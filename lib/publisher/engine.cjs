const fs = require("fs"),
  { randomUUID } = require("crypto");
const rules = require("../../shared/platform-rules.json"),
  { waitFor, evaluate } = require("./cdp.cjs");
function payload(d, platform) {
  const p = { ...d, ...d.overrides?.[platform] };
  const topics = String(p.topics || "")
    .split(/[\s,#，]+/)
    .filter(Boolean);
  const body = p.body || "";
  const text = [p.title, body, topics.map((t) => "#" + t).join(" ")]
    .filter(Boolean)
    .join("\n");
  return {
    ...p,
    body,
    desc: body,
    shortTitle: p.title,
    text,
    caption: text,
    topics,
    tags: topics,
  };
}
function weighted(text) {
  return [...text.replace(/https?:\/\/\S+/g, "x".repeat(23))].reduce(
    (n, c) => n + (c.codePointAt(0) > 0x10ff ? 2 : 1),
    0,
  );
}
function validate(d, platform) {
  const p = payload(d, platform),
    r = rules[platform];
  if (!r) throw Error("未知平台");
  if (!p.title?.trim()) throw Error("请填写标题");
  if (r.title && [...p.title].length > r.title)
    throw Error(`标题超过 ${r.title} 字`);
  if (r.minTitle && [...p.title].length < r.minTitle)
    throw Error(`短标题至少 ${r.minTitle} 字`);
  if (r.body && [...p.body].length > r.body)
    throw Error(`正文超过 ${r.body} 字`);
  if (
    r.total &&
    (platform === "x" ? weighted(p.text) : [...p.text].length) > r.total
  )
    throw Error(`总字数超过 ${r.total}`);
  return p;
}
function createPublisher({ store, accounts, getConcurrency=()=>2 }) {
  let running = false;
  const active = new Set();
  for (const r of store.read().records)
    if (!["失败", "待你确认", "已发布（手动标记）"].includes(r.status)) {
      r.status = "失败";
      r.logs.push("程序退出中断，请检查平台页面后再重试");
      store.record(r);
    }
  return {
    busy: () => running,
    async start(d, ids) {
      if (running) throw Error("已有分发任务正在运行");
      if (!Array.isArray(ids) || !ids.length) throw Error("请选择账号");
      const all = accounts.list();
      const jobs = [...new Set(ids)].map((id) => {
        const a = all.find((a) => a.id === id);
        if (!a) throw Error("账号不存在");
        validate(d, a.platform);
        if (
          store
            .read()
            .records.some(
              (r) =>
                r.accountId === id &&
                ["排队", "启动窗口", "上传中", "填写中", "待你确认"].includes(
                  r.status,
                ),
            )
        )
          throw Error(a.name + " 已有任务，请先检查原任务");
        if (a.networkWarnings.some((w) => /冲突|共用/.test(w)))
          throw Error(a.name + " 网络冲突，请先处理");
        if (
          a.platform !== "wechat" &&
          (!fs.existsSync(d.video) || !fs.statSync(d.video).isFile())
        )
          throw Error("请选择有效视频");
        return {
          id: randomUUID(),
          accountId: id,
          name: a.name,
          platform: a.platform,
          status: "排队",
          logs: [],
          createdAt: new Date().toISOString(),
          draft: structuredClone(d),
        };
      });
      for (const j of jobs) store.record(j);
      running = true;
      const work = async () => {
        while (jobs.length) {
          const j = jobs.shift();
          active.add(j.accountId);
          const update = (s, m) => {
            j.status = s;
            if (m) j.logs.push(m);
            store.record(j);
          };
          try {
            update("启动窗口", "准备隔离账号窗口");
            const a = all.find((a) => a.id === j.accountId);
            await accounts.openBrowser(a.id, "publish");
            const tab = await accounts.publisherConnection(a.id);
            const adapter = require(
              "./adapters/" + a.platform + ".cjs",
            ).default;
            // Navigate within this account's existing pipe; never expose a TCP debugging port.
            if (adapter.url)
              await tab.send("Page.navigate", { url: adapter.url });
            if (!(await waitFor(tab, adapter.ready, 45000)))
              throw Error(
                "需登录或打开编辑器：请在账号窗口扫码，然后检查是否已有草稿，再重试",
              );
            const issues = [];
            const ctx = {
              tabId: tab,
              p: validate(d, a.platform),
              video: d.video,
              cover: (key) => d.covers?.[key] || "",
              log: (m) => update(j.status, m),
              note: (m) => update(j.status, m),
              fail: (m) => {
                issues.push(m);
                update(j.status, m);
              },
              withFocus: async (fn) => fn(),
            };
            update("上传中", "开始上传与填写");
            await adapter.fill(ctx);
            update("填写中", "回读表单并等待平台处理");
            if (
              adapter.uploadDone &&
              !(await waitFor(tab, adapter.uploadDone, 600000, 1500))
            )
              throw Error("上传尚未完成，请在窗口检查，避免重复上传");
            if (adapter.afterUpload) await adapter.afterUpload(ctx);
            const got = await evaluate(
              tab,
              `(()=>{const out=[];function scan(root){for(const e of root.querySelectorAll('*')){if(e.shadowRoot)scan(e.shadowRoot);if(e.matches('input:not([type=file]),textarea,[contenteditable=true]'))out.push(e.value||e.innerText||'');}}scan(document);return out.join('\\n')})()`,
            );
            const norm = (x) => String(x).replace(/\s+/g, "").trim();
            const p = ctx.p;
            for (const expected of ["x", "instagram"].includes(a.platform)
              ? [p.text]
              : [p.title, p.body])
              if (expected && !norm(got).includes(norm(expected)))
                issues.push("表单回读未能确认文案完整，请手动核对");
            if (issues.length) throw Error(issues.join("；"));
            update(
              "待你确认",
              "自动填表结束，请检查视频、封面、正文和必填项后自行发布",
            );
          } catch (e) {
            update("失败", e.message);
          } finally {
            active.delete(j.accountId);
          }
        }
      };
      void Promise.all(Array.from({length:Math.max(1,Math.min(4,getConcurrency()))},()=>work())).finally(() => {
        running = false;
      });
      return store.read();
    },
    active,
  };
}
module.exports = { createPublisher, validate, payload, weighted };
