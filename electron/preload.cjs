const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld(
  "cs",
  Object.freeze({
    appInfo: () => invoke("app:info"),

    maitianRead: () => invoke("maitian:read"),
    maitianConnect: () => invoke("maitian:connect"),
    maitianOpen: () => invoke("maitian:open"),

    listAccounts: () => invoke("accounts:list"),
    addAccount: (name, platform, network) =>
      invoke("accounts:add", name, platform, network),
    renameAccount: (id, name) => invoke("accounts:rename", id, name),
    updateAccountNetwork: (id, network) =>
      invoke("accounts:update-network", id, network),
    checkAccountNetwork: (id) => invoke("accounts:check-network", id),
    checkAllAccountNetworks: () => invoke("accounts:check-all-networks"),
    detectLocalProxyPorts: () => invoke("accounts:detect-local-ports"),
    openAccountBrowser: (id, target) =>
      invoke("accounts:open-browser", id, target),
    readAccountData: (id, options) =>
      invoke("accounts:read-data", id, options),
    removeAccount: (id) => invoke("accounts:remove", id),
    onAccountsChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("accounts:changed", listener);
      return () => ipcRenderer.removeListener("accounts:changed", listener);
    },

    copy: (text) => invoke("clipboard:write", text),
    openUserData: () => invoke("open:user-data"),
  }),
);
