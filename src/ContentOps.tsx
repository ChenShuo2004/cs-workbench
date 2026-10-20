import React, { useEffect, useState } from "react";
import { ArrowRight, Copy, Plus, Save } from "lucide-react";
import type { ContentPlan, ProjectSummary, Section } from "./types";
import "./operations.css";
const empty = (project: string): ContentPlan => ({
  project,
  priority: "normal",
  audience: "",
  promise: "",
  hook: "",
  evidence: "",
  cta: "",
  nextAction: "",
  platform: "",
  plannedDate: "",
  resultUrl: "",
  measuredAt: "",
  views: null,
  saves: null,
  comments: null,
  learning: "",
  updatedAt: "",
});
const fields = [
  ["audience", "写给谁", "一个具体的人群和问题"],
  ["promise", "唯一核心观点", "看完之后，观众能得到什么"],
  ["hook", "开头钩子", "用事实、冲突或问题开始"],
  ["evidence", "证据与真实案例", "来源链接、项目事实、可验证的结果"],
  ["cta", "结尾行动", "希望观众采取的一个动作"],
  ["nextAction", "下一步动作", "例如：补上演示截图，核对第二段来源"],
] as const;
function stage(p: ProjectSummary) {
  if (
    p.status.publish === "已发布" ||
    (p.platforms.length > 0 &&
      p.platforms.every((x) => p.platformStatus?.[x] === "已发布"))
  )
    return "已发布";
  if (
    p.status.publish === "已上传" ||
    ["已导出", "可导出"].includes(p.status.article) ||
    ["已导出", "可导出"].includes(p.status.video)
  )
    return "待交接";
  if (Object.values(p.status).includes("待核查")) return "待核查";
  if ([p.status.article, p.status.video].some((x) => x !== "准备中"))
    return "制作中";
  return "选题";
}
export function ContentOps({
  projects,
  onOpen,
  onNavigate,
  onNew,
  onLeaveRef,
}: {
  projects: ProjectSummary[];
  onOpen: (root: string) => Promise<unknown>;
  onNavigate: (s: Section) => unknown;
  onNew: () => unknown;
  onLeaveRef: React.MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const [plans, setPlans] = useState<ContentPlan[]>([]),
    [selected, setSelected] = useState(projects[0]?.path || ""),
    [draft, setDraft] = useState<ContentPlan>(empty("")),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("全部"),
    [query, setQuery] = useState("");
  useEffect(() => {
    void window.cs
      .contentRead()
      .then((d) => {
        setPlans(d.plans);
        setDraft(
          d.plans.find((p) => p.project === selected) || empty(selected),
        );
      })
      .catch((e) => setError(String(e)));
  }, []);
  const choose = (root: string) => {
    if (dirty && !window.confirm("尚有未保存的内容计划，放弃修改并切换？"))
      return;
    setSelected(root);
    setDraft(plans.find((p) => p.project === root) || empty(root));
    setDirty(false);
    setNotice("");
  };
  const change = (key: keyof ContentPlan, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const result = await window.cs.contentSave({ ...draft, project: selected });
    setPlans(result.plans);
    setDraft(result.plans.find((p) => p.project === selected)!);
    setDirty(false);
    setNotice("内容计划已保存");
  };
  useEffect(() => {
    onLeaveRef.current = async () => {
      if (!dirty) return true;
      try {
        await save();
        return true;
      } catch (e) {
        setError(String(e));
        return false;
      }
    };
    return () => {
      onLeaveRef.current = null;
    };
  }, [draft, dirty, selected]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const current = projects.find((p) => p.path === selected);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const sorted = [...projects]
    .filter(
      (p) =>
        p.title.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "全部" || stage(p) === filter),
    )
    .sort((a, b) => {
      const ap = plans.find((p) => p.project === a.path),
        bp = plans.find((p) => p.project === b.path);
      const rank = (p: ContentPlan | undefined, project: ProjectSummary) =>
        (stage(project) === "已发布" ? 20 : 0) +
        (p?.plannedDate && p.plannedDate <= today ? -5 : 0) +
        (p?.priority === "high" ? -2 : 0);
      return (
        rank(ap, a) - rank(bp, b) ||
        (ap?.plannedDate || "9999").localeCompare(bp?.plannedDate || "9999") ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
    });
  const quality = fields
    .slice(0, 5)
    .filter(([key]) => draft[key].trim()).length;
  const packet = () =>
    `# ${current?.title || "内容"}｜创作简报\n\n${fields.map(([key, label]) => `## ${label}\n${draft[key] || "待补充"}`).join("\n\n")}\n\n目标平台：${draft.platform || current?.platforms.join("、") || "待定"}\n计划日期：${draft.plannedDate || "待定"}（仅本地计划）\n\n请先指出证据缺口，再优化开头、结构和表达；不编造经历、数据或来源。保留已确认事实，区分事实与观点。`;
  return (
    <div className="operations">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONTENT OPERATIONS</span>
          <h1>让每条内容，都有下一步。</h1>
          <p>从观众问题到真实反馈，把创作经验留给下一条作品。</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={15} />
          新建选题
        </button>
      </header>
      <div className="ops-counts">
        {["选题", "制作中", "待核查", "待交接", "已发布"].map((s) => (
          <button
            key={s}
            aria-pressed={filter === s}
            onClick={() => setFilter(filter === s ? "全部" : s)}
          >
            <strong>{projects.filter((p) => stage(p) === s).length}</strong>
            <span>{s}</span>
          </button>
        ))}
      </div>
      {error && (
        <div className="ops-error" role="alert">
          {error}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="content-ops-layout">
        <section className="ops-panel ops-queue">
          <div className="ops-title">
            <h2>推进队列</h2>
            <button className="text-button" onClick={() => setFilter("全部")}>
              全部
            </button>
          </div>
          <p className="muted">优先显示到期计划和重要选题；已发布项目排后。</p>
          <input
            aria-label="搜索内容项目"
            placeholder="搜索选题…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {sorted.map((p) => {
            const plan = plans.find((x) => x.project === p.path);
            return (
              <button
                className={`ops-project ${selected === p.path ? "selected" : ""}`}
                key={p.path}
                onClick={() => choose(p.path)}
              >
                <div>
                  <span className="tag">{stage(p)}</span>
                  <small>{plan?.plannedDate || "尚未排期"}</small>
                </div>
                <strong>{p.title}</strong>
                <p>{plan?.nextAction || "填写这条内容的下一步动作"}</p>
                <small>
                  {plan?.platform || p.platforms.join(" · ") || "平台待定"}
                </small>
              </button>
            );
          })}
          {!sorted.length && (
            <div className="ops-empty">
              {projects.length
                ? "没有匹配的内容，切换筛选或搜索。"
                : "从一个真实问题开始，新建第一个选题。"}
            </div>
          )}
        </section>
        <section className="ops-panel">
          {current ? (
            <>
              <div className="ops-title">
                <div>
                  <small className="muted">
                    {dirty ? "有未保存修改" : "本地创作计划"}
                  </small>
                  <h2>{current.title}</h2>
                </div>
                <button
                  className="button subtle"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (dirty) await save();
                      await onOpen(selected);
                    })
                  }
                >
                  进入项目 <ArrowRight size={14} />
                </button>
              </div>
              <div className="ops-quality">
                <strong>创作简报 {quality}/5</strong>
                <span>完整度检查，不代表内容质量评分</span>
                <progress max="5" value={quality} />
              </div>
              <form
                className="ops-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(save);
                }}
              >
                <div className="ops-two">
                  {fields.map(([key, label, placeholder]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        rows={3}
                        value={draft[key]}
                        placeholder={placeholder}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <h3>发布计划</h3>
                <p className="muted">
                  排期只保存在本地，不会自动上传、定时发布或改变项目发布状态。
                </p>
                <div className="ops-three">
                  <label>
                    计划日期
                    <input
                      type="date"
                      value={draft.plannedDate}
                      onInput={(e) =>
                        change("plannedDate", e.currentTarget.value)
                      }
                      onChange={(e) => change("plannedDate", e.target.value)}
                    />
                  </label>
                  <label>
                    目标平台
                    <select
                      value={draft.platform}
                      onChange={(e) => change("platform", e.target.value)}
                    >
                      <option value="">选择平台</option>
                      {["X", "小红书", "抖音", "B站", "视频号", "公众号"].map(
                        (x) => (
                          <option key={x}>{x}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    优先级
                    <select
                      value={draft.priority}
                      onChange={(e) => change("priority", e.target.value)}
                    >
                      <option value="high">重要</option>
                      <option value="normal">普通</option>
                      <option value="low">稍后</option>
                    </select>
                  </label>
                </div>
                <details className="ops-review">
                  <summary>发布后复盘 · 留下真实结果与下次改进</summary>
                  <div className="ops-form">
                    <label>
                      已发布链接
                      <input
                        type="url"
                        value={draft.resultUrl}
                        onChange={(e) => change("resultUrl", e.target.value)}
                        placeholder="https://…"
                      />
                    </label>
                    <label>
                      统计日期
                      <input
                        type="date"
                        value={draft.measuredAt}
                        onInput={(e) =>
                          change("measuredAt", e.currentTarget.value)
                        }
                        onChange={(e) => change("measuredAt", e.target.value)}
                      />
                    </label>
                    <div className="ops-three">
                      {(
                        [
                          ["views", "播放 / 阅读"],
                          ["saves", "收藏"],
                          ["comments", "评论"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={draft[key] ?? ""}
                            onChange={(e) =>
                              change(
                                key,
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      本次学到什么，下次改什么
                      <textarea
                        value={draft.learning}
                        rows={3}
                        onChange={(e) => change("learning", e.target.value)}
                      />
                    </label>
                    <p className="muted">
                      效果数据为手动记录，需同时填写发布链接与统计日期。不同平台不直接混合排名。
                    </p>
                  </div>
                </details>
                <div className="ops-actions">
                  <button className="button primary" disabled={busy}>
                    <Save size={15} />
                    保存内容计划
                  </button>
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() =>
                      void run(async () => {
                        await window.cs.copy(packet());
                        setNotice("已复制创作简报，可粘贴给 Agent；未自动发送");
                      })
                    }
                  >
                    <Copy size={15} />
                    复制创作简报
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void run(async () => {
                        const file = await window.cs.contentExport();
                        if (file) setNotice(`已导出：${file}`);
                      })
                    }
                  >
                    导出全部计划
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="ops-empty">
              <h2>选择一条内容开始优化</h2>
              <button className="button primary" onClick={onNew}>
                新建选题
              </button>
              <button
                className="text-button"
                onClick={() => onNavigate("projects")}
              >
                导入已有项目
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
