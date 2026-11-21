const fs = require("node:fs");
const path = require("node:path");

function parseMetricNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = String(raw || "").trim().replace(/,/g, "");
  if (!text || text === "--" || text === "暂无") return null;
  const match = text.match(/([+-]?\d+(?:\.\d+)?)\s*(亿|万|w|k|m)?/i);
  if (!match) return null;
  let value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] || "").toLowerCase();
  if (unit === "亿") value *= 100000000;
  else if (unit === "万" || unit === "w") value *= 10000;
  else if (unit === "m") value *= 1000000;
  else if (unit === "k") value *= 1000;
  return Math.round(value);
}

const KPI_PATTERNS = {
  followers: /(?:粉丝(?:总?数)?|关注者|订阅(?:者|人数)?|followers|subscribers)/i,
  views: /(?:(?:总)?播放(?:量)?|阅读(?:量)?|浏览(?:量)?|曝光(?:量)?|观看(?:次数)?|views|impressions)/i,
  likes: /(?:获赞|点赞(?:数)?|喜欢|likes)/i,
  comments: /(?:评论(?:数)?|comments)/i,
  saves: /(?:收藏(?:数)?|saves|bookmarks)/i,
  shares: /(?:分享(?:数)?|转发(?:数)?|shares|reposts)/i,
};

function extractKpisFromMetrics(metrics = [], explicitKpis = null) {
  const result = {
    followers: null,
    views: null,
    likes: null,
    comments: null,
    saves: null,
    shares: null,
  };
  if (explicitKpis && typeof explicitKpis === "object") {
    for (const key of Object.keys(result)) {
      const parsed = parseMetricNumber(explicitKpis[key]);
      if (parsed !== null) result[key] = parsed;
    }
  }
  if (explicitKpis && typeof explicitKpis === "object") return result;
  for (const line of metrics) {
    const str = String(line || "");
    for (const [key, regex] of Object.entries(KPI_PATTERNS)) {
      if (result[key] !== null) continue;
      if (!regex.test(str)) continue;
      const numMatch = str.match(/(\d[\d,.]*\s*(?:亿|万|w|k|m)?)/i);
      if (numMatch) {
        const parsed = parseMetricNumber(numMatch[1]);
        if (parsed !== null) result[key] = parsed;
      }
    }
  }
  return result;
}

function snapshotFromPage(page) {
  const metrics = Array.isArray(page.metrics)
    ? [...new Set(page.metrics.map((item) => String(item).trim().slice(0, 120)).filter(Boolean))].slice(0, 40)
    : [];
  const kpis = extractKpisFromMetrics(metrics, page.kpis);
  return {
    profileName: String(page.accountName || "").trim().slice(0, 80),
    accountId: String(page.accountId || "").trim().slice(0, 80),
    avatarDataUrl: typeof page.avatarDataUrl === "string" && page.avatarDataUrl.startsWith("data:image/png;base64,") && page.avatarDataUrl.length < 300100
      ? page.avatarDataUrl
      : "",
    pageHeading: String(page.heading || "").trim().slice(0, 80),
    pageTitle: String(page.title || "").trim().slice(0, 120),
    metrics,
    kpis,
  };
}

function computeDeltas(currentKpis, previousKpis) {
  if (!currentKpis || !previousKpis) return null;
  const deltas = {};
  let hasAny = false;
  for (const key of ["followers", "views", "likes", "comments", "saves", "shares"]) {
    if (typeof currentKpis[key] === "number" && typeof previousKpis[key] === "number") {
      deltas[key] = currentKpis[key] - previousKpis[key];
      hasAny = true;
    } else {
      deltas[key] = null;
    }
  }
  return hasAny ? deltas : null;
}

function hydrateSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kpis = raw.kpis || extractKpisFromMetrics(raw.metrics || []);
  const history = Array.isArray(raw.history) ? raw.history : [];
  const previous = history.length >= 2 ? history[history.length - 2]?.kpis : null;
  return {
    ...raw,
    kpis,
    history,
    deltas: computeDeltas(kpis, previous),
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
    get(id) {
      return snapshots[id] ? structuredClone(hydrateSnapshot(snapshots[id])) : null;
    },
    list() {
      const result = {};
      for (const [id, value] of Object.entries(snapshots)) {
        result[id] = hydrateSnapshot(value);
      }
      return structuredClone(result);
    },
    put(id, value) {
      const capturedAt = new Date().toISOString();
      const prev = snapshots[id];
      const prevHistory = Array.isArray(prev?.history) ? prev.history : [];
      const kpis = value.kpis || extractKpisFromMetrics(value.metrics || []);
      const historyEntry = { capturedAt, kpis };
      const history = [...prevHistory, historyEntry].slice(-60);
      const next = {
        ...value,
        kpis,
        capturedAt,
        history,
      };
      snapshots = { ...snapshots, [id]: next };
      save();
      return structuredClone(hydrateSnapshot(next));
    },
    remove(id) {
      const next = { ...snapshots };
      delete next[id];
      snapshots = next;
      save();
    },
  };
}

module.exports = {
  parseMetricNumber,
  extractKpisFromMetrics,
  createAccountDataStore,
  snapshotFromPage,
};
