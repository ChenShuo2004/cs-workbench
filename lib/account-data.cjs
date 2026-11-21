const fs = require("node:fs");
const path = require("node:path");

function snapshotFromPage(page) {
  const metrics = Array.isArray(page.metrics)
    ? [...new Set(page.metrics.map((item) => String(item).trim().slice(0, 120)).filter(Boolean))].slice(0, 40)
    : [];
  return {
    profileName: String(page.accountName || "").trim().slice(0, 80),
    accountId: String(page.accountId || "").trim().slice(0, 80),
    avatarDataUrl: typeof page.avatarDataUrl === "string" && page.avatarDataUrl.startsWith("data:image/png;base64,") && page.avatarDataUrl.length < 300100
      ? page.avatarDataUrl
      : "",
    pageHeading: String(page.heading || "").trim().slice(0, 80),
    pageTitle: String(page.title || "").trim().slice(0, 120),
    metrics,
  };
}

function createAccountDataStore(userData) {
  const file = path.join(userData, "account-data.json");
  let snapshots = {};
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) snapshots = saved;
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("账号数据快照无法读取，原文件未修改");
  }

  function save() {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(snapshots, null, 2), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
  }

  return {
    get(id) { return snapshots[id] ? structuredClone(snapshots[id]) : null; },
    list() { return structuredClone(snapshots); },
    put(id, value) {
      snapshots = { ...snapshots, [id]: { ...value, capturedAt: new Date().toISOString() } };
      save();
      return structuredClone(snapshots[id]);
    },
    remove(id) {
      const next = { ...snapshots };
      delete next[id];
      snapshots = next;
      save();
    },
  };
}

module.exports = { createAccountDataStore, snapshotFromPage };
