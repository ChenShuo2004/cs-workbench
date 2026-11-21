const fs = require("node:fs");
const path = require("node:path");
const { dateValid } = require("./health.cjs");
function createContentOps(userData) {
  const dir = path.join(userData, "content-ops"),
    file = path.join(dir, "plans.json");
  fs.mkdirSync(dir, { recursive: true });
  function read() {
    if (!fs.existsSync(file)) return { version: 1, plans: [] };
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw Error("内容计划损坏，原文件已保留");
    }
    if (data.version !== 1 || !Array.isArray(data.plans))
      throw Error("内容计划格式无效");
    return data;
  }
  function save(input, projects) {
    if (!projects.some((p) => p.path === input.project))
      throw Error("请先选择已连接的内容项目");
    const data = read(),
      existing = data.plans.find((p) => p.project === input.project);
    const plan = {
      project: input.project,
      updatedAt: new Date().toISOString(),
    };
    for (const key of [
      "audience",
      "promise",
      "hook",
      "evidence",
      "cta",
      "nextAction",
      "platform",
      "learning",
    ])
      plan[key] = String(input[key] || "")
        .trim()
        .slice(0, 5000);
    plan.priority = ["high", "normal", "low"].includes(input.priority)
      ? input.priority
      : "normal";
    plan.plannedDate = String(input.plannedDate || "");
    if (plan.plannedDate && !dateValid(plan.plannedDate))
      throw Error("计划日期无效");
    plan.resultUrl = String(input.resultUrl || "")
      .trim()
      .slice(0, 2048);
    if (plan.resultUrl) {
      let u;
      try {
        u = new URL(plan.resultUrl);
      } catch {
        throw Error("发布链接无效");
      }
      if (!["https:", "http:"].includes(u.protocol))
        throw Error("发布链接须为 HTTP 或 HTTPS");
    }
    plan.measuredAt = String(input.measuredAt || "");
    if (plan.measuredAt && !dateValid(plan.measuredAt))
      throw Error("统计日期无效");
    for (const key of ["views", "saves", "comments"]) {
      const raw = input[key];
      plan[key] = raw === "" || raw == null ? null : Number(raw);
      if (
        plan[key] !== null &&
        (!Number.isSafeInteger(plan[key]) || plan[key] < 0)
      )
        throw Error("效果数据需要非负整数");
    }
    if (
      ["views", "saves", "comments"].some((k) => plan[k] !== null) &&
      (!plan.measuredAt || !plan.resultUrl)
    )
      throw Error("记录效果数据时，请同时填写发布链接与统计日期");
    if (existing) Object.assign(existing, plan);
    else data.plans.push(plan);
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".previous");
    fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
    fs.renameSync(file + ".tmp", file);
    return read();
  }
  return { read, save };
}
module.exports = { createContentOps };
