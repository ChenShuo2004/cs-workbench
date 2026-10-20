const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const sharp = require("sharp");
const run = promisify(execFile);
const videoModels = require("../shared/video-models.json");
const BASE = "https://metaso.cn/api/minimax";
const FAILED = new Set([
  "failed",
  "fail",
  "cancelled",
  "canceled",
  "expired",
  "error",
]);
const DONE = new Set(["success", "succeeded", "completed", "done"]);
const clean = (value) =>
  String(value || "未知错误")
    .replace(/mk-[a-z0-9]+/gi, "[密钥已隐藏]")
    .replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]")
    .replace(/https?:\/\/\S+/gi, "[服务地址]")
    .slice(0, 500);

function createMetasoVideo({
  userData,
  secureStorage,
  findTool = () => null,
  fetchImpl = fetch,
}) {
  const directory = path.join(userData, "studio-generation");
  const credentialFile = path.join(directory, "metaso-key.enc");
  function key() {
    if (!fs.existsSync(credentialFile)) throw Error("请先保存秘塔 API Key");
    if (!secureStorage.isEncryptionAvailable())
      throw Error("系统密钥保护不可用，请解锁系统钥匙串");
    try {
      return secureStorage.decryptString(fs.readFileSync(credentialFile));
    } catch {
      throw Error("无法解密秘塔密钥，请在当前电脑重新配置");
    }
  }
  function status() {
    let ready = false,
      detail = "秘塔 MiniMax H3：请配置 API Key";
    try {
      if (fs.existsSync(credentialFile)) {
        key();
        ready = true;
        detail =
          "秘塔 H3 / Seedance 2.0 · 密钥已加密保存，生成按服务账户额度计费";
      }
    } catch (e) {
      detail = e.message;
    }
    return { ready, detail, models: videoModels.map((m) => m.id) };
  }
  function configure(value) {
    if (
      typeof value !== "string" ||
      !/^mk-[a-z0-9]{16,128}$/i.test(value.trim())
    )
      throw Error("请输入有效的秘塔 mk- API Key");
    if (!secureStorage.isEncryptionAvailable())
      throw Error("系统加密不可用，未保存密钥");
    fs.mkdirSync(directory, { recursive: true });
    const tmp = credentialFile + ".tmp";
    fs.writeFileSync(tmp, secureStorage.encryptString(value.trim()), {
      mode: 0o600,
    });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, credentialFile);
    return status();
  }
  async function request(endpoint, { body, method = "GET" } = {}) {
    const token = key();
    let response;
    try {
      response = await fetchImpl(BASE + endpoint, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(120000),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(body
          ? { body: body instanceof FormData ? body : JSON.stringify(body) }
          : {}),
      });
    } catch {
      throw Error("秘塔请求中断或超时；请保留原任务，不要重复提交");
    }
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw Error(`秘塔返回非 JSON 响应（HTTP ${response.status}）`);
    }
    const failure =
      data.base_resp?.status_code != null &&
      Number(data.base_resp.status_code) !== 0;
    if (!response.ok || failure || data.error) {
      const message =
        data.base_resp?.status_msg ||
        data.error?.message ||
        data.message ||
        `HTTP ${response.status}`;
      throw Error(
        `秘塔接口拒绝请求：${clean(String(message).split(token).join("[密钥已隐藏]"))}`,
      );
    }
    return data;
  }
  function validate(job) {
    key();
    const model = videoModels.find((m) => m.id === (job.model || "MiniMax-H3"));
    if (!model) throw Error("请选择已接入的视频模型");
    if (
      !Number.isInteger(job.duration) ||
      job.duration < 4 ||
      job.duration > 15
    )
      throw Error("视频时长需为 4–15 秒");
    if (job.resolution && !model.resolutions.includes(job.resolution))
      throw Error(`${model.label} 请选择 ${model.resolutions.join("、")}`);
  }
  async function submit(job, reference) {
    validate(job);
    const content = [{ type: "text", text: job.prompt }];
    const refs =
      typeof reference === "string"
        ? [{ path: reference, kind: "image", role: "first_frame" }]
        : reference || [];
    const roleTypes = {
      first_frame: ["image", 1],
      last_frame: ["image", 1],
      reference_image: ["image", 9],
      reference_video: ["video", 3],
      reference_audio: ["audio", 3],
    };
    if (!Array.isArray(refs) || refs.length > 15)
      throw Error("参考素材数量过多");
    const frames = refs.some((r) =>
      ["first_frame", "last_frame"].includes(r.role),
    );
    if (frames && refs.some((r) => r.role.startsWith("reference_")))
      throw Error("首尾帧与全能参考不能混用");
    if (
      refs.some((r) => r.role === "reference_audio") &&
      !refs.some((r) => ["reference_image", "reference_video"].includes(r.role))
    )
      throw Error("声音参考还需要至少一张图片或一段视频参考");
    const totals = { audio: 0, video: 0 };
    // Validate every input before uploading any of them or creating a paid task.
    for (const ref of refs) {
      if (
        !roleTypes[ref.role] ||
        ref.kind !== roleTypes[ref.role][0] ||
        refs.filter((r) => r.role === ref.role).length > roleTypes[ref.role][1]
      )
        throw Error("参考素材类型或数量无效");
      const maxMB = { image: 30, video: 50, audio: 15 }[ref.kind];
      if (fs.statSync(ref.path).size > maxMB * 1024 * 1024)
        throw Error(`参考${ref.kind}不能超过 ${maxMB} MB`);
      let width, height;
      if (ref.kind === "image") {
        const meta = await sharp(ref.path).metadata();
        width = meta.width;
        height = meta.height;
      } else {
        const ext = path.extname(ref.path).toLowerCase();
        if (
          !(
            ref.kind === "video" ? [".mp4", ".mov"] : [".wav", ".mp3"]
          ).includes(ext)
        )
          throw Error("参考视频仅支持 MP4/MOV，音频仅支持 WAV/MP3");
        const { stdout } = await run(
          findTool("ffprobe") || "ffprobe",
          [
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            ref.path,
          ],
          { timeout: 30000 },
        );
        const info = JSON.parse(stdout),
          duration = Number(info.format?.duration);
        if (!Number.isFinite(duration) || duration < 2 || duration > 15.05)
          throw Error("每段参考视频或音频需为 2–15 秒");
        totals[ref.kind] += duration;
        if (totals[ref.kind] > 15.05)
          throw Error("参考视频总时长、参考音频总时长分别不能超过 15 秒");
        const stream = info.streams.find((s) => s.codec_type === ref.kind);
        if (!stream) throw Error("参考素材缺少所需的媒体流");
        if (ref.kind === "video") {
          if (!["h264", "hevc"].includes(stream.codec_name))
            throw Error("参考视频需为 H.264 或 H.265 编码");
          if (
            info.streams.some(
              (s) =>
                s.codec_type === "audio" &&
                !["aac", "mp3"].includes(s.codec_name),
            )
          )
            throw Error("参考视频内的音轨需为 AAC 或 MP3 编码");
          const parts = stream.avg_frame_rate.split("/").map(Number),
            fps = parts[0] / parts[1];
          if (!Number.isFinite(fps) || fps < 23.97 || fps > 60.01)
            throw Error("参考视频帧率需为 24–60 fps");
          width = stream.width;
          height = stream.height;
        }
      }
      if (
        ref.kind !== "audio" &&
        (!width ||
          !height ||
          Math.min(width, height) < 256 ||
          Math.max(width, height) > 5760 ||
          width / height < 0.4 ||
          width / height > 2.5)
      )
        throw Error(
          "参考图片和视频宽高需为 256–5760 像素，宽高比需在 2:5 到 5:2 之间",
        );
    }
    for (const ref of refs) {
      const isImage = ref.kind === "image";
      const bytes = isImage
        ? await sharp(ref.path).png().toBuffer()
        : await fs.promises.readFile(ref.path);
      if (isImage && bytes.length > 30 * 1024 * 1024)
        throw Error("转换后的参考图片超过 30 MB");
      const form = new FormData();
      form.set("purpose", "video_generation_input");
      form.set(
        "file",
        new Blob([bytes], {
          type: isImage ? "image/png" : "application/octet-stream",
        }),
        isImage ? `${ref.role}.png` : `${ref.role}${path.extname(ref.path)}`,
      );
      const upload = await request("/v1/files/upload", {
        method: "POST",
        body: form,
      });
      const id = upload.file?.file_id;
      if (!id) throw Error("秘塔未返回参考素材文件编号，未提交视频生成");
      const type = `${ref.kind}_url`;
      content.push({
        type,
        [type]: { url: `mm_file://${id}` },
        role: ref.role,
      });
    }
    const result = await request("/v2/video_generation", {
      method: "POST",
      body: {
        model: job.model || "MiniMax-H3",
        content,
        resolution: job.legacy1080Transcode
          ? "2K"
          : { "1080P": "1080p", "720P": "720p" }[job.resolution] ||
            job.resolution ||
            "1080p",
        duration: job.duration,
        ...(!frames
          ? { ratio: job.aspect }
          : job.model === "seedance-2.0"
            ? { ratio: "adaptive" }
            : {}),
        ...(job.model === "seedance-2.0"
          ? { context_ir_enabled: false }
          : { fast_mode: false }),
      },
    });
    if (
      typeof result.task_id !== "string" ||
      !/^[a-z0-9_-]{1,200}$/i.test(result.task_id)
    )
      throw Error("秘塔未返回有效任务编号；未自动重新提交");
    return { request_id: result.task_id };
  }
  // Download only HTTPS media. API credentials are never forwarded to a CDN.
  async function download(url, destination, native1080 = false) {
    let current = url,
      response;
    for (let hop = 0; hop < 5; hop++) {
      const parsed = new URL(current);
      const host = parsed.hostname;
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        (parsed.port && parsed.port !== "443") ||
        !host.includes(".") ||
        /^[\d.]+$/.test(host) ||
        host.includes(":") ||
        /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
      )
        throw Error("视频下载地址无效");
      response = await fetchImpl(parsed.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(180000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        current = new URL(response.headers.get("location"), parsed).href;
        response = null;
        continue;
      }
      break;
    }
    if (!response?.ok || !response.body)
      throw Error("视频下载失败，可继续查询原任务");
    const max = 512 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > max) {
      await response.body.cancel();
      throw Error("生成视频超过 512 MB 下载限制");
    }
    const tmp = destination + ".part";
    const file = await fs.promises.open(tmp, "w", 0o600);
    let length = 0;
    try {
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > max) throw Error("生成视频超过 512 MB 下载限制");
        await file.writeFile(chunk);
      }
    } finally {
      await file.close();
    }
    try {
      const { stdout } = await run(
        findTool("ffprobe") || "ffprobe",
        ["-v", "error", "-show_format", "-show_streams", "-of", "json", tmp],
        { timeout: 30000, maxBuffer: 1024 * 1024 },
      );
      const info = JSON.parse(stdout);
      if (
        !info.streams?.some((s) => s.codec_type === "video") ||
        !(Number(info.format?.duration) > 0)
      )
        throw Error("invalid video");
      const video = info.streams.find((s) => s.codec_type === "video");
      if (native1080 && Math.min(video.width, video.height) !== 1080)
        throw Error(
          "服务返回的视频不是原生 1080P；未进行转码，请继续查询原任务或联系服务商",
        );
    } catch (e) {
      if (e.message.includes("原生 1080P")) throw e;
      throw Error("下载结果不是有效视频，可继续查询并重新下载原任务");
    }
    fs.renameSync(tmp, destination);
    return destination;
  }
  async function poll(job) {
    if (!/^[a-z0-9_-]{1,200}$/i.test(job.remoteId))
      throw Error("无效的视频任务编号");
    const result = await request(
      `/v2/query/video_generation/${encodeURIComponent(job.remoteId)}`,
    );
    const task = result.task;
    if (!task || typeof task.status !== "string")
      throw Error("秘塔查询响应缺少任务状态");
    const state = task.status.toLowerCase();
    if (FAILED.has(state))
      return { status: "failed", error: clean(task.error?.message || state) };
    if (task.content?.url) {
      if (!/^[a-f0-9-]{36}$/i.test(job.id)) throw Error("无效的本地任务编号");
      const folder = path.join(directory, job.id);
      fs.mkdirSync(folder, { recursive: true });
      try {
        if (job.legacy1080Transcode) {
          const source = path.join(folder, "source-2k.mp4");
          // A retry only repeats local conversion, never creates another paid task.
          if (!fs.existsSync(source)) await download(task.content.url, source);
          const output = path.join(folder, "generated.mp4");
          const temporary = path.join(folder, "1080p-converting.mp4");
          try {
            await run(
              findTool("ffmpeg") || "ffmpeg",
              [
                "-v",
                "error",
                "-nostdin",
                "-y",
                "-i",
                source,
                "-map",
                "0:v:0",
                "-map",
                "0:a?",
                "-vf",
                "scale=w='if(gte(iw,ih),trunc(1080*iw/ih/2)*2,1080)':h='if(gte(iw,ih),1080,trunc(1080*ih/iw/2)*2)':flags=lanczos,setsar=1",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                temporary,
              ],
              { timeout: 180000, maxBuffer: 1024 * 1024 },
            );
            const { stdout } = await run(
              findTool("ffprobe") || "ffprobe",
              [
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                temporary,
              ],
              { timeout: 30000 },
            );
            const info = JSON.parse(stdout),
              video = info.streams?.find((s) => s.codec_type === "video");
            if (
              !video ||
              Math.min(video.width, video.height) !== 1080 ||
              !(Number(info.format?.duration) > 0)
            )
              throw Error("1080P 视频校验失败");
            fs.renameSync(temporary, output);
            return { status: "completed", path: output };
          } catch {
            throw Error(
              "1080P 本地转码失败，2K 原片已保留。可继续查询原任务重试转码，不会重新生成。",
            );
          } finally {
            fs.rmSync(temporary, { force: true });
          }
        }
        return {
          status: "completed",
          path: await download(
            task.content.url,
            path.join(folder, "generated.mp4"),
            job.resolution === "1080P",
          ),
        };
      } catch (e) {
        throw Error(clean(e.message));
      }
    }
    if (DONE.has(state))
      throw Error("任务完成但尚未返回视频链接，请稍后继续查询");
    return { status: "running" };
  }
  return { configure, status, validate, submit, poll };
}
module.exports = { createMetasoVideo };
