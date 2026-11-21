const { session, dialog } = require("electron");
const { createAccountBrowser } = require("../lib/account-browser.cjs");
const { partitionFor, createAccountStore } = require("../lib/douyin-accounts.cjs");
const { createAccountDataStore, snapshotFromPage } = require("../lib/account-data.cjs");
const {
  defaultNetworkConfig,
  createProxySecretStore,
  createProxyBridgeManager,
  preflightProxy,
  probeNetwork,
  analyzeNetworkConflicts,
  detectLocalProxyPorts,
} = require("../lib/network-isolation.cjs");

function createDouyinManager(userData, getMainWindow, { secureStorage = null } = {}) {
  let store;
  const getStore = () => (store ||= createAccountStore(userData));
  let dataStore;
  const getDataStore = () => (dataStore ||= createAccountDataStore(userData));
  let secretStore;
  const getSecretStore = () => (secretStore ||= createProxySecretStore(userData, secureStorage));

  const browser = createAccountBrowser(userData);
  const proxyBridge = createProxyBridgeManager();
  const removing = new Set();
  const errors = new Map();

  const notify = () => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) main.webContents.send("accounts:changed");
  };

  const accountDataFields = (id) => {
    try {
      return { dataSnapshot: getDataStore().get(id), dataError: "" };
    } catch (error) {
      return {
        dataSnapshot: null,
        dataError: error.message || "账号数据缓存读取失败",
      };
    }
  };

  const list = () => {
    const raw = getStore().list().map((account) => ({
      ...account,
      network: {
        ...defaultNetworkConfig(),
        ...(account.network || {}),
        hasPassword: getSecretStore().has(account.id),
      },
      error: errors.get(account.id) || "",
      dataConnected: browser.isDataConnected(account.id),
      ...accountDataFields(account.id),
    }));
    const warnings = analyzeNetworkConflicts(raw);
    return raw.map((account) => ({
      ...account,
      networkWarnings: warnings[account.id] || [],
    }));
  };

  async function prepareProxyForLaunch(account) {
    const netCfg = { ...defaultNetworkConfig(), ...(account.network || {}) };
    if (netCfg.mode === "direct") return "";
    const password = getSecretStore().get(account.id);
    if (netCfg.failClosed !== false) {
      try {
        await preflightProxy(netCfg, password, 3500);
      } catch (err) {
        throw new Error(
          `代理不可用，已阻止启动 Chrome 以防止泄露本机 IP（${netCfg.protocol}://${netCfg.host}:${netCfg.port}：${err.message}）`,
        );
      }
    }
    const needsAuthBridge = netCfg.mode === "proxy" && Boolean(netCfg.username || password);
    if (needsAuthBridge) {
      return proxyBridge.ensureBridge(account.id, netCfg, password);
    }
    await proxyBridge.closeBridge(account.id);
    return "";
  }

  return {
    list,
    add(name, platform, networkInput = null) {
      let cleanNetwork = null;
      let password;
      if (networkInput && typeof networkInput === "object") {
        password = networkInput.password;
        const { password: _ignored, ...rest } = networkInput;
        cleanNetwork = rest;
      }
      const account = getStore().add(name, platform, cleanNetwork);
      if (password && cleanNetwork?.mode === "proxy") {
        getSecretStore().set(account.id, password);
        getStore().updateNetwork(account.id, { ...account.network, hasPassword: true });
      }
      notify();
      return list().find((item) => item.id === account.id);
    },
    rename(id, name) {
      const account = getStore().rename(id, name);
      notify();
      return account;
    },
    async updateNetwork(id, networkInput) {
      if (removing.has(id)) throw new Error("正在移除账号，请稍后再试");
      const { password, clearPassword, ...rest } = networkInput || {};
      const updated = getStore().updateNetwork(id, rest);
      if (updated.network.mode !== "proxy" || clearPassword) {
        getSecretStore().remove(id);
      } else if (typeof password === "string" && password.length > 0) {
        getSecretStore().set(id, password);
      }
      await proxyBridge.closeBridge(id);
      errors.delete(id);
      notify();
      return list().find((item) => item.id === id);
    },
    async checkNetwork(id) {
      if (removing.has(id)) throw new Error("正在移除账号，请稍后再试");
      const account = getStore().get(id);
      const netCfg = { ...defaultNetworkConfig(), ...(account.network || {}) };
      const password = getSecretStore().get(id);
      const result = await probeNetwork(netCfg, password);
      getStore().setNetworkCheck(id, result);
      notify();
      return result;
    },
    async detectLocalPorts() {
      return detectLocalProxyPorts();
    },
    async checkAllNetworks() {
      const accounts = getStore().list();
      const results = {};
      const queue = [...accounts];
      const concurrency = Math.min(4, queue.length || 1);
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (queue.length) {
            const acc = queue.shift();
            if (!acc || removing.has(acc.id)) continue;
            const netCfg = { ...defaultNetworkConfig(), ...(acc.network || {}) };
            const password = getSecretStore().get(acc.id);
            try {
              const res = await probeNetwork(netCfg, password);
              getStore().setNetworkCheck(acc.id, res);
              results[acc.id] = res;
            } catch (err) {
              const failed = {
                ok: false,
                ip: "",
                country: "",
                region: "",
                city: "",
                isp: "",
                latencyMs: 0,
                checkedAt: new Date().toISOString(),
                error: err.message || "检测失败",
              };
              getStore().setNetworkCheck(acc.id, failed);
              results[acc.id] = failed;
            }
          }
        }),
      );
      notify();
      return results;
    },
    async openBrowser(id, target = "home") {
      if (removing.has(id)) throw new Error("正在移除账号，请稍后再试");
      if (!["home", "publish", "data"].includes(target)) {
        throw new Error("不支持的打开目标");
      }
      const account = getStore().get(id);
      const proxyUrlOverride = await prepareProxyForLaunch(account);
      await browser.open(account, { target, proxyUrlOverride });
      getStore().opened(id, "chrome");
      errors.delete(id);
      notify();
    },
    async readData(id, { navigateToData = false } = {}) {
      if (removing.has(id)) throw new Error("正在移除账号，请稍后再试");
      const account = getStore().get(id);
      const proxyUrlOverride = await prepareProxyForLaunch(account);
      let page;
      try {
        page = await browser.readData(account, { proxyUrlOverride, navigateToData });
      } catch (error) {
        notify();
        throw error;
      }
      const snapshot = getDataStore().put(id, snapshotFromPage(page));
      getStore().opened(id, "chrome");
      errors.delete(id);
      notify();
      return snapshot;
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
            "将关闭此账号的独立 Chrome 窗口，并清除此账号在本机 cs-work 中的登录会话、代理密码与数据快照。线上平台账号和作品不会被删除。",
          buttons: ["取消", "移除并清除本地数据"],
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
        await proxyBridge.closeBridge(id);
        // Clean legacy Electron partition if it existed from earlier versions.
        try {
          const ses = session.fromPartition(partitionFor(id, account.platform));
          await ses.closeAllConnections();
          await ses.clearStorageData();
          await ses.clearCache();
          await ses.clearAuthCache();
        } catch {}
        getStore().remove(id);
        getDataStore().remove(id);
        getSecretStore().remove(id);
        errors.delete(id);
        notify();
        return true;
      } finally {
        removing.delete(id);
      }
    },
    async shutdown() {
      await proxyBridge.closeAll();
    },
  };
}

module.exports = { createDouyinManager };
