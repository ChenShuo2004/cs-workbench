import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronRight,
  CircleAlert,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Power,
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
import { Dashboard } from "./pages/Dashboard";
import { Publish } from "./pages/Publish";
import { Environment } from "./pages/Environment";
import { AutomationSettings } from "./pages/AutomationSettings";
import { Accounts } from "./pages/Accounts";

import type { AppInfo, PlatformAccount, Section } from "./types";
import { uiErrorMessage } from "./ui-error";
import "./styles/tokens.css";
import "./styles/app.css";

const NAV: {
  id: Section;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: "dashboard", label: "总仪表盘", icon: LayoutDashboard },
  { id: "publish", label: "发布中心", icon: UploadCloud },
  { id: "accounts", label: "账号与数据", icon: Users },
  { id: "network", label: "网络隔离", icon: ShieldCheck },
  { id: "settings", label: "设置", icon: Settings2 },
];

function App() {
  const appearance = useAppearance();
  const [section, setSection] = useState<Section>("dashboard");
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState(0);
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
      [{ opacity: 0.78 }, { opacity: 1 }],
      { duration: 130, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [section]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const notice = (message: string, error = false) => {
    clearTimeout(noticeTimer.current);
    setToast({ message, error });
    noticeTimer.current = setTimeout(() => setToast(null), error ? 6500 : 3800);
  };

  const refreshAccounts = async () => {
    const [list, postsState] = await Promise.all([
      window.cs.listAccounts(),
      window.cs.postsRead().catch(() => null),
    ]);
    setAccounts(list);
    if (postsState) {
      setPendingConfirm(
        postsState.records.filter((r) => r.status === "待你确认").length,
      );
    }
  };

  useEffect(() => {
    let live = true;
    void Promise.all([
      window.cs.listAccounts().then((list) => {
        if (live) setAccounts(list);
      }),
      window.cs
        .postsRead()
        .then((s) => {
          if (live)
            setPendingConfirm(
              s.records.filter((r) => r.status === "待你确认").length,
            );
        })
        .catch(() => {}),
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

  const onlineCount = accounts.filter((a) => a.dataConnected).length;

  const sidebar = (
    <aside className="t3-sidebar" aria-label="主导航">
      {narrow && (
        <button
          className="t3-icon-btn nav-close-btn"
          aria-label="关闭导航"
          onClick={() => setNavigationOpen(false)}
        >
          <X size={16} />
        </button>
      )}
      <div className="t3-brand">
        <div className="t3-brand-avatar">
          <BrandAvatar />
        </div>
        <div className="t3-brand-text">
          <strong>Kaige-work</strong>
          <span>Matrix Workspace</span>
        </div>
      </div>

      <nav className="t3-nav" aria-label="工作台导航">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              className={`t3-nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setSection(item.id);
                setNavigationOpen(false);
              }}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.id === "publish" && pendingConfirm > 0 && (
                <em className="t3-nav-num warn">{pendingConfirm}</em>
              )}
              {item.id === "accounts" && accounts.length > 0 && (
                <em className="t3-nav-num">{accounts.length}</em>
              )}
            </button>
          );
        })}
      </nav>

      <div className="t3-sidebar-foot">
        <span className="t3-foot-dot" />
        <span>
          {accounts.length} 账号 · {onlineCount > 0 ? `${onlineCount} 窗口运行` : "空闲"}
        </span>
      </div>
    </aside>
  );

  return (
    <div className="t3-shell">
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

      <div className="t3-main">
        <header className="t3-topbar">
          {narrow && (
            <button
              className="t3-icon-btn"
              aria-label="打开导航"
              aria-expanded={navigationOpen}
              onClick={() => setNavigationOpen(true)}
            >
              <Menu size={17} />
            </button>
          )}
          <div className="t3-crumb">
            <span>Kaige-work</span>
            <ChevronRight size={13} />
            <strong>{NAV.find((n) => n.id === section)?.label}</strong>
          </div>
          <div className="t3-topbar-right">
            {onlineCount > 0 && (
              <button
                className="t3-btn ghost xs"
                onClick={() =>
                  void window.cs
                    .closeAll()
                    .then(refreshAccounts)
                    .then(() => notice("已关闭全部账号窗口"))
                    .catch((e) => notice(uiErrorMessage(e), true))
                }
              >
                <Power size={12} /> 关窗 ({onlineCount})
              </button>
            )}
            <AppearancePicker
              compact
              theme={appearance.theme}
              onChange={appearance.changeTheme}
            />
          </div>
        </header>

        <main
          className={`t3-content ${section === "dashboard" ? "is-board" : ""}`}
          ref={contentScroll}
        >
          {section === "dashboard" && (
            <Dashboard
              accounts={accounts}
              loading={loadingAccounts}
              onRefresh={refreshAccounts}
              onNavigate={setSection}
              onNotice={notice}
            />
          )}

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
            <div className="t3-page t3-settings-page">
              <div className="t3-page-head">
                <div className="t3-head-title">
                  <h1>设置</h1>
                </div>
              </div>
              <div className="t3-settings-stack">
                <AutomationSettings onNotice={notice} />
                <section className="t3-card">
                  <div className="t3-card-head">
                    <span>外观与阅读</span>
                  </div>
                  <AppearancePicker
                    theme={appearance.theme}
                    onChange={appearance.changeTheme}
                  />
                  <div className="t3-divider" />
                  <ExperienceSettings appearance={appearance} />
                </section>

                <section className="t3-card">
                  <div className="t3-card-head">
                    <span>本机数据与安全</span>
                    <small>Kaige-work v{appInfo?.version || "1.0.0"}</small>
                  </div>
                  <p className="t3-muted-line">
                    钥匙串加密：{appInfo?.encryptionAvailable ? "已启用" : "不可用"} · 数据目录：
                    <code>{appInfo?.userDataPath || "--"}</code>
                  </p>
                  <div>
                    <button
                      className="t3-btn"
                      onClick={() =>
                        void window.cs
                          .openUserData()
                          .catch((e) => notice(uiErrorMessage(e), true))
                      }
                    >
                      <FolderOpen size={13} /> 在 Finder 中打开数据目录
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
          className={`t3-toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error && <CircleAlert size={14} />}
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
