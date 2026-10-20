const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const sharp = require("sharp");
const wb = require("./workbench.cjs");

const ROLES = ["host", "scene", "television"];
const FILES = {
  host: "01-男主.png", portrait: "02-亲人大头照-AI参考版.png",
  photo: "03-亲人原照片.png", scene: "04-老屋场景.png",
  television: "05-旧电视.png", prompt: "06-完整视频提示词-17秒.txt",
};
const ACTIVE = ["queued", "analyzing", "portrait_submitting", "portrait_running", "packaging"];
const text = (v, max) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function pixelBox(b, width, height) {
  if (!b || ["x", "y", "width", "height"].some(k => !Number.isFinite(b[k])) ||
    b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 ||
    b.x + b.width > 1.001 || b.y + b.height > 1.001) throw Error("照片定位超出截图，请重新提供完整清晰截图");
  const left = Math.floor(b.x * width), top = Math.floor(b.y * height);
  const w = Math.min(width - left, Math.round(b.width * width));
  const h = Math.min(height - top, Math.round(b.height * height));
  if (w < 32 || h < 32) throw Error("人物照片太小，无法可靠提取，请提供更清晰截图");
  return { left, top, width: w, height: h };
}
function validateAnalysis(a, width, height) {
  if (!a || a.confident !== true) throw Error(text(a?.reason, 500) || "没有明确识别到亲人照片与关系，请换一张截图");
  for (const k of ["comment", "relation", "appearance", "gesture", "endingAction"])
    if (!text(a[k], k === "comment" ? 3000 : 500)) throw Error(`截图分析缺少${k}，请重试或更换截图`);
  if (!Array.isArray(a.facts) || a.facts.length > 20 || a.facts.some(f => !text(f, 500))) throw Error("截图事实列表无效");
  if (!a.comment.includes(a.relation)) throw Error("亲属称呼未在评论原文中找到，请核对截图");
  const limits = { opening: 10, greeting: 6, main: 9, closing: 6 };
  let total = 0;
  for (const [key, max] of Object.entries(limits)) {
    const s = text(a[key], 60);
    const count = (s.match(/[\p{L}\p{N}]/gu) || []).length;
    if (!s || count < 2 || count > max || /[\r\n]/.test(s)) throw Error("对白超过17秒预算，请重试生成短稿");
    total += count;
  }
  if (total > 30) throw Error("对白超过17秒预算");
  const photo = pixelBox(a.photoBox, width, height), face = pixelBox(a.faceBox, width, height);
  if (face.left < photo.left - 2 || face.top < photo.top - 2 ||
    face.left + face.width > photo.left + photo.width + 2 ||
    face.top + face.height > photo.top + photo.height + 2)
    throw Error("人物定位不在原照片内，请换一张截图");
  return { ...a, photo, face, characterCount: total };
}
function buildPrompt(input) {
  const a = { ...input };
  for (const key of ["appearance", "gesture", "endingAction"])
    a[key] = a[key].replace(/[。！？.!?\s]+$/u, "");
  return `使用全能参考模式制作一条约17秒、9:16竖屏的自然写实亲人重逢视频。01-男主.png只控制开场男主身份与服装；03-亲人原照片.png为${a.relation}的身份与原始姿势依据，02-亲人大头照-AI参考版.png仅辅助外观，冲突以原照片为准；04-老屋场景.png控制木扶手椅、左侧窗光、米白墙与木柜；05-旧电视.png仅参考电视外形，不继承背景或风格化材质。亲人可见特征：${a.appearance}。保留真实年龄、面部比例、皮肤纹理和服装，不美颜、不年轻化，不把男主和亲人的脸混合。忽略原照片的医疗环境及其他无关背景。画面为自然手机拍摄，低饱和木色与米白、少量灰绿阴影，柔和侧窗光，不使用整屏橙黄滤镜。0—3秒直接进入情绪：男主右手持手机自拍，旧电视靠近他的右侧，屏幕里从第一秒就能看见${a.relation}坐在老屋椅子上；不以空镜、黑场、介绍或问候铺垫。男主平静认真地准确说：“${a.opening}”3—5秒：男主转身并转动持机手，镜头离开自拍构图、靠近并对正电视，在短暂摇动模糊处隐藏向外取景的切点；用短距离靠近和构图匹配切换，在电视屏幕几乎占满画面时接到相同人物位置、大小、姿势、视线和光线的老屋镜头，不做身体穿越、发光通道或空间扭曲。5—8秒：${a.relation}坐着，双手自然放下，抬眼看向镜头，轻轻点头，准确说：“${a.greeting}”8—12秒：维持同一轴线与稳定机位，亲人认真而温柔地看着镜头，准确说：“${a.main}”12—14秒：亲人带着克制的笑意轻声准确说：“${a.closing}”14—17秒不再说话，从双手放下的坐姿自然过渡到结尾姿态，再保持：${a.endingAction}。原照片动作参考：${a.gesture}。动作控制在约一秒完成，最后约两秒静静注视镜头，让深情落在眼神与停顿里，不消失、不回切空椅、不加告别文字，不突然站起或增加人物道具。全片只有上述四句逐字创作对白，男主只说第一句，亲人说后三句，不增加评论者形象或声音，不交换说话人，发声与可见口型协调，语气自然亲近、避免播音腔与夸张哭泣；不声称还原亲人生前真实音色。保留轻微室内环境声，转场处平缓接续，无背景音乐、电视噪声、哭声或惊吓音效。人物身份、服装、持机关系与光源连续；不把评论、头像、界面、字幕、标题、贴纸、水印或大头照背景生成进画面。总时长按17秒安排，优先保留最后两秒情绪停留，不能通过加速对白挤入时长。`;
}

function createReunion({ userData, home = os.homedir(), analyzer, bridge, onChange = () => {}, pollMs = 4000 }) {
  const base = path.join(userData, "reunion");
  fs.mkdirSync(base, { recursive: true });
  const store = path.join(base, "state.json");
  const project = path.join(home, "复活亲人 01");
  let state = fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, "utf8")) : {
    version: 1, settings: {
      output: path.join(home, "Documents", "CS工作台项目", "亲人重逢批量"),
      host: path.join(project, "角色图/男主/男主.jpg"),
      scene: path.join(project, "场景图/场景图-07-室内-乡村老屋.png"),
      television: path.join(project, "场景图/道具参考/d791d69b60dbc68f15c5c2945a812c12.jpg"),
    }, jobs: [],
  };
  if (state.version !== 1 || !Array.isArray(state.jobs) ||
    state.jobs.some(j => !/^[a-f0-9-]{36}$/.test(j.id))) throw Error("批量任务记录损坏，原文件已保留");
  let stopping = false, busy = false, importing = false;
  const timers = new Map();
  const save = () => { wb.writeJson(store, state); onChange(); };
  const get = id => { const j = state.jobs.find(j => j.id === id); if (!j) throw Error("任务不存在"); return j; };
  const dir = j => path.join(base, "jobs", j.id);
  const dest = (j, k) => path.join(j.output, FILES[k]);
  const savedPrompt = j => {
    try { return fs.readFileSync(dest(j, "prompt"), "utf8").trim(); }
    catch { return ""; }
  };
  const safeView = j => ({ id: j.id, name: j.name, status: j.status, stage: j.stage, error: j.error || "",
    createdAt: j.createdAt, output: j.output, relation: j.analysis?.relation || "",
    comment: j.analysis?.comment || "", facts: j.analysis?.facts || [],
    dialogue: j.analysis ? ["opening", "greeting", "main", "closing"].map(k => j.analysis[k]) : [],
    prompt: j.status === "ready" ? savedPrompt(j) : "", remoteId: j.remoteId || "",
  });
  function snapshot() {
    return { settings: { ...state.settings }, presets: Object.fromEntries(ROLES.map(k => [k, fs.existsSync(state.settings[k])])),
      analyzerAvailable: analyzer.available(), jobs: state.jobs.map(safeView) };
  }
  async function setting(kind, value) {
    if (![...ROLES, "output"].includes(kind) || typeof value !== "string" || !path.isAbsolute(value)) throw Error("设置无效");
    if (kind === "output") {
      if (!fs.statSync(value).isDirectory()) throw Error("输出位置必须是文件夹");
    } else await sharp(value, { limitInputPixels: 40000000 }).metadata();
    state.settings[kind] = value; save(); return snapshot();
  }
  async function importFiles(files) {
    if (importing) throw Error("正在导入，请稍后");
    if (!Array.isArray(files) || !files.length || files.length > 50) throw Error("每批请选择1–50张截图");
    if (state.jobs.filter(j => ACTIVE.includes(j.status)).length + files.length > 100) throw Error("待处理队列最多100条");
    if (!analyzer.available()) throw Error("请先安装并登录 Codex，再导入截图");
    for (const k of ROLES) if (!fs.existsSync(state.settings[k])) throw Error("请先在固定参考中补齐男主、老屋和旧电视");
    importing = true;
    const added = [], skipped = [], rejected = [];
    try {
      for (const file of files) {
        let jobDir, output;
        try {
          if (typeof file !== "string" || !path.isAbsolute(file) || !/\.(png|jpe?g|webp)$/i.test(file)) throw Error("只支持PNG、JPG或WebP截图");
          if (fs.statSync(file).size > 30 * 1024 * 1024) throw Error("截图不能超过30MB");
          const fingerprint = crypto.createHash("sha256").update(sha(file) + ROLES.map(k => sha(state.settings[k])).join("")).digest("hex");
          const known = state.jobs.find(j => j.fingerprint === fingerprint);
          if (known) { skipped.push(path.basename(file)); continue; }
          const id = crypto.randomUUID();
          const j = { id, fingerprint, name: path.basename(file), status: "queued", stage: "排队中",
            createdAt: new Date().toISOString(), output: path.join(state.settings.output, `${new Date().toISOString().slice(0, 10)}-${id.slice(0, 8)}`) };
          jobDir = dir(j); output = j.output;
          fs.mkdirSync(jobDir, { recursive: true });
          fs.mkdirSync(output, { recursive: true });
          const image = await sharp(file, { limitInputPixels: 40000000 }).rotate().png().toBuffer();
          fs.writeFileSync(path.join(jobDir, "screenshot.png"), image);
          const meta = await sharp(image).metadata(); j.width = meta.width; j.height = meta.height;
          fs.mkdirSync(path.join(output, "来源与检查"), { recursive: true });
          fs.copyFileSync(file, path.join(output, "来源与检查", `原始截图${path.extname(file).toLowerCase()}`));
          for (const k of ROLES) await sharp(state.settings[k], { limitInputPixels: 40000000 }).rotate().png().toFile(dest(j, k));
          state.jobs.unshift(j); added.push(id); save();
        } catch (e) {
          if (jobDir) fs.rmSync(jobDir, { recursive: true, force: true });
          if (output) fs.rmSync(output, { recursive: true, force: true });
          rejected.push({ name: typeof file === "string" ? path.basename(file) : "未知文件", error: e.message });
        }
      }
    } finally { importing = false; }
    void pump();
    return { added, skipped, rejected, snapshot: snapshot() };
  }
  async function packageJob(j) {
    j.status = "packaging"; j.stage = "整理参考与17秒提示词"; save();
    fs.writeFileSync(dest(j, "prompt"), buildPrompt(j.analysis) + "\n");
    fs.writeFileSync(path.join(j.output, "00-上传说明.txt"),
      `本包为17秒视频准备材料，尚未生成视频。\n上传01至05五张参考图，复制06中的完整提示词；文件名不是平台引用语法。\n原照片来自截图定位裁切，必要时等比放大以方便上传，不代表恢复了原始细节。AI大头照含补全细节，身份以原照片为准。\n对白是创作稿，不是亲人生前原话。确认人物相似度后再使用。\n时间安排：0–3秒情绪开场，3–5秒电视转场，5–14秒亲人对白，14–17秒动作与注视，最后约两秒留白。\n`);
    const manifest = [];
    for (const [role, file] of Object.entries(FILES)) {
      const full = path.join(j.output, file);
      if (role !== "prompt") { await sharp(full).raw().toBuffer(); }
      manifest.push({ role, file, sha256: sha(full), bytes: fs.statSync(full).size });
    }
    fs.writeFileSync(path.join(j.output, "来源与检查", "素材与文案.json"), JSON.stringify({
      comment: j.analysis.comment, facts: j.analysis.facts, analysis: j.analysis,
      creativeDialogue: true, duration: 17, mode: "全能参考", aiPortrait: true,
      checks: "文件校验与图像解码通过，人物相似度及生成视频未人工验收", files: manifest,
    }, null, 2));
    j.status = "ready"; j.stage = "上传包已就绪"; j.error = ""; save();
  }
  function schedule(j) {
    clearTimeout(timers.get(j.id));
    if (!stopping) timers.set(j.id, setTimeout(() => { timers.delete(j.id); void poll(j); }, pollMs));
  }
  async function poll(j) {
    if (stopping || j.status !== "portrait_running") return;
    try {
      const result = await bridge.poll(j.remoteId);
      if (stopping || j.status !== "portrait_running") return;
      if (result.status === "completed") {
        const image = result.images?.[0]?.path;
        const expected = path.join(dir(j), "portrait");
        if (!image || path.dirname(fs.realpathSync(image)) !== fs.realpathSync(expected)) throw Error("大头照结果位置不属于当前任务");
        await sharp(image, { limitInputPixels: 40000000 }).png().toFile(dest(j, "portrait"));
        await packageJob(j); void pump();
      } else if (result.status === "failed") {
        j.status = "failed"; j.stage = "大头照生成失败"; j.error = String(result.error || "生成服务失败").slice(0, 500); save(); void pump();
      } else if (Date.now() - Date.parse(j.watchingSince) > 15 * 60 * 1000) {
        j.status = "paused"; j.stage = "查询已暂停"; j.error = "等待超过15分钟，可继续查询原任务，不会重复提交"; save(); void pump();
      } else schedule(j);
    } catch (e) {
      j.status = "paused"; j.stage = "查询已暂停"; j.error = e.message; save(); void pump();
    }
  }
  async function pump() {
    if (stopping || busy || state.jobs.some(j => ["portrait_submitting", "portrait_running", "packaging"].includes(j.status))) return;
    const j = state.jobs.slice().reverse().find(j => j.status === "queued");
    if (!j) return;
    busy = true;
    try {
      if (!j.analysis) {
        j.status = "analyzing"; j.stage = "识别评论、人物与17秒文案"; save();
        const raw = await analyzer.analyze(path.join(dir(j), "screenshot.png"), path.join(dir(j), "analysis"));
        if (stopping) return;
        try { j.analysis = validateAnalysis(raw, j.width, j.height); }
        catch (e) { j.status = "needs_review"; j.stage = "截图需要核对"; j.error = e.message; save(); return; }
        fs.writeFileSync(path.join(dir(j), "analysis-validated.json"), JSON.stringify(j.analysis, null, 2));
      }
      if (fs.existsSync(dest(j, "portrait"))) {
        await packageJob(j);
        return;
      }
      await sharp(path.join(dir(j), "screenshot.png")).extract(j.analysis.photo)
        .resize({ width: Math.max(512, j.analysis.photo.width) }).png().toFile(dest(j, "photo"));
      const portraitDir = path.join(dir(j), "portrait");
      fs.mkdirSync(portraitDir, { recursive: true });
      // Keep exact cropped pixels as identity input; restoration is handled by the existing image bridge.
      await sharp(path.join(dir(j), "screenshot.png")).extract(j.analysis.face).png().toFile(path.join(dir(j), "face.png"));
      await bridge.check();
      if (stopping) return;
      j.status = "portrait_submitting"; j.stage = "提交人物大头照"; save();
      const result = await bridge.submit({
        prompt: `根据参考中的同一位亲人制作一张正面头肩大头照。保留身份、年龄、脸部比例、头发、皱纹和衣服，不美化、不年轻化，不替换成泛化人物。参考1为截图内原照片，参考2为原照片中的头部区域，人物特征：${j.analysis.appearance}。浅米白纯背景，完整头顶和双耳，双手在画面外，自然皮肤与光线，1:1单张照片，无文字水印。低清来源只保守补全细节，不声称无损还原。`,
        reference_images: [dest(j, "photo"), path.join(dir(j), "face.png")],
        aspect_ratio: "square", transparent_background: false, output_dir: portraitDir,
      });
      if (!result.job_id || typeof result.job_id !== "string") throw Error("未返回大头照任务编号");
      j.remoteId = result.job_id; j.status = "portrait_running"; j.stage = "正在生成大头照";
      j.watchingSince = new Date().toISOString(); save(); schedule(j);
    } catch (e) {
      if (j.status === "portrait_submitting") {
        j.status = "uncertain"; j.stage = "提交结果待核对";
        j.error = "大头照提交结果不明确，请核对服务端任务，避免重复生成。";
      } else { j.status = "failed"; j.stage = "处理失败"; j.error = e.message; }
      save();
    } finally { busy = false; if (!stopping) void pump(); }
  }
  function retry(id) {
    const j = get(id);
    if (["paused", "uncertain"].includes(j.status) && j.remoteId) {
      j.status = "portrait_running"; j.watchingSince = new Date().toISOString(); j.error = ""; save(); schedule(j);
    } else {
      if (!["failed", "needs_review", "interrupted", "cancelled"].includes(j.status)) throw Error("该任务不能重试；提交结果不明确时请先核对服务端");
      if (j.status === "needs_review") delete j.analysis;
      delete j.remoteId; j.status = "queued"; j.stage = "等待重试"; j.error = ""; save(); void pump();
    }
    return snapshot();
  }
  function pause(id) {
    const j = get(id);
    if (j.status === "queued") { j.status = "cancelled"; j.stage = "已取消排队"; }
    else if (j.status === "portrait_running") {
      clearTimeout(timers.get(id)); timers.delete(id); j.status = "paused";
      j.stage = "已暂停查询"; j.error = "服务端可能仍在生成，继续查询不会重新提交";
    } else throw Error("当前步骤无法暂停，请等待完成");
    save(); void pump(); return snapshot();
  }
  function recover(id, remoteId) {
    const j = get(id);
    if (j.status !== "uncertain" || typeof remoteId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(remoteId)) throw Error("请输入服务端原任务编号");
    j.remoteId = remoteId; j.status = "paused"; save(); return retry(id);
  }
  function media(id, role) {
    const j = get(id);
    const file = role === "screenshot" ? path.join(dir(j), "screenshot.png") : ["portrait", "photo"].includes(role) ? dest(j, role) : "";
    if (!file || !fs.existsSync(file)) throw Error("预览尚未就绪");
    return file;
  }
  return {
    snapshot, setting, importFiles, retry, pause, recover, media,
    folder: id => get(id).output,
    start() {
      stopping = false;
      for (const j of state.jobs) {
        if (j.status === "portrait_submitting") { j.status = "uncertain"; j.stage = "提交中断，请核对原任务"; }
        else if (j.status === "portrait_running") { j.watchingSince = new Date().toISOString(); schedule(j); }
        else if (["analyzing", "packaging"].includes(j.status)) { j.status = "interrupted"; j.stage = "上次运行中断，可重试"; }
      }
      save(); void pump();
    },
    shutdown() {
      stopping = true; for (const timer of timers.values()) clearTimeout(timer);
      timers.clear(); analyzer.close(); bridge.close();
    },
  };
}
module.exports = { createReunion, validateAnalysis, buildPrompt, pixelBox };
