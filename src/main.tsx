import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleUserRound,
  Clapperboard,
  Clipboard,
  Command,
  FileText,
  Film,
  Folder,
  FolderKanban,
  FolderOpen,
  Headphones,
  HeartHandshake,
  HeartPulse,
  House,
  Images,
  Inbox,
  LayoutDashboard,
  LibraryBig,
  LoaderCircle,
  Music2,
  Menu,
  PackageCheck,
  Play,
  PenLine,
  Plus,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Brain,
  SquarePen,
  Type,
  UploadCloud,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  Asset,
  Bootstrap,
  Branch,
  Catalog,
  DocKey,
  Preset,
  Project,
  ProjectSummary,
  QA,
  Section,
  Status,
} from "./types";
import "./styles.css";
import { Health } from "./Health";
import { ContentOps } from "./ContentOps";
import { Personal } from "./Personal";
import { Studio } from "./Studio";
import { VideoReferences } from "./VideoReferences";
import { Reunion } from "./Reunion";
import { DouyinAccounts } from "./DouyinAccounts";
import "./design-system.css";
import {
  AppearancePicker,
  ExperienceSettings,
  prefersReducedMotion,
  useAppearance,
} from "./Appearance";
import { DocumentPreview } from "./DocumentPreview";
import "./appearance.css";
import { BrandAvatar } from "./Brand";
import { Dialog } from "./Dialog";
import { WorkspaceSearch, type WorkspaceTarget } from "./WorkspaceSearch";
import "./experience.css";
import { uiErrorMessage } from "./ui-error";

const NAV: {
  id: Section;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: "health", label: "健康", icon: HeartPulse },
  { id: "content", label: "内容总览", icon: LayoutDashboard },
  { id: "desk", label: "我的工作台", icon: House },
  { id: "inbox", label: "资料收集", icon: Inbox },
  { id: "tasks", label: "每日任务", icon: CheckCheck },
  { id: "agents", label: "Agent 助手", icon: Sparkles },
  { id: "memory", label: "个人记忆", icon: Brain },
  { id: "folders", label: "文件空间", icon: FolderOpen },
  { id: "studio", label: "创作室", icon: Clapperboard },
  { id: "reunion", label: "亲人重逢", icon: HeartHandshake },
  { id: "projects", label: "项目", icon: FolderKanban },
  { id: "article", label: "文章", icon: PenLine },
  { id: "video", label: "视频", icon: ScrollText },
  { id: "library", label: "素材库", icon: LibraryBig },
  { id: "references", label: "风格案例", icon: Images },
  { id: "publish", label: "发布", icon: UploadCloud },
  { id: "accounts", label: "平台账号", icon: CircleUserRound },
];
const STAGES: { label: string; items: Section[] }[] = [
  { label: "发现信息", items: ["inbox"] },
  { label: "处理素材", items: ["folders", "library", "references"] },
  { label: "决定选题", items: ["projects"] },
  { label: "创作内容", items: ["article", "video", "studio", "reunion"] },
  { label: "分发交接", items: ["publish", "accounts"] },
];
const SEARCH_DESTINATIONS = [
  ...NAV.map((item) => ({
    id: item.id,
    label: item.label,
    group:
      STAGES.find((stage) => stage.items.includes(item.id))?.label ||
      "个人工作区",
  })),
  {
    id: "settings" as Section,
    label: "设置",
    group: "配色 · 密度 · 动态效果 · 文件位置",
  },
];
const STATUS: Status[] = [
  "准备中",
  "草稿",
  "待核查",
  "可导出",
  "已导出",
  "已上传",
  "已发布",
];
const DOC_NAMES: Record<DocKey, string> = {
  brief: "选题简报",
  article: "文章正文",
  script: "视频文案",
  shotlist: "逐镜头表",
  publish: "发布文案",
};
const PLATFORM_OPTIONS = ["小红书", "抖音", "X", "公众号", "B站", "视频号"];

function timeLabel(value: string) {
  try {
    return new Date(value).toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
function errorText(error: unknown) {
  return uiErrorMessage(error);
}
function statClass(status: string) {
  return ["已发布", "可导出"].includes(status)
    ? "good"
    : ["待核查", "待完善"].includes(status)
      ? "warn"
      : status === "阻塞"
        ? "bad"
        : "neutral";
}
function countWords(text: string) {
  return text.trim().replace(/\s+/g, "").length;
}

function App() {
  const appearance = useAppearance();
  const [documentView, setDocumentView] = useState<"edit" | "read">("edit");
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState("");
  const [section, setSection] = useState<Section>("desk");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const update = () => {
      setNarrow(media.matches);
      setNavigationOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const contentScroll = useRef<HTMLElement | null>(null);
  useEffect(() => {
    contentScroll.current?.scrollTo({ top: 0 });
    if (prefersReducedMotion()) return;
    const animation = contentScroll.current?.animate(
      [{ opacity: 0.65 }, { opacity: 1 }],
      { duration: 160, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [section]);
  const contentLeave = useRef<null | (() => Promise<boolean>)>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [expandedStage, setExpandedStage] = useState(-1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openTarget, setOpenTarget] = useState<WorkspaceTarget | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [docKey, setDocKey] = useState<DocKey>("article");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newError, setNewError] = useState("");
  useEffect(() => {
    if (newOpen) setNewError("");
  }, [newOpen]);
  const [newTitle, setNewTitle] = useState("");
  const [newAudience, setNewAudience] = useState("");
  const [newPlatforms, setNewPlatforms] = useState<string[]>(["小红书"]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [qa, setQa] = useState<QA | null>(null);
  const [libraryTab, setLibraryTab] = useState<"audio" | "fonts" | "netease">(
    "audio",
  );
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<{
    id: string;
    title: string;
    url: string;
  } | null>(null);
  const [fontPreview, setFontPreview] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewFontRef = useRef<FontFace | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const creating = useRef(false);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const notice = (message: string, error = false) => {
    clearTimeout(noticeTimer.current);
    setToast({ message, error });
    noticeTimer.current = setTimeout(() => setToast(null), error ? 8000 : 4400);
  };
  const refresh = async () => {
    const result = await window.cs.bootstrap();
    setBoot(result);
    return result;
  };
  const start = () => {
    setBootError("");
    void refresh().catch((e) => setBootError(errorText(e)));
  };
  useEffect(start, []);
  const refreshProject = async (root: string) => {
    const detail = await window.cs.readProject(root);
    setProject(detail);
    return detail;
  };
  const activateProject = async (root: string) => {
    if (!(await flush())) return;
    const detail = await refreshProject(root);
    setQa(null);
    setDraft(detail.docs[docKey]);
    setDirty(false);
    return true;
  };
  const selectProject = async (root: string) => {
    if (contentLeave.current && !(await contentLeave.current())) return false;
    if (!(await activateProject(root))) return false;
    setSection("projects");
    setNavigationOpen(false);
    return true;
  };
  const flush = async () => {
    if (!dirty || !project?.managed) return true;
    try {
      setSaving(true);
      await window.cs.saveDocument(project.path, docKey, draft);
      setDirty(false);
      setProject((p) =>
        p ? { ...p, docs: { ...p.docs, [docKey]: draft } } : p,
      );
      return true;
    } catch (e) {
      notice(`保存失败：${errorText(e)}`, true);
      return false;
    } finally {
      setSaving(false);
    }
  };
  const go = async (next: Section) => {
    if (
      next !== section &&
      contentLeave.current &&
      !(await contentLeave.current())
    )
      return false;
    if (!(await flush())) return false;
    if (
      next === "article" &&
      !["brief", "article", "publish"].includes(docKey)
    ) {
      setDocKey("article");
      setDraft(project?.docs.article || "");
      setDirty(false);
    }
    if (next === "video" && !["script", "shotlist"].includes(docKey)) {
      setDocKey("script");
      setDraft(project?.docs.script || "");
      setDirty(false);
    }
    setSection(next);
    setNavigationOpen(false);
    setQa(null);
    return true;
  };
  useEffect(() => {
    const stage = STAGES.findIndex((s) => s.items.includes(section));
    if (stage >= 0) setExpandedStage(stage);
  }, [section]);
  const openFinder = () => setSearchOpen(true);
  const openSearchTarget = async (target: WorkspaceTarget) => {
    if (target.kind === "project") return selectProject(target.id);
    if (!(await go(target.section))) return false;
    if (target.kind !== "page") setOpenTarget(target);
    return true;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        !e.isComposing
      ) {
        if (document.querySelector("dialog[open]") && !searchOpen) return;
        e.preventDefault();
        openFinder();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);
  const openDoc = async (key: DocKey, next: Section) => {
    if (!(await flush())) return;
    setDocKey(key);
    setDraft(project?.docs[key] || "");
    setDirty(false);
    setSection(next);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target as HTMLElement).closest('dialog[open], [role="dialog"]')
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush().then((ok) => {
          if (ok) notice("已保存到项目文件");
        });
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [dirty, draft, project, docKey]);
  const perform = async <T,>(
    label: string,
    action: () => Promise<T>,
    success?: string,
  ): Promise<T | undefined> => {
    setBusy(label);
    try {
      const result = await action();
      if (success) notice(success);
      return result;
    } catch (e) {
      notice(errorText(e), true);
      return undefined;
    } finally {
      setBusy("");
    }
  };
  const create = async () => {
    if (creating.current || !newTitle.trim()) return;
    creating.current = true;
    setNewError("");
    try {
      const result = await perform(
        "新建项目",
        () =>
          window.cs
            .createProject({
              title: newTitle,
              audience: newAudience,
              platforms: newPlatforms,
            })
            .catch((e) => {
              setNewError(errorText(e));
              throw e;
            }),
        "项目已建立",
      );
      if (!result) return;
      setNewOpen(false);
      setNewTitle("");
      setNewAudience("");
      await refresh();
      await selectProject(result.path);
    } finally {
      creating.current = false;
    }
  };
  const importExisting = async () => {
    const result = await perform(
      "导入工程",
      () => window.cs.importProject(),
      "已加入项目列表，原文件保持不变",
    );
    if (result) {
      await refresh();
      await selectProject(result.path);
    }
  };
  const changeSetting = async (kind: "workspace" | "library") => {
    const result = await perform("选择文件夹", () =>
      window.cs.chooseSetting(kind),
    );
    if (result) {
      await refresh();
      notice(kind === "library" ? "声音与字体库已连接" : "项目工作区已更新");
    }
  };
  const updateStatus = async (branch: Branch, status: Status) => {
    if (!project) return;
    const result = await perform(
      "更新状态",
      () => window.cs.updateStatus(project.path, branch, status),
      "状态已保存",
    );
    if (result) {
      await refreshProject(project.path);
      await refresh();
    }
  };
  const updatePlatform = async (platform: string, status: Status) => {
    if (!project) return;
    const result = await perform(
      "更新平台状态",
      () => window.cs.updatePlatformStatus(project.path, platform, status),
      `${platform}状态已保存`,
    );
    if (result) {
      await refreshProject(project.path);
      await refresh();
    }
  };
  const doQA = async () => {
    if (!project || !(await flush())) return;
    const result = await perform(
      "检查项目",
      () => window.cs.runQA(project.path),
      "检查已完成",
    );
    if (result) setQa(result);
  };
  const doExport = async (type: "article" | "video") => {
    if (!project || !(await flush())) return;
    const result = await perform("生成交付包", () =>
      window.cs.exportProject(project.path, type),
    );
    if (result) {
      setQa(result.qa);
      setSection("publish");
      notice(
        result.qa.issues.length
          ? `交付包已导出，仍有 ${result.qa.issues.length} 项待完善，请查看收尾检查。`
          : `交付包已生成：${result.zip.split("/").pop()}`,
      );
      await window.cs.openTarget(project.path, "outputs");
      await refreshProject(project.path);
    }
  };
  const doHandoff = async () => {
    if (!project || !(await flush())) return;
    const prompt = await perform("复制指令", () =>
      window.cs.handoff(project.path),
    );
    if (prompt) {
      await window.cs.copy(prompt);
      notice("已复制给 Codex / Claude 的项目指令");
    }
  };
  const preview = async (asset: Asset) => {
    if (playing?.id === asset.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    const result = await perform("加载试听", () =>
      window.cs.previewAsset(asset.id),
    );
    if (!result) return;
    if (asset.kind === "font") {
      try {
        const font = new FontFace("CSPreview", `url(${result.dataUrl})`);
        await font.load();
        if (previewFontRef.current)
          document.fonts.delete(previewFontRef.current);
        document.fonts.add(font);
        previewFontRef.current = font;
        setFontPreview(asset.id);
      } catch (e) {
        notice(errorText(e), true);
      }
    } else {
      setPlaying({ id: asset.id, title: result.title, url: result.dataUrl });
      window.setTimeout(() => {
        void audioRef.current?.play();
      }, 50);
    }
  };
  const addAsset = async (asset: Asset) => {
    if (!project) {
      notice("先新建或选择一个项目");
      return;
    }
    const result = await perform(
      "加入素材",
      () => window.cs.addAsset(project.path, asset.id),
      "素材已复制到当前项目",
    );
    if (result) await refreshProject(project.path);
  };
  const filteredAssets = useMemo(() => {
    const items =
      libraryTab === "audio"
        ? boot?.catalog.audio || []
        : libraryTab === "fonts"
          ? boot?.catalog.fonts || []
          : boot?.catalog.netease || [];
    const q = query.trim().toLowerCase();
    return items
      .filter(
        (a) =>
          !q ||
          `${a.title} ${a.use} ${a.tags.join(" ")}`.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)),
      );
  }, [boot?.catalog, libraryTab, query]);

  const renderNav = (id: Section) => {
    const item = NAV.find((n) => n.id === id)!;
    const Icon = item.icon;
    return (
      <button
        key={id}
        aria-label={item.label}
        title={item.label}
        type="button"
        className={`nav-item ${section === id ? "active" : ""}`}
        aria-current={section === id ? "page" : undefined}
        onClick={() => void go(id)}
      >
        <Icon size={17} />
        <span>{item.label}</span>
        {id === "projects" && (
          <span className="nav-count">{boot?.projects.length}</span>
        )}
      </button>
    );
  };
  if (!boot)
    return (
      <div className="splash">
        <BrandAvatar className="splash-avatar" />
        <h1>CS 工作台</h1>
        {bootError ? (
          <>
            <CircleAlert size={24} />
            <p role="alert">工作台暂时无法打开：{bootError}</p>
            <button className="button primary" onClick={start}>
              重新打开工作台
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={24} />
            <span role="status">正在打开工作台</span>
          </>
        )}
      </div>
    );
  const sidebar = (
    <aside className="sidebar" aria-label="工作台侧栏">
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
          <div className="brand-title">CS 工作台</div>
          <div className="brand-sub">计划 · 创作 · 整理</div>
        </div>
      </div>
      <nav aria-label="工作台导航">
        <div className="sidebar-label">我的安排</div>
        {(["desk", "content", "tasks", "health"] as Section[]).map(renderNav)}
        <div className="sidebar-label workflow-label">创作流程</div>
        {STAGES.map((stage, i) =>
          stage.items.length === 1 ? (
            <div
              className={`workflow-stage single ${stage.items.includes(section) ? "current" : ""}`}
              key={stage.label}
            >
              <button
                className={`nav-stage direct ${section === stage.items[0] ? "active" : ""}`}
                aria-label={NAV.find((n) => n.id === stage.items[0])?.label}
                aria-current={section === stage.items[0] ? "page" : undefined}
                title={`${stage.label} · ${NAV.find((n) => n.id === stage.items[0])?.label}`}
                onClick={() => void go(stage.items[0])}
              >
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{stage.label}</span>
                <small>{NAV.find((n) => n.id === stage.items[0])?.label}</small>
                {stage.items[0] === "projects" && !!boot?.projects.length && (
                  <span className="nav-count">{boot.projects.length}</span>
                )}
              </button>
            </div>
          ) : (
            <div
              className={`workflow-stage ${stage.items.includes(section) ? "current" : ""}`}
              key={stage.label}
            >
              <button
                className="nav-stage"
                aria-label={`展开${stage.label}`}
                title={stage.label}
                aria-expanded={expandedStage === i}
                onClick={() => {
                  setExpandedStage(expandedStage === i ? -1 : i);
                }}
              >
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{stage.label}</span>
                <ChevronDown size={13} />
              </button>
              {expandedStage === i && (
                <div className="stage-items">{stage.items.map(renderNav)}</div>
              )}
            </div>
          ),
        )}
        <div className="sidebar-label workflow-label">常驻工具</div>
        {(["agents", "memory"] as Section[]).map(renderNav)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-project">
        <span className="sidebar-label">当前项目</span>
        {project ? (
          <button
            className="current-project"
            onClick={() => void go("projects")}
          >
            <span className="current-dot" />
            <span className="truncate">{project.title}</span>
            <ChevronRight size={15} />
          </button>
        ) : (
          <div className="sidebar-hint">尚未选择项目</div>
        )}
      </div>
      <button
        aria-label="设置"
        title="设置"
        className={`nav-item bottom ${section === "settings" ? "active" : ""}`}
        aria-current={section === "settings" ? "page" : undefined}
        onClick={() => void go("settings")}
      >
        <Settings2 size={18} />
        <span>设置</span>
      </button>
    </aside>
  );
  return (
    <div className="app-shell studio-shell">
      <a className="skip-to-content" href="#workbench-content">
        跳到主要内容
      </a>
      {!narrow && sidebar}
      {narrow && navigationOpen && (
        <Dialog
          label="工作台导航"
          className="navigation-dialog"
          onClose={() => setNavigationOpen(false)}
        >
          {sidebar}
        </Dialog>
      )}
      <div
        className={`main-shell ${section === "accounts" ? "accounts-shell" : ""}`}
      >
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
            <span>CS 工作台</span>
            <ChevronRight size={14} />
            <strong>
              {NAV.find((n) => n.id === section)?.label || "设置"}
            </strong>
            {project &&
              !["today", "accounts", "settings"].includes(section) && (
                <>
                  <ChevronRight size={14} />
                  <span className="truncate">{project.title}</span>
                </>
              )}
          </div>
          <button
            className="icon-button global-search"
            aria-label="全局搜索工作区"
            title="搜索工作区 · ⌘K"
            onClick={() => void openFinder()}
          >
            <Search size={15} />
            <span>搜索或跳转</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="top-actions">
            <AppearancePicker
              compact
              theme={appearance.theme}
              onChange={appearance.changeTheme}
            />
            <span className="local-badge">
              <span />
              本机工作区
            </span>
            <button
              className="button primary small"
              onClick={() => setNewOpen(true)}
            >
              <Plus size={16} />
              新建选题
            </button>
          </div>
        </header>
        <main
          className="content"
          id="workbench-content"
          tabIndex={-1}
          ref={contentScroll}
        >
          {[
            "inbox",
            "projects",
            "article",
            "video",
            "studio",
            "publish",
          ].includes(section) && (
            <div className="workflow-context">
              <label>
                <span>当前创作项目</span>
                <select
                  aria-label="当前创作项目"
                  disabled={section === "studio" && editorBusy}
                  value={project?.path || ""}
                  onChange={(e) =>
                    void activateProject(e.target.value).catch((e) =>
                      notice(errorText(e), true),
                    )
                  }
                >
                  <option value="" disabled>
                    选择项目，贯穿整个创作流程
                  </option>
                  {boot.projects.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="workflow-output" aria-label="项目创作入口">
                {(
                  [
                    { id: "article", label: "文章" },
                    { id: "video", label: "口播脚本" },
                    { id: "studio", label: "创作室" },
                    { id: "publish", label: "交接" },
                  ] as { id: Section; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    aria-current={section === item.id ? "page" : undefined}
                    onClick={() => void go(item.id)}
                  >
                    {item.label}
                    <ArrowRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {["desk", "tasks", "memory", "inbox", "folders", "agents"].includes(
            section,
          ) && (
            <Personal
              section={section}
              onNavigate={go}
              projects={boot.projects}
              projectPath={project?.path}
              onOpenProject={selectProject}
              openTarget={openTarget}
              onTargetHandled={() => setOpenTarget(null)}
            />
          )}
          {section === "health" && <Health />}
          {section === "references" && <VideoReferences project={project} />}
          {section === "reunion" && <Reunion />}
          {section === "content" && (
            <ContentOps
              projects={boot.projects}
              onOpen={selectProject}
              onNavigate={go}
              onNew={() => setNewOpen(true)}
              onLeaveRef={contentLeave}
            />
          )}
          {section === "studio" && (
            <Studio
              projectPath={project?.path}
              onProjectChange={activateProject}
              onBusyChange={setEditorBusy}
              projects={boot.projects}
              onRefresh={refresh}
              onNavigate={go}
            />
          )}
          {section === "today" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CONTENT OPERATIONS</span>
                  <h1>今天，从一条内容开始。</h1>
                  <p>
                    把选题、文章、视频和素材放在同一处，继续手头最重要的制作。
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setNewOpen(true)}
                >
                  <Plus size={17} />
                  新建选题
                </button>
              </div>
              <div className="overview-grid">
                <div className="overview-primary">
                  <div className="section-kicker">
                    继续制作 <ArrowRight size={17} />
                  </div>
                  {boot.projects.length ? (
                    <div className="featured-project">
                      <div className="featured-top">
                        <span className="tag soft">最近编辑</span>
                        <span className="muted">
                          {timeLabel(boot.projects[0].updatedAt)}
                        </span>
                      </div>
                      <h2>{boot.projects[0].title}</h2>
                      <p>
                        {boot.projects[0].audience ||
                          "从项目简报开始，确定观众能带走什么。"}
                      </p>
                      <div className="featured-status">
                        <span>
                          文章{" "}
                          <b
                            className={`status-text ${statClass(boot.projects[0].status.article)}`}
                          >
                            {boot.projects[0].status.article}
                          </b>
                        </span>
                        <span>
                          视频{" "}
                          <b
                            className={`status-text ${statClass(boot.projects[0].status.video)}`}
                          >
                            {boot.projects[0].status.video}
                          </b>
                        </span>
                      </div>
                      <button
                        className="button dark"
                        onClick={() =>
                          void selectProject(boot.projects[0].path)
                        }
                      >
                        继续项目 <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="empty-feature">
                      <SquarePen size={28} />
                      <h2>还没有内容项目</h2>
                      <p>
                        建立第一个选题，工作台会自动准备文章、视频稿和分镜文件。
                      </p>
                      <button
                        className="button dark"
                        onClick={() => setNewOpen(true)}
                      >
                        创建第一个项目 <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="overview-side">
                  <div className="mini-stat">
                    <span className="mini-label">内容项目</span>
                    <strong>
                      {String(boot.projects.length).padStart(2, "0")}
                    </strong>
                    <span>文章与视频共用选题资料</span>
                  </div>
                  <div className="mini-stat">
                    <span className="mini-label">已连接素材</span>
                    <strong>
                      {boot.catalog.connected
                        ? boot.catalog.audio.length + boot.catalog.fonts.length
                        : "—"}
                    </strong>
                    <span>
                      {boot.catalog.connected
                        ? `${boot.catalog.audio.length} 条声音 · ${boot.catalog.fonts.length} 款字体`
                        : "连接声音与字体库开始使用"}
                    </span>
                  </div>
                  <div
                    className="quick-link"
                    onClick={() => void go("library")}
                    role="button"
                    tabIndex={0}
                  >
                    <Headphones size={19} />
                    <div>
                      <strong>打开素材库</strong>
                      <span>试听、筛选并加入当前项目</span>
                    </div>
                    <ArrowRight size={17} />
                  </div>
                </div>
              </div>
              <div className="section-title">
                <div>
                  <h2>最近项目</h2>
                  <p>每条内容都保留独立的文章和视频进度。</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => void go("projects")}
                >
                  查看全部 <ArrowRight size={15} />
                </button>
              </div>
              <div className="recent-list">
                {boot.projects.slice(0, 4).map((p) => (
                  <button
                    className="recent-row"
                    key={p.path}
                    onClick={() => void selectProject(p.path)}
                  >
                    <div className="recent-icon">
                      <Folder size={18} />
                    </div>
                    <div className="recent-main">
                      <strong>{p.title}</strong>
                      <span>
                        {p.managed
                          ? p.platforms.join(" · ") || "尚未选择平台"
                          : "已有工程 · 只读接入"}
                      </span>
                    </div>
                    <span className="muted">{timeLabel(p.updatedAt)}</span>
                    <ChevronRight size={17} />
                  </button>
                ))}
                {boot.projects.length === 0 && (
                  <div className="list-empty">新的选题会出现在这里。</div>
                )}
              </div>
            </>
          )}
          {section === "projects" && (
            <>
              <div className="page-heading compact">
                <div>
                  <span className="eyebrow">PROJECTS</span>
                  <h1>项目工作区</h1>
                  <p>一个选题管理一组文章、视频和交付记录。</p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button subtle"
                    onClick={() => void importExisting()}
                  >
                    <FolderOpen size={16} />
                    导入已有工程
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setNewOpen(true)}
                  >
                    <Plus size={16} />
                    新建项目
                  </button>
                </div>
              </div>
              {project ? (
                <div className="project-layout">
                  <div className="project-main">
                    <button
                      className="back-link"
                      onClick={() => setProject(null)}
                    >
                      <ArrowLeft size={15} />
                      全部项目
                    </button>
                    <div className="project-hero">
                      <div className="project-hero-top">
                        <span className="tag">
                          {project.managed ? "工作台项目" : "已有工程 · 只读"}
                        </span>
                        <span className="muted">
                          更新于 {timeLabel(project.updatedAt)}
                        </span>
                      </div>
                      <h2>{project.title}</h2>
                      <p>
                        {project.audience ||
                          "编辑选题简报，为内容确定清楚的观众和目标。"}
                      </p>
                      <div className="chip-row">
                        {project.platforms.map((p) => (
                          <span className="chip" key={p}>
                            {p}
                          </span>
                        ))}
                        <span className="chip subdued">
                          {project.managed
                            ? "项目文件可编辑"
                            : "原工程保持不变"}
                        </span>
                      </div>
                    </div>
                    <div className="workflow-head">
                      <h3>制作流程</h3>
                      <button
                        className="text-button"
                        onClick={() => void doQA()}
                      >
                        <CheckCheck size={16} />
                        检查项目
                      </button>
                    </div>
                    <div className="workflow-list">
                      <button onClick={() => void openDoc("brief", "article")}>
                        <div className="step-index">01</div>
                        <div>
                          <strong>选题与资料</strong>
                          <span>核心观点、受众、来源与事实范围</span>
                        </div>
                        <ChevronRight size={17} />
                      </button>
                      <button
                        onClick={() => void openDoc("article", "article")}
                      >
                        <div className="step-index">02</div>
                        <div>
                          <strong>文章制作</strong>
                          <span>正文与平台发布文案</span>
                        </div>
                        <span
                          className={`pill ${statClass(project.status.article)}`}
                        >
                          {project.status.article}
                        </span>
                        <ChevronRight size={17} />
                      </button>
                      <button onClick={() => void openDoc("script", "video")}>
                        <div className="step-index">03</div>
                        <div>
                          <strong>视频制作</strong>
                          <span>视频稿、分镜、声音与字体</span>
                        </div>
                        <span
                          className={`pill ${statClass(project.status.video)}`}
                        >
                          {project.status.video}
                        </span>
                        <ChevronRight size={17} />
                      </button>
                      <button onClick={() => void go("publish")}>
                        <div className="step-index">04</div>
                        <div>
                          <strong>检查与交付</strong>
                          <span>成片规格、交付包、发布状态</span>
                        </div>
                        <ChevronRight size={17} />
                      </button>
                    </div>
                    {qa && <QAResults qa={qa} />}
                  </div>
                  <div className="detail-rail">
                    <div className="rail-block">
                      <span className="rail-label">快速操作</span>
                      <button onClick={() => void doHandoff()}>
                        <Clipboard size={16} />
                        复制 AI 交接指令
                      </button>
                      <button
                        onClick={() =>
                          void perform("打开项目", () =>
                            window.cs.openTarget(project.path, "project"),
                          )
                        }
                      >
                        <FolderOpen size={16} />在 Finder 打开
                      </button>
                      {project.video && (
                        <button
                          onClick={() =>
                            void perform("打开成片", () =>
                              window.cs.openTarget(project.path, "video"),
                            )
                          }
                        >
                          <Play size={16} />
                          播放现有成片
                        </button>
                      )}
                    </div>
                    <div className="rail-block">
                      <span className="rail-label">项目素材</span>
                      <strong className="rail-number">
                        {project.selection.length.toString().padStart(2, "0")}
                      </strong>
                      <span className="rail-caption">条已选声音与字体</span>
                      <button
                        className="rail-link"
                        onClick={() => void go("library")}
                      >
                        前往素材库 <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="rail-block">
                      <span className="rail-label">项目目录</span>
                      <span className="path-text">{project.path}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="project-list">
                  {boot.projects.map((p) => (
                    <button
                      className="project-list-item"
                      key={p.path}
                      onClick={() => void selectProject(p.path)}
                    >
                      <div className="project-list-icon">
                        <Folder size={21} />
                      </div>
                      <div>
                        <strong>{p.title}</strong>
                        <span>
                          {p.managed
                            ? p.audience ||
                              p.platforms.join(" · ") ||
                              "待填写选题简报"
                            : "已有工程 · 只读接入"}
                        </span>
                      </div>
                      <span className={`pill ${statClass(p.status.article)}`}>
                        文 · {p.status.article}
                      </span>
                      <span className={`pill ${statClass(p.status.video)}`}>
                        视 · {p.status.video}
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                  {boot.projects.length === 0 && (
                    <Empty
                      title="从第一条内容开始"
                      description="新建项目会生成文章、视频稿、分镜和交付目录。"
                      action="新建项目"
                      onAction={() => setNewOpen(true)}
                    />
                  )}
                </div>
              )}
            </>
          )}
          {(section === "article" || section === "video") &&
            (project ? (
              <>
                <div className="page-heading compact">
                  <div>
                    <span className="eyebrow">
                      {section === "article" ? "WRITING DESK" : "VIDEO DESK"}
                    </span>
                    <h1>{section === "article" ? "文章制作" : "视频制作"}</h1>
                    <p>{project.title}</p>
                  </div>
                  <div className="heading-actions">
                    <span
                      className={`save-indicator ${dirty ? "unsaved" : ""}`}
                    >
                      {saving ? "保存中…" : dirty ? "未保存" : "已保存"}
                    </span>
                    <button
                      className="button subtle"
                      disabled={!project.managed || !dirty}
                      onClick={() =>
                        void flush().then((ok) => ok && notice("稿件已保存"))
                      }
                    >
                      <Check size={16} />
                      保存
                    </button>
                  </div>
                </div>
                <div className="editor-layout">
                  <div className="editor-main">
                    <div className="doc-tabs">
                      {(section === "article"
                        ? ["brief", "article", "publish"]
                        : ["script", "shotlist"]
                      ).map((key) => (
                        <button
                          key={key}
                          className={docKey === key ? "active" : ""}
                          onClick={() => void openDoc(key as DocKey, section)}
                        >
                          {DOC_NAMES[key as DocKey]}
                        </button>
                      ))}
                    </div>
                    <div className="editor-header">
                      <div>
                        <span className="eyebrow">
                          {docKey === "shotlist" ? "SHOT LIST" : "MARKDOWN"}
                        </span>
                        <h2>{DOC_NAMES[docKey]}</h2>
                      </div>
                      <span className="word-count">{countWords(draft)} 字</span>
                    </div>
                    <div
                      className="document-view-switch"
                      role="group"
                      aria-label="稿件呈现方式"
                    >
                      <button
                        aria-pressed={documentView === "edit"}
                        onClick={() => setDocumentView("edit")}
                      >
                        编辑原稿
                      </button>
                      <button
                        aria-pressed={documentView === "read"}
                        onClick={() => setDocumentView("read")}
                      >
                        阅读预览
                      </button>
                    </div>
                    {documentView === "read" ? (
                      <DocumentPreview text={draft} />
                    ) : (
                      <textarea
                        className="document-editor"
                        value={draft}
                        readOnly={!project.managed}
                        spellCheck={false}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setDirty(true);
                        }}
                        placeholder={
                          project.managed
                            ? "从这里开始写…"
                            : "这个旧工程中尚无对应文件"
                        }
                        aria-label={DOC_NAMES[docKey]}
                      />
                    )}
                    <div className="editor-foot">
                      <span>
                        {project.managed
                          ? "⌘ S 保存 · 文件直接保存在项目目录"
                          : "导入工程为只读视图"}
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          void perform("打开文件", () =>
                            window.cs.openTarget(
                              project.path,
                              section === "article" ? "article" : "script",
                            ),
                          )
                        }
                      >
                        在本机打开 <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="editor-rail">
                    <div className="rail-block">
                      <span className="rail-label">制作进度</span>
                      <strong>{section === "article" ? "文章" : "视频"}</strong>
                      <StatusSelect
                        value={project.status[section]}
                        disabled={!project.managed}
                        onChange={(s) => void updateStatus(section, s)}
                      />
                    </div>
                    <div className="rail-block">
                      <span className="rail-label">下一步动作</span>
                      <p>
                        {section === "article"
                          ? "写完后核对来源，再准备各平台标题与简介。"
                          : "先写清每一镜的画面和声音，再到素材库挑选可用素材。"}
                      </p>
                      <button
                        className="rail-link"
                        onClick={() =>
                          void go(section === "article" ? "publish" : "library")
                        }
                      >
                        {section === "article"
                          ? "准备发布文案"
                          : "选择声音与字体"}{" "}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="rail-block">
                      <span className="rail-label">交付</span>
                      <button
                        className="rail-action"
                        onClick={() => void doExport(section)}
                        disabled={!project.managed}
                      >
                        <PackageCheck size={16} />
                        导出{section === "article" ? "文章" : "视频"}包
                      </button>
                    </div>
                    {section === "video" && project.video && (
                      <div className="rail-block">
                        <span className="rail-label">现有成片</span>
                        <button
                          className="rail-action"
                          onClick={() =>
                            void perform("打开成片", () =>
                              window.cs.openTarget(project.path, "video"),
                            )
                          }
                        >
                          <Play size={16} />
                          播放成片
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <Empty
                title="先选择一个内容项目"
                description="文章和视频稿会跟着选题一起保存。"
                action="查看项目"
                onAction={() => void go("projects")}
              />
            ))}
          {section === "library" && (
            <>
              <div className="page-heading compact">
                <div>
                  <span className="eyebrow">ASSET LIBRARY</span>
                  <h1>声音与字体库</h1>
                  <p>试听、筛选、确认权利，再把真正用到的素材加入项目。</p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button subtle"
                    onClick={() => void changeSetting("library")}
                  >
                    <FolderOpen size={16} />
                    {boot.catalog.connected ? "更换素材库" : "连接素材库"}
                  </button>
                </div>
              </div>
              {!boot.catalog.connected ? (
                <Empty
                  title="连接你的声音与字体库"
                  description="选择已有“音效与配乐库”文件夹。工作台只读原库；加入项目时才复制选用的文件。"
                  action="选择素材库"
                  onAction={() => void changeSetting("library")}
                />
              ) : (
                <>
                  <div className="library-toolbar">
                    <div className="segmented">
                      <button
                        className={libraryTab === "audio" ? "selected" : ""}
                        onClick={() => {
                          setLibraryTab("audio");
                          setQuery("");
                        }}
                      >
                        <AudioLines size={16} />
                        音效与配乐 <span>{boot.catalog.audio.length}</span>
                      </button>
                      <button
                        className={libraryTab === "fonts" ? "selected" : ""}
                        onClick={() => {
                          setLibraryTab("fonts");
                          setQuery("");
                        }}
                      >
                        <Type size={16} />
                        字体 <span>{boot.catalog.fonts.length}</span>
                      </button>
                      <button
                        className={libraryTab === "netease" ? "selected" : ""}
                        onClick={() => {
                          setLibraryTab("netease");
                          setQuery("");
                        }}
                      >
                        <Music2 size={16} />
                        网易云候选 <span>{boot.catalog.netease.length}</span>
                      </button>
                    </div>
                    <label className="searchbox">
                      <Search size={17} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="搜索名称、用途或标签"
                      />
                    </label>
                  </div>
                  {libraryTab === "netease" && (
                    <div className="notice-line">
                      <CircleAlert size={17} />
                      <span>
                        这些 MP3
                        可在本机试听；发布授权尚未核实，因此不会加入视频交付包。
                      </span>
                    </div>
                  )}
                  {libraryTab === "fonts" && (
                    <div className="preset-strip">
                      <div className="preset-heading">
                        <span className="eyebrow">TYPOGRAPHY PRESETS</span>
                        <strong>已配置的字体搭配</strong>
                      </div>
                      <div className="preset-list">
                        {boot.catalog.presets.map((p) => (
                          <button
                            className={
                              selectedPreset?.id === p.id ? "active" : ""
                            }
                            key={p.id}
                            onClick={() => setSelectedPreset(p)}
                          >
                            <strong>{p.name}</strong>
                            <span>{p.scene}</span>
                          </button>
                        ))}
                      </div>
                      {selectedPreset && (
                        <div
                          className="preset-preview"
                          style={{
                            background: selectedPreset.colors.background,
                            color: selectedPreset.colors.foreground,
                          }}
                        >
                          <span style={{ color: selectedPreset.colors.accent }}>
                            {selectedPreset.eyebrow}
                          </span>
                          <strong>{selectedPreset.title}</strong>
                          <small>{selectedPreset.subtitle}</small>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="asset-list">
                    {filteredAssets.map((a) => (
                      <div className="asset-row" key={a.id}>
                        <div className={`asset-icon ${a.kind}`}>
                          {a.kind === "font" ? (
                            <Type size={20} />
                          ) : a.category === "bgm" ? (
                            <Music2 size={20} />
                          ) : (
                            <AudioLines size={20} />
                          )}
                        </div>
                        <div className="asset-info">
                          <strong>{a.title}</strong>
                          <span>
                            {a.use ||
                              (a.kind === "font"
                                ? a.family
                                : "背景音乐候选")}{" "}
                            {a.duration ? `· ${Math.round(a.duration)} 秒` : ""}
                          </span>
                        </div>
                        <span
                          className={`rights ${a.kind === "netease" ? "unclear" : ""}`}
                        >
                          {a.kind === "netease" ? (
                            <CircleAlert size={14} />
                          ) : (
                            <ShieldCheck size={14} />
                          )}{" "}
                          {a.rights}
                        </span>
                        <button
                          className="icon-button"
                          title={
                            a.kind === "font"
                              ? "预览字体"
                              : playing?.id === a.id
                                ? "停止试听"
                                : "试听"
                          }
                          onClick={() => void preview(a)}
                        >
                          {playing?.id === a.id ? (
                            <X size={17} />
                          ) : (
                            <Play size={17} />
                          )}
                        </button>
                        <button
                          className="button subtle tiny"
                          disabled={
                            !project?.managed ||
                            a.kind === "netease" ||
                            project.selection.some((s) => s.id === a.id)
                          }
                          onClick={() => void addAsset(a)}
                        >
                          {project?.selection.some((s) => s.id === a.id) ? (
                            <>
                              <Check size={14} />
                              已加入
                            </>
                          ) : (
                            <>
                              <Plus size={14} />
                              加入项目
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                    {filteredAssets.length === 0 && (
                      <div className="list-empty">没有找到匹配的素材。</div>
                    )}
                  </div>
                  {libraryTab === "fonts" && fontPreview && (
                    <div className="font-sample">
                      <span>字体试排</span>
                      <strong style={{ fontFamily: "CSPreview" }}>
                        让每个想法，都有清晰的表达。
                      </strong>
                      <small style={{ fontFamily: "CSPreview" }}>
                        CS 工作台 · 文章、视频与内容系统
                      </small>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {section === "publish" &&
            (project ? (
              <>
                <div className="page-heading compact">
                  <div>
                    <span className="eyebrow">DELIVERY & PUBLISHING</span>
                    <h1>交付与发布</h1>
                    <p>将本地导出、上传和真实发布分开记录。</p>
                  </div>
                  <button className="button subtle" onClick={() => void doQA()}>
                    <CheckCheck size={16} />
                    运行检查
                  </button>
                </div>
                <div className="delivery-layout">
                  <div>
                    <div className="delivery-grid">
                      <div className="delivery-card">
                        <div className="delivery-card-icon">
                          <FileText size={20} />
                        </div>
                        <h2>文章交付</h2>
                        <p>正文、选题简报、来源清单与平台文案。</p>
                        <span
                          className={`pill ${statClass(project.status.article)}`}
                        >
                          {project.status.article}
                        </span>
                        <button
                          className="button dark"
                          disabled={!project.managed}
                          onClick={() => void doExport("article")}
                        >
                          <ArrowDownToLine size={16} />
                          导出文章包
                        </button>
                      </div>
                      <div className="delivery-card">
                        <div className="delivery-card-icon green">
                          <Film size={20} />
                        </div>
                        <h2>视频交付</h2>
                        <p>视频稿、镜头表、已选素材与现有成片。</p>
                        <span
                          className={`pill ${statClass(project.status.video)}`}
                        >
                          {project.status.video}
                        </span>
                        <button
                          className="button dark"
                          disabled={!project.managed}
                          onClick={() => void doExport("video")}
                        >
                          <ArrowDownToLine size={16} />
                          导出视频包
                        </button>
                      </div>
                    </div>
                    <div className="section-title inline">
                      <div>
                        <h2>发布记录</h2>
                        <p>只在完成对应动作后更新状态。</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => void go("accounts")}
                      >
                        <Users size={16} /> 多平台账号后台
                      </button>
                    </div>
                    <div className="publish-status">
                      <div>
                        <span className="status-number">01</span>
                        <strong>稿件准备</strong>
                        <span>文章、视频与素材</span>
                      </div>
                      <ArrowRight size={17} />
                      <div>
                        <span className="status-number">02</span>
                        <strong>本地导出</strong>
                        <span>生成可交付文件</span>
                      </div>
                      <ArrowRight size={17} />
                      <div>
                        <span className="status-number">03</span>
                        <strong>上传平台</strong>
                        <span>人工确认上传成功</span>
                      </div>
                      <ArrowRight size={17} />
                      <div>
                        <span className="status-number">04</span>
                        <strong>正式发布</strong>
                        <span>人工确认公开状态</span>
                      </div>
                    </div>
                    <div className="publish-control">
                      <strong>各平台状态独立记录</strong>
                      <span className="muted">请在右侧逐个平台确认</span>
                      <button
                        className="text-button"
                        onClick={() => void openDoc("publish", "article")}
                      >
                        编辑发布文案 <ArrowRight size={15} />
                      </button>
                    </div>
                    {qa && <QAResults qa={qa} />}
                  </div>
                  <aside className="delivery-rail">
                    <span className="rail-label">发布平台</span>
                    {project.platforms.length ? (
                      project.platforms.map((p) => (
                        <div className="platform-row" key={p}>
                          <span className="platform-dot" />
                          {p}
                          <StatusSelect
                            value={project.platformStatus[p] || "准备中"}
                            disabled={!project.managed}
                            onChange={(status) =>
                              void updatePlatform(p, status)
                            }
                          />
                        </div>
                      ))
                    ) : (
                      <p>创建项目时可以选目标平台。</p>
                    )}
                    <div className="rule" />
                    <span className="rail-label">交接给 AI</span>
                    <p>复制包含项目路径、必读资料与交付要求的指令。</p>
                    <button
                      className="rail-action"
                      onClick={() => void doHandoff()}
                    >
                      <Clipboard size={16} />
                      复制交接指令
                    </button>
                  </aside>
                </div>
              </>
            ) : (
              <Empty
                title="先选择一个项目"
                description="交付包与发布状态按选题分别保存。"
                action="查看项目"
                onAction={() => void go("projects")}
              />
            ))}
          {section === "accounts" && <DouyinAccounts />}
          {section === "settings" && (
            <>
              <div className="page-heading compact">
                <div>
                  <span className="eyebrow">PREFERENCES</span>
                  <h1>本机设置</h1>
                  <p>项目在你的 Mac 上保存；工作台不会自动上传内容。</p>
                </div>
              </div>
              <div className="settings-group">
                <h2>外观与阅读</h2>
                <p className="muted">
                  选择喜欢的配色，切换后自动记住。纯白提供清爽的白色背景与中性灰层次。
                </p>
                <AppearancePicker
                  theme={appearance.theme}
                  onChange={appearance.changeTheme}
                />
                <ExperienceSettings appearance={appearance} />
                {appearance.error && <p role="alert">{appearance.error}</p>}
              </div>
              <div className="settings-group">
                <h2>键盘操作</h2>
                <div className="shortcut-reference">
                  <span>
                    搜索内容与前往页面 <kbd>⌘ / Ctrl K</kbd>
                  </span>
                  <span>
                    保存当前文稿 <kbd>⌘ / Ctrl S</kbd>
                  </span>
                  <span>
                    关闭弹窗 <kbd>Esc</kbd>
                  </span>
                  <span>
                    选择下一项 <kbd>Tab</kbd>
                  </span>
                </div>
              </div>
              <div className="settings-group">
                <h2>项目收尾</h2>
                <p className="muted">
                  每次导出交付包时自动检查当前分支与公共资料，列出缺项并写入交付说明。导出文件不等于完整交付或已发布。
                </p>
              </div>
              <div className="settings-group">
                <h2>文件位置</h2>
                <div className="setting-row">
                  <div className="setting-icon">
                    <Folder size={19} />
                  </div>
                  <div>
                    <strong>项目工作区</strong>
                    <span>{boot.config.workspace}</span>
                  </div>
                  <button
                    className="button subtle tiny"
                    onClick={() => void changeSetting("workspace")}
                  >
                    更改
                  </button>
                </div>
                <div className="setting-row">
                  <div className="setting-icon">
                    <LibraryBig size={19} />
                  </div>
                  <div>
                    <strong>声音与字体库</strong>
                    <span>{boot.config.library || "尚未连接"}</span>
                  </div>
                  <button
                    className="button subtle tiny"
                    onClick={() => void changeSetting("library")}
                  >
                    选择
                  </button>
                </div>
              </div>
              <div className="settings-group">
                <h2>本机工具</h2>
                {Object.entries(boot.tools).map(([name, toolPath]) => (
                  <div className="setting-row tool" key={name}>
                    <div className="setting-icon">
                      <Command size={18} />
                    </div>
                    <div>
                      <strong>{name}</strong>
                      <span>{toolPath || "未检测到"}</span>
                    </div>
                    <span className={`pill ${toolPath ? "good" : "neutral"}`}>
                      {toolPath ? "可用" : "未连接"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="settings-foot">
                <ShieldCheck size={18} />
                <span>
                  素材库只读接入；加入项目时复制单个文件。网易云候选音乐不会自动进入交付包。
                </span>
              </div>
            </>
          )}
        </main>
      </div>
      {playing && (
        <div className="audio-dock">
          <div className="dock-icon">
            <AudioLines size={18} />
          </div>
          <div>
            <span>正在试听</span>
            <strong>{playing.title}</strong>
          </div>
          <audio
            controls
            autoPlay
            ref={audioRef}
            src={playing.url}
            onEnded={() => setPlaying(null)}
          />
          <button
            className="icon-button"
            title="关闭试听"
            onClick={() => {
              audioRef.current?.pause();
              setPlaying(null);
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {newOpen && (
        <Dialog
          label="新建选题"
          onClose={() => setNewOpen(false)}
          dismissible={!busy}
          error={newError}
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">NEW PROJECT</span>
                <h2>新建一个选题</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setNewOpen(false)}
                aria-label="关闭"
                disabled={!!busy}
              >
                <X size={19} />
              </button>
            </div>
            <label className="field">
              <span>
                选题名称 <b>*</b>
              </span>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例如：普通人如何用 AI 做第一条视频"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing)
                    void create();
                }}
              />
            </label>
            <label className="field">
              <span>目标读者</span>
              <input
                value={newAudience}
                onChange={(e) => setNewAudience(e.target.value)}
                placeholder="例如：刚接触 AI 视频制作的小白"
              />
            </label>
            <div className="field">
              <span>发布平台</span>
              <div className="platform-picks">
                {PLATFORM_OPTIONS.map((p) => (
                  <button
                    key={p}
                    className={newPlatforms.includes(p) ? "picked" : ""}
                    aria-pressed={newPlatforms.includes(p)}
                    onClick={() =>
                      setNewPlatforms(
                        newPlatforms.includes(p)
                          ? newPlatforms.filter((x) => x !== p)
                          : [...newPlatforms, p],
                      )
                    }
                  >
                    {newPlatforms.includes(p) && <Check size={14} />} {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-note">
              <Sparkles size={17} />
              <span>创建后自动准备简报、文章、视频稿、镜头表和交付目录。</span>
            </div>
            <div className="modal-actions">
              <button
                className="button subtle"
                onClick={() => setNewOpen(false)}
                disabled={!!busy}
              >
                取消
              </button>
              <button
                className="button primary"
                disabled={!newTitle.trim() || Boolean(busy)}
                onClick={() => void create()}
              >
                <Plus size={16} />
                创建项目
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {searchOpen && (
        <WorkspaceSearch
          destinations={SEARCH_DESTINATIONS}
          projects={boot.projects}
          onOpen={openSearchTarget}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "error" : ""}`}
        >
          {toast.error ? <CircleAlert size={17} /> : <CircleCheck size={17} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="关闭通知"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-badge" role="status">
          <LoaderCircle className="spin" size={15} />
          {busy}
        </div>
      )}
    </div>
  );
}

function Empty({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <WandSparkles size={24} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="button primary" onClick={onAction}>
        {action}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: Status;
  disabled?: boolean;
  onChange: (status: Status) => void;
}) {
  return (
    <label className="status-select">
      <span className={`status-dot ${statClass(value)}`} />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Status)}
      >
        {STATUS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
function QAResults({ qa }: { qa: QA }) {
  return (
    <div className="qa-results">
      <div className="qa-title">
        <CheckCheck size={17} />
        <strong>收尾检查</strong>
        <span>{new Date(qa.checkedAt).toLocaleString("zh-CN")}</span>
      </div>
      {qa.video && (
        <div className="qa-video">
          <Film size={16} />
          视频文件：{Math.round(qa.video.duration)} 秒 ·{" "}
          {qa.video.streams.find((s) => s.type === "video")?.width || "—"} ×{" "}
          {qa.video.streams.find((s) => s.type === "video")?.height || "—"}
        </div>
      )}
      {qa.issues.length ? (
        qa.issues.map((issue, i) => (
          <div className="qa-issue" key={i}>
            <span className={`pill ${statClass(issue.level)}`}>
              {issue.level}
            </span>
            <span>{issue.message}</span>
          </div>
        ))
      ) : (
        <div className="qa-pass">
          <CircleCheck size={17} />
          当前自动检查未发现缺项；发布前仍需人工审片与核权。
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
