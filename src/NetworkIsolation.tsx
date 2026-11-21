import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  LoaderCircle,
  Lock,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import platforms from "../shared/account-platforms.json";
import { NetworkEditorModal } from "./NetworkEditorModal";
import type { AccountPlatform, PlatformAccount } from "./types";
import { uiErrorMessage } from "./ui-error";

export function formatNetworkSummary(account: PlatformAccount) {
  const n = account.network;
  if (!n || n.mode === "direct") return "本机直连";
  const endpoint = `${n.protocol.toUpperCase()} ${n.host}:${n.port}`;
  return n.label ? `${n.label}（${endpoint}）` : endpoint;
}

export function formatLocation(account: PlatformAccount) {
  const c = account.lastNetworkCheck;
  if (!c || !c.ok) return "";
  return [c.country, c.region, c.city].filter(Boolean).join(" · ");
}

export function NetworkIsolation({
  accounts,
  loading,
  onRefresh,
  onNotice,
}: {
  accounts: PlatformAccount[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNotice: (msg: string, error?: boolean) => void;
}) {
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [editing, setEditing] = useState<PlatformAccount | null>(null);

  const isolatedCount = accounts.filter((a) => a.network.mode !== "direct").length;
  const directCount = accounts.length - isolatedCount;
  const conflictCount = accounts.filter((a) => a.networkWarnings.length > 0).length;
  const checkedOkCount = accounts.filter((a) => a.lastNetworkCheck?.ok).length;

  const grouped = Object.keys(platforms)
    .map((pid) => ({
      id: pid as AccountPlatform,
      meta: platforms[pid as AccountPlatform],
      items: accounts.filter((a) => a.platform === pid),
    }))
    .filter((group) => group.items.length > 0);

  async function checkOne(id: string) {
    setCheckingId(id);
    try {
      const res = await window.cs.checkAccountNetwork(id);
      await onRefresh();
      if (res.ok) {
        onNotice(`出口 IP：${res.ip}${res.country ? `（${res.country}）` : ""} · ${res.latencyMs}ms`);
      } else {
        onNotice(res.error || "出口 IP 检测失败", true);
      }
    } catch (err) {
      onNotice(uiErrorMessage(err), true);
    } finally {
      setCheckingId("");
    }
  }

  async function checkAll() {
    setCheckingAll(true);
    try {
      const results = await window.cs.checkAllAccountNetworks();
      await onRefresh();
      const total = Object.keys(results).length;
      const ok = Object.values(results).filter((r) => r.ok).length;
      onNotice(`已完成全部 ${total} 个账号的网络检测：${ok} 个连通，${total - ok} 个异常`);
    } catch (err) {
      onNotice(uiErrorMessage(err), true);
    } finally {
      setCheckingAll(false);
    }
  }

  async function openBrowser(id: string) {
    setOpeningId(id);
    try {
      await window.cs.openAccountBrowser(id, "home");
      await onRefresh();
    } catch (err) {
      onNotice(uiErrorMessage(err), true);
    } finally {
      setOpeningId("");
    }
  }

  return (
    <div className="accounts-page network-page">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">NETWORK ISOLATION</span>
          <h1>网络隔离中心</h1>
          <p>
            为每个账号绑定独立的 Chrome 会话与出口代理（支持远程 HTTP/HTTPS/SOCKS5 代理及本机 Clash Verge 多端口分流），并自动检测同平台同 IP 冲突。
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button primary"
            disabled={checkingAll || loading || !accounts.length}
            onClick={() => void checkAll()}
          >
            {checkingAll ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Activity size={15} />
            )}
            {checkingAll ? "正在检测全部 IP…" : "一键检测全部出口 IP"}
          </button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-box">
          <span>已配置独立代理</span>
          <strong>
            {isolatedCount} <small>/ {accounts.length}</small>
          </strong>
          <em>每个账号独立 Profile + 代理</em>
        </div>
        <div className="kpi-box">
          <span>本机直连账号</span>
          <strong>{directCount}</strong>
          <em>同平台多个直连账号会共享本机 IP</em>
        </div>
        <div className={`kpi-box ${conflictCount > 0 ? "warn" : "good"}`}>
          <span>同平台关联风险</span>
          <strong>{conflictCount}</strong>
          <em>
            {conflictCount > 0 ? "检测到同平台共享代理或同出口 IP" : "当前未发现同平台 IP 冲突"}
          </em>
        </div>
        <div className="kpi-box">
          <span>最近连通正常</span>
          <strong>{checkedOkCount}</strong>
          <em>含出口 IP、归属地与延迟记录</em>
        </div>
      </div>

      <div className="accounts-info">
        <Lock size={18} />
        <p>
          <strong>双模式网络隔离：</strong>
          ① <strong>本机 Clash Verge 多端口分流</strong>：在 Clash 配置多个监听端口（如 7890 / 7891 / 7892）分别指向不同节点，这里按账号绑定不同端口即可；
          ② <strong>独立住宅/静态代理</strong>：直接填 HTTP/HTTPS/SOCKS5 主机、端口与账密，cs-work 自动建立本机加密隧道，默认开启 <strong>Fail-Closed</strong>（代理不通禁止打开 Chrome）与 <strong>WebRTC 防泄露</strong>。
        </p>
      </div>

      {loading ? (
        <div className="accounts-empty" role="status">
          <LoaderCircle size={24} className="spin" />
          <p>正在加载网络配置…</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="accounts-empty">
          <Globe size={34} />
          <h2>还没有平台账号</h2>
          <p>请先在「账号与数据」添加平台账号，再在这里配置独立代理与检测出口 IP。</p>
        </div>
      ) : (
        <div className="network-groups">
          {grouped.map((group) => (
            <section className="network-group" key={group.id}>
              <div className="network-group-head">
                <h2>
                  {group.meta.name}
                  <span className="pill neutral">{group.items.length} 个账号</span>
                  {group.meta.region === "global" && (
                    <span className="pill neutral">海外平台</span>
                  )}
                </h2>
              </div>
              <div className="network-table">
                {group.items.map((account) => {
                  const check = account.lastNetworkCheck;
                  const hasWarning = account.networkWarnings.length > 0;
                  const isDirect = account.network.mode === "direct";
                  const busyRow = checkingId === account.id || openingId === account.id || checkingAll;
                  return (
                    <div
                      className={`network-row ${hasWarning ? "has-warning" : ""}`}
                      key={account.id}
                    >
                      <div className="network-row-main">
                        <div className="network-row-title">
                          <strong>{account.name}</strong>
                          <span className={`pill ${isDirect ? "neutral" : "good"}`}>
                            {account.network.mode === "local_port"
                              ? "Clash / 本机端口"
                              : account.network.mode === "proxy"
                                ? "独立代理"
                                : "直连"}
                          </span>
                          {account.network.failClosed && !isDirect && (
                            <span className="pill neutral" title="代理不可用时禁止启动 Chrome">
                              Fail-Closed
                            </span>
                          )}
                          {account.network.blockWebRtc && (
                            <span className="pill neutral" title="已禁用非代理 WebRTC UDP">
                              WebRTC 防护
                            </span>
                          )}
                          {account.network.timezone && (
                            <span className="pill neutral">{account.network.timezone}</span>
                          )}
                        </div>
                        <div className="network-row-meta">
                          <span>出口策略：{formatNetworkSummary(account)}</span>
                          {check ? (
                            check.ok ? (
                              <span className="ip-badge ok">
                                <CheckCircle2 size={13} />
                                {check.ip}
                                {formatLocation(account) ? ` · ${formatLocation(account)}` : ""}
                                {check.latencyMs ? ` · ${check.latencyMs}ms` : ""}
                              </span>
                            ) : (
                              <span className="ip-badge bad">
                                <ShieldAlert size={13} />
                                检测失败：{check.error}
                              </span>
                            )
                          ) : (
                            <span className="muted">尚未检测出口 IP</span>
                          )}
                        </div>
                        {hasWarning && (
                          <div className="network-warning-list">
                            {account.networkWarnings.map((w, idx) => (
                              <div className="network-warning-item" key={idx}>
                                <AlertTriangle size={13} />
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="network-row-actions">
                        <button
                          className="button subtle"
                          disabled={busyRow}
                          onClick={() => void checkOne(account.id)}
                        >
                          {checkingId === account.id ? (
                            <LoaderCircle size={14} className="spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          测出口 IP
                        </button>
                        <button
                          className="button subtle"
                          disabled={busyRow}
                          onClick={() => setEditing(account)}
                        >
                          <Settings2 size={14} />
                          配置代理
                        </button>
                        <button
                          className="button dark"
                          disabled={busyRow}
                          onClick={() => void openBrowser(account.id)}
                        >
                          <ExternalLink size={14} />
                          打开隔离窗口
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <NetworkEditorModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={async (checkAfterSave) => {
            await onRefresh();
            onNotice(`已保存「${editing.name}」的网络隔离配置`);
            if (checkAfterSave) {
              await checkOne(editing.id);
            }
          }}
        />
      )}
    </div>
  );
}
