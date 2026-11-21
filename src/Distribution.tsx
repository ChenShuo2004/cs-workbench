import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import platforms from "../shared/account-platforms.json";
import { uiErrorMessage } from "./ui-error";
import type { AccountPlatform, MaitianFrame, PlatformAccount } from "./types";
import "./distribution.css";

export function Distribution({
  accounts,
  onOpenAccounts,
  onNotice,
}: {
  accounts: PlatformAccount[];
  onOpenAccounts: () => void;
  onNotice: (msg: string, error?: boolean) => void;
}) {
  const [state, setState] = useState<MaitianFrame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [platformFilter, setPlatformFilter] = useState<AccountPlatform | "all">("all");
  const [launchingId, setLaunchingId] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void window.cs
      .maitianRead()
      .then((s) => {
        if (live) setState(s);
      })
      .catch((e) => {
        if (live) setError(uiErrorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [revision]);

  const refresh = () => setRevision((r) => r + 1);

  async function connect() {
    try {
      const s = await window.cs.maitianConnect();
      if (s) {
        setState(s);
        refresh();
      }
    } catch (e) {
      setError(uiErrorMessage(e));
    }
  }

  async function launchPublish(account: PlatformAccount) {
    setLaunchingId(account.id);
    try {
      await window.cs.openAccountBrowser(account.id, "publish");
      onNotice(
        `已在独立隔离 Chrome 中打开发布页：${platforms[account.platform].name} · ${account.name}`,
      );
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setLaunchingId("");
    }
  }

  const activePlatforms = Object.keys(platforms).filter((pid) =>
    accounts.some((a) => a.platform === pid),
  ) as AccountPlatform[];

  const visibleAccounts =
    platformFilter === "all"
      ? accounts
      : accounts.filter((a) => a.platform === platformFilter);

  return (
    <section className="maitian-embedded publish-center" aria-label="发布中心">
      <div className="quick-publish-bar">
        <div className="quick-publish-head">
          <div className="quick-publish-title">
            <Send size={14} />
            <strong>矩阵号一键隔离发布</strong>
            <span>点击账号直接拉起其专属代理与 Chrome Profile 进入发布页</span>
          </div>
          <div className="quick-publish-filters">
            <button
              className={`chip-btn ${platformFilter === "all" ? "active" : ""}`}
              onClick={() => setPlatformFilter("all")}
            >
              全部 ({accounts.length})
            </button>
            {activePlatforms.map((pid) => (
              <button
                key={pid}
                className={`chip-btn ${platformFilter === pid ? "active" : ""}`}
                onClick={() => setPlatformFilter(pid)}
              >
                {platforms[pid].name}
              </button>
            ))}
            <button className="text-button" onClick={onOpenAccounts}>
              管理账号与数据
            </button>
          </div>
        </div>
        {visibleAccounts.length > 0 ? (
          <div className="quick-publish-chips">
            {visibleAccounts.map((account) => {
              const isolated = account.network.mode !== "direct";
              const warned = account.networkWarnings.length > 0;
              return (
                <button
                  key={account.id}
                  className={`publish-account-chip ${warned ? "warn" : isolated ? "isolated" : ""}`}
                  disabled={launchingId === account.id}
                  title={
                    warned
                      ? account.networkWarnings[0]
                      : isolated
                        ? `通过 ${account.network.protocol}://${account.network.host}:${account.network.port} 隔离打开发布页`
                        : "本机直连打开发布页"
                  }
                  onClick={() => void launchPublish(account)}
                >
                  {launchingId === account.id ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : warned ? (
                    <AlertTriangle size={13} />
                  ) : (
                    <ShieldCheck size={13} />
                  )}
                  <span className="chip-platform">
                    {platforms[account.platform].name}
                  </span>
                  <strong>{account.name}</strong>
                  {isolated && (
                    <em className="chip-port">
                      {account.network.label || `:${account.network.port}`}
                    </em>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted small">
            暂无平台账号，前往「账号与数据」添加后即可在此一键隔离发布。
          </p>
        )}
      </div>

      <div className="maitian-frame-toolbar">
        <span>
          <i className={state?.connected ? "online" : ""} />
          麦田 · 主号多平台分发与数据大屏
        </span>
        <div>
          <button className="text-button" disabled={loading} onClick={refresh}>
            <RefreshCw size={14} />
            刷新网页
          </button>
          <button className="text-button" onClick={() => void connect()}>
            连接位置
          </button>
          <button
            className="text-button"
            disabled={!state?.installed}
            onClick={() =>
              void window.cs
                .maitianOpen()
                .catch((e) => setError(uiErrorMessage(e)))
            }
          >
            <ExternalLink size={14} />
            在浏览器打开
          </button>
        </div>
      </div>

      {error && (
        <div className="maitian-frame-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="maitian-frame-placeholder" role="status">
          <LoaderCircle className="spin" size={22} />
          <p>正在连接麦田…</p>
        </div>
      ) : state?.connected ? (
        <iframe
          key={revision}
          src={state.frameUrl}
          title="麦田看板"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="maitian-frame-placeholder">
          <h1>{state?.installed ? "麦田暂时无法连接" : "连接你的麦田"}</h1>
          <p>{state?.error || "请选择本机已安装的麦田目录（~/maitian/mdldm-maitian）。"}</p>
          <button
            className="button primary"
            onClick={state?.installed ? refresh : () => void connect()}
          >
            {state?.installed ? "重新连接" : "选择麦田目录"}
          </button>
        </div>
      )}
    </section>
  );
}
