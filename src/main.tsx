import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpenText,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clipboard,
  Command,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Headphones,
  LayoutDashboard,
  LibraryBig,
  LoaderCircle,
  Music2,
  PackageCheck,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Type,
  UploadCloud,
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

const NAV: {
  id: Section;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: "today", label: "今日", icon: LayoutDashboard },
  { id: "projects", label: "项目", icon: Folder },
  { id: "article", label: "文章", icon: BookOpenText },
  { id: "video", label: "视频", icon: Film },
  { id: "library", label: "素材库", icon: LibraryBig },
  { id: "publish", label: "发布", icon: UploadCloud },
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
  return error instanceof Error ? error.message : String(error);
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
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [section, setSection] = useState<Section>("today");
  const [project, setProject] = useState<Project | null>(null);
  const [docKey, setDocKey] = useState<DocKey>("article");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
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

  const notice = (message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 4400);
  };
  const refresh = async () => {
    const result = await window.cs.bootstrap();
    setBoot(result);
    return result;
  };
  useEffect(() => {
    refresh().catch((e) => notice(errorText(e), true));
  }, []);
  const refreshProject = async (root: string) => {
    const detail = await window.cs.readProject(root);
    setProject(detail);
    return detail;
  };
  const selectProject = async (root: string) => {
    if (!(await flush())) return;
    const detail = await refreshProject(root);
    setQa(null);
    setDraft(detail.docs[docKey]);
    setDirty(false);
    setSection("projects");
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
    if (!(await flush())) return;
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
    setQa(null);
  };
  const openDoc = async (key: DocKey, next: Section) => {
    if (!(await flush())) return;
    setDocKey(key);
    setDraft(project?.docs[key] || "");
    setDirty(false);
    setSection(next);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
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
    const result = await perform(
      "新建项目",
      () =>
        window.cs.createProject({
          title: newTitle,
          audience: newAudience,
          platforms: newPlatforms,
        }),
      "项目已建立",
    );
    if (!result) return;
    setNewOpen(false);
    setNewTitle("");
    setNewAudience("");
    await refresh();
    await selectProject(result.path);
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
      notice(`交付包已生成：${result.zip.split("/").pop()}`);
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

  if (!boot)
    return (
      <div className="splash">
        <div className="brand-mark">CS</div>
        <LoaderCircle className="spin" size={24} />
        <span>正在打开工作台</span>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-mark">CS</div>
          <div>
            <div className="brand-title">CS 工作台</div>
            <div className="brand-sub">个人内容制作空间</div>
          </div>
        </div>
        <div className="sidebar-label">工作区</div>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${section === id ? "active" : ""}`}
              onClick={() => void go(id)}
            >
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {id === "projects" && (
                <span className="nav-count">{boot.projects.length}</span>
              )}
            </button>
          ))}
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
          className={`nav-item bottom ${section === "settings" ? "active" : ""}`}
          onClick={() => void go("settings")}
        >
          <Settings2 size={18} />
          <span>设置</span>
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="crumb">
            <span>CS 工作台</span>
            <ChevronRight size={14} />
            <strong>
              {NAV.find((n) => n.id === section)?.label || "设置"}
            </strong>
            {project && section !== "today" && (
              <>
                <ChevronRight size={14} />
                <span className="truncate">{project.title}</span>
              </>
            )}
          </div>
          <div className="top-actions">
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
        <main className="content">
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
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNewOpen(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="新建选题"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">NEW PROJECT</span>
                <h2>新建一个选题</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setNewOpen(false)}
                aria-label="关闭"
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
                  if (e.key === "Enter") void create();
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
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`}>
          {toast.error ? <CircleAlert size={17} /> : <CircleCheck size={17} />}
          <span>{toast.message}</span>
        </div>
      )}
      {busy && (
        <div className="busy-badge">
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
        <strong>项目检查</strong>
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
