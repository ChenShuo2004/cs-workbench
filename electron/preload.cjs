const { contextBridge, ipcRenderer, webUtils } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld(
  "cs",
  Object.freeze({
    appInfo: () => invoke("app:info"),

    postsImport: () => invoke("posts:import"),
    pathForFile:file=>webUtils.getPathForFile(file),
    settingsRead:()=>invoke("settings:read"),
    settingsSave:value=>invoke("settings:save",value),
    postsRead: () => invoke("posts:read"),
    postsDraft: (d) => invoke("posts:draft", d),
    postsDraftCreate: (initial) => invoke("posts:draft-create", initial),
    postsDraftDuplicate: (id) => invoke("posts:draft-duplicate", id),
    postsDraftSelect: (id) => invoke("posts:draft-select", id),
    postsDraftDelete: (id) => invoke("posts:draft-delete", id),
    postsMediaInfo: (filePath) => invoke("posts:media-info", filePath),
    postsStart: (d, ids) => invoke("posts:start", d, ids),
    postsRetry: (id) => invoke("posts:retry", id),
    postsMark: (id, url) => invoke("posts:mark", id, url),
    postsChoose: (kind) => invoke("posts:choose", kind),
    syncAll: () => invoke("accounts:sync-all"),
    closeAll: () => invoke("accounts:close-all"),
    clashRead: () => invoke("clash:read"),
    clashReload: () => invoke("clash:reload"),
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
    closeAccountBrowser: (id) => invoke("accounts:close-browser", id),
    readAccountData: (id, options) => invoke("accounts:read-data", id, options),
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
