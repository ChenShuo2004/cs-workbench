const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const DOCS = Object.freeze({
  brief: "brief.md",
  article: "writing/article.md",
  script: "writing/video-script.md",
  shotlist: "video/shotlist.csv",
  publish: "publish/发布文案.md",
});
const IMPORT_DOCS = Object.freeze({
  brief: ["brief.md"],
  article: ["文章.md", DOCS.article],
  script: ["文案.md", DOCS.script],
  shotlist: ["分镜.md", DOCS.shotlist],
  publish: ["发布文案.md", DOCS.publish],
});
const STATES = new Set([
  "准备中",
  "草稿",
  "待核查",
  "可导出",
  "已导出",
  "已上传",
  "已发布",
]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}
function inside(root, relative) {
  const full = path.resolve(root, relative);
  if (
    full !== path.resolve(root) &&
    !full.startsWith(`${path.resolve(root)}${path.sep}`)
  )
    throw new Error("文件路径超出指定目录");
  return full;
}
function textFile(file, limit = 3_000_000) {
  if (!fs.existsSync(file)) return "";
  if (fs.statSync(file).size > limit) throw new Error("稿件文件过大");
  return fs.readFileSync(file, "utf8");
}
function filename(title) {
  const clean = String(title || "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, 42);
  return clean || "未命名选题";
}
function dateStamp(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}
function defaultConfig(home = os.homedir()) {
  const library = path.join(
    home,
    "Documents",
    "ChatGPT",
    "陈硕 video",
    "音效与配乐库",
  );
  return {
    version: 1,
    workspace: path.join(home, "Documents", "CS工作台项目"),
    library: fs.existsSync(path.join(library, "manifest.json")) ? library : "",
    projects: [],
  };
}
function requireRegistered(config, projectPath) {
  const target = path.resolve(String(projectPath || ""));
  if (!config.projects.some((p) => path.resolve(p) === target))
    throw new Error("请先在工作台中打开这个项目");
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory())
    throw new Error("项目目录不存在");
  return target;
}
function isManaged(root) {
  return fs.existsSync(path.join(root, "project.json"));
}
function projectSummary(root) {
  const info = readJson(path.join(root, "project.json"), null);
  const stat = fs.statSync(root);
  return {
    path: root,
    title: info?.title || path.basename(root),
    audience: info?.audience || "",
    platforms: info?.platforms || [],
    platformStatus: info?.platformStatus || {},
    status: info?.status || {
      article: "待核查",
      video: "待核查",
      publish: "准备中",
    },
    updatedAt: info?.updatedAt || stat.mtime.toISOString(),
    managed: Boolean(info),
  };
}
function listProjects(config) {
  return config.projects
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory())
    .map(projectSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function createProject(config, input) {
  const title = String(input?.title || "").trim();
  if (!title || title.length > 100)
    throw new Error("请输入 1–100 字的选题名称");
  const workspace = path.resolve(config.workspace);
  fs.mkdirSync(workspace, { recursive: true });
  let root = path.join(workspace, `${dateStamp()}-${filename(title)}`);
  let suffix = 2;
  while (fs.existsSync(root))
    root = path.join(
      workspace,
      `${dateStamp()}-${filename(title)}-${suffix++}`,
    );
  const now = new Date().toISOString();
  const info = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    audience: String(input.audience || "")
      .trim()
      .slice(0, 200),
    platforms: Array.isArray(input.platforms)
      ? input.platforms.map((s) => String(s).slice(0, 40)).slice(0, 8)
      : [],
    platformStatus: {},
    status: { article: "准备中", video: "准备中", publish: "准备中" },
    createdAt: now,
    updatedAt: now,
  };
  info.platformStatus = Object.fromEntries(
    info.platforms.map((p) => [p, "准备中"]),
  );
  for (const dir of [
    "research",
    "writing",
    "video",
    "assets/files",
    "outputs",
    "qa",
    "publish",
  ])
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  writeJson(path.join(root, "project.json"), info);
  writeJson(path.join(root, "research/sources.json"), []);
  writeJson(path.join(root, "assets/selection.json"), []);
  fs.writeFileSync(
    path.join(root, DOCS.brief),
    `# ${title}\n\n## 核心观点\n\n\n## 目标读者\n\n${info.audience}\n\n## 观众能带走什么\n\n\n## 已核实材料\n\n`,
  );
  fs.writeFileSync(path.join(root, DOCS.article), `# ${title}\n\n`);
  fs.writeFileSync(path.join(root, DOCS.script), `# ${title}｜视频稿\n\n`);
  fs.writeFileSync(
    path.join(root, DOCS.shotlist),
    "镜头,预计秒数,旁白或字幕,画面,声音,素材路径,状态\n",
  );
  fs.writeFileSync(
    path.join(root, DOCS.publish),
    `# ${title}｜发布文案\n\n## 标题\n\n## 简介\n\n## 平台与状态\n\n`,
  );
  config.projects.unshift(root);
  return projectSummary(root);
}
function importProject(config, root) {
  const target = path.resolve(root);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory())
    throw new Error("请选择项目文件夹");
  if (!config.projects.some((p) => path.resolve(p) === target))
    config.projects.unshift(target);
  return projectSummary(target);
}
function readProject(config, projectPath) {
  const root = requireRegistered(config, projectPath);
  const managed = isManaged(root);
  const docs = {};
  for (const key of Object.keys(DOCS)) {
    const candidates = managed ? [DOCS[key]] : IMPORT_DOCS[key];
    const found = candidates.find((p) => fs.existsSync(inside(root, p)));
    docs[key] = found ? textFile(inside(root, found)) : "";
  }
  const sourcePath = managed
    ? path.join(root, "research/sources.json")
    : path.join(root, "sources.md");
  const sources = managed ? readJson(sourcePath, []) : textFile(sourcePath);
  const selection = managed
    ? readJson(path.join(root, "assets/selection.json"), [])
    : [];
  const video =
    ["outputs/final.mp4", "out/final.mp4"]
      .map((p) => inside(root, p))
      .find(fs.existsSync) || "";
  return { ...projectSummary(root), docs, sources, selection, video };
}
function saveDocument(config, projectPath, key, content) {
  const root = requireRegistered(config, projectPath);
  if (!isManaged(root))
    throw new Error("导入的旧项目只读；新建工作台项目后可编辑");
  if (!Object.hasOwn(DOCS, key)) throw new Error("未知稿件类型");
  if (typeof content !== "string" || content.length > 3_000_000)
    throw new Error("稿件内容无效或过大");
  fs.writeFileSync(inside(root, DOCS[key]), content);
  const info = readJson(path.join(root, "project.json"), {});
  info.updatedAt = new Date().toISOString();
  if (key === "article" && info.status.article === "准备中")
    info.status.article = "草稿";
  if (["script", "shotlist"].includes(key) && info.status.video === "准备中")
    info.status.video = "草稿";
  writeJson(path.join(root, "project.json"), info);
  return projectSummary(root);
}
function updateStatus(config, projectPath, branch, status) {
  const root = requireRegistered(config, projectPath);
  if (!isManaged(root)) throw new Error("导入的旧项目只读");
  if (!["article", "video", "publish"].includes(branch) || !STATES.has(status))
    throw new Error("状态不受支持");
  const info = readJson(path.join(root, "project.json"), {});
  info.status[branch] = status;
  info.updatedAt = new Date().toISOString();
  writeJson(path.join(root, "project.json"), info);
  return projectSummary(root);
}
function updatePlatformStatus(config, projectPath, platform, status) {
  const root = requireRegistered(config, projectPath);
  if (!isManaged(root)) throw new Error("导入的旧项目只读");
  if (!STATES.has(status)) throw new Error("状态不受支持");
  const info = readJson(path.join(root, "project.json"), {});
  if (!info.platforms.includes(platform)) throw new Error("平台未在项目中登记");
  info.platformStatus ||= {};
  info.platformStatus[platform] = status;
  info.status.publish = info.platforms.every(
    (p) => info.platformStatus[p] === "已发布",
  )
    ? "已发布"
    : info.platforms.some((p) => info.platformStatus[p] === "已上传")
      ? "已上传"
      : info.platforms.some((p) => info.platformStatus[p] === "已导出")
        ? "已导出"
        : "准备中";
  info.updatedAt = new Date().toISOString();
  writeJson(path.join(root, "project.json"), info);
  return projectSummary(root);
}
function libraryCatalog(library) {
  if (!library || !fs.existsSync(path.join(library, "manifest.json")))
    return { connected: false, audio: [], fonts: [], presets: [], netease: [] };
  const manifest = readJson(path.join(library, "manifest.json"), { items: [] });
  const fontLibrary = readJson(path.join(library, "字体库/font-library.json"), {
    fonts: [],
  });
  const presets = readJson(
    path.join(library, "字体库/typography-presets.json"),
    { presets: [] },
  );
  const neteaseDir = path.join(library, "assets/bgm/网易云可导入");
  const netease = fs.existsSync(neteaseDir)
    ? fs
        .readdirSync(neteaseDir)
        .filter((f) => f.toLowerCase().endsWith(".mp3"))
        .map((f) => ({
          id: `netease:${f}`,
          title: path.parse(f).name,
          kind: "netease",
          category: "bgm",
          rights: "待核权",
          use: "私人候选",
          tags: [],
        }))
    : [];
  return {
    connected: true,
    audio: manifest.items.map((a) => ({
      id: `audio:${a.id}`,
      title: a.title,
      kind: "audio",
      category: a.category,
      rights: "已记录授权",
      use: a.use || "",
      tags: a.tags || [],
      duration: a.duration_s || 0,
      recommended: Boolean(a.recommended),
      style: a.style || "",
    })),
    fonts: fontLibrary.fonts.map((f) => ({
      id: `font:${f.id}`,
      title: f.name,
      kind: "font",
      category: "font",
      rights: f.license || "已记录授权",
      use: f.use || "",
      tags: f.tags || [],
      family: f.family || "",
    })),
    presets: presets.presets,
    netease,
  };
}
function libraryEntry(library, id) {
  if (!library) throw new Error("请先连接素材库");
  if (id.startsWith("audio:")) {
    const item = readJson(path.join(library, "manifest.json"), {
      items: [],
    }).items.find((a) => a.id === id.slice(6));
    if (!item) throw new Error("找不到音频素材");
    return {
      item,
      kind: "audio",
      file: verifiedLibraryFile(library, inside(library, item.path)),
      title: item.title,
      license: item.license,
      sha256: item.sha256,
    };
  }
  if (id.startsWith("font:")) {
    const item = readJson(path.join(library, "字体库/font-library.json"), {
      fonts: [],
    }).fonts.find((f) => f.id === id.slice(5));
    if (!item) throw new Error("找不到字体");
    return {
      item,
      kind: "font",
      file: verifiedLibraryFile(
        library,
        inside(path.join(library, "字体库"), item.path),
      ),
      title: item.name,
      license: item.license,
      sha256: item.sha256,
    };
  }
  if (id.startsWith("netease:")) {
    const name = id.slice(8);
    if (name !== path.basename(name) || !name.toLowerCase().endsWith(".mp3"))
      throw new Error("文件名无效");
    return {
      kind: "netease",
      file: verifiedLibraryFile(
        library,
        inside(path.join(library, "assets/bgm/网易云可导入"), name),
      ),
      title: path.parse(name).name,
      license: "待核权",
    };
  }
  throw new Error("未知素材");
}
function verifiedLibraryFile(library, file) {
  if (!fs.existsSync(file)) throw new Error("素材文件不存在");
  const realRoot = fs.realpathSync(library);
  const realFile = fs.realpathSync(file);
  if (!realFile.startsWith(`${realRoot}${path.sep}`))
    throw new Error("素材文件超出库目录");
  return realFile;
}
function previewAsset(library, id) {
  const entry = libraryEntry(library, id);
  if (!fs.existsSync(entry.file)) throw new Error("素材文件不存在");
  if (fs.statSync(entry.file).size > 35_000_000)
    throw new Error("试听文件过大，请在 Finder 中打开");
  const ext = path.extname(entry.file).toLowerCase();
  const mime =
    ext === ".ttf" ? "font/ttf" : ext === ".mp3" ? "audio/mpeg" : "audio/wav";
  return {
    dataUrl: `data:${mime};base64,${fs.readFileSync(entry.file).toString("base64")}`,
    title: entry.title,
    kind: entry.kind,
  };
}
function addAsset(config, projectPath, id) {
  const root = requireRegistered(config, projectPath);
  if (!isManaged(root)) throw new Error("导入的旧项目只读");
  const entry = libraryEntry(config.library, id);
  if (entry.kind === "netease")
    throw new Error("网易云候选曲目授权待核实，不能加入公开视频交付包");
  if (!fs.existsSync(entry.file)) throw new Error("素材文件不存在");
  const actualHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(entry.file))
    .digest("hex");
  if (entry.sha256 && actualHash !== entry.sha256)
    throw new Error("素材与清单校验值不一致");
  const selectionPath = path.join(root, "assets/selection.json");
  const selection = readJson(selectionPath, []);
  if (selection.some((s) => s.id === id)) return selection;
  const name = `${filename(id.replace(":", "-"))}${path.extname(entry.file).toLowerCase()}`;
  const relative = `assets/files/${name}`;
  const destination = inside(root, relative);
  if (fs.existsSync(destination))
    throw new Error("项目中已有同名素材，请先检查");
  fs.copyFileSync(entry.file, destination, fs.constants.COPYFILE_EXCL);
  selection.push({
    id,
    kind: entry.kind,
    title: entry.title,
    path: relative,
    license: entry.license,
    sha256: actualHash,
    sourceLibrary: config.library,
    addedAt: new Date().toISOString(),
  });
  writeJson(selectionPath, selection);
  return selection;
}
function findVideo(root) {
  return (
    ["outputs/final.mp4", "out/final.mp4"]
      .map((p) => inside(root, p))
      .find(fs.existsSync) || ""
  );
}
function runQA(config, projectPath, ffprobe = "ffprobe") {
  const project = readProject(config, projectPath);
  const issues = [];
  if (project.docs.article.replace(/^#.*$/gm, "").trim().length < 80)
    issues.push({
      branch: "article",
      level: "待完善",
      message: "文章正文不足 80 字",
    });
  if (project.docs.script.replace(/^#.*$/gm, "").trim().length < 30)
    issues.push({
      branch: "video",
      level: "待完善",
      message: "视频稿尚未写完",
    });
  if (
    !project.docs.shotlist ||
    project.docs.shotlist.trim().split("\n").length < 2
  )
    issues.push({ branch: "video", level: "待完善", message: "逐镜头表为空" });
  if (Array.isArray(project.sources) && project.sources.length === 0)
    issues.push({
      branch: "shared",
      level: "待核查",
      message: "尚未记录资料来源",
    });
  if (project.selection.some((s) => s.license === "待核权"))
    issues.push({
      branch: "video",
      level: "阻塞",
      message: "选用素材中有授权待核曲目",
    });
  let video = null;
  const videoPath = findVideo(project.path);
  if (videoPath) {
    try {
      video = JSON.parse(
        execFileSync(
          ffprobe,
          [
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            videoPath,
          ],
          { timeout: 15000, maxBuffer: 2_000_000, encoding: "utf8" },
        ),
      );
      if (!video.streams?.some((s) => s.codec_type === "video"))
        issues.push({
          branch: "video",
          level: "阻塞",
          message: "成片缺少视频流",
        });
    } catch (error) {
      issues.push({
        branch: "video",
        level: "阻塞",
        message: `成片无法通过 FFprobe：${error.message}`,
      });
    }
  } else
    issues.push({
      branch: "video",
      level: "待完善",
      message: "尚未找到 outputs/final.mp4",
    });
  const result = {
    checkedAt: new Date().toISOString(),
    issues,
    video: video
      ? {
          duration: Number(video.format?.duration || 0),
          streams: video.streams?.map((s) => ({
            codec: s.codec_name,
            type: s.codec_type,
            width: s.width,
            height: s.height,
          })),
        }
      : null,
  };
  if (project.managed)
    writeJson(path.join(project.path, "qa/latest.json"), result);
  return result;
}
function exportProject(config, projectPath, type) {
  const project = readProject(config, projectPath);
  if (!project.managed) throw new Error("导入的旧项目只读，请先新建工作台项目");
  if (!["article", "video"].includes(type)) throw new Error("未知导出类型");
  if (
    type === "article" &&
    project.docs.article.replace(/^#.*$/gm, "").trim().length < 30
  )
    throw new Error("请先完成文章正文");
  if (
    type === "video" &&
    project.docs.script.replace(/^#.*$/gm, "").trim().length < 30
  )
    throw new Error("请先完成视频稿");
  const label = type === "article" ? "文章" : "视频";
  const base = path.join(
    project.path,
    "outputs",
    `CS${label}交付包-${dateStamp()}-${Date.now()}`,
  );
  fs.mkdirSync(base, { recursive: true });
  const paths =
    type === "article"
      ? [DOCS.brief, DOCS.article, DOCS.publish, "research/sources.json"]
      : [
          DOCS.brief,
          DOCS.script,
          DOCS.shotlist,
          DOCS.publish,
          "research/sources.json",
          "assets/selection.json",
        ];
  for (const relative of paths) {
    const source = inside(project.path, relative);
    if (!fs.existsSync(source)) continue;
    const destination = inside(base, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  if (type === "video") {
    for (const selected of project.selection) {
      if (selected.license === "待核权") continue;
      const source = inside(project.path, selected.path);
      if (!fs.existsSync(source)) continue;
      const currentHash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(source))
        .digest("hex");
      if (currentHash !== selected.sha256)
        throw new Error(`项目素材已变化，请重新检查：${selected.title}`);
      const destination = inside(base, selected.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
    if (project.video)
      fs.copyFileSync(project.video, path.join(base, "final.mp4"));
  }
  fs.writeFileSync(
    path.join(base, "交付说明.md"),
    `# ${project.title}｜${label}交付包\n\n生成时间：${new Date().toLocaleString("zh-CN")}\n\n此包是本地制作交付，不代表已经上传或发布。外部素材的使用权限以原始授权记录为准。\n`,
  );
  const zip = `${base}.zip`;
  execFileSync(
    "/usr/bin/ditto",
    ["-c", "-k", "--sequesterRsrc", "--keepParent", base, zip],
    { timeout: 120000 },
  );
  const info = readJson(path.join(project.path, "project.json"), {});
  info.status[type] = "已导出";
  info.updatedAt = new Date().toISOString();
  writeJson(path.join(project.path, "project.json"), info);
  return { folder: base, zip };
}
function handoffPrompt(project) {
  return `请继续制作“${project.title}”。项目目录：${project.path}\n\n先阅读 brief.md、research/sources.json、writing/article.md、writing/video-script.md、video/shotlist.csv 和 assets/selection.json。先核实资料与素材权利，再完善文章和视频稿。写入现有文件，不新建平行版本。视频制作完成后放在 outputs/final.mp4，记录 QA；不要把“已导出”当成“已发布”。`;
}

module.exports = {
  DOCS,
  defaultConfig,
  readJson,
  writeJson,
  inside,
  filename,
  listProjects,
  createProject,
  importProject,
  readProject,
  saveDocument,
  updateStatus,
  updatePlatformStatus,
  libraryCatalog,
  libraryEntry,
  previewAsset,
  addAsset,
  runQA,
  exportProject,
  handoffPrompt,
  requireRegistered,
};
