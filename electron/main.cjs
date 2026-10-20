const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
  Menu,
  protocol,
  safeStorage,
  net,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
// Allows isolated packaged-app acceptance tests without touching personal data.
if (process.env.CS_WORKBENCH_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.CS_WORKBENCH_USER_DATA_DIR));
}
const { execFileSync } = require("node:child_process");
const workbench = require("../lib/workbench.cjs");
const videoReferences = require("../lib/video-references.cjs");
const { createDouyinManager } = require("./douyin.cjs");

const { pathToFileURL } = require("node:url");
const { createStudio } = require("../lib/studio.cjs");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "cs-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
let studio;
let generation;
let videoProvider;
const { createMetasoVideo } = require("../lib/metaso-video.cjs");
const { createImageBridge } = require("../lib/image-bridge.cjs");
const { createGeneration } = require("../lib/studio-generation.cjs");
const { createReunion } = require("../lib/reunion.cjs");
const { createReunionAnalyzer } = require("../lib/reunion-analyzer.cjs");
let reunion;
let personal;
let health, contentOps;
const { createHealth } = require("../lib/health.cjs");
const { createContentOps } = require("../lib/content-ops.cjs");
let grokWindow;
const { createPersonal } = require("../lib/personal.cjs");
let mediaTokens = new Map();
let mainWindow;
let configFile;
let config;
let douyin;

function saveConfig() {
  workbench.writeJson(configFile, config);
}
function installedTool(name) {
  for (const base of [
    path.join(app.getPath("home"), ".npm-global/bin"),
    path.join(app.getPath("home"), ".local/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ]) {
    const file = path.join(base, name);
    if (fs.existsSync(file)) return file;
  }
  try {
    return execFileSync("/usr/bin/which", [name], {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
  } catch {
    return "";
  }
}
function toolStatus() {
  return Object.fromEntries(
    ["ffprobe", "ffmpeg", "node", "codex", "hyperframes"].map((name) => [
      name,
      installedTool(name),
    ]),
  );
}
function chooseFolder(title) {
  return dialog
    .showOpenDialog(mainWindow, {
      title,
      properties: ["openDirectory", "createDirectory"],
    })
    .then((result) => (result.canceled ? "" : result.filePaths[0]));
}
function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    )
      throw new Error("此窗口无权访问工作台数据");
    return listener(event, ...args);
  });
}
function registerHandlers() {
  handle("reunion:read", () => reunion.snapshot());
  handle("reunion:import", async (_e, files) => {
    if (files === undefined) {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: "选择评论截图，可多选",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "评论截图", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (picked.canceled) return null;
      files = picked.filePaths;
    }
    return reunion.importFiles(files);
  });
  handle("reunion:setting", async (_e, kind) => {
    if (!["host", "scene", "television", "output"].includes(kind)) throw Error("无效设置");
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: kind === "output" ? "选择批量输出文件夹" : "选择固定参考图",
      properties: kind === "output" ? ["openDirectory", "createDirectory"] : ["openFile"],
      ...(kind !== "output" ? { filters: [{ name: "参考图片", extensions: ["png", "jpg", "jpeg", "webp"] }] } : {}),
    });
    if (picked.canceled) return null;
    return reunion.setting(kind, picked.filePaths[0]);
  });
  handle("reunion:retry", (_e, id) => reunion.retry(id));
  handle("reunion:pause", (_e, id) => reunion.pause(id));
  handle("reunion:recover", (_e, id, remoteId) => reunion.recover(id, remoteId));
  handle("reunion:folder", async (_e, id) => {
    const error = await shell.openPath(reunion.folder(id));
    if (error) throw Error(error);
  });
  handle("reunion:media", (_e, id, role) => {
    const file = reunion.media(id, role);
    for (const [token, known] of mediaTokens) if (known === file) return `cs-media://local/${token}`;
    const token = require("node:crypto").randomUUID();
    mediaTokens.set(token, file);
    return `cs-media://local/${token}`;
  });
  let fullscreenTransition;
  handle(
    "window:fullscreen-state",
    () => mainWindow.isFullScreen() || mainWindow.isSimpleFullScreen(),
  );
  handle("window:fullscreen", async (_event, enabled) => {
    if (typeof enabled !== "boolean") throw new Error("无效的全屏状态");
    if (fullscreenTransition) await fullscreenTransition;
    const win = mainWindow;
    // macOS simple fullscreen keeps the editor on the current desktop and avoids
    // asynchronous Spaces transitions swallowing a rapid enter/exit request.
    if (process.platform === "darwin" && !win.isFullScreen()) {
      win.setSimpleFullScreen(enabled);
      const active = win.isSimpleFullScreen();
      win.webContents.send("window:fullscreen-changed", active);
      return active;
    }
    if (win.isFullScreen() === enabled) return enabled;
    fullscreenTransition = new Promise((resolve, reject) => {
      const event = enabled ? "enter-full-screen" : "leave-full-screen";
      const cleanup = () => {
        clearTimeout(timer);
        win.removeListener(event, done);
        win.removeListener("closed", closed);
      };
      const done = () => {
        cleanup();
        resolve(enabled);
      };
      const closed = () => {
        cleanup();
        reject(new Error("窗口已关闭"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("全屏切换未完成，请重试"));
      }, 8000);
      win.once(event, done);
      win.once("closed", closed);
      win.setFullScreen(enabled);
    });
    try {
      return await fullscreenTransition;
    } finally {
      fullscreenTransition = null;
    }
  });
  const referenceRoot = () =>
    config.videoReferences ??
    videoReferences.defaultReferenceDirectory(app.getPath("home"));
  handle("references:read", () => videoReferences.readCatalog(referenceRoot()));
  handle("references:connect", async () => {
    const root = await chooseFolder("选择视频风格案例库（包含 cases.json）");
    if (!root) return null;
    const catalog = videoReferences.readCatalog(root);
    if (!catalog.connected) throw new Error("案例库目录不存在");
    config.videoReferences = root;
    saveConfig();
    return catalog;
  });
  handle("references:media", (_event, id, kind) => {
    const file = videoReferences.referenceMedia(referenceRoot(), id, kind);
    // Reuse capabilities for repeated selections instead of accumulating tokens.
    for (const [token, known] of mediaTokens)
      if (known === file) return `cs-media://local/${token}`;
    const token = require("node:crypto").randomUUID();
    mediaTokens.set(token, file);
    return `cs-media://local/${token}`;
  });
  handle("references:source", (_event, id) =>
    shell.openExternal(videoReferences.sourceURL(referenceRoot(), id)),
  );
  handle("references:folder", async () => {
    const catalog = videoReferences.readCatalog(referenceRoot());
    if (!catalog.connected) throw new Error("请先连接案例库");
    const error = await shell.openPath(catalog.root);
    if (error) throw new Error(error);
  });
  handle("health:read", () => health.snapshot());
  handle("health:save", (_e, input) => health.save(input));
  handle("health:open", () => shell.openExternal("https://chatgpt.com/health"));
  handle("content:read", () => contentOps.read());
  handle("content:save", (_e, input) =>
    contentOps.save(input, workbench.listProjects(config)),
  );
  for (const kind of ["health", "content"])
    handle(`${kind}:export`, async () => {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: kind === "health" ? "导出健康记录" : "导出内容计划",
        defaultPath: `${kind}-records.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return null;
      const data = kind === "health" ? health.snapshot() : contentOps.read();
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), {
        mode: 0o600,
      });
      return result.filePath;
    });
  handle("personal:xai-key", (_e, key) => personal.configureXai(key));
  handle("personal:grok-web", () => {
    if (grokWindow && !grokWindow.isDestroyed()) {
      grokWindow.show();
      grokWindow.focus();
      return true;
    }
    grokWindow = new BrowserWindow({
      width: 1200,
      height: 850,
      title: "Grok · CS 工作台",
      webPreferences: {
        partition: "persist:grok-official",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    grokWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) void shell.openExternal(url);
      return { action: "deny" };
    });
    grokWindow.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith("https://")) e.preventDefault();
    });
    grokWindow.webContents.session.setPermissionRequestHandler((_w, _p, cb) =>
      cb(false),
    );
    grokWindow.on("closed", () => {
      grokWindow = null;
    });
    void grokWindow.loadURL("https://grok.com/").catch(() => {});
    return true;
  });
  handle("personal:read", () => personal.snapshot());
  handle("personal:task", (_e, input) => personal.task(input));
  handle("personal:daily", (_e, date) => personal.carryDaily(date));
  handle("personal:note", (_e, input) => personal.note(input));
  handle("personal:archive-note", (_e, id) => personal.removeNote(id));
  handle("personal:journal", (_e, date, body) => personal.journal(date, body));
  handle("personal:connect", async () => {
    const folder = await chooseFolder("连接到个人工作台");
    return folder ? personal.connect(folder) : null;
  });
  handle("personal:disconnect", (_e, id) => personal.disconnect(id));
  handle("personal:browse", (_e, id, relative) =>
    personal.browse(id, relative),
  );
  handle("personal:file", (_e, id, relative) =>
    personal.readFile(id, relative),
  );
  handle("personal:open", (_e, id, relative) =>
    shell.openPath(personal.resolve(id, relative)),
  );
  handle("personal:providers", (_e, force) => personal.providers(force));
  handle("personal:conversation", () => personal.newConversation());
  handle("personal:send", (_e, input) => personal.send(input));
  handle("personal:cancel", (_e, id) => personal.cancel(id));
  handle("personal:restore", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择个人工作区备份",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled) return null;
    const source = result.filePaths[0],
      data = personal.inspectBackup(source);
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["取消", "恢复这份备份"],
      defaultId: 0,
      cancelId: 0,
      message: "替换当前个人工作区？",
      detail: `备份含 ${data.tasks.length} 个任务、${data.notes.length} 条记忆、${data.conversations.length} 个会话。当前数据会先另存恢复前备份，项目媒体与登录凭据不变。\n连接目录：\n${data.folders.map((f) => f.path).join("\n")}`,
    });
    return confirm.response === 1 ? personal.restoreData(source) : null;
  });
  handle("personal:export", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "备份个人工作区",
      defaultPath: `CS工作台-个人备份-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    return result.canceled ? null : personal.exportData(result.filePath);
  });

  const assist = require("../lib/editor-assist.cjs");
  handle("studio:tempo", (_e, root, id) => studio.tempo(root, id));
  handle("studio:plan", (_e, root, instruction) => {
    const state = studio.read(root);
    return {
      prompt: assist.optimizationPrompt(state, instruction),
      fingerprint: assist.fingerprint(state),
    };
  });
  handle("studio:validate-plan", (_e, root, text, fingerprint) =>
    assist.parsePlan(studio.read(root), text, fingerprint),
  );
  handle("studio:snap", (_e, root, id) =>
    assist.snapEnd(studio.read(root), id),
  );
  handle("studio:captions", async (_e, root) => {
    const state = studio.read(root);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出剪辑后的字幕",
      defaultPath: "captions.srt",
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (result.canceled) return null;
    fs.writeFileSync(
      result.filePath,
      require("../lib/studio.cjs").makeSRT(state.clips),
    );
    return result.filePath;
  });
  handle("studio:open-jimeng", () =>
    shell.openExternal("https://jimeng.jianying.com/"),
  );
  handle("generation:status", () => generation.status());
  handle("generation:previewGraph", (_e, root, ids) =>
    generation.previewGraph(root, ids),
  );
  handle("generation:enqueueGraph", (_e, root, ids) =>
    generation.enqueueGraph(root, ids),
  );
  handle("generation:configureVideo", (_e, key) =>
    videoProvider.configure(key),
  );
  handle("generation:list", (_e, root) => generation.list(root));
  handle("generation:enqueue", (_e, root, input) =>
    generation.enqueue(root, input),
  );
  handle("generation:pause", (_e, id) => generation.pause(id));
  handle("generation:resume", (_e, id) => generation.resume(id));
  handle("generation:attach", (_e, id) => generation.attach(id));
  handle("generation:acknowledge", (_e, id) => generation.acknowledge(id));
  handle("studio:read", (_event, root) => studio.read(root));
  handle("studio:save", (_event, root, state) => studio.save(root, state));
  handle("studio:import", async (_event, root) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "导入图片、视频或音频",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "媒体",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "mp4",
            "mov",
            "m4v",
            "webm",
            "mkv",
            "wav",
            "mp3",
            "m4a",
            "aac",
          ],
        },
      ],
    });
    if (result.canceled) return null;
    let state;
    for (const source of result.filePaths)
      state = await studio.addMedia(root, source);
    return state;
  });
  handle("studio:clipboard", async () => ({
    text: await clipboard.readText(),
    image: await clipboard.has("image/png"),
  }));
  handle(
    "studio:import-at",
    async (_event, root, point, files, fromClipboard) => {
      studio.read(root);
      if (
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        Math.abs(point.x) > 80000 ||
        Math.abs(point.y) > 80000
      )
        throw Error("导入位置无效");
      let temporary;
      try {
        if (fromClipboard) {
          const item = (await clipboard.read()).find((item) =>
            item.types.includes("image/png"),
          );
          if (!item) return null;
          const bytes = Buffer.from(
            await (await item.getType("image/png")).arrayBuffer(),
          );
          if (bytes.length > 30 * 1024 * 1024)
            throw Error("剪贴板图片超过 30 MB");
          temporary = path.join(
            app.getPath("temp"),
            `cs-canvas-paste-${require("node:crypto").randomUUID()}.png`,
          );
          fs.writeFileSync(temporary, bytes, { mode: 0o600 });
          files = [temporary];
        } else if (!files) {
          const result = await dialog.showOpenDialog(mainWindow, {
            title: "添加素材节点",
            properties: ["openFile", "multiSelections"],
            filters: [
              {
                name: "媒体",
                extensions: [
                  "png",
                  "jpg",
                  "jpeg",
                  "webp",
                  "mp4",
                  "mov",
                  "m4v",
                  "webm",
                  "mkv",
                  "wav",
                  "mp3",
                  "m4a",
                  "aac",
                ],
              },
            ],
          });
          if (result.canceled) return null;
          files = result.filePaths;
        }
        if (
          !Array.isArray(files) ||
          !files.length ||
          files.length > 50 ||
          files.some((f) => typeof f !== "string" || !path.isAbsolute(f))
        )
          throw Error("每次导入 1–50 个本地媒体文件");
        if (
          (studio.read(root).canvas?.sources?.length || 0) + files.length >
          500
        )
          throw Error("素材节点数量已达上限");
        for (const [i, source] of files.entries()) {
          // Save each source node immediately so partial import failures retain usable results.
          const state = await studio.addMedia(root, source, {
            createClip: false,
            ...(fromClipboard ? { name: "粘贴的图片.png" } : {}),
          });
          const media = state.media.at(-1),
            id = require("node:crypto").randomUUID();
          const canvas = state.canvas || {
            positions: {},
            notes: [],
            view: { x: 65, y: 85, zoom: 0.85 },
          };
          state.canvas = {
            ...canvas,
            sources: [...(canvas.sources || []), { id, mediaId: media.id }],
            positions: {
              ...canvas.positions,
              [id]: {
                x: Math.min(90000, point.x + (i % 4) * 330),
                y: Math.min(90000, point.y + Math.floor(i / 4) * 290),
              },
            },
          };
          studio.save(root, state);
        }
        return studio.read(root);
      } finally {
        if (temporary) fs.rmSync(temporary, { force: true });
      }
    },
  );
  handle("studio:srt", async (_event, root, id) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "导入有时间码的字幕",
      properties: ["openFile"],
      filters: [{ name: "SRT 字幕", extensions: ["srt"] }],
    });
    if (result.canceled) return null;
    if (fs.statSync(result.filePaths[0]).size > 3000000)
      throw new Error("字幕文件过大");
    return studio.importSRT(
      root,
      id,
      fs.readFileSync(result.filePaths[0], "utf8"),
    );
  });
  handle("studio:transcribe", (_event, root, id) =>
    studio.transcribe(root, id),
  );
  handle("studio:silence", (_event, root, id, threshold, minimum) =>
    studio.silence(root, id, threshold, minimum),
  );
  handle("studio:media-url", (_event, root, id) => {
    const file = studio.mediaPath(root, id);
    const token = require("node:crypto").randomUUID();
    mediaTokens.set(token, file);
    return `cs-media://local/${token}`;
  });
  handle("studio:export", (_event, root) => studio.enqueue(root));
  handle("studio:jobs", () => studio.jobs());
  handle("studio:cancel", (_event, id) => studio.cancel(id));
  handle("studio:open-export", (_event, id) =>
    shell.openPath(studio.output(id)),
  );

  handle("douyin:list", () => douyin.list());
  handle("douyin:add", (_event, name, platform) => douyin.add(name, platform));
  handle("douyin:rename", (_event, id, name) => douyin.rename(id, name));
  handle("douyin:open", (_event, id) => douyin.open(id));
  handle("accounts:open-browser", (_event, id) => douyin.openBrowser(id));
  handle("douyin:remove", (_event, id) => douyin.remove(id));
  handle("bootstrap", () => ({
    config,
    projects: workbench.listProjects(config),
    catalog: workbench.libraryCatalog(config.library),
    tools: toolStatus(),
  }));
  handle("settings:choose", async (_event, kind) => {
    if (!["workspace", "library"].includes(kind)) throw new Error("未知设置");
    const folder = await chooseFolder(
      kind === "workspace" ? "选择项目工作区" : "选择声音与字体库",
    );
    if (!folder) return null;
    if (
      kind === "library" &&
      !fs.existsSync(path.join(folder, "manifest.json"))
    )
      throw new Error("此文件夹没有 manifest.json，请选择音效与配乐库根目录");
    config[kind] = folder;
    saveConfig();
    return {
      config,
      catalog: workbench.libraryCatalog(config.library),
      projects: workbench.listProjects(config),
    };
  });
  handle("project:create", (_event, input) => {
    const result = workbench.createProject(config, input);
    saveConfig();
    return result;
  });
  handle("project:import", async () => {
    const folder = await chooseFolder("选择已有内容工程");
    if (!folder) return null;
    const result = workbench.importProject(config, folder);
    saveConfig();
    return result;
  });
  handle("project:list", () => workbench.listProjects(config));
  handle("project:read", (_event, root) => workbench.readProject(config, root));
  handle("project:save-document", (_event, root, key, content) =>
    workbench.saveDocument(config, root, key, content),
  );
  handle("project:update-status", (_event, root, branch, status) =>
    workbench.updateStatus(config, root, branch, status),
  );
  handle("project:update-platform-status", (_event, root, platform, status) =>
    workbench.updatePlatformStatus(config, root, platform, status),
  );
  handle("project:qa", (_event, root) =>
    workbench.runQA(config, root, installedTool("ffprobe") || "ffprobe"),
  );
  handle("project:export", (_event, root, type) =>
    workbench.exportProject(
      config,
      root,
      type,
      installedTool("ffprobe") || "ffprobe",
    ),
  );
  handle("project:handoff", (_event, root) =>
    workbench.handoffPrompt(workbench.readProject(config, root)),
  );
  handle("library:catalog", () => workbench.libraryCatalog(config.library));
  handle("library:preview", (_event, id) =>
    workbench.previewAsset(config.library, id),
  );
  handle("library:add", (_event, root, id) =>
    workbench.addAsset(config, root, id),
  );
  handle("clipboard:write", async (_event, content) => {
    await clipboard.writeText(String(content));
    return true;
  });
  handle("open:target", async (_event, root, target) => {
    const project = workbench.readProject(config, root);
    const candidates = {
      project: project.path,
      article: path.join(
        project.path,
        project.managed ? "writing/article.md" : "文章.md",
      ),
      script: path.join(
        project.path,
        project.managed ? "writing/video-script.md" : "文案.md",
      ),
      video: project.video,
      outputs: path.join(project.path, project.managed ? "outputs" : "out"),
    };
    const file = candidates[target];
    if (!file || !fs.existsSync(file)) throw new Error("文件尚不存在");
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
    return true;
  });
  handle("open:library", async () => {
    if (!config.library) throw new Error("请先连接素材库");
    const error = await shell.openPath(config.library);
    if (error) throw new Error(error);
    return true;
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 680,
    title: "CS 工作台 Pro",
    show: !process.env.CS_WORKBENCH_USER_DATA_DIR,
    backgroundColor: "#111315",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  const editorURL = pathToFileURL(
    path.join(__dirname, "..", "dist", "index.html"),
  ).href;
  const allowEditorFullscreen = (contents, permission) =>
    permission === "fullscreen" &&
    contents === mainWindow?.webContents &&
    contents.getURL() === editorURL;
  mainWindow.webContents.session.setPermissionCheckHandler(
    (contents, permission) => allowEditorFullscreen(contents, permission),
  );
  mainWindow.webContents.session.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(allowEditorFullscreen(contents, permission)),
  );
  for (const event of ["enter-full-screen", "leave-full-screen"]) {
    mainWindow.on(event, () => {
      mainWindow?.webContents.send(
        "window:fullscreen-changed",
        mainWindow.isFullScreen() || mainWindow.isSimpleFullScreen(),
      );
    });
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}
app.whenReady().then(() => {
  configFile = path.join(app.getPath("userData"), "config.json");
  // Separate Pro data avoids concurrent writes from the still-installed original app.
  // Import only the existing workspace pointers, never authentication cookies or credentials.
  if (!fs.existsSync(configFile)) {
    const previous = path.join(
      app.getPath("appData"),
      "CS 工作台",
      "config.json",
    );
    if (fs.existsSync(previous) && previous !== configFile) {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.copyFileSync(previous, configFile);
    }
  }
  config = {
    ...workbench.defaultConfig(),
    ...workbench.readJson(configFile, {}),
  };
  if (!Array.isArray(config.projects)) config.projects = [];
  saveConfig();
  douyin = createDouyinManager(app.getPath("userData"), () => mainWindow);
  health = createHealth(app.getPath("userData"));
  contentOps = createContentOps(app.getPath("userData"));
  personal = createPersonal({
    userData: app.getPath("userData"),
    findTool: installedTool,
    secureStorage: safeStorage,
    onChange: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("personal:changed");
    },
  });
  studio = createStudio({
    config: () => config,
    tools: toolStatus,
    userData: app.getPath("userData"),
    onChange: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("studio:changed");
    },
  });
  videoProvider = createMetasoVideo({
    userData: app.getPath("userData"),
    secureStorage: safeStorage,
    findTool: installedTool,
  });
  generation = createGeneration({
    userData: app.getPath("userData"),
    studio,
    videoProvider,
    bridge: createImageBridge({ node: installedTool("node") }),
    onChange: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("generation:changed");
    },
  });
  generation.start();
  reunion = createReunion({
    userData: app.getPath("userData"),
    analyzer: createReunionAnalyzer({ findTool: installedTool }),
    bridge: createImageBridge({ node: installedTool("node") }),
    onChange: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("reunion:changed");
    },
  });
  reunion.start();
  protocol.handle("cs-media", (request) => {
    const file = mediaTokens.get(new URL(request.url).pathname.slice(1));
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).href, { headers: request.headers });
  });
  registerHandlers();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "CS 工作台",
        submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
      },
      {
        label: "编辑",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      { label: "窗口", submenu: [{ role: "minimize" }, { role: "zoom" }] },
    ]),
  );
  createWindow();
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  reunion?.shutdown();
  generation?.shutdown();
  studio?.shutdown();
  personal?.shutdown();
});
