import React, { useEffect, useRef, useState } from "react";
import { BrandAvatar } from "./Brand";
import { Dialog } from "./Dialog";
import { uiErrorMessage } from "./ui-error";
import { prefersReducedMotion } from "./Appearance";
import type { WorkspaceTarget } from "./WorkspaceSearch";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Bot,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Link,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type {
  AgentProvider,
  PersonalData,
  PersonalTask,
  PersonalNote,
  PersonalFile,
  ProjectSummary,
  Section,
} from "./types";
import "./personal.css";
import { HealthPeek } from "./Health";
const priorityNames = { high: "重要", normal: "普通", low: "稍后" };
const formatDate = (date: string) =>
  new Date(date + "T12:00:00+08:00").toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai",
  });
export function Personal({
  section,
  onNavigate,
  projects,
  onOpenProject,
  openTarget,
  onTargetHandled,
  onSearch,
  projectPath,
}: {
  projectPath?: string;
  section: Section;
  onNavigate: (s: Section) => unknown;
  projects: ProjectSummary[];
  onOpenProject: (root: string) => Promise<unknown>;
  openTarget: WorkspaceTarget | null;
  onTargetHandled: () => void;
  onSearch: () => void;
}) {
  const [data, setData] = useState<PersonalData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [date, setDate] = useState(""),
    [taskTitle, setTaskTitle] = useState(""),
    [taskEdit, setTaskEdit] = useState<Partial<PersonalTask> | null>(null),
    [taskFilter, setTaskFilter] = useState("date");
  const [journal, setJournal] = useState(""),
    [journalDirty, setJournalDirty] = useState(false);
  const journalRef = useRef({ date: "", body: "", dirty: false });
  const journalChain = useRef<Promise<unknown>>(Promise.resolve());
  const [dataOpen, setDataOpen] = useState(false);
  const [query, setQuery] = useState(""),
    [noteEdit, setNoteEdit] = useState<Partial<PersonalNote> | null>(null),
    [showArchived, setShowArchived] = useState(false);
  const [folderId, setFolderId] = useState(""),
    [relative, setRelative] = useState(""),
    [files, setFiles] = useState<PersonalFile[]>([]),
    [filePreview, setFilePreview] = useState<{
      name: string;
      body: string;
      path: string;
    } | null>(null);
  const [providers, setProviders] = useState<AgentProvider[]>([]),
    [provider, setProvider] = useState("codex"),
    [model, setModel] = useState(""),
    [conversationId, setConversationId] = useState(""),
    [prompt, setPrompt] = useState(""),
    [noteIds, setNoteIds] = useState<string[]>([]),
    [attachment, setAttachment] = useState<{
      folderId: string;
      relative: string;
    } | null>(null);
  const [xaiOpen, setXaiOpen] = useState(false),
    [xaiKey, setXaiKey] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const fail = (e: unknown) => setError(uiErrorMessage(e));
  const refresh = () =>
    window.cs.personalRead().then((d) => {
      if (alive.current) setData(d);
      return d;
    });
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh()
      .then((d) => {
        if (!alive.current) return;
        setDate(d.date);
        setJournal(d.journal[d.date]?.body || "");
        journalRef.current = {
          date: d.date,
          body: d.journal[d.date]?.body || "",
          dirty: false,
        };
      })
      .catch(fail);
    const off = window.cs.onPersonalChanged(() => void refresh().catch(fail));
    return () => {
      alive.current = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (section === "agents" || section === "desk")
      void window.cs.personalProviders().then(setProviders).catch(fail);
  }, [section]);
  useEffect(() => {
    if (section === "folders" && data?.folders.length && !folderId)
      setFolderId(data.folders[0].id);
  }, [section, data?.folders.length]);
  useEffect(() => {
    if (folderId)
      void act("读取目录", async () => {
        setFiles(await window.cs.personalBrowse(folderId, relative));
      });
  }, [folderId, relative]);
  const conversation = data?.conversations.find((c) => c.id === conversationId);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "instant" : "smooth",
      block: "end",
    });
  }, [conversation?.messages.at(-1)?.text, conversation?.status]);
  useEffect(() => {
    if (!openTarget || !data) return;
    const { kind, id } = openTarget;
    if (kind === "task")
      setTaskEdit(data.tasks.find((t) => t.id === id) || null);
    if (kind === "note")
      setNoteEdit(data.notes.find((n) => n.id === id) || null);
    if (kind === "conversation") {
      const item = data.conversations.find((c) => c.id === id);
      if (item) {
        setConversationId(item.id);
        setProvider(item.provider);
        setModel(item.model);
      }
    }
    if (kind === "folder") {
      setFolderId(id);
      setRelative("");
      setFilePreview(null);
    }
    onTargetHandled();
  }, [openTarget, data]);
  const saveJournal = () => {
    const j = { ...journalRef.current };
    if (!j.dirty) return;
    journalChain.current = journalChain.current
      .catch(() => {})
      .then(() => window.cs.personalJournal(j.date, j.body))
      .then(() => {
        if (
          journalRef.current.date === j.date &&
          journalRef.current.body === j.body
        ) {
          journalRef.current.dirty = false;
          setJournalDirty(false);
        }
      })
      .catch(fail);
  };
  useEffect(() => {
    if (!journalDirty) return;
    const timer = setTimeout(saveJournal, 600);
    return () => clearTimeout(timer);
  }, [journal, journalDirty]);
  useEffect(() => () => saveJournal(), []);
  const changeDate = (next: string) => {
    if (!next) return;
    saveJournal();
    setDate(next);
    const body = data?.journal[next]?.body || "";
    setJournal(body);
    setJournalDirty(false);
    journalRef.current = { date: next, body, dirty: false };
  };
  const addTask = () =>
    act("添加任务", async () => {
      setData(
        await window.cs.personalTask({
          title: taskTitle,
          date,
          status: "todo",
        }),
      );
      setTaskTitle("");
    });
  const saveTask = () =>
    act("保存任务", async () => {
      if (taskEdit)
        setData(
          await window.cs.personalTask({
            ...taskEdit,
            date: taskEdit.date || date,
          }),
        );
      setTaskEdit(null);
    });
  const saveNote = () =>
    act("保存记忆", async () => {
      if (noteEdit) setData(await window.cs.personalNote(noteEdit));
      setNoteEdit(null);
    });
  const connect = () =>
    act("连接文件夹", async () => {
      const d = await window.cs.personalConnect();
      if (d) {
        setData(d);
        setFolderId(d.folders.at(-1)?.id || "");
        setRelative("");
      }
    });
  const newConversation = () =>
    act("新建会话", async () => {
      const c = await window.cs.personalConversation();
      setConversationId(c.id);
      await refresh();
    });
  const send = () =>
    act("发送给 Agent", async () => {
      let id = conversationId;
      if (!id) {
        const c = await window.cs.personalConversation();
        id = c.id;
        setConversationId(id);
      }
      await window.cs.personalSend({
        id,
        provider,
        model,
        prompt,
        noteIds,
        attachment,
      });
      setPrompt("");
      await refresh();
    });
  const toggleTask = (t: PersonalTask) =>
    act("更新任务", async () => {
      setData(
        await window.cs.personalTask({
          ...t,
          status: t.status === "done" ? "todo" : "done",
        }),
      );
    });
  if (!data)
    return (
      <div className="personal-loading">
        <LoaderCircle className="spin" size={22} />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="s-button"
              onClick={() => {
                setError("");
                void refresh()
                  .then((d) => {
                    setDate(d.date);
                    setJournal(d.journal[d.date]?.body || "");
                    journalRef.current = {
                      date: d.date,
                      body: d.journal[d.date]?.body || "",
                      dirty: false,
                    };
                  })
                  .catch(fail);
              }}
            >
              重新打开个人工作区
            </button>
          </>
        ) : (
          "正在打开个人工作区"
        )}
      </div>
    );
  const todayTasks = data.tasks.filter(
      (t) => t.date === date && t.status !== "archived",
    ),
    complete = todayTasks.filter((t) => t.status === "done").length;
  const tasks = data.tasks
    .filter(
      (t) =>
        (taskFilter === "archived"
          ? t.status === "archived"
          : t.status !== "archived") &&
        (taskFilter === "all" ||
          taskFilter === "archived" ||
          (taskFilter === "overdue"
            ? t.date < date && t.status !== "done"
            : t.date === date)),
    )
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        ["high", "normal", "low"].indexOf(a.priority) -
          ["high", "normal", "low"].indexOf(b.priority),
    );
  const notes = data.notes
    .filter(
      (n) =>
        !!n.archived === showArchived &&
        (section === "inbox"
          ? n.kind === "reference"
          : n.kind !== "reference") &&
        `${n.title} ${n.body} ${n.tags} ${n.sourceUrl || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const title =
    section === "inbox"
      ? "先收集，让好想法有处可去。"
      : section === "desk"
        ? "把今天，过成想要的样子。"
        : section === "tasks"
          ? "留出时间，做重要的事。"
          : section === "agents"
            ? "你的想法，有个好搭档。"
            : section === "memory"
              ? "让经验，成为下一次的起点。"
              : "把散落的文件，连成工作空间。";
  const subtitle =
    section === "inbox"
      ? "保存来源、摘录和灵感，关联选题；整理过的资料标记为已处理。"
      : section === "desk"
        ? "任务、创作、记忆和 AI，在这里接上。"
        : section === "tasks"
          ? "把大目标拆成今天能完成的小事，留下真实的进度。"
          : section === "agents"
            ? "本机 Codex / GPT、Claude Code，以及 Grok，一处连接。"
            : section === "memory"
              ? "记下偏好、方法和判断；由你选择哪些内容带进 Agent 会话。"
              : "连接已有目录，按需浏览与引用；文件始终留在原处。";
  const renderTask = (t: PersonalTask) => (
    <div
      className={`desk-task ${t.status === "done" ? "done" : ""}`}
      key={t.id}
    >
      <button
        className="task-check"
        aria-label={`${t.status === "done" ? "恢复" : "完成"}任务 ${t.title}`}
        onClick={() => void toggleTask(t)}
      >
        {t.status === "done" ? (
          <Check size={14} />
        ) : t.status === "doing" ? (
          <Clock3 size={13} />
        ) : null}
      </button>
      <button className="task-body" onClick={() => setTaskEdit(t)}>
        <strong>{t.title}</strong>
        {t.detail && <small>{t.detail}</small>}
      </button>
      <span className={`priority ${t.priority}`}>
        {priorityNames[t.priority]}
      </span>
      {t.repeat === "daily" && <RefreshCw size={12} className="muted" />}
      <span className="task-date">{t.date.slice(5)}</span>
      <button
        className="s-icon"
        aria-label={`${t.status === "archived" ? "恢复" : "归档"}任务 ${t.title}`}
        onClick={() =>
          void act("归档任务", async () =>
            setData(
              await window.cs.personalTask({
                ...t,
                status: t.status === "archived" ? "todo" : "archived",
              }),
            ),
          )
        }
      >
        {t.status === "archived" ? (
          <RotateCcw size={13} />
        ) : (
          <Trash2 size={13} />
        )}
      </button>
    </div>
  );
  return (
    <div className="personal studio">
      {dataOpen && (
        <Dialog
          label="数据与备份"
          onClose={() => setDataOpen(false)}
          dismissible={!busy}
          error={error}
        >
          <section
            className="studio-modal data-manager"
            aria-label="数据与备份"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="studio-eyebrow">YOUR LOCAL DATA</span>
                <h2>记录可查，数据可恢复。</h2>
              </div>
              <button
                className="s-icon"
                aria-label="关闭数据管理"
                onClick={() => setDataOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="data-counts">
              {[
                [data.tasks.length, "任务"],
                [Object.keys(data.journal).length, "天记录"],
                [data.notes.length, "条记忆"],
                [data.conversations.length, "个会话"],
              ].map(([n, label]) => (
                <div key={label}>
                  <strong>{n}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p>数据目录</p>
            <code>{data.dataPath}</code>
            <p>
              备份包含任务、随手记、记忆、会话与目录引用；项目媒体、登录凭据和
              API Key 单独保留。恢复时先预览内容，并自动保存当前工作区副本。
            </p>
            <div className="assist-actions">
              <button
                className="s-button primary"
                disabled={!!busy}
                onClick={() =>
                  void act("导出备份", async () => {
                    saveJournal();
                    await journalChain.current;
                    const file = await window.cs.personalExport();
                    if (file) setNotice(`已备份到 ${file}`);
                  })
                }
              >
                <ArrowDownToLine size={14} />
                备份工作区
              </button>
              <button
                className="s-button"
                disabled={!!busy}
                onClick={() =>
                  void act("恢复备份", async () => {
                    saveJournal();
                    await journalChain.current;
                    const result = await window.cs.personalRestore();
                    if (result) {
                      journalRef.current = {
                        date: result.data.date,
                        body: result.data.journal[result.data.date]?.body || "",
                        dirty: false,
                      };
                      setData(result.data);
                      setDate(result.data.date);
                      setJournal(journalRef.current.body);
                      setJournalDirty(false);
                      setFolderId("");
                      setConversationId("");
                      setDataOpen(false);
                      setNotice(`已恢复；原数据保存在 ${result.previous}`);
                    }
                  })
                }
              >
                <RotateCcw size={14} />
                恢复备份
              </button>
            </div>
          </section>
        </Dialog>
      )}
      <header className="personal-heading">
        <div className={section === "desk" ? "home-brand-heading" : ""}>
          {section === "desk" && <BrandAvatar className="home-avatar" />}
          <div>
            <span className="studio-eyebrow">
              {section === "inbox"
                ? "COLLECT · CONNECT · CREATE"
                : section === "desk"
                  ? "PERSONAL OPERATING SPACE"
                  : section === "agents"
                    ? "CONNECTED INTELLIGENCE"
                    : section === "memory"
                      ? "YOUR SECOND MEMORY"
                      : section === "folders"
                        ? "FILES, IN CONTEXT"
                        : "ONE DAY AT A TIME"}
            </span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="personal-header-actions">
          <button className="s-button" onClick={onSearch}>
            <Search size={14} />
            搜索 <kbd>⌘K</kbd>
          </button>
          <button className="s-button" onClick={() => setDataOpen(true)}>
            <Folder size={14} />
            数据与备份
          </button>
        </div>
      </header>
      {error && (
        <div className="studio-banner error" role="alert">
          {error}
          <button aria-label="关闭错误" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {notice && !error && (
        <div className="studio-banner" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="studio-busy">
          <LoaderCircle className="spin" size={14} />
          {busy}…
        </div>
      )}
      {section === "desk" && (
        <>
          <HealthPeek onNavigate={onNavigate} />
          <div className="ops-home-links">
            <button
              className="button subtle"
              onClick={() => onNavigate("content")}
            >
              内容总览 · 选题、排期与复盘 <ArrowRight size={16} />
            </button>
          </div>
          <div className="desk-overview">
            <section className="day-card">
              <div className="day-top">
                <CalendarDays size={16} />
                <span>{formatDate(date || data.date)}</span>
                <span className="date-pill">我的今天</span>
              </div>
              <div className="day-stats">
                <div>
                  <strong>
                    {complete}
                    <span> / {todayTasks.length}</span>
                  </strong>
                  <p>今日任务已完成</p>
                </div>
                <div
                  className="progress-ring"
                  style={
                    {
                      "--progress": `${todayTasks.length ? (complete / todayTasks.length) * 100 : 0}%`,
                    } as React.CSSProperties
                  }
                >
                  <CheckCheck size={30} strokeWidth={1.3} />
                </div>
              </div>
              <div className="day-bottom">
                <span>
                  {todayTasks.length
                    ? complete === todayTasks.length
                      ? "今天的计划已完成，给自己一点余裕。"
                      : `${todayTasks.length - complete} 件事，值得今天认真对待。`
                    : "先写下今天最重要的一件事。"}
                </span>
                <button onClick={() => onNavigate("tasks")}>
                  <ArrowRight size={17} />
                </button>
              </div>
            </section>
            <button
              className="shortcut-card video-shortcut"
              onClick={() => onNavigate("studio")}
            >
              <span className="shortcut-icon">
                <Film size={26} strokeWidth={1.4} />
              </span>
              <span className="studio-eyebrow">CREATE SOMETHING</span>
              <h2>进入创作室</h2>
              <p>口播剪辑 · 字幕与声音 · 节奏优化</p>
              <span className="shortcut-bottom">
                把一个想法做出来
                <ArrowRight size={16} />
              </span>
            </button>
            <button
              className="shortcut-card agent-shortcut"
              onClick={() => onNavigate("agents")}
            >
              <span className="shortcut-icon">
                <Sparkles size={26} strokeWidth={1.4} />
              </span>
              <span className="studio-eyebrow">THINK TOGETHER</span>
              <h2>与 Agent 一起思考</h2>
              <p>
                {providers.length
                  ? `${providers.filter((p) => p.loggedIn).length} 个 Agent 已连接`
                  : "正在检测本机连接…"}
              </p>
              <span className="shortcut-bottom">
                带上你的文件和记忆
                <ArrowRight size={16} />
              </span>
            </button>
          </div>
          <div className="desk-columns">
            <section className="desk-panel">
              <div className="desk-panel-title">
                <h2>
                  今天，要推进的事<span>{todayTasks.length}</span>
                </h2>
                <button onClick={() => onNavigate("tasks")}>
                  全部任务
                  <ArrowRight size={13} />
                </button>
              </div>
              <form
                className="quick-task"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addTask();
                }}
              >
                <Plus size={17} />
                <input
                  aria-label="快速添加任务"
                  placeholder="写下今天的一件事，回车添加"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  maxLength={200}
                />
                <button disabled={!taskTitle.trim() || !!busy}>添加</button>
              </form>
              <div className="desk-task-list">
                {todayTasks.length ? (
                  todayTasks.slice(0, 7).map(renderTask)
                ) : (
                  <div className="desk-empty">
                    <Circle size={26} />
                    <p>今天还没有任务。</p>
                    <small>添加一个任务，让今天开始运转。</small>
                  </div>
                )}
              </div>
              <div className="desk-panel-title journal-title">
                <h2>
                  随手记<span>今天的记录</span>
                </h2>
                <small>{journalDirty ? "保存中…" : "自动保存"}</small>
              </div>
              <textarea
                className="journal-input"
                aria-label="今日随手记"
                placeholder="一个想法、一段进展，或者今天踩过的坑……"
                value={journal}
                onChange={(e) => {
                  setJournal(e.target.value);
                  setJournalDirty(true);
                  journalRef.current = {
                    date,
                    body: e.target.value,
                    dirty: true,
                  };
                }}
                onBlur={saveJournal}
              />
            </section>
            <div className="desk-right">
              <section className="desk-panel">
                <div className="desk-panel-title">
                  <h2>已连接的空间</h2>
                  <button
                    aria-label="连接文件夹"
                    onClick={() => void connect()}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                {data.folders.length ? (
                  data.folders.slice(0, 4).map((f) => (
                    <button
                      className="folder-mini"
                      key={f.id}
                      onClick={() => {
                        setFolderId(f.id);
                        setRelative("");
                        onNavigate("folders");
                      }}
                    >
                      <Folder size={19} />
                      <span>
                        <b>{f.name}</b>
                        <small>{f.path}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))
                ) : (
                  <div className="small-empty">
                    <FolderOpen size={24} />
                    <p>把常用的素材、知识库和工程目录连进来。</p>
                    <button className="s-button" onClick={() => void connect()}>
                      <Link size={14} />
                      连接文件夹
                    </button>
                  </div>
                )}
              </section>
              <section className="desk-panel">
                <div className="desk-panel-title">
                  <h2>最近留下的足迹</h2>
                  <Clock3 size={14} />
                </div>
                <div className="activity-list">
                  {data.events.slice(0, 5).map((e) => (
                    <div key={e.id}>
                      <i />
                      <span>
                        <b>{e.type}</b>
                        <p>{e.detail}</p>
                        <small>
                          {new Date(e.at).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Shanghai",
                          })}
                        </small>
                      </span>
                    </div>
                  ))}
                  {!data.events.length && (
                    <p className="panel-note">
                      任务完成、记忆保存和文件夹连接，会在这里留下记录。
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
      {section === "tasks" && (
        <section className="desk-panel task-page">
          <div className="task-toolbar">
            <label>
              <CalendarDays size={16} />
              <input
                aria-label="任务日期"
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
              />
            </label>
            <div className="filter-buttons">
              {[
                ["date", "当天"],
                ["overdue", "未完成的过去"],
                ["all", "全部"],
                ["archived", "已归档"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={taskFilter === id ? "active" : ""}
                  onClick={() => setTaskFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="s-button"
              onClick={() =>
                void act("生成例行任务", async () => {
                  setData(await window.cs.personalDaily(date));
                  setNotice("已生成所选日期的每日例行任务，不会重复添加");
                })
              }
            >
              <RefreshCw size={13} />
              生成例行任务
            </button>
            <button
              className="s-button primary"
              onClick={() =>
                setTaskEdit({
                  title: "",
                  date,
                  priority: "normal",
                  status: "todo",
                  repeat: "none",
                })
              }
            >
              <Plus size={14} />
              新建任务
            </button>
          </div>
          <form
            className="quick-task"
            onSubmit={(e) => {
              e.preventDefault();
              void addTask();
            }}
          >
            <Plus size={17} />
            <input
              aria-label="快速添加任务"
              placeholder="今天想推进什么？"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
            <button disabled={!taskTitle.trim()}>添加</button>
          </form>
          {tasks.length ? (
            tasks.map(renderTask)
          ) : (
            <div className="desk-empty">
              <CheckCheck size={38} />
              <p>这一天，等你来安排。</p>
            </div>
          )}
          <div className="task-summary">
            {tasks.filter((t) => t.status === "done").length} / {tasks.length}{" "}
            已完成<span>每日例行任务按日期生成，历史完成记录会保留。</span>
          </div>
        </section>
      )}
      {(section === "memory" || section === "inbox") && (
        <>
          <div className="memory-toolbar">
            <label className="personal-search">
              <Search size={16} />
              <input
                aria-label={
                  section === "inbox" ? "搜索收集资料" : "搜索个人记忆"
                }
                placeholder={
                  section === "inbox"
                    ? "搜索来源、摘录或标签"
                    : "搜索经验、偏好、方法或标签"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className="s-button"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "返回记忆库" : "查看已归档"}
            </button>
            <button
              className="s-button primary"
              onClick={() =>
                setNoteEdit({
                  title: "",
                  body: "",
                  tags: "",
                  pinned: false,
                  kind: section === "inbox" ? "reference" : "memory",
                  project: section === "inbox" ? projectPath : "",
                })
              }
            >
              <Plus size={15} />
              {section === "inbox" ? "收集资料" : "记下一条经验"}
            </button>
          </div>
          <div className="memory-grid">
            {notes.map((n) => (
              <article className="memory-card" key={n.id}>
                <div>
                  <BookOpenText size={18} />
                  {n.pinned && <Star size={13} fill="currentColor" />}
                  <button
                    className="s-icon"
                    aria-label={`${n.archived ? "恢复" : "归档"}记忆 ${n.title}`}
                    onClick={() =>
                      void act("更新记忆", async () =>
                        setData(await window.cs.personalArchiveNote(n.id)),
                      )
                    }
                  >
                    {n.archived ? (
                      <RefreshCw size={13} />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
                <button className="memory-body" onClick={() => setNoteEdit(n)}>
                  <h2>{n.title}</h2>
                  <p>{n.body}</p>
                </button>
                {n.kind === "reference" && (
                  <div className="reference-meta">
                    {n.sourceUrl && (
                      <button
                        title={n.sourceUrl}
                        onClick={() =>
                          void act("复制来源", async () => {
                            await window.cs.copy(n.sourceUrl!);
                            setNotice("来源链接已复制");
                          })
                        }
                      >
                        <Link size={12} />
                        复制来源
                      </button>
                    )}
                    <span>
                      {projects.find((p) => p.path === n.project)?.title ||
                        "尚未关联选题"}
                    </span>
                    <button
                      aria-label={`${n.processed ? "退回待整理" : "标记已处理"} ${n.title}`}
                      onClick={() =>
                        void act("更新资料", async () =>
                          setData(
                            await window.cs.personalNote({
                              ...n,
                              processed: !n.processed,
                            }),
                          ),
                        )
                      }
                    >
                      {n.processed ? "✓ 已处理" : "待整理"}
                    </button>
                  </div>
                )}
                <footer>
                  <span>{n.tags || "未分类"}</span>
                  <small>
                    {new Date(n.updatedAt).toLocaleDateString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                  </small>
                </footer>
              </article>
            ))}
            {!notes.length && (
              <div className="desk-panel memory-empty">
                <BookOpenText size={35} />
                <h2>
                  {section === "inbox"
                    ? "把下一条创作的起点留在这里。"
                    : "不是所有经验，都要重新学一遍。"}
                </h2>
                <p>
                  {section === "inbox"
                    ? "存下链接、摘录、观察，再关联到具体选题。"
                    : "记下你的表达风格、工作习惯和判断依据。"}
                  <br />
                  发消息时可以选择带上这些记忆。
                </p>
                <button
                  className="s-button"
                  onClick={() =>
                    setNoteEdit({
                      kind: section === "inbox" ? "reference" : "memory",
                      project: section === "inbox" ? projectPath : "",
                      title: section === "inbox" ? "" : "我的创作偏好",
                      body: "",
                      tags: "创作偏好",
                    })
                  }
                >
                  {section === "inbox" ? "收集第一份资料" : "写第一条记忆"}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {section === "folders" && (
        <div className="file-layout">
          <aside className="desk-panel folder-sidebar">
            <div className="desk-panel-title">
              <h2>连接目录</h2>
              <button aria-label="连接文件夹" onClick={() => void connect()}>
                <Plus size={16} />
              </button>
            </div>
            {data.folders.map((f) => (
              <div
                className={`folder-entry ${folderId === f.id ? "selected" : ""}`}
                key={f.id}
              >
                <button
                  onClick={() => {
                    setFolderId(f.id);
                    setRelative("");
                    setFilePreview(null);
                  }}
                >
                  <Folder size={17} />
                  <span>{f.name}</span>
                </button>
                <button
                  aria-label={`断开 ${f.name}`}
                  title="断开连接，保留原文件"
                  onClick={() =>
                    void act("断开连接", async () => {
                      setData(await window.cs.personalDisconnect(f.id));
                      setFolderId("");
                      setFiles([]);
                      setFilePreview(null);
                    })
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <p className="panel-note">
              连接不会移动文件。断开仅移除入口，原文件保留。
            </p>
          </aside>
          <section className="desk-panel file-browser">
            <div className="file-breadcrumb">
              <button
                className="s-icon"
                aria-label="返回上级目录"
                disabled={!relative}
                onClick={() => {
                  setRelative(relative.split("/").slice(0, -1).join("/"));
                  setFilePreview(null);
                }}
              >
                <ArrowLeft size={16} />
              </button>
              <span>
                {data.folders.find((f) => f.id === folderId)?.name ||
                  "尚未连接目录"}
                {relative && ` / ${relative}`}
              </span>
              <button
                className="s-button compact"
                disabled={!folderId}
                onClick={() =>
                  void act("打开目录", async () => {
                    const e = await window.cs.personalOpen(folderId, relative);
                    if (e) throw Error(e);
                  })
                }
              >
                在 Finder 打开
              </button>
            </div>
            {folderId ? (
              <>
                <div className="file-table">
                  <div className="file-table-head">
                    <span>名称</span>
                    <span>大小</span>
                    <span>修改时间</span>
                  </div>
                  {files.map((f) => (
                    <button
                      key={f.relative}
                      disabled={f.symlink}
                      className="file-row"
                      onClick={() => {
                        if (f.directory) {
                          setRelative(f.relative);
                          setFilePreview(null);
                        } else
                          void act("读取文件", async () => {
                            setFilePreview(
                              await window.cs.personalFile(
                                folderId,
                                f.relative,
                              ),
                            );
                          });
                      }}
                    >
                      {f.directory ? (
                        <Folder size={16} />
                      ) : (
                        <FileText size={16} />
                      )}
                      <b>{f.name}</b>
                      <span>
                        {f.directory ? "—" : `${Math.ceil(f.size / 1024)} KB`}
                      </span>
                      <small>
                        {new Date(f.modifiedAt).toLocaleDateString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                        })}
                      </small>
                    </button>
                  ))}
                  {!files.length && (
                    <div className="desk-empty">
                      <p>这个目录还没有可显示的文件。</p>
                    </div>
                  )}
                </div>
                {filePreview && (
                  <section className="file-preview">
                    <header>
                      <strong>{filePreview.name}</strong>
                      <button
                        className="s-button compact"
                        onClick={() => {
                          setAttachment({
                            folderId,
                            relative:
                              files.find((f) => f.name === filePreview.name)
                                ?.relative || "",
                          });
                          setNotice("文件已加入下一次 Agent 消息的上下文");
                          onNavigate("agents");
                        }}
                      >
                        带到 Agent 会话
                        <ArrowRight size={13} />
                      </button>
                    </header>
                    <pre>{filePreview.body}</pre>
                  </section>
                )}
              </>
            ) : (
              <div className="desk-empty">
                <FolderOpen size={40} />
                <p>先连接一个你常用的目录。</p>
                <button
                  className="s-button primary"
                  onClick={() => void connect()}
                >
                  连接文件夹
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {section === "agents" && (
        <div className="agent-layout">
          <aside className="desk-panel agent-sidebar">
            <button
              className="s-button full"
              onClick={() => void newConversation()}
            >
              <Plus size={15} />
              新的会话
            </button>
            <div className="conversation-list">
              {data.conversations.map((c) => (
                <button
                  key={c.id}
                  className={c.id === conversationId ? "selected" : ""}
                  onClick={() => {
                    setConversationId(c.id);
                    setProvider(c.provider);
                    setModel(c.model);
                  }}
                >
                  <span>{c.title}</span>
                  <small>
                    {c.provider === "codex"
                      ? "GPT"
                      : c.provider === "xai"
                        ? "Grok"
                        : "Claude"}{" "}
                    {c.status === "running" ? "· 处理中" : ""}
                  </small>
                </button>
              ))}
            </div>
            <div className="provider-health">
              <header>
                <span>本机连接</span>
                <button
                  className="s-icon"
                  aria-label="重新检测 Agent"
                  onClick={() =>
                    void act("检测本机 Agent", async () =>
                      setProviders(await window.cs.personalProviders(true)),
                    )
                  }
                >
                  <RefreshCw size={13} />
                </button>
              </header>
              {providers.map((p) => (
                <div key={p.id}>
                  <span className={p.loggedIn ? "live-dot" : "offline-dot"} />
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {p.id === "xai"
                        ? p.loggedIn
                          ? "API 已配置"
                          : "网页 / 配置 API"
                        : p.loggedIn
                          ? "已登录"
                          : p.installed
                            ? "已安装 · 待登录"
                            : "未安装"}
                    </small>
                  </span>
                </div>
              ))}
              <div className="grok-actions">
                <button
                  className="s-button compact"
                  onClick={() =>
                    void act("打开 Grok", () => window.cs.personalGrokWeb())
                  }
                >
                  Grok 网页
                </button>
                <button
                  className="s-button compact"
                  onClick={() => setXaiOpen(true)}
                >
                  配置 xAI
                </button>
              </div>
              <p>
                Claude 待登录时，在终端运行 <code>claude</code>；完成后点刷新。
              </p>
            </div>
          </aside>
          <section className="desk-panel agent-chat">
            <div className="agent-chat-header">
              <Bot size={17} />
              <strong>{conversation?.title || "开始一次新的思考"}</strong>
              <span className="readonly-badge">只读分析</span>
            </div>
            <div className="chat-messages">
              {conversation?.messages.length ? (
                conversation.messages.map((m) => (
                  <article key={m.id} className={`chat-message ${m.role}`}>
                    <span className="message-avatar">
                      {m.role === "user"
                        ? "你"
                        : conversation.provider === "codex"
                          ? "G"
                          : conversation.provider === "xai"
                            ? "X"
                            : "C"}
                    </span>
                    <div>
                      <header>
                        {m.role === "user"
                          ? "我的消息"
                          : conversation.provider === "codex"
                            ? "Codex / GPT"
                            : conversation.provider === "xai"
                              ? "Grok / xAI"
                              : "Claude Code"}
                        {m.noteIds?.length ? (
                          <small>含 {m.noteIds.length} 条记忆</small>
                        ) : null}
                      </header>
                      <pre>
                        {m.text ||
                          (conversation.status === "running"
                            ? "正在思考…"
                            : "未返回内容")}
                      </pre>
                      {m.text && (
                        <button
                          className="copy-message"
                          onClick={() => void window.cs.copy(m.text)}
                        >
                          <Copy size={11} />
                          复制
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="agent-welcome">
                  <div>
                    <Sparkles size={30} strokeWidth={1.4} />
                  </div>
                  <span className="studio-eyebrow">
                    A LITTLE CLARITY GOES A LONG WAY
                  </span>
                  <h2>先把想法说出来。</h2>
                  <p>
                    整理今天的任务、推敲一段口播，
                    <br />
                    或带着文件一起分析下一步。
                  </p>
                  <div className="prompt-starters">
                    {[
                      "帮我把今天的目标拆成可执行任务",
                      "帮我把这个想法写成 60 秒口播",
                      "从我的工作记录中提炼可复用的方法",
                    ].map((p) => (
                      <button key={p} onClick={() => setPrompt(p)}>
                        {p}
                        <ArrowRight size={13} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {conversation?.error && (
                <div className="studio-banner error" role="alert">
                  {conversation.error}
                </div>
              )}
              <div ref={bottom} />
            </div>
            <div className="agent-composer">
              <div className="context-picks">
                <details>
                  <summary>
                    <BookOpenText size={13} />
                    带上记忆 {noteIds.length > 0 && `(${noteIds.length})`}
                  </summary>
                  <div>
                    {data.notes
                      .filter((n) => !n.archived)
                      .map((n) => (
                        <label key={n.id}>
                          <input
                            type="checkbox"
                            checked={noteIds.includes(n.id)}
                            onChange={(e) =>
                              setNoteIds(
                                e.target.checked
                                  ? [...noteIds, n.id]
                                  : noteIds.filter((id) => id !== n.id),
                              )
                            }
                          />
                          {n.title}
                        </label>
                      ))}
                    {!data.notes.length && <p>先去个人记忆写下一条经验。</p>}
                  </div>
                </details>
                {attachment && (
                  <span className="attachment-chip">
                    <FileText size={12} />
                    {attachment.relative.split("/").at(-1)}
                    <button
                      aria-label="移除参考文件"
                      onClick={() => setAttachment(null)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
              <textarea
                aria-label="发送给 Agent 的消息"
                placeholder="输入你的想法…  ⌘ Enter 发送"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    (e.metaKey || e.ctrlKey) &&
                    e.key === "Enter" &&
                    prompt.trim() &&
                    conversation?.status !== "running"
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-bottom">
                <select
                  aria-label="选择 Agent"
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setModel("");
                  }}
                >
                  {providers.length ? (
                    providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {!p.loggedIn ? " · 待连接" : ""}
                      </option>
                    ))
                  ) : (
                    <option value="codex">Codex / GPT</option>
                  )}
                </select>
                <input
                  list="agent-models"
                  aria-label="选择模型"
                  placeholder="沿用 Agent 默认模型"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
                <datalist id="agent-models">
                  {providers
                    .find((p) => p.id === provider)
                    ?.models.filter(Boolean)
                    .map((m) => (
                      <option key={m} value={m} />
                    ))}
                </datalist>
                {conversation?.status === "running" ? (
                  <button
                    className="s-button"
                    onClick={() =>
                      void act("停止回复", async () => {
                        await window.cs.personalCancel(conversation.id);
                      })
                    }
                  >
                    <Square size={12} />
                    停止
                  </button>
                ) : (
                  <button
                    className="s-button primary"
                    disabled={
                      !prompt.trim() ||
                      !!busy ||
                      !providers.find((p) => p.id === provider)?.loggedIn
                    }
                    onClick={() => void send()}
                  >
                    <Send size={14} />
                    发送
                  </button>
                )}
              </div>
              <p>
                仅发送本次消息、会话历史及你选择的记忆/文件；会使用对应 Agent
                账户额度。
              </p>
            </div>
          </section>
        </div>
      )}
      <footer className="personal-footer">
        <span>
          <span className="live-dot" />
          个人数据保存在本机
        </span>
        <span>
          CS WORKBENCH<span className="separator">/</span>WORK WITH INTENTION
        </span>
      </footer>
      {xaiOpen && (
        <Dialog
          label="配置 xAI"
          onClose={() => {
            setXaiOpen(false);
            setXaiKey("");
          }}
          dismissible={!busy}
          error={error}
        >
          <form
            className="studio-modal personal-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act("验证 xAI 连接", async () => {
                setProviders(await window.cs.personalXaiKey(xaiKey));
                setXaiKey("");
                setXaiOpen(false);
                setNotice("xAI API Key 已验证并加密保存");
              });
            }}
          >
            <button
              type="button"
              className="modal-close s-icon"
              aria-label="关闭 xAI 配置"
              onClick={() => {
                setXaiOpen(false);
                setXaiKey("");
              }}
            >
              <X size={18} />
            </button>
            <span className="studio-eyebrow">CONNECT GROK</span>
            <h2>接入你的 xAI 账户</h2>
            <p>
              填写 xAI Console 的 API Key，验证后使用系统加密保存。Grok
              网页订阅和 API 额度分别管理。
            </p>
            <label>
              API Key
              <input
                type="password"
                autoComplete="off"
                aria-label="xAI API Key"
                value={xaiKey}
                onChange={(e) => setXaiKey(e.target.value)}
                placeholder="在此粘贴密钥，不写入文档或备份"
              />
            </label>
            <button
              className="s-button primary"
              disabled={!xaiKey.trim() || !!busy}
            >
              验证并保存
            </button>
            <button
              type="button"
              className="s-button full"
              style={{ marginTop: 10 }}
              onClick={() =>
                void act("移除 xAI 密钥", async () => {
                  setProviders(await window.cs.personalXaiKey(""));
                  setXaiKey("");
                  setXaiOpen(false);
                })
              }
            >
              移除本机保存的密钥
            </button>
          </form>
        </Dialog>
      )}
      {taskEdit && (
        <Dialog
          label="编辑任务"
          onClose={() => setTaskEdit(null)}
          dismissible={!busy}
          error={error}
        >
          <form
            className="studio-modal personal-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTask();
            }}
          >
            <button
              type="button"
              className="modal-close s-icon"
              aria-label="关闭任务编辑"
              onClick={() => setTaskEdit(null)}
            >
              <X size={18} />
            </button>
            <span className="studio-eyebrow">MAKE IT HAPPEN</span>
            <h2>{taskEdit.id ? "调整这件事" : "给想法一个行动"}</h2>
            <label>
              任务名称
              <input
                autoFocus
                aria-label="任务名称"
                value={taskEdit.title || ""}
                maxLength={200}
                onChange={(e) =>
                  setTaskEdit({ ...taskEdit, title: e.target.value })
                }
              />
            </label>
            <label>
              说明
              <textarea
                aria-label="任务说明"
                value={taskEdit.detail || ""}
                onChange={(e) =>
                  setTaskEdit({ ...taskEdit, detail: e.target.value })
                }
              />
            </label>
            <div className="form-pair">
              <label>
                计划日期
                <input
                  aria-label="计划日期"
                  type="date"
                  value={taskEdit.date || date}
                  onChange={(e) =>
                    setTaskEdit({ ...taskEdit, date: e.target.value })
                  }
                />
              </label>
              <label>
                优先级
                <select
                  aria-label="任务优先级"
                  value={taskEdit.priority || "normal"}
                  onChange={(e) =>
                    setTaskEdit({
                      ...taskEdit,
                      priority: e.target.value as PersonalTask["priority"],
                    })
                  }
                >
                  <option value="high">重要</option>
                  <option value="normal">普通</option>
                  <option value="low">稍后</option>
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                状态
                <select
                  aria-label="任务状态"
                  value={taskEdit.status || "todo"}
                  onChange={(e) =>
                    setTaskEdit({
                      ...taskEdit,
                      status: e.target.value as PersonalTask["status"],
                    })
                  }
                >
                  <option value="todo">待办</option>
                  <option value="doing">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </label>
              <label>
                重复
                <select
                  aria-label="任务重复"
                  value={taskEdit.repeat || "none"}
                  onChange={(e) =>
                    setTaskEdit({
                      ...taskEdit,
                      repeat: e.target.value as PersonalTask["repeat"],
                    })
                  }
                >
                  <option value="none">不重复</option>
                  <option value="daily">每日例行</option>
                </select>
              </label>
            </div>
            <label>
              关联项目
              <select
                aria-label="任务关联项目"
                value={taskEdit.project || ""}
                onChange={(e) =>
                  setTaskEdit({ ...taskEdit, project: e.target.value })
                }
              >
                <option value="">个人事务</option>
                {projects.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="s-button primary"
              disabled={!taskEdit.title?.trim() || !!busy}
            >
              保存任务
              <Check size={15} />
            </button>
          </form>
        </Dialog>
      )}
      {noteEdit && (
        <Dialog
          label="编辑记忆与资料"
          onClose={() => setNoteEdit(null)}
          dismissible={!busy}
          error={error}
        >
          <form
            className="studio-modal personal-form note-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveNote();
            }}
          >
            <button
              type="button"
              className="modal-close s-icon"
              aria-label="关闭记忆编辑"
              onClick={() => setNoteEdit(null)}
            >
              <X size={18} />
            </button>
            <span className="studio-eyebrow">KEEP WHAT YOU LEARN</span>
            <h2>
              {noteEdit.kind === "reference"
                ? "收集与整理资料"
                : noteEdit.id
                  ? "完善这条记忆"
                  : "记下一条经验"}
            </h2>
            <label>
              标题
              <input
                autoFocus
                aria-label={
                  noteEdit.kind === "reference" ? "资料标题" : "记忆标题"
                }
                value={noteEdit.title || ""}
                maxLength={200}
                onChange={(e) =>
                  setNoteEdit({ ...noteEdit, title: e.target.value })
                }
              />
            </label>
            <label>
              内容
              <textarea
                aria-label={
                  noteEdit.kind === "reference" ? "资料摘要" : "记忆内容"
                }
                value={noteEdit.body || ""}
                onChange={(e) =>
                  setNoteEdit({ ...noteEdit, body: e.target.value })
                }
                placeholder="例如：我的视频先讲真实经历，再给一个可执行的方法。"
              />
            </label>
            <label>
              标签
              <input
                aria-label="记忆标签"
                value={noteEdit.tags || ""}
                onChange={(e) =>
                  setNoteEdit({ ...noteEdit, tags: e.target.value })
                }
                placeholder="创作偏好，方法，项目背景"
              />
            </label>
            {noteEdit.kind === "reference" && (
              <>
                <label>
                  来源链接
                  <input
                    aria-label="资料来源"
                    type="url"
                    placeholder="https://…（可选）"
                    value={noteEdit.sourceUrl || ""}
                    onChange={(e) =>
                      setNoteEdit({ ...noteEdit, sourceUrl: e.target.value })
                    }
                  />
                </label>
                <label>
                  关联选题
                  <select
                    aria-label="资料关联选题"
                    value={noteEdit.project || ""}
                    onChange={(e) =>
                      setNoteEdit({ ...noteEdit, project: e.target.value })
                    }
                  >
                    <option value="">暂不关联</option>
                    {projects.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="pin-note">
              <input
                type="checkbox"
                checked={noteEdit.pinned || false}
                onChange={(e) =>
                  setNoteEdit({ ...noteEdit, pinned: e.target.checked })
                }
              />
              置顶这条记忆
            </label>
            <button
              className="s-button primary"
              disabled={
                !noteEdit.title?.trim() || !noteEdit.body?.trim() || !!busy
              }
            >
              {noteEdit.kind === "reference" ? "保存资料" : "保存记忆"}
              <Check size={15} />
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
