import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CircleAlert,
  ExternalLink,
  Globe,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { NetworkEditorModal } from "./NetworkEditorModal";
import { formatLocation, formatNetworkSummary } from "./NetworkIsolation";
import { checkAndRecordPublishStagger } from "./publish-guard";
import platforms from "../shared/account-platforms.json";
import type {
  AccountPlatform,
  BrowserTarget,
  PlatformAccount,
} from "./types";
import { uiErrorMessage } from "./ui-error";

function formatNumber(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString("zh-CN");
}

function formatDelta(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "";
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

export function DouyinAccounts({
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
  const [filter, setFilter] = useState<AccountPlatform | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [readingId, setReadingId] = useState("");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{
    id?: string;
    name: string;
    platform: AccountPlatform;
  } | null>(null);
  const [networkTarget, setNetworkTarget] = useState<PlatformAccount | null>(null);
  const [expandedMetrics, setExpandedMetrics] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter !== "all" && a.platform !== filter) return false;
      if (!q) return true;
      const haystack = [
        a.name,
        platforms[a.platform].name,
        a.dataSnapshot?.profileName || "",
        a.network?.label || "",
        a.lastNetworkCheck?.ip || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [accounts, filter, searchQuery]);

  const summary = useMemo(() => {
    let followers = 0;
    let views = 0;
    let engagements = 0;
    let withData = 0;
    let isolated = 0;
    let conflicts = 0;
    for (const a of visible) {
      if (a.network.mode !== "direct") isolated++;
      if (a.networkWarnings.length > 0) conflicts++;
      const k = a.dataSnapshot?.kpis;
      if (k) {
        if (
          k.followers !== null ||
          k.views !== null ||
          k.likes !== null ||
          (a.dataSnapshot?.metrics?.length || 0) > 0
        ) {
          withData++;
        }
        if (typeof k.followers === "number") followers += k.followers;
        if (typeof k.views === "number") views += k.views;
        if (typeof k.likes === "number") engagements += k.likes;
        if (typeof k.comments === "number") engagements += k.comments;
        if (typeof k.saves === "number") engagements += k.saves;
      }
    }
    return { followers, views, engagements, withData, isolated, conflicts };
  }, [visible]);

  async function saveAccount() {
    if (!editor) return;
    setBusyId(editor.id || "new");
    setError("");
    try {
      if (editor.id) {
        await window.cs.renameAccount(editor.id, editor.name);
        onNotice(`已更新账号备注：${editor.name}`);
      } else {
        const created = await window.cs.addAccount(editor.name, editor.platform);
        onNotice(`已添加 ${platforms[editor.platform].name} 账号「${created.name}」`);
      }
      setEditor(null);
      await onRefresh();
    } catch (e) {
      setError(uiErrorMessage(e));
    } finally {
      setBusyId("");
    }
  }

  async function openBrowser(account: PlatformAccount, target: BrowserTarget) {
    setBusyId(account.id);
    setError("");
    try {
      const staggerWarning =
        target === "publish" ? checkAndRecordPublishStagger(account) : "";
      await window.cs.openAccountBrowser(account.id, target);
      await onRefresh();
      const label =
        target === "publish" ? "发布页" : target === "data" ? "数据中心" : "创作者后台";
      onNotice(
        staggerWarning || `已通过独立隔离 Chrome 打开「${account.name}」的${label}`,
        Boolean(staggerWarning),
      );
    } catch (e) {
      const msg = uiErrorMessage(e);
      setError(msg);
      onNotice(msg, true);
    } finally {
      setBusyId("");
    }
  }

  async function readData(account: PlatformAccount) {
    setReadingId(account.id);
    setError("");
    try {
      const snapshot = await window.cs.readAccountData(account.id, {
        navigateToData: !account.dataConnected,
      });
      await onRefresh();
      const count = snapshot.metrics?.length || 0;
      if (count > 0 || snapshot.profileName) {
        onNotice(
          `已刷新「${account.name}」数据（识别到 ${count} 项指标）`,
        );
      } else {
        onNotice(
          `已连接「${account.name}」窗口，但暂未识别到指标：请在该账号 Chrome 中确认已登录并打开数据页后再点刷新`,
          true,
        );
      }
    } catch (e) {
      const msg = uiErrorMessage(e);
      setError(msg);
      onNotice(msg, true);
    } finally {
      setReadingId("");
    }
  }

  async function removeAccount(account: PlatformAccount) {
    setBusyId(account.id);
    setError("");
    try {
      const removed = await window.cs.removeAccount(account.id);
      if (removed) {
        await onRefresh();
        onNotice(`已移除账号「${account.name}」及其本机隔离数据`);
      }
    } catch (e) {
      setError(uiErrorMessage(e));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="accounts-page">
      <button className="button subtle" onClick={()=>void window.cs.syncAll().then(()=>{onNotice('同步完成，需登录的账号请查看提示');void onRefresh();}).catch(e=>onNotice(String(e),true))}>同步全部账号数据</button>
        <div className="page-heading compact">
        <div>
          <span className="eyebrow">MATRIX ACCOUNTS & ANALYTICS</span>
          <h1>账号与数据</h1>
          <p>
            管理全部 8 个平台的矩阵账号，每个账号拥有独立 Chrome 会话与网络代理；可一键拉起隔离浏览器发布，或直接读取各账号实时数据快照。
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button subtle"
            disabled={loading}
            onClick={() => void onRefresh()}
          >
            <RefreshCw size={15} /> 刷新列表
          </button>
          <button
            className="button primary"
            disabled={loading}
            onClick={() => setEditor({ name: "", platform: filter === "all" ? "douyin" : filter })}
          >
            <Plus size={16} /> 添加平台账号
          </button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-box">
          <span>当前筛选账号</span>
          <strong>
            {visible.length} <small>个</small>
          </strong>
          <em>已隔离代理 {summary.isolated} 个 · 有数据 {summary.withData} 个</em>
        </div>
        <div className="kpi-box">
          <span>已采集粉丝汇总</span>
          <strong>{formatNumber(summary.followers)}</strong>
          <em>来自已刷新账号的数据快照</em>
        </div>
        <div className="kpi-box">
          <span>已采集播放 / 阅读</span>
          <strong>{formatNumber(summary.views)}</strong>
          <em>各平台数据页可见指标合计</em>
        </div>
        <div
          className={`kpi-box ${summary.conflicts > 0 ? "warn" : "good"} clickable`}
          onClick={onOpenNetwork}
        >
          <span>网络隔离状态</span>
          <strong>
            {summary.conflicts > 0 ? `${summary.conflicts} 个风险` : "隔离正常"}
          </strong>
          <em>点击进入网络隔离中心查看详情</em>
        </div>
      </div>

      <div className="platform-filter-bar" role="tablist" aria-label="按平台筛选">
        <button
          role="tab"
          aria-selected={filter === "all"}
          className={`chip-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          全部 ({accounts.length})
        </button>
        {(Object.keys(platforms) as AccountPlatform[]).map((pid) => {
          const count = accounts.filter((a) => a.platform === pid).length;
          return (
            <button
              key={pid}
              role="tab"
              aria-selected={filter === pid}
              className={`chip-btn ${filter === pid ? "active" : ""}`}
              onClick={() => setFilter(pid)}
            >
              {platforms[pid].name} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
        <input
          type="search"
          className="account-search-input"
          value={searchQuery}
          placeholder="搜索备注 / 昵称 / IP…"
          aria-label="搜索账号"
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="accounts-error" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button className="text-button" onClick={() => setError("")}>
            关闭
          </button>
        </div>
      )}

      {loading ? (
        <div className="accounts-empty" role="status">
          <LoaderCircle size={24} className="spin" />
          <p>正在读取账号与数据…</p>
        </div>
      ) : visible.length ? (
        <div className="accounts-grid matrix-grid">
          {visible.map((account, index) => {
            const snap = account.dataSnapshot;
            const kpis = snap?.kpis;
            const deltas = snap?.deltas;
            const isBusy = busyId === account.id || readingId === account.id;
            const isIsolated = account.network.mode !== "direct";
            const hasWarning = account.networkWarnings.length > 0;
            const expanded = Boolean(expandedMetrics[account.id]);

            return (
              <article
                className={`account-card matrix-card ${hasWarning ? "has-warning" : ""}`}
                key={account.id}
              >
                <div className="account-heading">
                  <div className="account-avatar">
                    {snap?.avatarDataUrl ? (
                      <img
                        src={snap.avatarDataUrl}
                        alt={`${snap.profileName || account.name}的平台头像`}
                      />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </div>
                  <div className="account-identity">
                    <div className="account-title-row">
                      <h2 title={account.name}>{account.name}</h2>
                      <span className="pill neutral">
                        {platforms[account.platform].name}
                      </span>
                    </div>
                    <span className="account-sub">
                      {snap?.profileName
                        ? `${snap.profileName}${snap.accountId ? ` · ${snap.accountId}` : ""}`
                        : platforms[account.platform].title}
                    </span>
                  </div>
                </div>

                <div className="account-network-bar">
                  <button
                    type="button"
                    className={`network-pill-btn ${hasWarning ? "warn" : isIsolated ? "good" : "neutral"}`}
                    onClick={() => setNetworkTarget(account)}
                    title="点击配置此账号的网络与代理隔离"
                  >
                    {hasWarning ? (
                      <AlertTriangle size={13} />
                    ) : isIsolated ? (
                      <ShieldCheck size={13} />
                    ) : (
                      <Globe size={13} />
                    )}
                    <span>{formatNetworkSummary(account)}</span>
                    {account.lastNetworkCheck?.ok && (
                      <em>
                        · {account.lastNetworkCheck.ip}
                        {formatLocation(account) ? ` (${formatLocation(account)})` : ""}
                      </em>
                    )}
                  </button>
                  {hasWarning && (
                    <p className="inline-warning">{account.networkWarnings[0]}</p>
                  )}
                </div>

                <div className="account-metrics-panel">
                  <div className="account-kpi-grid">
                    <div className="mini-kpi">
                      <span>粉丝</span>
                      <strong>{formatNumber(kpis?.followers)}</strong>
                      {formatDelta(deltas?.followers) && (
                        <em className={(deltas?.followers || 0) > 0 ? "up" : "down"}>
                          {formatDelta(deltas?.followers)}
                        </em>
                      )}
                    </div>
                    <div className="mini-kpi">
                      <span>播放 / 阅读</span>
                      <strong>{formatNumber(kpis?.views)}</strong>
                      {formatDelta(deltas?.views) && (
                        <em className={(deltas?.views || 0) > 0 ? "up" : "down"}>
                          {formatDelta(deltas?.views)}
                        </em>
                      )}
                    </div>
                    <div className="mini-kpi">
                      <span>获赞</span>
                      <strong>{formatNumber(kpis?.likes)}</strong>
                      {formatDelta(deltas?.likes) && (
                        <em className={(deltas?.likes || 0) > 0 ? "up" : "down"}>
                          {formatDelta(deltas?.likes)}
                        </em>
                      )}
                    </div>
                    <div className="mini-kpi">
                      <span>评论 / 收藏</span>
                      <strong>
                        {kpis?.comments !== null || kpis?.saves !== null
                          ? `${formatNumber(kpis?.comments)} / ${formatNumber(kpis?.saves)}`
                          : "--"}
                      </strong>
                    </div>
                  </div>

                  {snap ? (
                    <div className="snapshot-footer">
                      <span>
                        更新于 {new Date(snap.capturedAt).toLocaleString("zh-CN")}
                      </span>
                      {snap.metrics?.length > 0 && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setExpandedMetrics((prev) => ({
                              ...prev,
                              [account.id]: !prev[account.id],
                            }))
                          }
                        >
                          {expanded
                            ? "收起原始指标"
                            : `查看全部 ${snap.metrics.length} 条指标`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="snapshot-empty">
                      暂无数据快照 · 点「读数据」从该账号独立 Chrome 数据页抓取
                    </p>
                  )}

                  {expanded && snap?.metrics?.length ? (
                    <ul className="raw-metrics-list">
                      {snap.metrics.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="account-actions matrix-actions">
                  <button
                    className="button primary"
                    disabled={isBusy}
                    onClick={() => void openBrowser(account, "publish")}
                  >
                    <Send size={14} /> 去发布
                  </button>
                  <button
                    className="button dark"
                    disabled={isBusy}
                    onClick={() => void openBrowser(account, "home")}
                  >
                    <ExternalLink size={14} /> 后台
                  </button>
                  <button
                    className="button subtle"
                    disabled={isBusy}
                    onClick={() => void readData(account)}
                  >
                    {readingId === account.id ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <BarChart3 size={14} />
                    )}
                    {readingId === account.id ? "读取中…" : "读数据"}
                  </button>
                  <button
                    className="icon-button"
                    disabled={isBusy}
                    title={`修改「${account.name}」备注`}
                    aria-label={`修改${account.name}备注`}
                    onClick={() =>
                      setEditor({
                        id: account.id,
                        name: account.name,
                        platform: account.platform,
                      })
                    }
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button account-remove"
                    disabled={isBusy}
                    title={`移除「${account.name}」`}
                    aria-label={`移除${account.name}`}
                    onClick={() => void removeAccount(account)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="accounts-empty">
          <Users size={34} />
          <h2>{filter === "all" ? "添加第一个平台账号" : `还没有${platforms[filter].name}账号`}</h2>
          <p>每个账号独立 Chrome Profile 与网络代理，互不串号。</p>
          <button
            className="button primary"
            onClick={() =>
              setEditor({
                name: "",
                platform: filter === "all" ? "douyin" : filter,
              })
            }
          >
            <Plus size={16} /> 添加平台账号
          </button>
        </div>
      )}

      {editor && (
        <Dialog
          label={editor.id ? "修改账号备注" : "添加平台账号"}
          onClose={() => setEditor(null)}
          dismissible={!busyId}
        >
          <form
            className="modal account-modal"
            aria-labelledby="account-editor-title"
            onSubmit={(event) => {
              event.preventDefault();
              void saveAccount();
            }}
          >
            <div className="account-modal-title">
              <h2 id="account-editor-title">
                {editor.id ? "修改账号备注" : "添加平台账号"}
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭"
                disabled={Boolean(busyId)}
                onClick={() => setEditor(null)}
              >
                <X size={18} />
              </button>
            </div>
            <label htmlFor="account-platform">平台（支持全部 8 大平台）</label>
            <select
              id="account-platform"
              value={editor.platform}
              disabled={Boolean(busyId) || Boolean(editor.id)}
              onChange={(event) =>
                setEditor({
                  ...editor,
                  platform: event.target.value as AccountPlatform,
                })
              }
            >
              {Object.entries(platforms).map(([id, platform]) => (
                <option key={id} value={id}>
                  {platform.name} · {platform.title}
                </option>
              ))}
            </select>
            <label htmlFor="account-name">账号备注</label>
            <input
              id="account-name"
              autoFocus
              required
              maxLength={40}
              value={editor.name}
              placeholder="例如：主号 / AI 知识号 / 海外号 01"
              disabled={Boolean(busyId)}
              onChange={(event) =>
                setEditor({ ...editor, name: event.target.value })
              }
            />
            <p className="muted">
              创建后可在卡片上配置专属代理或本机 Clash 端口，再打开独立 Chrome 登录与发布。
            </p>
            <div className="modal-actions">
              <button
                className="button subtle"
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setEditor(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={Boolean(busyId) || !editor.name.trim()}
              >
                {busyId ? "正在保存…" : "保存"}
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
            onNotice(`已保存「${networkTarget.name}」的网络隔离配置`);
            if (checkAfterSave) {
              try {
                const res = await window.cs.checkAccountNetwork(networkTarget.id);
                await onRefresh();
                if (res.ok) {
                  onNotice(`出口 IP：${res.ip} · ${res.latencyMs}ms`);
                } else {
                  onNotice(res.error || "出口 IP 检测失败", true);
                }
              } catch (err) {
                onNotice(uiErrorMessage(err), true);
              }
            }
          }}
        />
      )}
    </div>
  );
}
