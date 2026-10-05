const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
  Menu,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const workbench = require("../lib/workbench.cjs");

let mainWindow;
let configFile;
let config;

function saveConfig() {
  workbench.writeJson(configFile, config);
}
function installedTool(name) {
  for (const base of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) {
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
function registerHandlers() {
  ipcMain.handle("bootstrap", () => ({
    config,
    projects: workbench.listProjects(config),
    catalog: workbench.libraryCatalog(config.library),
    tools: toolStatus(),
  }));
  ipcMain.handle("settings:choose", async (_event, kind) => {
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
  ipcMain.handle("project:create", (_event, input) => {
    const result = workbench.createProject(config, input);
    saveConfig();
    return result;
  });
  ipcMain.handle("project:import", async () => {
    const folder = await chooseFolder("选择已有内容工程");
    if (!folder) return null;
    const result = workbench.importProject(config, folder);
    saveConfig();
    return result;
  });
  ipcMain.handle("project:list", () => workbench.listProjects(config));
  ipcMain.handle("project:read", (_event, root) =>
    workbench.readProject(config, root),
  );
  ipcMain.handle("project:save-document", (_event, root, key, content) =>
    workbench.saveDocument(config, root, key, content),
  );
  ipcMain.handle("project:update-status", (_event, root, branch, status) =>
    workbench.updateStatus(config, root, branch, status),
  );
  ipcMain.handle(
    "project:update-platform-status",
    (_event, root, platform, status) =>
      workbench.updatePlatformStatus(config, root, platform, status),
  );
  ipcMain.handle("project:qa", (_event, root) =>
    workbench.runQA(config, root, installedTool("ffprobe") || "ffprobe"),
  );
  ipcMain.handle("project:export", (_event, root, type) =>
    workbench.exportProject(config, root, type),
  );
  ipcMain.handle("project:handoff", (_event, root) =>
    workbench.handoffPrompt(workbench.readProject(config, root)),
  );
  ipcMain.handle("library:catalog", () =>
    workbench.libraryCatalog(config.library),
  );
  ipcMain.handle("library:preview", (_event, id) =>
    workbench.previewAsset(config.library, id),
  );
  ipcMain.handle("library:add", (_event, root, id) =>
    workbench.addAsset(config, root, id),
  );
  ipcMain.handle("clipboard:write", (_event, content) => {
    clipboard.writeText(String(content));
    return true;
  });
  ipcMain.handle("open:target", async (_event, root, target) => {
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
  ipcMain.handle("open:library", async () => {
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
    title: "CS 工作台",
    backgroundColor: "#f5f7f5",
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
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}
app.whenReady().then(() => {
  configFile = path.join(app.getPath("userData"), "config.json");
  config = {
    ...workbench.defaultConfig(),
    ...workbench.readJson(configFile, {}),
  };
  if (!Array.isArray(config.projects)) config.projects = [];
  saveConfig();
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
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
