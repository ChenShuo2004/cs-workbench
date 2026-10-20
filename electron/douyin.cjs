const { BrowserWindow, session, dialog } = require("electron");
const { createAccountBrowser } = require("../lib/account-browser.cjs");
const {
  platformFor,
  partitionFor,
  isPlatformURL,
  createAccountStore,
} = require("../lib/douyin-accounts.cjs");

function createDouyinManager(userData, getMainWindow) {
  let store;
  const getStore = () => (store ||= createAccountStore(userData));
  const windows = new Map();
  const browser = createAccountBrowser(userData);
  const removing = new Set();
  const errors = new Map();
  const notify = () => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) main.webContents.send("douyin:changed");
  };
  const list = () =>
    getStore()
      .list()
      .map((account) => ({
        ...account,
        isOpen: Boolean(windows.get(account.id)?.size),
        error: errors.get(account.id) || "",
      }));
  const preferences = (id) => ({
    partition: partitionFor(id, getStore().get(id).platform),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
    navigateOnDragDrop: false,
  });
  function guard(win, id) {
    if (!windows.has(id)) windows.set(id, new Set());
    windows.get(id).add(win);
    const title = () => `${getStore().get(id).name} · ${platformFor(getStore().get(id).platform).title}`;
    win.setTitle(title());
    win.webContents.on("page-title-updated", (event) => {
      event.preventDefault();
      win.setTitle(title());
    });
    const navigate = (event, legacyURL) => {
      const url = event.url || legacyURL;
      if (!isPlatformURL(url, getStore().get(id).platform)) {
        event.preventDefault();
        let host = "未知地址";
        try { host = new URL(url).hostname; } catch {}
        errors.set(id, `内置窗口阻止了跳转到 ${host}，请使用「打开 Chrome / 登录」。`);
        notify();
      }
    };
    win.webContents.on("will-navigate", navigate);
    win.webContents.on("will-redirect", navigate);
    win.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    win.webContents.setWindowOpenHandler(({ url }) =>
      isPlatformURL(url, getStore().get(id).platform)
        ? {
            action: "allow",
            overrideBrowserWindowOptions: {
              width: 1100,
              height: 800,
              autoHideMenuBar: true,
              webPreferences: preferences(id),
            },
          }
        : { action: "deny" },
    );
    win.webContents.on("did-create-window", (child) => {
      guard(child, id);
      notify();
    });
    win.webContents.on(
      "did-fail-load",
      (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
          errors.set(id, `后台加载失败（${code}），请检查网络后重新打开`);
          notify();
        }
      },
    );
    win.webContents.on("did-finish-load", () => {
      errors.delete(id);
      notify();
    });
    win.webContents.on("render-process-gone", () => {
      errors.set(id, "后台页面已停止响应，请关闭后重新打开");
      notify();
    });
    win.on("closed", () => {
      windows.get(id)?.delete(win);
      notify();
    });
    return win;
  }
  return {
    list,
    add(name, platform) {
      const account = getStore().add(name, platform);
      notify();
      return account;
    },
    rename(id, name) {
      const account = getStore().rename(id, name);
      for (const win of windows.get(id) || [])
        win.setTitle(`${account.name} · ${platformFor(account.platform).title}`);
      notify();
      return account;
    },
    async openBrowser(id) {
      if (removing.has(id)) throw new Error("正在移除账号，请稍后再试");
      const account = getStore().get(id);
      await browser.open(account);
      getStore().opened(id, "chrome");
      notify();
    },
    open(id) {
      const account = getStore().get(id);
      if (removing.has(id)) throw new Error("正在移除账号，请稍后再试");
      const existing = [...(windows.get(id) || [])].find(
        (win) => !win.isDestroyed(),
      );
      if (existing) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        if (errors.has(id)) {
          errors.delete(id);
          existing.loadURL(platformFor(account.platform).url).catch(() => {});
        }
        notify();
        return;
      }
      const ses = session.fromPartition(partitionFor(id, getStore().get(id).platform));
      ses.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      ses.setPermissionCheckHandler(() => false);
      const win = guard(
        new BrowserWindow({
          width: 1280,
          height: 860,
          minWidth: 800,
          minHeight: 600,
          title: `${account.name} · ${platformFor(account.platform).title}`,
          autoHideMenuBar: true,
          webPreferences: preferences(id),
        }),
        id,
      );
      getStore().opened(id);
      errors.delete(id);
      notify();
      win.loadURL(platformFor(account.platform).url).catch(() => {});
    },
    async remove(id) {
      const account = getStore().get(id);
      if (removing.has(id)) throw new Error("正在移除账号，请稍后再试");
      removing.add(id);
      try {
        const options = {
          type: "warning",
          title: "移除平台账号",
          message: `移除「${account.name}」？`,
          detail:
            "将关闭此账号的独立 Chrome 和内置后台窗口，并清除此账号在本机工作台中的登录数据。平台账号和线上作品不会被删除。",
          buttons: ["取消", "移除并清除登录数据"],
          defaultId: 0,
          cancelId: 0,
        };
        const main = getMainWindow();
        const result =
          main && !main.isDestroyed()
            ? await dialog.showMessageBox(main, options)
            : await dialog.showMessageBox(options);
        if (result.response !== 1) return false;
        await browser.remove(account);
        for (const win of windows.get(id) || []) win.destroy();
        const ses = session.fromPartition(partitionFor(id, getStore().get(id).platform));
        await ses.closeAllConnections();
        await ses.clearStorageData();
        await ses.clearCache();
        await ses.clearAuthCache();
        getStore().remove(id);
        windows.delete(id);
        errors.delete(id);
        notify();
        return true;
      } finally {
        removing.delete(id);
      }
    },
  };
}
module.exports = { createDouyinManager };
