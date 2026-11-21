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

// Allows isolated acceptance tests without touching personal data.
if (process.env.CS_WORKBENCH_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.CS_WORKBENCH_USER_DATA_DIR));
}

const { createDouyinManager } = require("./douyin.cjs");
const { createMaitian } = require("../lib/maitian.cjs");

let mainWindow;
let configFile;
let config;
let accounts;
let maitian;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
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
    maitianRoot: config.maitianRoot || path.join(os.homedir(), "maitian/mdldm-maitian"),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  }));

  handle("maitian:read", () => maitian.snapshot());
  handle("maitian:connect", async () => {
    const folder = await chooseFolder("选择麦田仓库（mdldm-maitian）");
    if (!folder) return null;
    const previous = config.maitianRoot;
    config.maitianRoot = folder;
    try {
      maitian.installation();
      saveConfig();
    } catch (e) {
      config.maitianRoot = previous;
      throw e;
    }
    return maitian.snapshot();
  });
  handle("maitian:open", () => shell.openExternal(maitian.dashboardURL()));

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
  handle("accounts:open-browser", (_e, id, target) =>
    accounts.openBrowser(id, target || "home"),
  );
  handle("accounts:read-data", (_e, id, options) =>
    accounts.readData(id, options || {}),
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
    title: "cs-work",
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

  // Inject Maitian auth cookie strictly for the configured local 127.0.0.1 origin.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["http://127.0.0.1/*"] },
    (details, callback) => {
      const requestHeaders =
        details.webContentsId === mainWindow?.webContents.id
          ? maitian.frameHeaders(details.url, details.requestHeaders)
          : details.requestHeaders;
      callback({ requestHeaders });
    },
  );

  mainWindow.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame && !maitian.acceptsURL(event.url)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (
      maitian.acceptsURL(details.referrer?.url) &&
      /^https?:\/\//.test(details.url)
    ) {
      void shell.openExternal(details.url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.session.setPermissionRequestHandler((_c, _p, cb) => cb(false));

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
    for (const fileName of ["config.json", "douyin-accounts.json", "account-data.json"]) {
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
  maitian = createMaitian({ getConfig: () => config });

  registerHandlers();

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "cs-work",
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

app.on("will-quit", () => {
  void accounts?.shutdown();
});
