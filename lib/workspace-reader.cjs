const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("node:worker_threads");

if (!isMainThread) {
  const workbench = require("./workbench.cjs");
  try {
    parentPort.postMessage({
      result: {
        projects: workbench.listProjects(workerData),
        catalog: workbench.libraryCatalog(workerData.library),
      },
    });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
}

// External directories may wait on macOS permission, a cloud download, or a disk.
// Keep those reads off Electron's UI thread. Retries share the same pending read.
function createWorkspaceReader({ timeoutMs = 10000 } = {}) {
  let pending = null;
  let closed = false;
  function read(config) {
    if (closed) return Promise.reject(Error("工作台正在关闭"));
    const snapshot = structuredClone(config);
    const key = JSON.stringify(snapshot);
    if (pending && pending.key !== key)
      return Promise.reject(Error("上一次目录读取尚未结束，请稍后重试"));
    if (!pending) {
      const worker = new Worker(__filename, { workerData: snapshot });
      const entry = { key, worker };
      pending = entry;
      entry.promise = new Promise((resolve, reject) => {
        entry.reject = reject;
        worker.once("message", (message) => {
          if (message.error) reject(Error(message.error));
          else resolve(message.result);
        });
        worker.once("error", reject);
        worker.once("exit", () => reject(Error("目录读取未完成，请重试")));
      }).finally(() => {
        if (pending === entry) pending = null;
      });
      worker.unref();
    }
    const flight = pending.promise;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            Error(
              "读取项目或素材库超时。请检查 macOS 文件访问提示，或确认目录仍可用，然后重试。",
            ),
          ),
        timeoutMs,
      );
      flight.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }
  function shutdown() {
    closed = true;
    if (!pending) return;
    pending.reject(Error("工作台正在关闭"));
    void pending.worker.terminate().catch(() => {});
  }
  return { read, shutdown };
}

module.exports = { createWorkspaceReader };
