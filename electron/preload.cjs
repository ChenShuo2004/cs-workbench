const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld(
  "cs",
  Object.freeze({
    bootstrap: () => invoke("bootstrap"),
    chooseSetting: (kind) => invoke("settings:choose", kind),
    createProject: (input) => invoke("project:create", input),
    importProject: () => invoke("project:import"),
    listProjects: () => invoke("project:list"),
    readProject: (root) => invoke("project:read", root),
    saveDocument: (root, key, content) =>
      invoke("project:save-document", root, key, content),
    updateStatus: (root, branch, status) =>
      invoke("project:update-status", root, branch, status),
    updatePlatformStatus: (root, platform, status) =>
      invoke("project:update-platform-status", root, platform, status),
    runQA: (root) => invoke("project:qa", root),
    exportProject: (root, type) => invoke("project:export", root, type),
    handoff: (root) => invoke("project:handoff", root),
    catalog: () => invoke("library:catalog"),
    previewAsset: (id) => invoke("library:preview", id),
    addAsset: (root, id) => invoke("library:add", root, id),
    copy: (text) => invoke("clipboard:write", text),
    openTarget: (root, target) => invoke("open:target", root, target),
    openLibrary: () => invoke("open:library"),
  }),
);
