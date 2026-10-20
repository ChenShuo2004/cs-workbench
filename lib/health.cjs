const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const METRICS = {
  steps: { label: "步数", unit: "步", min: 0, max: 200000 },
  distance: { label: "步行与跑步", unit: "公里", min: 0, max: 500 },
  weight: { label: "体重", unit: "公斤", min: 1, max: 500 },
  sleep: { label: "睡眠", unit: "小时", min: 0, max: 24 },
  restingHeartRate: { label: "静息心率", unit: "次/分", min: 1, max: 300 },
  energy: { label: "主观精力", unit: "/ 5", min: 1, max: 5 },
};
function dateValid(value, monthAllowed = false) {
  if (monthAllowed && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return true;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function createHealth(userData) {
  const dir = path.join(userData, "health"),
    file = path.join(dir, "records.json");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  function read() {
    if (!fs.existsSync(file)) return { version: 1, records: [] };
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw Error("健康记录损坏，原文件已保留");
    }
    if (data.version !== 1 || !Array.isArray(data.records))
      throw Error("健康记录格式无效，原文件已保留");
    return data;
  }
  // Shared by Electron and the scheduled local importer: never overwrite a concurrent writer.
  function mutate(fn) {
    const lock = path.join(dir, ".write-lock");
    let fd;
    try { fd = fs.openSync(lock, "wx", 0o600); }
    catch { throw Error("健康记录正在写入或上次写入意外中断，请稍后检查再试"); }
    try {
      const data = read();
      fn(data);
      if (fs.existsSync(file)) fs.copyFileSync(file, file + ".previous");
      fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(file + ".tmp", file);
    } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
    return snapshot();
  }
  function upsert(data, input) {
    const metric = METRICS[input.metric];
    if (!Object.hasOwn(METRICS, input.metric)) throw Error("不支持的健康指标");
    const date = String(input.date || "");
    if (!dateValid(date, true))
      throw Error("记录日期须为有效的 YYYY-MM-DD 或 YYYY-MM");
    if (
      input.value === "" ||
      input.value == null ||
      !Number.isFinite(Number(input.value))
    )
      throw Error("请输入有效数值");
    const value = Number(input.value);
    if (value < metric.min || value > metric.max)
      throw Error("数值超出可记录范围，请检查单位");
    if (["steps", "energy"].includes(input.metric) && !Number.isInteger(value))
      throw Error("此指标需要整数");
    const source = ["manual", "chatgpt-snapshot", "file-import"].includes(
      input.source,
    )
      ? input.source
      : "manual";
    const existing = data.records.find(
      (r) =>
        r.metric === input.metric && r.date === date && r.source === source,
    );
    if (existing && existing.value === value && existing.sourceLabel === input.sourceLabel) return false;
    const record = {
      id: existing?.id || crypto.randomUUID(),
      metric: input.metric,
      value,
      date,
      source,
      sourceLabel: String(
        input.sourceLabel || (source === "manual" ? "手动记录" : "本地导入"),
      ).slice(0, 200),
      recordedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, record);
    else data.records.push(record);
    if (data.records.length > 50000)
      throw Error("记录数量超过上限，请先导出归档");
    return true;
  }
  function save(input) { return mutate(data => upsert(data, input)); }
  function importObservation(input) {
    const observed = Date.parse(input.observedAt);
    if (!Number.isFinite(observed) || Math.abs(Date.now() - observed) > 15 * 60000)
      throw Error("仅接受本轮 15 分钟内核实的网页观察");
    const url = new URL(input.sourceUrl);
    if (url.origin !== "https://chatgpt.com" || url.pathname !== "/health" || input.appleHealthConnected !== true)
      throw Error("请先核实 ChatGPT Health 中 Apple 健康已连接");
    if (!Array.isArray(input.records) || !input.records.length || input.records.length > 500)
      throw Error("没有可同步的健康记录，保留原数据");
    const units = { steps: { count: 1, "/d": 1 }, distance: { km: 1, mi: 1.609344 }, weight: { kg: 1, lb: 0.45359237 }, sleep: { h: 1, min: 1 / 60 }, restingHeartRate: { bpm: 1, "/min": 1 } };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const seen = new Set();
    const records = input.records.map(r => {
      if (!Object.hasOwn(units, r.metric) || !Object.hasOwn(units[r.metric], r.unit)) throw Error("指标或原始单位不支持");
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) throw Error("原始数值无效");
      if (r.metric === "steps" && !Number.isInteger(r.value)) throw Error("步数需要整数");
      if (!dateValid(r.date, true) || r.date > today) throw Error("原始日期无效或晚于今天");
      const key = `${r.metric}:${r.date}`;
      if (seen.has(key)) throw Error("同一批观察中存在重复指标和日期");
      seen.add(key);
      return { metric: r.metric, date: r.date, value: Math.round(r.value * units[r.metric][r.unit] * 100) / 100, source: "chatgpt-snapshot", sourceLabel: `ChatGPT Health · Apple 健康 · 原值 ${r.value} ${r.unit}` };
    });
    return mutate(data => {
      let changed = 0;
      for (const record of records) if (upsert(data, record)) changed++;
      data.sync = { ...data.sync, method: "browser-observation", status: "ok", lastAttemptAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), observedAt: input.observedAt, lastDataDate: records.map(r => r.date).sort().at(-1), recordCount: records.length, changedCount: changed, error: "" };
    });
  }
  function syncFailure(message) {
    if (typeof message !== "string" || !message.trim()) throw Error("缺少失败原因");
    return mutate(data => { data.sync = { ...data.sync, method: "browser-observation", status: "error", lastAttemptAt: new Date().toISOString(), error: message.slice(0, 300) }; });
  }
  function configureSync(input) {
    if (!input.automationId || !input.scheduleLabel) throw Error("缺少已创建的自动任务信息");
    return mutate(data => { data.sync = { ...data.sync, method: "browser-observation", automationId: String(input.automationId), scheduleLabel: String(input.scheduleLabel), configuredAt: new Date().toISOString() }; });
  }
  function snapshot() {
    const data = read();
    return { ...data, dataPath: file, connection: data.sync?.automationId ? "scheduled-browser" : "local-only" };
  }
  return { snapshot, save, importObservation, syncFailure, configureSync };
}
module.exports = { createHealth, METRICS, dateValid };
