import React, { useMemo, useState } from "react";
import {
  Activity,
  ExternalLink,
  Globe,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Dialog } from "../Dialog";
import { NetworkEditorModal } from "../NetworkEditorModal";
import { formatLocation, formatNetworkSummary } from "../NetworkIsolation";
import { PLATFORM_BRAND, PlatformIcon } from "../platform-icons";
import platforms from "../../shared/account-platforms.json";
import type { AccountPlatform, PlatformAccount } from "../types";
import { uiErrorMessage } from "../ui-error";

function fmtVal(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString("zh-CN");
}

function fmtDelta(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "";
  return `${n > 0 ? "+" : ""}${fmtVal(n)}`;
}

export function Accounts({
  accounts,
  loading,
  onRefresh,
  onOpenNetwork,
  onNotice,
}: {
  accounts: PlatformAccount[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenNetwork: () => void;
  onNotice: (msg: string, error?: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [platformFilter, setPlatformFilter] = useState<AccountPlatform | "all">("all");
  const [query, setQuery] = useState("");
  const [syncingAll, setSyncingAll] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [editor, setEditor] = useState<{
    id?: string;
    name: string;
    platform: AccountPlatform;
  } | null>(null);
  const [networkTarget, setNetworkTarget] = useState<PlatformAccount | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (platformFilter !== "all" && a.platform !== platformFilter) return false;
      if (!q) return true;
      return [
        a.name,
        platforms[a.platform].name,
        a.dataSnapshot?.profileName || "",
        a.network.label || "",
        a.lastNetworkCheck?.ip || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [accounts, platformFilter, query]);

  const grouped = useMemo(() => {
    const order = Object.keys(platforms) as AccountPlatform[];
    return order
      .map((pid) => ({
        pid,
        name: platforms[pid].name,
        items: visible.filter((a) => a.platform === pid),
      }))
      .filter((g) => g.items.length > 0);
  }, [visible]);

  const active = useMemo(
    () =>
      visible.find((a) => a.id === selectedId) ||
      accounts.find((a) => a.id === selectedId) ||
      visible[0] ||
      null,
    [visible, accounts, selectedId],
  );

  async function syncAll() {
    setSyncingAll(true);
    try {
      await window.cs.syncAll();
      await onRefresh();
      onNotice("全部账号数据已同步，抓取窗口已自动关闭");
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setSyncingAll(false);
    }
  }

  async function saveAccount() {
    if (!editor) return;
    setBusyAction("save");
    try {
      if (editor.id) {
        await window.cs.renameAccount(editor.id, editor.name);
        onNotice(`已重命名为「${editor.name}」`);
      } else {
        const created = await window.cs.addAccount(editor.name, editor.platform);
        setSelectedId(created.id);
        onNotice(`已添加 ${platforms[editor.platform].name} 账号「${created.name}」`);
      }
      setEditor(null);
      await onRefresh();
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyAction("");
    }
  }

  async function openOne(a: PlatformAccount, target: "home" | "publish") {
    setBusyAction(target);
    try {
      await window.cs.openAccountBrowser(a.id, target);
      await onRefresh();
      onNotice(`已一键启动「${a.name}」${target === "publish" ? "发布页" : "后台"}`);
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyAction("");
    }
  }

  async function closeOne(a: PlatformAccount) {
    setBusyAction("close");
    try {
      await window.cs.closeAccountBrowser(a.id);
      await onRefresh();
      onNotice(`已关闭「${a.name}」的隔离浏览器`);
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyAction("");
    }
  }

  async function captureOne(a: PlatformAccount) {
    setBusyAction("read");
    try {
      const snap = await window.cs.readAccountData(a.id, {
        navigateToData: true,
        autoClose: true,
      });
      await onRefresh();
      const count = snap.metrics?.length || 0;
      onNotice(
        count > 0 || snap.profileName
          ? `已抓取「${a.name}」数据（${count} 项），抓取窗口已自动关闭`
          : "抓取完成但未识别到指标，请先一键启动确认是否已登录",
        count === 0 && !snap.profileName,
      );
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyAction("");
    }
  }

  async function checkIp(a: PlatformAccount) {
    setBusyAction("ip");
    try {
      const res = await window.cs.checkAccountNetwork(a.id);
      await onRefresh();
      if (res.ok) onNotice(`出口 IP：${res.ip} · ${res.latencyMs}ms`);
      else onNotice(res.error || "检测失败", true);
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyAction("");
    }
  }

  async function removeOne(a: PlatformAccount) {
    setBusyAction("remove");
    try {
      const ok = await window.cs.removeAccount(a.id);
      if (ok) {
        setSelectedId("");
        await onRefresh();
        onNotice(`已移除账号「${a.name}」`);
      }
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyAction("");
    }
  }

  const onlineCount = accounts.filter((a) => a.dataConnected).length;

  return (
    <div className="t3-page accounts-split-page">
      <div className="t3-page-head">
        <div className="t3-head-title">
          <h1>账号与数据</h1>
          <span className="t3-count">{accounts.length}</span>
        </div>
        <div className="t3-head-actions">
          {onlineCount > 0 && (
            <button
              className="t3-btn ghost"
              onClick={() =>
                void window.cs
                  .closeAll()
                  .then(onRefresh)
                  .then(() => onNotice("已关闭全部账号浏览器"))
                  .catch((e) => onNotice(uiErrorMessage(e), true))
              }
            >
              <Power size={13} /> 关闭全部窗口 ({onlineCount})
            </button>
          )}
          <button
            className="t3-btn"
            disabled={syncingAll || !accounts.length}
            onClick={() => void syncAll()}
          >
            {syncingAll ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {syncingAll ? "抓取中（自动关窗）…" : "同步全部数据"}
          </button>
          <button
            className="t3-btn primary"
            onClick={() =>
              setEditor({
                name: "",
                platform: platformFilter === "all" ? "douyin" : platformFilter,
              })
            }
          >
            <Plus size={13} /> 添加账号
          </button>
        </div>
      </div>

      <div className="t3-master-detail">
        <aside className="t3-list-rail">
          <div className="t3-rail-controls">
            <div className="t3-search">
              <Search size={13} />
              <input
                type="search"
                value={query}
                placeholder="筛选账号 / IP…"
                aria-label="搜索账号"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="t3-select-sm"
              aria-label="按平台筛选"
              value={platformFilter}
              onChange={(e) =>
                setPlatformFilter(e.target.value as AccountPlatform | "all")
              }
            >
              <option value="all">全部平台</option>
              {(Object.keys(platforms) as AccountPlatform[]).map((pid) => (
                <option key={pid} value={pid}>
                  {platforms[pid].name}
                </option>
              ))}
            </select>
          </div>

          <div className="t3-rail-scroll">
            {loading ? (
              <div className="t3-empty-sm">加载中…</div>
            ) : grouped.length === 0 ? (
              <div className="t3-empty-sm">没有匹配的账号</div>
            ) : (
              grouped.map((g) => (
                <div className="t3-rail-group" key={g.pid}>
                  <div className="t3-rail-group-label">
                    <span>{g.name}</span>
                    <span>{g.items.length}</span>
                  </div>
                  {g.items.map((a) => {
                    const isSel = active?.id === a.id;
                    const fans = a.dataSnapshot?.kpis.followers;
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className={`t3-rail-item ${isSel ? "active" : ""}`}
                        onClick={() => setSelectedId(a.id)}
                      >
                        <PlatformIcon platform={a.platform} size={20} />
                        <span className="t3-rail-name">{a.name}</span>
                        <span className="t3-rail-meta">
                          {fans != null ? fmtVal(fans) : ""}
                        </span>
                        <i
                          className={`t3-dot ${
                            a.dataConnected
                              ? "online"
                              : a.error
                                ? "err"
                                : a.networkWarnings.length
                                  ? "warn"
                                  : ""
                          }`}
                          title={
                            a.dataConnected
                              ? "窗口运行中"
                              : a.error || a.networkWarnings[0] || "空闲"
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="t3-detail-pane">
          {!active ? (
            <div className="t3-detail-empty">
              <p>选择左侧账号查看数据、启动隔离浏览器或配置线路。</p>
            </div>
          ) : (
            (() => {
              const snap = active.dataSnapshot;
              const k = snap?.kpis;
              const d = snap?.deltas;
              const brand = PLATFORM_BRAND[active.platform];
              const hist = (snap?.history || [])
                .slice(-30)
                .map((x) => x.kpis.followers)
                .filter((v): v is number => typeof v === "number");
              const pts =
                hist.length >= 2
                  ? (() => {
                      const lo = Math.min(...hist);
                      const hi = Math.max(...hist);
                      const sp = Math.max(1, hi - lo);
                      return hist
                        .map(
                          (v, i) =>
                            `${((i * 440) / (hist.length - 1)).toFixed(1)},${(74 - ((v - lo) / sp) * 62).toFixed(1)}`,
                        )
                        .join(" ");
                    })()
                  : "";
              const isBusy = Boolean(busyAction) || syncingAll;

              return (
                <div className="t3-inspector">
                  <div className="t3-inspector-head">
                    <div className="t3-inspector-id">
                      <PlatformIcon platform={active.platform} size={34} />
                      <div>
                        <div className="t3-inspector-title-row">
                          <h2>{active.name}</h2>
                          <span className="t3-tag">{platforms[active.platform].name}</span>
                          {active.dataConnected && (
                            <span className="t3-tag good">窗口运行中</span>
                          )}
                          {active.error && (
                            <span className="t3-tag bad">{active.error}</span>
                          )}
                        </div>
                        <p className="t3-sub">
                          {snap?.profileName
                            ? `${snap.profileName}${snap.accountId ? ` · ${snap.accountId}` : ""}`
                            : platforms[active.platform].title}
                        </p>
                      </div>
                    </div>

                    <div className="t3-inspector-actions">
                      <button
                        className="t3-btn primary"
                        disabled={isBusy}
                        onClick={() => void openOne(active, "home")}
                      >
                        {busyAction === "home" ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : (
                          <ExternalLink size={13} />
                        )}
                        {active.dataConnected ? "聚焦窗口" : "一键启动"}
                      </button>
                      {active.dataConnected && (
                        <button
                          className="t3-btn"
                          disabled={isBusy}
                          onClick={() => void closeOne(active)}
                        >
                          <Power size={13} /> 关闭窗口
                        </button>
                      )}
                      <button
                        className="t3-btn"
                        disabled={isBusy}
                        onClick={() => void openOne(active, "publish")}
                      >
                        <Send size={13} /> 发布页
                      </button>
                      <button
                        className="t3-btn"
                        disabled={isBusy}
                        onClick={() => void captureOne(active)}
                        title="自动打开数据页抓取并在完成后自动关闭浏览器"
                      >
                        {busyAction === "read" ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : (
                          <RefreshCw size={13} />
                        )}
                        抓数据
                      </button>
                      <button
                        className="t3-icon-btn"
                        disabled={isBusy}
                        title="修改备注"
                        onClick={() =>
                          setEditor({
                            id: active.id,
                            name: active.name,
                            platform: active.platform,
                          })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="t3-icon-btn danger"
                        disabled={isBusy}
                        title="移除账号"
                        onClick={() => void removeOne(active)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="t3-metric-strip">
                    <div className="t3-metric-cell">
                      <span>{brand.fanUnit}</span>
                      <strong>{fmtVal(k?.followers)}</strong>
                      {fmtDelta(d?.followers) && (
                        <em className={(d?.followers || 0) > 0 ? "up" : "down"}>
                          {fmtDelta(d?.followers)}
                        </em>
                      )}
                    </div>
                    <div className="t3-metric-cell">
                      <span>播放 / 阅读</span>
                      <strong>{fmtVal(k?.views)}</strong>
                      {fmtDelta(d?.views) && (
                        <em className={(d?.views || 0) > 0 ? "up" : "down"}>
                          {fmtDelta(d?.views)}
                        </em>
                      )}
                    </div>
                    <div className="t3-metric-cell">
                      <span>获赞</span>
                      <strong>{fmtVal(k?.likes)}</strong>
                    </div>
                    <div className="t3-metric-cell">
                      <span>评论 / 收藏 / 转发</span>
                      <strong>
                        {snap
                          ? `${fmtVal(k?.comments)} / ${fmtVal(k?.saves)} / ${fmtVal(k?.shares)}`
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  <div className="t3-card">
                    <div className="t3-card-head">
                      <span>粉丝走势</span>
                      <small>
                        {snap
                          ? `更新于 ${new Date(snap.capturedAt).toLocaleString("zh-CN")}`
                          : "暂未抓取数据"}
                      </small>
                    </div>
                    {pts ? (
                      <svg viewBox="0 0 440 84" className="t3-trend-svg">
                        <polyline
                          points={pts}
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <p className="t3-muted-line">
                        点击上方「抓数据」，系统会后台读取此账号指标并在完成后自动关闭浏览器。
                      </p>
                    )}
                    {snap?.metrics && snap.metrics.length > 0 && (
                      <details className="t3-details">
                        <summary>原始识别字段（{snap.metrics.length} 条）</summary>
                        <ul className="t3-raw-list">
                          {snap.metrics.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>

                  <div className="t3-card">
                    <div className="t3-card-head">
                      <span>网络与隔离环境</span>
                      <div className="t3-inline-actions">
                        <button
                          className="t3-btn ghost xs"
                          disabled={isBusy}
                          onClick={() => void checkIp(active)}
                        >
                          <Activity size={12} /> 测速
                        </button>
                        <button
                          className="t3-btn ghost xs"
                          disabled={isBusy}
                          onClick={() => setNetworkTarget(active)}
                        >
                          <Settings2 size={12} /> 配置代理
                        </button>
                        <button className="t3-btn ghost xs" onClick={onOpenNetwork}>
                          全部线路
                        </button>
                      </div>
                    </div>
                    <div className="t3-kv-row">
                      <span>
                        {active.network.mode === "direct" ? (
                          <Globe size={13} />
                        ) : (
                          <ShieldCheck size={13} />
                        )}
                        {formatNetworkSummary(active)}
                      </span>
                      <span className="t3-mono">
                        {active.lastNetworkCheck?.ok
                          ? `${active.lastNetworkCheck.ip}${formatLocation(active) ? ` · ${formatLocation(active)}` : ""} · ${active.lastNetworkCheck.latencyMs}ms`
                          : active.lastNetworkCheck?.error || "尚未测速"}
                      </span>
                    </div>
                    {active.networkWarnings.length > 0 && (
                      <p className="t3-warn-note">{active.networkWarnings[0]}</p>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </section>
      </div>

      {editor && (
        <Dialog
          label={editor.id ? "修改账号备注" : "添加平台账号"}
          onClose={() => !busyAction && setEditor(null)}
          dismissible={!busyAction}
        >
          <form
            className="modal account-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void saveAccount();
            }}
          >
            <div className="account-modal-title">
              <h2>{editor.id ? "修改账号备注" : "添加平台账号"}</h2>
              <button
                type="button"
                className="t3-icon-btn"
                aria-label="关闭"
                onClick={() => setEditor(null)}
              >
                <X size={16} />
              </button>
            </div>
            <label className="composer-field">
              <span>平台</span>
              <select
                value={editor.platform}
                disabled={Boolean(editor.id)}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    platform: e.target.value as AccountPlatform,
                  })
                }
              >
                {Object.entries(platforms).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name} · {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="composer-field">
              <span>账号备注</span>
              <input
                autoFocus
                required
                maxLength={40}
                value={editor.name}
                placeholder="例如：Kaige 主号"
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="t3-btn" onClick={() => setEditor(null)}>
                取消
              </button>
              <button
                type="submit"
                className="t3-btn primary"
                disabled={!editor.name.trim() || Boolean(busyAction)}
              >
                保存
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {networkTarget && (
        <NetworkEditorModal
          account={networkTarget}
          onClose={() => setNetworkTarget(null)}
          onSaved={async (checkAfterSave) => {
            await onRefresh();
            onNotice(`已保存「${networkTarget.name}」的代理配置`);
            if (checkAfterSave) await checkIp(networkTarget);
          }}
        />
      )}
    </div>
  );
}
