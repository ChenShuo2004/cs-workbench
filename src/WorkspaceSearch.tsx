import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Search, X } from "lucide-react";
import type { PersonalData, ProjectSummary, Section } from "./types";
import { Dialog } from "./Dialog";
import { uiErrorMessage } from "./ui-error";

export type WorkspaceTarget = {
  kind: "page" | "project" | "task" | "note" | "conversation" | "folder";
  id: string;
  section: Section;
};
type Result = WorkspaceTarget & {
  title: string;
  category: string;
  body: string;
};

export function WorkspaceSearch({
  destinations,
  projects,
  onOpen,
  onClose,
}: {
  destinations: { id: Section; label: string; group: string }[];
  projects: ProjectSummary[];
  onOpen: (target: WorkspaceTarget) => Promise<boolean>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PersonalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(0);
  const [opening, setOpening] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    window.cs
      .personalRead()
      .then((value) => {
        if (live) setData(value);
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
  }, [retry]);
  const results = useMemo(() => {
    const all: Result[] = [
      ...destinations.map((d): Result => ({
        kind: "page",
        id: d.id,
        section: d.id,
        title: d.label,
        category: "页面",
        body: d.group,
      })),
      ...projects.map((p): Result => ({
        kind: "project",
        id: p.path,
        section: "projects",
        title: p.title,
        category: "项目",
        body: p.path,
      })),
      ...(data?.tasks || [])
        .filter((t) => t.status !== "archived")
        .map((t): Result => ({
          kind: "task",
          id: t.id,
          section: "tasks",
          title: t.title,
          category: "任务",
          body: t.detail || "",
        })),
      ...(data?.notes || [])
        .filter((n) => !n.archived)
        .map((n): Result => ({
          kind: "note",
          id: n.id,
          section: n.kind === "reference" ? "inbox" : "memory",
          title: n.title,
          category: n.kind === "reference" ? "资料" : "记忆",
          body: `${n.body} ${n.tags} ${n.sourceUrl || ""}`,
        })),
      ...(data?.conversations || []).map((c): Result => ({
        kind: "conversation",
        id: c.id,
        section: "agents",
        title: c.title,
        category: "会话",
        body: c.messages.map((m) => m.text).join(" "),
      })),
      ...(data?.folders || []).map((f): Result => ({
        kind: "folder",
        id: f.id,
        section: "folders",
        title: f.name,
        category: "目录",
        body: f.path,
      })),
    ];
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return all
      .filter((r) =>
        terms.every((t) =>
          `${r.title} ${r.category} ${r.body}`.toLocaleLowerCase().includes(t),
        ),
      )
      .sort((a, b) => {
        if (!terms.length) return 0;
        const rank = (r: Result) =>
          terms.every((t) => r.title.toLocaleLowerCase().includes(t)) ? 0 : 1;
        return rank(a) - rank(b);
      })
      .slice(0, 60);
  }, [destinations, projects, data, query]);
  useEffect(() => {
    setActive(0);
  }, [query]);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  async function choose(result: Result | undefined) {
    if (!result || pending.current) return;
    pending.current = true;
    setOpening(true);
    try {
      if (await onOpen(result)) onClose();
    } catch (e) {
      setError(uiErrorMessage(e));
    } finally {
      pending.current = false;
      setOpening(false);
    }
  }
  const selected = results[Math.min(active, Math.max(0, results.length - 1))];
  return (
    <Dialog
      label="搜索工作区"
      onClose={onClose}
      dismissible={!opening}
      className="workspace-search-dialog"
    >
      <section className="workspace-search">
        <div className="workspace-search-input">
          {opening ? (
            <LoaderCircle className="spin" size={20} />
          ) : (
            <Search size={20} />
          )}
          <input
            autoFocus
            aria-label="搜索工作区内容"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="workspace-search-results"
            aria-activedescendant={
              selected
                ? `search-${selected.kind}-${results.indexOf(selected)}`
                : undefined
            }
            placeholder="搜索页面、项目、任务、记忆与会话…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive(
                  (value) =>
                    (value +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      results.length) %
                    (results.length || 1),
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                void choose(selected);
              }
            }}
          />
          <button
            className="icon-button"
            aria-label="关闭搜索"
            onClick={onClose}
            disabled={opening}
          >
            <X size={18} />
          </button>
        </div>
        {error && (
          <div className="workspace-search-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setRetry((n) => n + 1)}>重新加载</button>
          </div>
        )}
        <div className="workspace-search-caption" role="status">
          {loading
            ? "正在读取本机记录…"
            : query
              ? `找到 ${results.length}${results.length === 60 ? "+" : ""} 项`
              : "快捷前往 · 输入关键词搜索内容"}
        </div>
        <div
          id="workspace-search-results"
          className="workspace-search-results"
          role="listbox"
          aria-label="搜索结果"
          ref={list}
        >
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              id={`search-${r.kind}-${i}`}
              role="option"
              aria-selected={selected === r}
              tabIndex={-1}
              onMouseMove={() => setActive(i)}
              onClick={() => void choose(r)}
              disabled={opening}
            >
              <span className="search-category">{r.category}</span>
              <span className="search-result-copy">
                <strong>{r.title}</strong>
                <small>{r.body.slice(0, 110)}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!results.length && !loading && (
            <div className="search-empty">
              <Search size={24} />
              <strong>没有找到相关内容</strong>
              <p>
                换一个关键词，或先创建项目、收集资料。目录搜索只查已连接的名称与路径。
              </p>
            </div>
          )}
        </div>
        <footer>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开
          </span>
          <span>
            <kbd>Esc</kbd> 返回当前页面
          </span>
        </footer>
      </section>
    </Dialog>
  );
}
