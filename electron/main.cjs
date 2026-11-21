const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
  Menu,
  safeStorage,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Preserve the existing account profiles when the product name changes.
app.setPath("userData", path.join(app.getPath("appData"), "cs-work"));

// Allows isolated acceptance tests without touching personal data.
if (process.env.CS_WORKBENCH_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.CS_WORKBENCH_USER_DATA_DIR));
}

if (!process.env.CS_WORKBENCH_USER_DATA_DIR && !app.requestSingleInstanceLock()) app.quit();
app.on("second-instance",()=>{if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.show();mainWindow.focus();}});

const { createDouyinManager } = require("./douyin.cjs");
const { createPostStore } = require("../lib/post-store.cjs");
const { createPublisher } = require("../lib/publisher/engine.cjs");
const { readListeners } = require("../lib/clash-verge.cjs");

let mainWindow;
let configFile;
let config;
let accounts;
let posts;
let publisher;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(`${file}.tmp`, file);
}

function saveConfig() {
  writeJson(configFile, config);
}

function chooseFolder(title) {
  return dialog
    .showOpenDialog(mainWindow, {
      title,
      properties: ["openDirectory"],
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
    ) {
      throw new Error("此窗口无权访问 cs-work 数据");
    }
    return listener(event, ...args);
  });
}

function registerHandlers() {
  handle("app:info", () => ({
    version: app.getVersion(),
    userDataPath: app.getPath("userData"),

    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  }));

  handle("posts:import", async () => {
    const folder = await chooseFolder("选择发布素材工程目录");
    if (!folder) return null;
    const files = fs.readdirSync(folder);
    const video =
      files.find((f) => /成片.*\.(mp4|mov)$/i.test(f)) ||
      files.find((f) => /\.(mp4|mov)$/i.test(f));
    const draft = {
      ...posts.read().draft,
      video: video ? path.join(folder, video) : "",
      covers: {},
    };
    for (const sub of [folder, path.join(folder, "封面")])
      if (fs.existsSync(sub))
        for (const f of fs.readdirSync(sub)) {
          const key = /16.?9/.test(f)
            ? "16x9"
            : /3.?4/.test(f)
              ? "3x4"
              : /4.?3/.test(f)
                ? "4x3"
                : "";
          if (key && /\.(png|jpe?g)$/i.test(f))
            draft.covers[key] = path.join(sub, f);
        }
    const copy = path.join(folder, "发布素材.md");
    if (fs.existsSync(copy)) {
      const text = fs.readFileSync(copy, "utf8");
      draft.title = text.match(/^#\s+(.+)$/m)?.[1] || draft.title;
      draft.body = text.replace(/^#\s+.+\n?/, "").trim();
    }
    return posts.draft(draft);
  });
  handle("posts:read", () => posts.read());
  handle("posts:draft", (_e, d) => posts.draft(d));
  handle("posts:start", (_e, d, ids) => publisher.start(d, ids));
  handle("posts:retry", (_e, id) => {
    const r = posts.read().records.find((r) => r.id === id);
    if (!r || r.status !== "失败") throw Error("此任务无法重试");
    return publisher.start(r.draft, [r.accountId]);
  });
  handle("posts:mark", (_e, id, url) => posts.mark(id, url));
  handle("posts:choose", async (_e, kind) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        {
          name: kind === "video" ? "视频" : "图片",
          extensions:
            kind === "video"
              ? ["mp4", "mov", "m4v", "webm"]
              : ["png", "jpg", "jpeg"],
        },
      ],
    });
    return result.canceled ? "" : result.filePaths[0];
  });
  handle("accounts:sync-all", () => {
    if (publisher.busy()) throw Error("请等待填表任务结束再同步数据");
    return accounts.syncAll();
  });
  handle("accounts:close-all", () => {
    if (publisher.busy()) throw Error("请等待填表任务结束再关闭窗口");
    return accounts.closeAll();
  });
  handle("clash:read", () => readListeners(config.clashPath));
  handle("settings:read",()=>({concurrency:config.concurrency||2,clashPath:config.clashPath||""}));
  handle("settings:save",(_e,value)=>{if(!Number.isInteger(value.concurrency)||value.concurrency<1||value.concurrency>4)throw Error("并发需要为 1 至 4");if(value.clashPath&&(!path.isAbsolute(value.clashPath)||!fs.existsSync(value.clashPath)))throw Error("Clash 配置文件不存在");config.concurrency=value.concurrency;config.clashPath=String(value.clashPath||"");saveConfig();return {concurrency:config.concurrency,clashPath:config.clashPath};});
  handle("accounts:list", () => accounts.list());
  handle("accounts:add", (_e, name, platform, network) =>
    accounts.add(name, platform, network),
  );
  handle("accounts:rename", (_e, id, name) => accounts.rename(id, name));
  handle("accounts:update-network", (_e, id, network) =>
    accounts.updateNetwork(id, network),
  );
  handle("accounts:check-network", (_e, id) => accounts.checkNetwork(id));
  handle("accounts:check-all-networks", () => accounts.checkAllNetworks());
  handle("accounts:detect-local-ports", () => accounts.detectLocalPorts());
  handle("accounts:open-browser", (_e, id, target) =>
    accounts.openBrowser(id, target || "home"),
  );
  handle("accounts:read-data", (_e, id, options) =>
    publisher.busy()
      ? Promise.reject(Error("请等待填表任务结束再读取数据"))
      : accounts.readData(id, options || {}),
  );
  handle("accounts:remove", (_e, id) => accounts.remove(id));

  handle("clipboard:write", async (_e, content) => {
    await clipboard.writeText(String(content));
    return true;
  });
  handle("open:user-data", async () => {
    const error = await shell.openPath(app.getPath("userData"));
    if (error) throw new Error(error);
    return true;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "Kaige-work",
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
  mainWindow.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame) event.preventDefault();
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.session.setPermissionRequestHandler((_c, _p, cb) =>
    cb(false),
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  const userDataDir = app.getPath("userData");
  configFile = path.join(userDataDir, "config.json");

  // Migrate config and account list from prior CS Workbench Pro installs on first launch,
  // preserving original backups intact. Skip during isolated test runs.
  if (!process.env.CS_WORKBENCH_USER_DATA_DIR) {
    const legacyAppDirs = [
      path.join(app.getPath("appData"), "CS 工作台 Pro"),
      path.join(app.getPath("appData"), "CS 工作台"),
    ];
    for (const fileName of [
      "config.json",
      "douyin-accounts.json",
      "account-data.json",
    ]) {
      const dest = path.join(userDataDir, fileName);
      if (fs.existsSync(dest)) continue;
      for (const legacyDir of legacyAppDirs) {
        const source = path.join(legacyDir, fileName);
        if (fs.existsSync(source) && source !== dest) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(source, dest);
          break;
        }
      }
    }
  }

  config = { version: 1, ...readJson(configFile, {}) };
  saveConfig();

  accounts = createDouyinManager(userDataDir, () => mainWindow, {
    secureStorage: safeStorage,
  });
  posts = createPostStore(userDataDir);
  publisher = createPublisher({ store: posts, accounts, getConcurrency:()=>config.concurrency||2 });

  registerHandlers();

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Kaige-work",
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
  if (process.env.KAIGE_LOGIN_SETUP === "1") {
    void (async()=>{const report=[];for(const a of accounts.list()){try{await accounts.openBrowser(a.id,"home");report.push({name:a.name,status:"已打开，可检查登录"});}catch(e){report.push({name:a.name,status:e.message});}}writeJson(path.join(userDataDir,"login-setup-report.json"),report);})();
  }

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

let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  const pending =
    publisher?.busy() ||
    posts?.read().records.some((r) => r.status === "待你确认");
  if (pending) {
    event.preventDefault();
    dialog
      .showMessageBox({
        type: "warning",
        message: "还有运行中或待确认的发布任务",
        detail: "退出可能关闭账号窗口，请先检查平台草稿。",
        buttons: ["继续工作", "退出"],
        cancelId: 0,
        defaultId: 0,
      })
      .then((r) => {
        if (r.response === 1) {
          quitting = true;
          app.quit();
        }
      });
  }
});
app.on("will-quit", () => {
  void accounts?.shutdown();
});
