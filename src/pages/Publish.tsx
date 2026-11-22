import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Film,
  FolderInput,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Dialog } from "../Dialog";
import { PlatformIcon } from "../platform-icons";
import type {
  AccountPlatform,
  MediaFileInfo,
  PlatformAccount,
  PostDraft,
  PostDraftItem,
  PostRecord,
} from "../types";
import platforms from "../../shared/account-platforms.json";
import rules from "../../shared/platform-rules.json";
import { uiErrorMessage } from "../ui-error";

const empty: PostDraft = {
  title: "",
  body: "",
  topics: "",
  video: "",
  covers: {},
  overrides: {},
};

function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function describeRule(pid: AccountPlatform) {
  const r = rules[pid] as { title?: number; minTitle?: number; body?: number; total?: number };
  const parts: string[] = [];
  if (r.minTitle && r.title) parts.push(`标题 ${r.minTitle}–${r.title} 字`);
  else if (r.title) parts.push(`标题 ≤ ${r.title} 字`);
  if (r.body) parts.push(`正文 ≤ ${r.body} 字`);
  if (r.total) parts.push(`总长 ≤ ${r.total} 字符`);
  return parts.join(" · ") || "按平台默认规范";
}

function getLimitWarning(pid: string, p: PostDraft) {
  if (pid === "master") return "";
  const r = rules[pid as AccountPlatform] as {
    title?: number;
    minTitle?: number;
    body?: number;
    total?: number;
  };
  const tLen = [...(p.title || "")].length;
  const bLen = [...(p.body || "")].length;
  if (r.title && tLen > r.title) return `标题超出 ${tLen - r.title} 字`;
  if (r.minTitle && tLen > 0 && tLen < r.minTitle) return `标题至少 ${r.minTitle} 字`;
  if (r.body && bLen > r.body) return `正文超出 ${bLen - r.body} 字`;
  if (r.total) {
    const len = [...[p.title, p.body, p.topics].filter(Boolean).join(" ")].length;
    if (len > r.total) return `总长约 ${len}/${r.total}`;
  }
  return "";
}

export function Publish({
  accounts,
  onOpenAccounts,
  onNotice,
}: {
  accounts: PlatformAccount[];
  onOpenAccounts: () => void;
  onNotice: (s: string, e?: boolean) => void;
}) {
  const [d, D] = useState<PostDraft>(empty);
  const [drafts, setDrafts] = useState<PostDraftItem[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [records, R] = useState<PostRecord[]>([]);
  const [ids, I] = useState<string[]>([]);
  const [platform, P] = useState("master");
  const [ready, S] = useState(false);
  const [busy, B] = useState(false);
  const [videoInfo, setVideoInfo] = useState<MediaFileInfo | null>(null);
  const [coverInfos, setCoverInfos] = useState<Record<string, MediaFileInfo>>({});
  const [retryModal, setRetryModal] = useState<PostRecord | null>(null);
  const [markModal, setMarkModal] = useState<{ record: PostRecord; url: string } | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const revision = useRef(0);

  function applyState(s: {
    draft: PostDraft;
    drafts?: PostDraftItem[];
    activeDraftId?: string;
    records: PostRecord[];
  }) {
    D(s.draft);
    if (s.drafts) setDrafts(s.drafts);
    if (s.activeDraftId) setActiveDraftId(s.activeDraftId);
    R(s.records);
  }

  useEffect(() => {
    let live = true;
    window.cs
      .postsRead()
      .then((s) => {
        if (live) {
          applyState(s);
          S(true);
        }
      })
      .catch((e) => onNotice(uiErrorMessage(e), true));
    const t = setInterval(
      () =>
        window.cs
          .postsRead()
          .then((s) => {
            if (live) R(s.records);
          })
          .catch(() => {}),
      1500,
    );
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const n = ++revision.current;
    const t = setTimeout(
      () =>
        window.cs
          .postsDraft(d)
          .then((s) => {
            if (s.drafts) setDrafts(s.drafts);
          })
          .catch((e) => {
            if (n === revision.current) onNotice("草稿保存失败：" + uiErrorMessage(e), true);
          }),
      500,
    );
    return () => clearTimeout(t);
  }, [d, ready]);

  useEffect(() => {
    let live = true;
    if (!d.video) {
      setVideoInfo(null);
      return;
    }
    void window.cs
      .postsMediaInfo(d.video)
      .then((info) => {
        if (live) setVideoInfo(info);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [d.video]);

  useEffect(() => {
    let live = true;
    const entries = Object.entries(d.covers || {}).filter(([, fp]) => Boolean(fp));
    if (!entries.length) {
      setCoverInfos({});
      return;
    }
    void Promise.all(
      entries.map(async ([k, fp]) => [k, await window.cs.postsMediaInfo(fp)] as const),
    )
      .then((list) => {
        if (!live) return;
        const next: Record<string, MediaFileInfo> = {};
        for (const [k, info] of list) next[k] = info;
        setCoverInfos(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [d.covers]);

  const p = platform === "master" ? d : { ...d, ...d.overrides[platform] };
  const limitWarn = getLimitWarning(platform, p);

  const edit = (key: "title" | "body" | "topics", v: string) =>
    D((x) =>
      platform === "master"
        ? { ...x, [key]: v }
        : {
            ...x,
            overrides: {
              ...x.overrides,
              [platform]: { ...x.overrides[platform], [key]: v },
            },
          },
    );

  const choose = async (kind: string, key?: string) => {
    try {
      const f = await window.cs.postsChoose(kind);
      if (f)
        D((x) =>
          key ? { ...x, covers: { ...x.covers, [key]: f } } : { ...x, video: f },
        );
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    }
  };

  const run = async () => {
    B(true);
    try {
      await window.cs.postsDraft(d);
      const s = await window.cs.postsStart(d, ids);
      R(s.records);
      onNotice("已加入队列，填好后停在发布按钮前等你确认");
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      B(false);
    }
  };

  async function handleConfirmRetry() {
    if (!retryModal) return;
    setModalBusy(true);
    try {
      const s = await window.cs.postsRetry(retryModal.id);
      R(s.records);
      setRetryModal(null);
      onNotice(`已重新加入队列：${retryModal.name}`);
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setModalBusy(false);
    }
  }

  async function handleConfirmMark() {
    if (!markModal) return;
    setModalBusy(true);
    try {
      const s = await window.cs.postsMark(markModal.record.id, markModal.url.trim());
      R(s.records);
      setMarkModal(null);
      onNotice(`已标记发布完成：${markModal.record.name}`);
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setModalBusy(false);
    }
  }

  const runningTask = records.some((r) =>
    ["排队", "启动窗口", "上传中", "填写中"].includes(r.status),
  );

  return (
    <div className="t3-page">
      <div className="t3-page-head">
        <div className="t3-head-title">
          <h1>一稿多发</h1>
          {drafts.length > 0 && (
            <div className="t3-draft-inline">
              {drafts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`t3-chip ${item.id === activeDraftId ? "active" : ""}`}
                  onClick={() =>
                    void window.cs
                      .postsDraftSelect(item.id)
                      .then(applyState)
                      .catch((e) => onNotice(uiErrorMessage(e), true))
                  }
                >
                  {item.name || "未命名草稿"}
                </button>
              ))}
              <button
                type="button"
                className="t3-icon-btn"
                title="新建草稿"
                onClick={() =>
                  void window.cs
                    .postsDraftCreate()
                    .then((s) => {
                      applyState(s);
                      onNotice("已新建草稿");
                    })
                    .catch((e) => onNotice(uiErrorMessage(e), true))
                }
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                className="t3-icon-btn"
                title="复制草稿"
                onClick={() =>
                  void window.cs
                    .postsDraftDuplicate(activeDraftId)
                    .then((s) => {
                      applyState(s);
                      onNotice("已复制草稿");
                    })
                    .catch((e) => onNotice(uiErrorMessage(e), true))
                }
              >
                <Copy size={13} />
              </button>
              {drafts.length > 1 && (
                <button
                  type="button"
                  className="t3-icon-btn"
                  title="删除草稿"
                  onClick={() =>
                    void window.cs
                      .postsDraftDelete(activeDraftId)
                      .then((s) => {
                        applyState(s);
                        onNotice("已删除草稿");
                      })
                      .catch((e) => onNotice(uiErrorMessage(e), true))
                  }
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="t3-head-actions">
          <button
            className="t3-btn ghost"
            onClick={() =>
              void window.cs
                .postsImport()
                .then((s) => {
                  if (s) {
                    applyState(s);
                    onNotice("已导入工程素材与文案");
                  }
                })
                .catch((e) => onNotice(uiErrorMessage(e), true))
            }
          >
            <FolderInput size={13} /> 导入工程
          </button>
          <button className="t3-btn ghost" onClick={onOpenAccounts}>
            管理账号
          </button>
        </div>
      </div>

      <div className="t3-publish-grid">
        {/* Left: Composer */}
        <section
          className="t3-card t3-composer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && /\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
              try {
                const video = window.cs.pathForFile(file);
                D((x) => ({ ...x, video }));
                onNotice(`已载入视频：${file.name}`);
              } catch (err) {
                onNotice(uiErrorMessage(err), true);
              }
            } else {
              onNotice("请拖入 mp4 / mov / m4v / webm 视频文件", true);
            }
          }}
        >
          {/* Compact media bar */}
          <div className="t3-media-row">
            <div className="t3-video-bar">
              <Film size={15} />
              <div className="t3-video-name">
                <strong>
                  {videoInfo?.exists
                    ? videoInfo.name
                    : d.video
                      ? d.video.split("/").pop()
                      : "拖入或选择视频文件"}
                </strong>
                {videoInfo?.exists && (
                  <small>
                    {videoInfo.ext} · {formatBytes(videoInfo.sizeBytes)}
                  </small>
                )}
              </div>
              <button
                type="button"
                className="t3-btn xs"
                onClick={() => void choose("video")}
              >
                <UploadCloud size={12} /> 选视频
              </button>
            </div>

            <div className="t3-covers-mini">
              {(
                [
                  ["16x9", "16:9"],
                  ["3x4", "3:4"],
                  ["4x3", "4:3"],
                ] as const
              ).map(([k, label]) => {
                const info = coverInfos[k];
                return (
                  <button
                    key={k}
                    type="button"
                    className={`t3-cover-mini ${d.covers[k] ? "filled" : ""}`}
                    onClick={() => void choose("image", k)}
                    title={`选择 ${label} 封面`}
                  >
                    {info?.previewDataUrl ? (
                      <img src={info.previewDataUrl} alt={label} />
                    ) : (
                      <ImageIcon size={13} />
                    )}
                    <span>{label}{d.covers[k] ? " ✓" : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platform version tabs */}
          <div className="t3-version-bar" role="tablist" aria-label="编辑版本">
            <button
              type="button"
              role="tab"
              aria-selected={platform === "master"}
              className={`t3-chip ${platform === "master" ? "active" : ""}`}
              onClick={() => P("master")}
            >
              通用主文案
            </button>
            {(Object.keys(platforms) as AccountPlatform[]).map((pid) => {
              const hasOverride = Boolean(
                d.overrides[pid] &&
                  Object.values(d.overrides[pid] || {}).some((v) => v && String(v).trim()),
              );
              return (
                <button
                  key={pid}
                  type="button"
                  role="tab"
                  aria-selected={platform === pid}
                  className={`t3-chip ${platform === pid ? "active" : ""}`}
                  onClick={() => P(pid)}
                >
                  <PlatformIcon platform={pid} size={14} />
                  {platforms[pid].name}
                  {hasOverride && <i className="t3-dot online" />}
                </button>
              );
            })}
          </div>

          {platform !== "master" && (
            <div className={`t3-rule-line ${limitWarn ? "bad" : ""}`}>
              <span>
                {platforms[platform as AccountPlatform].name}：
                {describeRule(platform as AccountPlatform)}
              </span>
              {limitWarn && <strong>{limitWarn}</strong>}
            </div>
          )}

          <label className="t3-field">
            <span>标题（{[...p.title].length}）</span>
            <input
              value={p.title}
              placeholder="填写作品标题…"
              onChange={(e) => edit("title", e.target.value)}
            />
          </label>

          <label className="t3-field">
            <span>正文（{[...p.body].length}）</span>
            <textarea
              rows={7}
              value={p.body}
              placeholder="填写简介、正文内容或章节时间戳…"
              onChange={(e) => edit("body", e.target.value)}
            />
          </label>

          <label className="t3-field">
            <span>话题（空格分隔）</span>
            <input
              value={p.topics}
              placeholder="AI工具 独立开发 效率"
              onChange={(e) => edit("topics", e.target.value)}
            />
          </label>

          <div className="t3-composer-foot">
            <small>{ready ? "已自动保存草稿" : "读取草稿中…"}</small>
          </div>
        </section>

        {/* Right: Ultra-compact single-line account selector */}
        <section className="t3-card t3-targets-card">
          <div className="t3-card-head">
            <span>目标账号（{ids.length}/{accounts.length}）</span>
            <div className="t3-inline-actions">
              {(
                [
                  ["全选", "all"],
                  ["国内", "cn"],
                  ["海外", "global"],
                ] as const
              ).map(([label, region]) => (
                <button
                  key={region}
                  type="button"
                  className="t3-link-btn"
                  onClick={() =>
                    I(
                      accounts
                        .filter(
                          (a) =>
                            region === "all" ||
                            platforms[a.platform].region === region,
                        )
                        .map((a) => a.id),
                    )
                  }
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="t3-link-btn"
                onClick={() => I([])}
              >
                清空
              </button>
            </div>
          </div>

          <div className="t3-pick-list">
            {accounts.map((a) => {
              const checked = ids.includes(a.id);
              const warn = a.error || a.networkWarnings[0] || "";
              return (
                <label
                  key={a.id}
                  className={`t3-pick-row ${checked ? "checked" : ""}`}
                  title={warn || `${platforms[a.platform].name} · ${a.name}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      I(
                        e.target.checked
                          ? [...ids, a.id]
                          : ids.filter((id) => id !== a.id),
                      )
                    }
                  />
                  <PlatformIcon platform={a.platform} size={18} />
                  <span className="t3-pick-name">{a.name}</span>
                  <span className="t3-pick-plat">
                    {platforms[a.platform].name}
                  </span>
                  {warn && (
                    <span className="t3-warn-icon" title={warn}>
                      <AlertTriangle size={12} />
                    </span>
                  )}
                </label>
              );
            })}
            {!accounts.length && (
              <div className="t3-empty-sm">暂无账号</div>
            )}
          </div>

          <button
            className="t3-btn primary t3-full-btn"
            disabled={!ready || busy || !ids.length || runningTask}
            onClick={() => void run()}
          >
            {busy || runningTask ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Send size={14} />
            )}
            {runningTask ? "填表中…" : `开始自动填表（${ids.length}）`}
          </button>
          <p className="t3-hint-sm">填完自动停在「发布」前，绝不误发。</p>
        </section>
      </div>

      {/* Compact records strip */}
      <section className="t3-card">
        <div className="t3-card-head">
          <span>任务与发布记录</span>
          <small>{records.length} 条</small>
        </div>
        {!records.length ? (
          <p className="t3-muted-line">还没有分发任务</p>
        ) : (
          <div className="t3-records">
            {records.map((r) => (
              <div className="t3-record-row" key={r.id}>
                <div className="t3-record-main">
                  <PlatformIcon platform={r.platform} size={18} />
                  <strong>{r.name}</strong>
                  <span
                    className={`t3-tag ${
                      r.status.startsWith("已发布")
                        ? "good"
                        : r.status === "待你确认"
                          ? "warn"
                          : r.status === "失败"
                            ? "bad"
                            : ""
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="t3-record-log">{r.logs.at(-1) || "等待中"}</span>
                </div>
                <div className="t3-row-actions">
                  <button
                    className="t3-btn ghost xs"
                    onClick={() =>
                      void window.cs
                        .openAccountBrowser(r.accountId)
                        .catch((e) => onNotice(uiErrorMessage(e), true))
                    }
                  >
                    <ExternalLink size={12} /> 窗口
                  </button>
                  {r.status === "失败" && (
                    <button
                      className="t3-btn ghost xs"
                      onClick={() => setRetryModal(r)}
                    >
                      <RotateCcw size={12} /> 重试
                    </button>
                  )}
                  {r.status === "待你确认" && (
                    <button
                      className="t3-btn primary xs"
                      onClick={() => setMarkModal({ record: r, url: "" })}
                    >
                      <CheckCircle2 size={12} /> 已发布
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {retryModal && (
        <Dialog
          label="确认重试"
          onClose={() => !modalBusy && setRetryModal(null)}
          dismissible={!modalBusy}
        >
          <div className="modal">
            <h2>重试「{retryModal.name}」？</h2>
            <p className="t3-muted-line">请先确认平台窗口内没有半截草稿，避免重复上传。</p>
            <div className="modal-actions">
              <button className="t3-btn" disabled={modalBusy} onClick={() => setRetryModal(null)}>
                取消
              </button>
              <button
                className="t3-btn primary"
                disabled={modalBusy}
                onClick={() => void handleConfirmRetry()}
              >
                确认重试
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {markModal && (
        <Dialog
          label="标记已发布"
          onClose={() => !modalBusy && setMarkModal(null)}
          dismissible={!modalBusy}
        >
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void handleConfirmMark();
            }}
          >
            <h2>标记「{markModal.record.name}」已发布</h2>
            <label className="t3-field">
              <span>作品链接（可选）</span>
              <input
                autoFocus
                value={markModal.url}
                placeholder="https://..."
                disabled={modalBusy}
                onChange={(e) => setMarkModal({ ...markModal, url: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="t3-btn"
                disabled={modalBusy}
                onClick={() => setMarkModal(null)}
              >
                取消
              </button>
              <button type="submit" className="t3-btn primary" disabled={modalBusy}>
                确认
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
