import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronRight,
  CircleAlert,
  FolderOpen,
  Menu,
  Settings2,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import {
  AppearancePicker,
  ExperienceSettings,
  prefersReducedMotion,
  useAppearance,
} from "./Appearance";
import { BrandAvatar } from "./Brand";
import { Publish } from "./pages/Publish";
import { Environment } from "./pages/Environment";
import { Accounts } from "./pages/Accounts";

import type { AppInfo, PlatformAccount, Section } from "./types";
import { uiErrorMessage } from "./ui-error";
import "./styles/tokens.css";
import "./styles/app.css";

const NAV: {
  id: Section;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  {
    id: "publish",
    label: "发布中心",
    desc: "一稿多发 · 自动填表 · 人工确认",
    icon: UploadCloud,
  },
  {
    id: "accounts",
    label: "账号与数据",
    desc: "8 平台矩阵与数据快照",
    icon: Users,
  },
  {
    id: "network",
    label: "网络隔离",
    desc: "独立代理 · Clash 端口 · 出口 IP",
    icon: ShieldCheck,
  },
  { id: "settings", label: "设置", desc: "外观 · 本机数据", icon: Settings2 },
];

function App() {
  const appearance = useAppearance();
  const [section, setSection] = useState<Section>("accounts");
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const contentScroll = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const update = () => {
      setNarrow(media.matches);
      setNavigationOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    contentScroll.current?.scrollTo({ top: 0 });
    if (prefersReducedMotion()) return;
    const animation = contentScroll.current?.animate(
      [{ opacity: 0.7 }, { opacity: 1 }],
      { duration: 150, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [section]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const notice = (message: string, error = false) => {
    clearTimeout(noticeTimer.current);
    setToast({ message, error });
    noticeTimer.current = setTimeout(() => setToast(null), error ? 7500 : 4200);
  };

  const refreshAccounts = async () => {
    const list = await window.cs.listAccounts();
    setAccounts(list);
  };

  useEffect(() => {
    let live = true;
    void Promise.all([
      window.cs.listAccounts().then((list) => {
        if (live) setAccounts(list);
      }),
      window.cs.appInfo().then((info) => {
        if (live) setAppInfo(info);
      }),
    ])
      .catch((err) => {
        if (live) notice(uiErrorMessage(err), true);
      })
      .finally(() => {
        if (live) setLoadingAccounts(false);
      });

    const unsub = window.cs.onAccountsChanged(() => {
      void refreshAccounts().catch(() => {});
    });
    return () => {
      live = false;
      unsub();
    };
  }, []);

  const conflictCount = accounts.filter(
    (a) => a.networkWarnings.length > 0,
  ).length;

  const sidebar = (
    <aside className="sidebar cs-work-sidebar" aria-label="主导航">
      {narrow && (
        <button
          className="icon-button navigation-close"
          aria-label="关闭导航"
          onClick={() => setNavigationOpen(false)}
        >
          <X size={18} />
        </button>
      )}
      <div className="sidebar-top">
        <div className="brand-mark">
          <BrandAvatar />
        </div>
        <div>
          <div className="brand-title">Kaige-work</div>
          <div className="brand-sub">PUBLISH · DATA · ISOLATION</div>
        </div>
      </div>

      <nav aria-label="工作台导航">
        <div className="sidebar-label">核心工作台</div>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setSection(item.id);
                setNavigationOpen(false);
              }}
            >
              <Icon size={17} strokeWidth={1.85} />
              <span>{item.label}</span>
              {item.id === "accounts" && accounts.length > 0 && (
                <span className="nav-badge">{accounts.length}</span>
              )}
              {item.id === "network" && conflictCount > 0 && (
                <span className="nav-badge warn">{conflictCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="local-badge">
          <span />
          <div>
            <strong>本机独立会话</strong>
            <small>
              {accounts.length} 个账号 ·{" "}
              {accounts.filter((a) => a.network.mode !== "direct").length}{" "}
              个已配代理
            </small>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-shell studio-shell">
      {narrow
        ? navigationOpen && (
            <div
              className="drawer-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setNavigationOpen(false);
              }}
            >
              {sidebar}
            </div>
          )
        : sidebar}

      <div className="workspace">
        <header className="topbar">
          {narrow && (
            <button
              className="icon-button navigation-toggle"
              aria-label="打开导航"
              aria-expanded={navigationOpen}
              onClick={() => setNavigationOpen(true)}
            >
              <Menu size={19} />
            </button>
          )}
          <div className="crumb">
            <span>Kaige-work</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((n) => n.id === section)?.label}</strong>
          </div>
          <div className="topbar-right">
            <AppearancePicker
              compact
              theme={appearance.theme}
              onChange={appearance.changeTheme}
            />
          </div>
        </header>

        <main className="content" ref={contentScroll}>
          {section === "publish" && (
            <Publish
              accounts={accounts}
              onOpenAccounts={() => setSection("accounts")}
              onNotice={notice}
            />
          )}

          {section === "accounts" && (
            <Accounts
              accounts={accounts}
              loading={loadingAccounts}
              onRefresh={refreshAccounts}
              onOpenNetwork={() => setSection("network")}
              onNotice={notice}
            />
          )}

          {section === "network" && (
            <Environment
              accounts={accounts}
              loading={loadingAccounts}
              onRefresh={refreshAccounts}
              onNotice={notice}
            />
          )}

          {section === "settings" && (
            <div className="accounts-page settings-page">
              <div className="page-heading compact">
                <div>
                  <span className="eyebrow">SETTINGS</span>
                  <h1>工作台设置</h1>
                  <p>
                    配置外观主题与本机隔离数据目录。工作台配色仅影响壳层界面，不改动内嵌看板与外部平台页面颜色。
                  </p>
                </div>
              </div>

              <div className="settings-stack">
                <section className="settings-card">
                  <h2>外观与阅读</h2>
                  <p className="muted">
                    选择适合当前光线的语义配色方案，自动持久保存。
                  </p>
                  <AppearancePicker
                    theme={appearance.theme}
                    onChange={appearance.changeTheme}
                  />
                  <div className="settings-divider" />
                  <ExperienceSettings appearance={appearance} />
                </section>

                <section className="settings-card">
                  <h2>本机数据与安全</h2>
                  <p className="muted">
                    应用版本：
                    <code>Kaige-work v{appInfo?.version || "1.0.0"}</code> ·
                    系统钥匙串加密：
                    <strong>
                      {appInfo?.encryptionAvailable ? "已启用" : "不可用"}
                    </strong>
                  </p>
                  <p className="muted">
                    本机数据目录（含账号列表、独立 Chrome Profile 与数据快照）：
                    <code>{appInfo?.userDataPath || "--"}</code>
                  </p>
                  <div className="settings-actions">
                    <button
                      className="button subtle"
                      onClick={() =>
                        void window.cs
                          .openUserData()
                          .catch((e) => notice(uiErrorMessage(e), true))
                      }
                    >
                      <FolderOpen size={15} /> 在 Finder 中打开数据目录
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error && <CircleAlert size={16} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
