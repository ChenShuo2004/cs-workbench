const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const sharp = require("sharp");
const wb = require("./workbench.cjs");
const assist = require("./editor-assist.cjs");
const uuid = () => crypto.randomUUID();
const FORMATS = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:3": [1440, 1080],
};
const fresh = () => ({
  version: 1,
  mode: "talk",
  aspect: "16:9",
  resolution: 720,
  theme: "mint",
  sceneStyle: "pixel",
  captions: true,
  normalize: true,
  media: [],
  clips: [],
  revision: 0,
});
function validate(state) {
  if (!state || state.version !== 1 || !["talk", "pixel"].includes(state.mode))
    throw new Error("不支持的剪辑工程");
  if (
    !FORMATS[state.aspect] ||
    ![720, 1080].includes(state.resolution) ||
    !["mint", "violet", "amber"].includes(state.theme)
  )
    throw new Error("无效的视频规格");
  if (
    !Array.isArray(state.media) ||
    !Array.isArray(state.clips) ||
    state.clips.length > 1000
  )
    throw new Error("无效的轨道数据");
  const ids = new Set();
  for (const c of state.clips) {
    if (!c.id || ids.has(c.id)) throw new Error("片段 ID 重复");
    ids.add(c.id);
    if (c.visual && !["scene", "media"].includes(c.visual))
      throw Error("无效的画面类型");
    if (c.visual === "media" && !c.mediaId) throw Error("素材镜头缺少源素材");
    if (
      c.prompt !== undefined &&
      (typeof c.prompt !== "string" || c.prompt.length > 4000)
    )
      throw Error("镜头提示词最多 4000 字");
    if (
      !Number.isFinite(c.start) ||
      !Number.isFinite(c.end) ||
      c.start < 0 ||
      c.end - c.start < 0.08 ||
      c.end - c.start > 3600
    )
      throw new Error("片段时长须在 0.08 秒至 1 小时之间");
    if (typeof c.text !== "string" || c.text.length > 500)
      throw new Error("单句文本最多 500 字");
    if (c.mediaId) {
      const m = state.media.find((m) => m.id === c.mediaId);
      if (!m || (m.kind !== "image" && c.end > m.duration + 0.1))
        throw new Error("片段超出素材范围");
    } else if (state.mode === "talk" && c.visual !== "scene")
      throw new Error("口播片段缺少源素材");
  }
  if (state.canvas) {
    require("./generation-graph.cjs").graphData(state);
    const c = state.canvas;
    if (c.groups !== undefined) {
      const ids = new Set(
        [
          ...state.clips,
          ...(c.generators || []),
          ...(c.sources || []),
          ...(c.notes || []),
        ].map((n) => n.id),
      );
      if (
        !Array.isArray(c.groups) ||
        c.groups.length > 200 ||
        c.groups.some(
          (g) =>
            !g.id ||
            typeof g.title !== "string" ||
            g.title.length > 100 ||
            !Array.isArray(g.nodeIds) ||
            g.nodeIds.length > 500 ||
            g.nodeIds.some((id) => !ids.has(id)),
        )
      )
        throw Error("分镜组数据无效");
    }
    const point = (p) =>
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) <= 100000 &&
      Math.abs(p.y) <= 100000;
    if (c.generationDraft) {
      const d = c.generationDraft;
      if (
        d.resolution !== undefined &&
        !["720P", "768P", "1080P", "2K"].includes(d.resolution)
      )
        throw Error("生成分辨率无效");
      if (
        !["image", "video"].includes(d.kind) ||
        typeof d.prompt !== "string" ||
        d.prompt.length > 4000 ||
        !FORMATS[d.aspect] ||
        !Number.isInteger(d.duration) ||
        d.duration < 1 ||
        d.duration > 15 ||
        typeof d.referenceId !== "string" ||
        typeof d.model !== "string" ||
        d.model.length > 200
      )
        throw Error("生成草稿无效");
    }
    if (
      (c.draft !== undefined &&
        (typeof c.draft !== "string" || c.draft.length > 20000)) ||
      !c.positions ||
      Object.keys(c.positions).length > 5000 ||
      !Object.values(c.positions).every(point) ||
      !Array.isArray(c.notes) ||
      c.notes.length > 200 ||
      !c.notes.every(
        (n) =>
          point(n) &&
          typeof n.id === "string" &&
          typeof n.text === "string" &&
          n.text.length <= 4000,
      ) ||
      !point(c.view) ||
      !Number.isFinite(c.view.zoom) ||
      c.view.zoom < 0.25 ||
      c.view.zoom > 2
    )
      throw Error("画布布局数据无效");
  }
  return assist.checkSettings(state);
}
function parseSRT(content) {
  const secs = (t) => {
    const [h, m, s] = t.replace(",", ".").split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };
  const blocks = String(content)
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/);
  const out = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const m = lines[i].match(
      /(\d{2,}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[,.]\d{3})/,
    );
    if (!m) throw new Error("字幕时间格式不正确");
    const start = secs(m[1]),
      end = secs(m[2]),
      text = lines
        .slice(i + 1)
        .join(" ")
        .replace(/<[^>]*>/g, "")
        .trim();
    if (
      end <= start ||
      !text ||
      (out.length && start < out[out.length - 1].end - 0.01)
    )
      throw new Error("字幕需按时间排列，不能重叠或为空");
    out.push({ id: uuid(), start, end, text, enabled: true });
  }
  if (!out.length) throw new Error("未识别到 SRT 字幕");
  return out;
}
function stamp(t) {
  const ms = Math.round(t * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
function makeSRT(clips) {
  let time = 0,
    index = 0;
  const out = [];
  for (const c of clips.filter((c) => c.enabled)) {
    const start = time;
    time += c.end - c.start;
    if (c.text.trim())
      out.push(`${++index}\n${stamp(start)} --> ${stamp(time)}\n${c.text}\n`);
  }
  return out.join("\n");
}
function withGaps(clips, mediaId, duration) {
  const out = [];
  let cursor = 0;
  for (const original of clips) {
    const c = { ...original, mediaId, enabled: true };
    if (c.start < cursor - 0.01 || c.end > duration + 0.1)
      throw Error("字幕重叠或超出素材时长");
    if (c.start - cursor >= 0.08)
      out.push({
        id: uuid(),
        mediaId,
        start: cursor,
        end: c.start,
        text: "",
        enabled: true,
      });
    else c.start = cursor;
    c.end = Math.min(duration, c.end);
    out.push(c);
    cursor = c.end;
  }
  if (duration - cursor >= 0.08)
    out.push({
      id: uuid(),
      mediaId,
      start: cursor,
      end: duration,
      text: "",
      enabled: true,
    });
  else if (out.length) out.at(-1).end = duration;
  return out;
}
function speechRanges(log, duration, padding = 0.1) {
  const intervals = [];
  let start = null;
  for (const line of log.split("\n")) {
    const a = line.match(/silence_start: ([\d.]+)/),
      b = line.match(/silence_end: ([\d.]+)/);
    if (a) start = Number(a[1]);
    if (b) {
      intervals.push([start ?? 0, Number(b[1])]);
      start = null;
    }
  }
  if (start !== null) intervals.push([start, duration]);
  let cursor = 0;
  const keep = [];
  for (const [s, e] of intervals) {
    if (s - cursor >= 0.08)
      keep.push([
        Math.max(0, cursor - padding),
        Math.min(duration, s + padding),
      ]);
    cursor = Math.max(cursor, e);
  }
  if (duration - cursor >= 0.08)
    keep.push([Math.max(0, cursor - padding), duration]);
  return keep.reduce((merged, r) => {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
    return merged;
  }, []);
}
function run(bin, args, { job, onProgress, duration } = {}) {
  return new Promise((resolve, reject) => {
    if (job?.cancelled) return reject(new Error("已取消"));
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    if (job) job.child = child;
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (d) => {
      stdout = (stdout + d).slice(-4000000);
      const matches = [...String(d).matchAll(/out_time_us=(\d+)/g)];
      if (matches.length && duration && onProgress)
        onProgress(Math.min(0.99, Number(matches.at(-1)[1]) / 1e6 / duration));
    });
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-60000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (job) job.child = null;
      if (job?.cancelled) reject(new Error("已取消"));
      else if (code !== 0)
        reject(new Error(stderr.slice(-2500) || `进程退出 ${code}`));
      else resolve({ stdout, stderr });
    });
  });
}
function createStudio({ config, tools, userData, onChange = () => {} }) {
  const jobFile = path.join(userData, "studio-jobs.json");
  let jobs = wb
    .readJson(jobFile, [])
    .map((j) =>
      ["queued", "running"].includes(j.status)
        ? { ...j, status: "interrupted", error: "应用退出中断了导出，可重试" }
        : j,
    );
  const active = new Map();
  let pumping = false;
  const file = (root) =>
    path.join(wb.requireRegistered(config(), root), "video/studio.json");
  const read = (root) => {
    const f = file(root);
    if (!fs.existsSync(f)) return fresh();
    try {
      return validate(JSON.parse(fs.readFileSync(f, "utf8")));
    } catch (e) {
      throw new Error(`剪辑工程无法读取，原文件已保留：${e.message}`);
    }
  };
  const save = (root, state) => {
    validate(state);
    const before = read(root);
    state = { ...state, media: before.media, revision: before.revision + 1 };
    validate(state);
    wb.writeJson(file(root), state);
    return state;
  };
  const persist = () => {
    wb.writeJson(
      jobFile,
      jobs.map(({ child, snapshot, ...j }) => j),
    );
    onChange();
  };
  async function probe(p) {
    if (/\.(png|jpe?g|webp)$/i.test(p)) {
      const meta = await sharp(p).metadata();
      if (!meta.width || !meta.height) throw Error("图片无法读取");
      return {
        duration: 5,
        width: meta.width,
        height: meta.height,
        hasAudio: false,
        kind: "image",
      };
    }
    const r = await run(tools().ffprobe || "ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      p,
    ]);
    const x = JSON.parse(r.stdout);
    const v = x.streams.find((s) => s.codec_type === "video");
    const a = x.streams.find((s) => s.codec_type === "audio");
    const duration = Number(x.format?.duration);
    if (!duration || (!v && !a)) throw new Error("无法识别媒体时长");
    return {
      duration,
      width: v?.width || 0,
      height: v?.height || 0,
      hasAudio: !!a,
      kind: v ? "video" : "audio",
    };
  }
  function mediaPath(root, id) {
    const m = read(root).media.find((m) => m.id === id);
    if (!m) throw new Error("素材不存在");
    return wb.inside(root, m.path);
  }
  async function addMedia(root, source, options = {}) {
    const before = read(root);
    if (options.id && before.media.some((m) => m.id === options.id))
      return before;
    const metadata = await probe(source);
    const id = options.id || uuid();
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error("无效素材编号");
    const relative = `assets/media/${id}${path.extname(source).toLowerCase()}`;
    const dest = wb.inside(root, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      await fs.promises.copyFile(source, dest, fs.constants.COPYFILE_EXCL);
    } catch (e) {
      if (!options.id || e.code !== "EEXIST") throw e;
      // A deterministic generation import may be retried after a crash.
      if (fs.statSync(dest).size !== fs.statSync(source).size)
        throw Error("已存在的生成素材不一致，原文件已保留");
    }
    // The user can keep editing while probing/copying; merge into the latest
    // project rather than writing the snapshot taken before those awaits.
    const state = read(root);
    if (state.media.some((m) => m.id === id)) return state;
    const media = {
      id,
      name: options.name || path.basename(source),
      path: relative,
      ...metadata,
    };
    state.media.push(media);
    state.revision++;
    if (
      options.createClip !== false &&
      !state.clips.length &&
      state.mode === "talk"
    )
      state.clips.push({
        id: uuid(),
        mediaId: id,
        start: 0,
        end: metadata.duration,
        text: "",
        enabled: true,
      });
    wb.writeJson(file(root), validate(state));
    return state;
  }
  async function transcribe(root, id) {
    const state = read(root),
      media = state.media.find((m) => m.id === id);
    if (!media?.hasAudio) throw new Error("此素材没有可转写的音轨");
    const python = path.join(
      require("node:os").homedir(),
      ".local/share/cs-workbench/asr/bin/python",
    );
    if (!fs.existsSync(python))
      throw new Error("本地转写引擎未安装，请运行 scripts/setup-asr.sh");
    const out = path.join(root, "video", `transcription-${uuid()}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const worker = path.join(userData, "transcribe-worker.py");
    fs.writeFileSync(
      worker,
      fs.readFileSync(path.join(__dirname, "../scripts/transcribe.py")),
    );
    await run(python, [worker, mediaPath(root, id), out]);
    const result = JSON.parse(fs.readFileSync(out, "utf8"));
    if (!result.segments?.length)
      throw new Error("未检测到清晰语音，原剪辑未改动");
    const segments = result.segments
      .map((c) => ({
        id: uuid(),
        mediaId: id,
        start: Math.max(0, c.start),
        end: Math.min(media.duration, c.end),
        text: c.text,
        enabled: true,
      }))
      .filter((c) => c.end - c.start >= 0.08);
    return withGaps(segments, id, media.duration);
  }
  async function tempo(root, id) {
    const state = read(root),
      m = state.media.find((m) => m.id === id);
    if (!m?.hasAudio) throw Error("请先选择带音轨的背景音乐");
    const args = [
      "-v",
      "error",
      "-nostdin",
      "-i",
      mediaPath(root, id),
      "-t",
      "90",
      "-vn",
      "-ar",
      "8000",
      "-ac",
      "1",
      "-f",
      "f32le",
      "pipe:1",
    ];
    const buffer = await new Promise((resolve, reject) => {
      const child = spawn(tools().ffmpeg || "ffmpeg", args);
      const chunks = [];
      let bytes = 0;
      child.stdout.on("data", (d) => {
        bytes += d.length;
        if (bytes > 3000000) {
          child.kill();
          reject(Error("节拍分析数据超限"));
        } else chunks.push(d);
      });
      child.stderr.resume();
      child.on("error", reject);
      child.on("close", (c) =>
        c === 0
          ? resolve(Buffer.concat(chunks))
          : reject(Error("节拍分析失败")),
      );
    });
    return assist.detectTempo(buffer);
  }
  async function importSRT(root, id, content) {
    const state = read(root),
      m = state.media.find((m) => m.id === id);
    if (!m) throw new Error("请先选择素材");
    const clips = withGaps(parseSRT(content), id, m.duration);
    state.clips = clips;
    state.mode = "talk";
    return save(root, state);
  }
  async function silence(root, id, threshold = -35, min = 0.45) {
    if (
      !Number.isFinite(threshold) ||
      threshold < -80 ||
      threshold > -10 ||
      !Number.isFinite(min) ||
      min < 0.1 ||
      min > 5
    )
      throw new Error("静音参数无效");
    const state = read(root),
      m = state.media.find((m) => m.id === id);
    if (!m?.hasAudio) throw new Error("此素材没有音轨");
    const { stderr } = await run(tools().ffmpeg || "ffmpeg", [
      "-hide_banner",
      "-nostdin",
      "-i",
      mediaPath(root, id),
      "-af",
      `silencedetect=noise=${threshold}dB:d=${min}`,
      "-vn",
      "-f",
      "null",
      "-",
    ]);
    const ranges = speechRanges(stderr, m.duration);
    return {
      ranges,
      removed: m.duration - ranges.reduce((s, [a, b]) => s + b - a, 0),
    };
  }
  async function execute(j) {
    const state = j.snapshot;
    const clips = state.clips.filter((c) => c.enabled);
    const work = path.join(j.root, "outputs", `render-${j.id}`);
    fs.mkdirSync(work, { recursive: true });
    if (
      clips.some(
        (c) => c.visual === "scene" || (!c.visual && state.mode === "pixel"),
      )
    )
      wb.writeJson(path.join(work, "art-direction.json"), {
        referenceIds: [
          { mint: "P01", violet: "P06", amber: "P04" }[state.theme],
        ],
        style: state.sceneStyle || "pixel",
        scene: "original generated environment",
        layers:
          "foreground silhouette, midground character and props, low-contrast background",
        light: {
          mint: "upper-left daylight through mist",
          violet: "sunset behind mountains",
          amber: "warm desk lamp and window",
        }[state.theme],
        character: "generic original figure, not KAI master",
        captionArea: "lower safe zone",
        referenceImagesEmbedded: false,
      });
    const [baseW, baseH] = FORMATS[state.aspect],
      scale = state.resolution / 1080,
      width = Math.round((baseW * scale) / 2) * 2,
      height = Math.round((baseH * scale) / 2) * 2;
    const { sceneSVG, captionSVG } = await import(
      pathToFileURL(path.join(__dirname, "../shared/studio-visuals.mjs")).href
    );
    const ffmpeg = tools().ffmpeg || "ffmpeg";
    const total = clips.reduce((a, c) => a + c.end - c.start, 0);
    let completed = 0;
    for (let i = 0; i < clips.length; i++) {
      if (j.cancelled) throw new Error("已取消");
      const c = clips[i],
        duration = c.end - c.start;
      let args = ["-hide_banner", "-nostdin", "-y"];
      let filters = [];
      let video = "0:v";
      let audio = "0:a";
      const m = state.media.find((m) => m.id === c.mediaId);
      if (c.visual === "scene" || (!c.visual && state.mode === "pixel")) {
        // Render one small animation cycle with the same SVG used by the UI.
        for (let f = 0; f < 30; f++) {
          if (j.cancelled) throw new Error("已取消");
          await sharp(
            Buffer.from(
              sceneSVG(
                c.text,
                state.theme,
                f / 30,
                width,
                height,
                state.sceneStyle || "pixel",
              ),
            ),
          )
            .png()
            .toFile(
              path.join(work, `scene-${i}-${String(f).padStart(2, "0")}.png`),
            );
        }
        args.push(
          "-stream_loop",
          "-1",
          "-framerate",
          "15",
          "-i",
          path.join(work, `scene-${i}-%02d.png`),
        );
        if (m?.hasAudio) {
          args.push(
            "-ss",
            String(c.start),
            "-t",
            String(duration),
            "-i",
            wb.inside(j.root, m.path),
          );
          audio = "1:a";
        } else {
          args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
          audio = "1:a";
        }
        filters.push("[0:v]fps=30,format=yuv420p[v]");
      } else {
        if (!m) throw new Error("缺少原始素材");
        if (m.kind === "image") args.push("-loop", "1", "-framerate", "30");
        else args.push("-ss", String(c.start));
        args.push("-t", String(duration), "-i", wb.inside(j.root, m.path));
        let next = 1;
        if (m.kind === "audio") {
          args.push(
            "-f",
            "lavfi",
            "-i",
            `color=c=0x101c22:s=${width}x${height}:r=30`,
          );
          video = `${next++}:v`;
        }
        if (!m.hasAudio) {
          args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
          audio = `${next++}:a`;
        }
        filters.push(
          `[${video}]${state.framing === "fill" ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}` : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x101318`},setsar=1,fps=30[base]`,
        );
        if (state.captions && c.text) {
          const png = path.join(work, `caption-${i}.png`);
          await sharp(
            Buffer.from(captionSVG(c.text, width, height, state.captionStyle)),
          )
            .png()
            .toFile(png);
          args.push("-loop", "1", "-i", png);
          filters.push(
            `[base][${next}:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
          );
        } else filters.push("[base]format=yuv420p[v]");
      }
      if (c.voiceId) {
        const voice = state.media.find((m) => m.id === c.voiceId);
        const inputIndex = args.filter((a) => a === "-i").length;
        args.push(
          "-ss",
          String(c.voiceStart || 0),
          "-t",
          String(duration),
          "-i",
          wb.inside(j.root, voice.path),
        );
        audio = `${inputIndex}:a`;
      }
      filters.push(
        `[${audio}]aresample=48000,${state.normalize ? "loudnorm=I=-16:TP=-1.5:LRA=11," : ""}aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${c.muted ? 0 : 1},apad[a]`,
      );
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        String(duration),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-pix_fmt",
        "yuv420p",
        "-progress",
        "pipe:1",
        path.join(work, `part-${i}.mp4`),
      );
      await run(ffmpeg, args, {
        job: j,
        duration,
        onProgress: (p) => {
          j.progress = Math.round(((completed + duration * p) / total) * 90);
          persist();
        },
      });
      completed += duration;
    }
    fs.writeFileSync(
      path.join(work, "concat.txt"),
      clips.map((_, i) => `file 'part-${i}.mp4'`).join("\n"),
    );
    const output = path.join(work, "final.mp4"),
      joined = path.join(work, "joined.mp4");
    j.progress = 92;
    persist();
    await run(
      ffmpeg,
      [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        path.join(work, "concat.txt"),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        joined,
      ],
      { job: j },
    );
    const mix = state.audio || {},
      music = state.media.find((m) => m.id === mix.musicId);
    const mixArgs = ["-hide_banner", "-nostdin", "-y", "-i", joined];
    if (music) {
      mixArgs.push(
        "-stream_loop",
        "-1",
        "-ss",
        String(mix.musicOffset || 0),
        "-i",
        wb.inside(j.root, music.path),
      );
      const fadeIn = Math.min(total / 2, mix.fadeIn ?? 1),
        fadeOut = Math.min(total / 2, mix.fadeOut ?? 1);
      const filters = [
        `[0:a]volume=${mix.voiceGain ?? 1},asplit=2[voice][key]`,
        `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${total},asetpts=PTS-STARTPTS,volume=${mix.musicGain ?? 0.12},afade=t=in:d=${Math.max(0.001, fadeIn)},afade=t=out:st=${total - fadeOut}:d=${Math.max(0.001, fadeOut)}[music]`,
      ];
      if (mix.duck !== false)
        filters.push(
          "[music][key]sidechaincompress=threshold=0.025:ratio=6:attack=15:release=280[bed]",
        );
      else filters.push("[key]anullsink", "[music]anull[bed]");
      filters.push(
        "[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]",
      );
      mixArgs.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v",
        "-map",
        "[a]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(total),
        "-movflags",
        "+faststart",
        output,
      );
      await run(ffmpeg, mixArgs, { job: j });
    } else if ((mix.voiceGain ?? 1) !== 1) {
      mixArgs.push(
        "-af",
        `volume=${mix.voiceGain},alimiter=limit=0.95:level=false`,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      );
      await run(ffmpeg, mixArgs, { job: j });
    } else fs.renameSync(joined, output);
    if (fs.existsSync(joined)) fs.unlinkSync(joined);
    const metadata = await probe(output);
    if (Math.abs(metadata.duration - total) > 0.3 + clips.length * 0.04)
      throw new Error("导出时长校验失败");
    await run(
      ffmpeg,
      ["-v", "error", "-nostdin", "-i", output, "-f", "null", "-"],
      { job: j },
    );
    fs.writeFileSync(path.join(work, "captions.srt"), makeSRT(clips));
    wb.writeJson(path.join(work, "timeline.json"), state);
    wb.writeJson(path.join(work, "verification.json"), {
      checkedAt: new Date().toISOString(),
      decodePassed: true,
      expectedDuration: total,
      ...metadata,
    });
    if (j.cancelled) throw new Error("已取消");
    // Atomic publication; an earlier successful export is retained until success.
    const target = path.join(j.root, "outputs/final.mp4"),
      temp = path.join(j.root, `outputs/.final-${j.id}.mp4`);
    await fs.promises.copyFile(output, temp);
    fs.renameSync(temp, target);
    j.output = output;
    j.progress = 100;
    j.status = "complete";
    j.finishedAt = new Date().toISOString();
    for (const name of fs.readdirSync(work))
      if (/^(scene-|caption-|part-)/.test(name))
        fs.unlinkSync(path.join(work, name));
    persist();
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      let j;
      while (
        (j = [...jobs]
          .reverse()
          .find((j) => j.status === "queued" && j.snapshot))
      ) {
        j.status = "running";
        active.set(j.id, j);
        persist();
        try {
          await execute(j);
        } catch (e) {
          j.status = j.cancelled ? "cancelled" : "failed";
          j.error = e.message;
          persist();
        } finally {
          active.delete(j.id);
        }
      }
    } finally {
      pumping = false;
    }
  }
  function enqueue(root) {
    const state = read(root);
    if (!state.clips.some((c) => c.enabled))
      throw new Error("请至少保留一个片段");
    if (
      jobs.filter((j) => ["running", "queued"].includes(j.status)).length >= 4
    )
      throw new Error("导出队列已满，请等待或取消任务");
    const j = {
      id: uuid(),
      root,
      title: wb.readProject(config(), root).title,
      createdAt: new Date().toISOString(),
      status: "queued",
      progress: 0,
      snapshot: structuredClone(state),
      output: "",
      error: "",
    };
    jobs.unshift(j);
    persist();
    setImmediate(pump);
    return j.id;
  }
  function cancel(id) {
    const j = jobs.find((j) => j.id === id);
    if (!j || !["running", "queued"].includes(j.status)) return false;
    j.cancelled = true;
    if (j.child) j.child.kill("SIGTERM");
    if (j.status === "queued") j.status = "cancelled";
    persist();
    return true;
  }
  return {
    read,
    save,
    addMedia,
    importSRT,
    tempo,
    transcribe,
    silence,
    probe,
    mediaPath,
    enqueue,
    cancel,
    jobs: () => jobs.map(({ child, snapshot, ...j }) => j),
    shutdown: () => {
      for (const j of active.values()) {
        j.cancelled = true;
        j.child?.kill("SIGTERM");
      }
    },
    output: (id) => {
      const j = jobs.find((j) => j.id === id);
      if (j?.status !== "complete" || !fs.existsSync(j.output))
        throw new Error("成片尚不存在");
      return j.output;
    },
  };
}
module.exports = {
  createStudio,
  validate,
  parseSRT,
  withGaps,
  makeSRT,
  speechRanges,
  fresh,
};
