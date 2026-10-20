const { contextBridge, ipcRenderer, webUtils } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld(
  "cs",
  Object.freeze({
    reunionRead: () => invoke("reunion:read"),
    reunionImport: (files) => invoke("reunion:import", files?.map(file => webUtils.getPathForFile(file))),
    reunionSetting: (kind) => invoke("reunion:setting", kind),
    reunionRetry: (id) => invoke("reunion:retry", id),
    reunionPause: (id) => invoke("reunion:pause", id),
    reunionRecover: (id, remoteId) => invoke("reunion:recover", id, remoteId),
    reunionFolder: (id) => invoke("reunion:folder", id),
    reunionMedia: (id, role) => invoke("reunion:media", id, role),
    onReunionChanged: (callback) => {
      const fn = () => callback();
      ipcRenderer.on("reunion:changed", fn);
      return () => ipcRenderer.removeListener("reunion:changed", fn);
    },
    referencesRead: () => invoke("references:read"),
    referencesConnect: () => invoke("references:connect"),
    referencesMedia: (id, kind) => invoke("references:media", id, kind),
    referencesSource: (id) => invoke("references:source", id),
    referencesFolder: () => invoke("references:folder"),
    healthRead: () => invoke("health:read"),
    healthSave: (input) => invoke("health:save", input),
    healthOpen: () => invoke("health:open"),
    healthExport: () => invoke("health:export"),
    contentRead: () => invoke("content:read"),
    contentSave: (input) => invoke("content:save", input),
    contentExport: () => invoke("content:export"),
    personalXaiKey: (key) => invoke("personal:xai-key", key),
    personalGrokWeb: () => invoke("personal:grok-web"),
    personalRead: () => invoke("personal:read"),
    personalTask: (input) => invoke("personal:task", input),
    personalDaily: (date) => invoke("personal:daily", date),
    personalNote: (input) => invoke("personal:note", input),
    personalArchiveNote: (id) => invoke("personal:archive-note", id),
    personalJournal: (date, body) => invoke("personal:journal", date, body),
    personalConnect: () => invoke("personal:connect"),
    personalDisconnect: (id) => invoke("personal:disconnect", id),
    personalBrowse: (id, relative) => invoke("personal:browse", id, relative),
    personalFile: (id, relative) => invoke("personal:file", id, relative),
    personalOpen: (id, relative) => invoke("personal:open", id, relative),
    personalProviders: (force) => invoke("personal:providers", force),
    personalConversation: () => invoke("personal:conversation"),
    personalSend: (input) => invoke("personal:send", input),
    personalCancel: (id) => invoke("personal:cancel", id),
    personalRestore: () => invoke("personal:restore"),
    personalExport: () => invoke("personal:export"),
    onPersonalChanged: (callback) => {
      const fn = () => callback();
      ipcRenderer.on("personal:changed", fn);
      return () => ipcRenderer.removeListener("personal:changed", fn);
    },
    windowFullscreenState: () => invoke("window:fullscreen-state"),
    windowFullscreen: (enabled) => invoke("window:fullscreen", enabled),
    onWindowFullscreen: (callback) => {
      const fn = (_event, enabled) => callback(enabled);
      ipcRenderer.on("window:fullscreen-changed", fn);
      return () => ipcRenderer.removeListener("window:fullscreen-changed", fn);
    },
    generationStatus: () => invoke("generation:status"),
    generationPreviewGraph: (root, ids) =>
      invoke("generation:previewGraph", root, ids),
    generationEnqueueGraph: (root, ids) =>
      invoke("generation:enqueueGraph", root, ids),
    generationConfigureVideo: (key) => invoke("generation:configureVideo", key),
    generationList: (root) => invoke("generation:list", root),
    generationEnqueue: (root, input) =>
      invoke("generation:enqueue", root, input),
    generationPause: (id) => invoke("generation:pause", id),
    generationResume: (id) => invoke("generation:resume", id),
    generationAttach: (id) => invoke("generation:attach", id),
    generationAcknowledge: (id) => invoke("generation:acknowledge", id),
    onGenerationChanged: (callback) => {
      const fn = () => callback();
      ipcRenderer.on("generation:changed", fn);
      return () => ipcRenderer.removeListener("generation:changed", fn);
    },
    studioTempo: (root, id) => invoke("studio:tempo", root, id),
    studioPlan: (root, instruction) => invoke("studio:plan", root, instruction),
    studioValidatePlan: (root, text, fingerprint) =>
      invoke("studio:validate-plan", root, text, fingerprint),
    studioSnap: (root, id) => invoke("studio:snap", root, id),
    studioCaptions: (root) => invoke("studio:captions", root),
    studioOpenJimeng: () => invoke("studio:open-jimeng"),
    studioRead: (root) => invoke("studio:read", root),
    studioSave: (root, state) => invoke("studio:save", root, state),
    studioImport: (root) => invoke("studio:import", root),
    studioClipboard: () => invoke("studio:clipboard"),
    studioImportAt: (root, point, files, fromClipboard) =>
      invoke(
        "studio:import-at",
        root,
        point,
        files?.map((file) => webUtils.getPathForFile(file)),
        fromClipboard,
      ),
    studioSRT: (root, id) => invoke("studio:srt", root, id),
    studioTranscribe: (root, id) => invoke("studio:transcribe", root, id),
    studioSilence: (root, id, threshold, minimum) =>
      invoke("studio:silence", root, id, threshold, minimum),
    studioMediaURL: (root, id) => invoke("studio:media-url", root, id),
    studioExport: (root) => invoke("studio:export", root),
    studioJobs: () => invoke("studio:jobs"),
    studioCancel: (id) => invoke("studio:cancel", id),
    studioOpenExport: (id) => invoke("studio:open-export", id),
    onStudioChanged: (callback) => {
      const fn = () => callback();
      ipcRenderer.on("studio:changed", fn);
      return () => ipcRenderer.removeListener("studio:changed", fn);
    },
    bootstrap: () => invoke("bootstrap"),
    listDouyinAccounts: () => invoke("douyin:list"),
    addDouyinAccount: (name, platform) => invoke("douyin:add", name, platform),
    renameDouyinAccount: (id, name) => invoke("douyin:rename", id, name),
    openDouyinAccount: (id) => invoke("douyin:open", id),
    openAccountBrowser: (id) => invoke("accounts:open-browser", id),
    removeDouyinAccount: (id) => invoke("douyin:remove", id),
    onDouyinAccountsChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("douyin:changed", listener);
      return () => ipcRenderer.removeListener("douyin:changed", listener);
    },
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
