import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Power,
  RefreshCw,
  Router,
  Settings2,
} from "lucide-react";
import { NetworkEditorModal } from "../NetworkEditorModal";
import { formatLocation } from "../NetworkIsolation";
import { PlatformIcon } from "../platform-icons";
import platforms from "../../shared/account-platforms.json";
import type { ClashReadResult, PlatformAccount } from "../types";
import { uiErrorMessage } from "../ui-error";

export function Environment({
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
  const [nodes, setNodes] = useState<ClashReadResult | null>(null);
  const [showPorts, setShowPorts] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState<PlatformAccount | null>(null);

  const loadClash = () =>
    window.cs
      .clashRead()
      .then(setNodes)
      .catch((e) => onNotice(uiErrorMessage(e), true));

  useEffect(() => {
    void loadClash();
  }, []);

  const boundByPort = new Map<number, string[]>();
  for (const a of accounts) {
    if (a.network.mode === "local_port" && a.network.port) {
      const list = boundByPort.get(a.network.port) || [];
      list.push(a.name);
      boundByPort.set(a.network.port, list);
    }
  }

  const onlineCount = accounts.filter((a) => a.dataConnected).length;
  const conflictCount = accounts.filter((a) => a.networkWarnings.length > 0).length;

  async function checkAll() {
    setCheckingAll(true);
    try {
      const res = await window.cs.checkAllAccountNetworks();
      await onRefresh();
      const total = Object.keys(res).length;
      const ok = Object.values(res).filter((r) => r.ok).length;
      onNotice(`测速完成：${ok}/${total} 个出口连通`);
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setCheckingAll(false);
    }
  }

  async function checkOne(a: PlatformAccount) {
    setBusyId(a.id);
    try {
      const res = await window.cs.checkAccountNetwork(a.id);
      await onRefresh();
      if (res.ok) onNotice(`${a.name} 出口：${res.ip} · ${res.latencyMs}ms`);
      else onNotice(res.error || "检测失败", true);
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyId("");
    }
  }

  async function toggleBrowser(a: PlatformAccount) {
    setBusyId(a.id);
    try {
      if (a.dataConnected) {
        await window.cs.closeAccountBrowser(a.id);
        onNotice(`已关闭「${a.name}」窗口`);
      } else {
        await window.cs.openAccountBrowser(a.id, "home");
        onNotice(`已启动「${a.name}」隔离窗口`);
      }
      await onRefresh();
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="t3-page">
      <div className="t3-page-head">
        <div className="t3-head-title">
          <h1>网络隔离</h1>
          <span className="t3-count">{accounts.length}</span>
          {conflictCount > 0 && (
            <span className="t3-tag warn">{conflictCount} 项线路提示</span>
          )}
        </div>
        <div className="t3-head-actions">
          <button className="t3-btn ghost" onClick={() => setShowPorts((v) => !v)}>
            <Router size={13} />
            Clash Verge（{nodes?.listeners?.length || 0} 端口）
            {showPorts ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <button
            className="t3-btn ghost"
            disabled={reloading}
            onClick={() => {
              setReloading(true);
              void window.cs
                .clashReload()
                .then((res) => {
                  if (res.ok) onNotice("Clash 配置已重载");
                  else onNotice(res.error || "重载失败", true);
                  return loadClash();
                })
                .catch((e) => onNotice(uiErrorMessage(e), true))
                .finally(() => setReloading(false));
            }}
          >
            <RefreshCw size={13} className={reloading ? "spin" : ""} /> 重载
          </button>
          <button
            className="t3-btn ghost"
            onClick={() =>
              void window.cs
                .closeAll()
                .then(onRefresh)
                .then(() => onNotice("已关闭全部账号窗口"))
                .catch((e) => onNotice(uiErrorMessage(e), true))
            }
          >
            <Power size={13} /> 关闭全部窗口{onlineCount > 0 ? ` (${onlineCount})` : ""}
          </button>
          <button
            className="t3-btn primary"
            disabled={checkingAll || loading || !accounts.length}
            onClick={() => void checkAll()}
          >
            {checkingAll ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <Activity size={13} />
            )}
            {checkingAll ? "测速中…" : "全量测出口 IP"}
          </button>
        </div>
      </div>

      {showPorts && (
        <div className="t3-card clash-drawer">
          <div className="t3-card-head">
            <span>Clash Verge 运行配置</span>
            <small className="file-path">{nodes?.file || nodes?.error || "—"}</small>
          </div>
          {nodes?.listeners?.length ? (
            <div className="clash-port-grid">
              {nodes.listeners.map((n) => {
                const owners = boundByPort.get(n.port) || [];
                return (
                  <div
                    className={`clash-port-chip ${owners.length ? "bound" : ""}`}
                    key={n.port}
                    title={`${n.name} → ${n.proxy}${owners.length ? `\n绑定：${owners.join("、")}` : ""}`}
                  >
                    <div className="clash-port-top">
                      <strong>:{n.port}</strong>
                      <span className={`t3-tag ${owners.length ? "good" : ""}`}>
                        {owners.length > 1
                          ? `${owners.length} 账号`
                          : owners[0] || "空闲"}
                      </span>
                    </div>
                    <small className="clash-proxy-name">{n.proxy}</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="t3-muted-line">{nodes?.error || "未检测到端口监听"}</p>
          )}
        </div>
      )}

      <div className="t3-table-wrap">
        <table className="t3-table">
          <thead>
            <tr>
              <th>账号</th>
              <th>代理策略</th>
              <th>出口 IP & 延迟</th>
              <th>隔离窗口</th>
              <th style={{ textAlign: "right" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const check = a.lastNetworkCheck;
              const rowBusy = busyId === a.id || checkingAll;
              const warnText = a.networkWarnings[0] || "";
              return (
                <tr key={a.id}>
                  <td>
                    <div className="t3-table-id">
                      <PlatformIcon platform={a.platform} size={20} />
                      <strong>{a.name}</strong>
                      <span className="t3-muted-sm">{platforms[a.platform].name}</span>
                      {warnText && (
                        <span className="t3-warn-icon" title={warnText}>
                          <AlertTriangle size={13} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="t3-route-pill">
                      {a.network.mode === "direct"
                        ? "直连"
                        : `${a.network.label || a.network.protocol.toUpperCase()} :${a.network.port}`}
                    </span>
                  </td>
                  <td>
                    {check ? (
                      check.ok ? (
                        <span className="t3-ip-cell">
                          <code>{check.ip}</code>
                          <small>
                            {formatLocation(a)}
                            {check.latencyMs ? ` · ${check.latencyMs}ms` : ""}
                          </small>
                        </span>
                      ) : (
                        <span className="t3-tag bad">{check.error || "异常"}</span>
                      )
                    ) : (
                      <span className="t3-muted-sm">未测速</span>
                    )}
                  </td>
                  <td>
                    <span className={`t3-status-dot ${a.dataConnected ? "online" : ""}`}>
                      {a.dataConnected ? "运行中" : "已关闭"}
                    </span>
                  </td>
                  <td>
                    <div className="t3-row-actions">
                      <button
                        className="t3-btn ghost xs"
                        disabled={rowBusy}
                        onClick={() => void checkOne(a)}
                      >
                        测速
                      </button>
                      <button
                        className="t3-btn ghost xs"
                        disabled={rowBusy}
                        onClick={() => setEditing(a)}
                      >
                        <Settings2 size={12} /> 代理
                      </button>
                      <button
                        className="t3-btn xs"
                        disabled={rowBusy}
                        onClick={() => void toggleBrowser(a)}
                      >
                        {a.dataConnected ? (
                          <>
                            <Power size={12} /> 关闭
                          </>
                        ) : (
                          <>
                            <ExternalLink size={12} /> 启动
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!accounts.length && <div className="t3-empty-sm">暂无平台账号</div>}
      </div>

      {editing && (
        <NetworkEditorModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={async (checkAfterSave) => {
            await onRefresh();
            onNotice(`已保存「${editing.name}」的代理配置`);
            if (checkAfterSave) await checkOne(editing);
          }}
        />
      )}
    </div>
  );
}
