import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
export type CanvasCommand = {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
};
export function CanvasCommandMenu({
  x,
  y,
  title,
  commands,
  close,
}: {
  x: number;
  y: number;
  title: string;
  commands: CanvasCommand[];
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [close]);
  const filtered = commands.filter((c) =>
    (c.label + " " + (c.hint || ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const execute = (c: CanvasCommand) => {
    if (!c.disabled) {
      close();
      c.run();
    }
  };
  return (
    <div
      ref={ref}
      className="vc-command-menu"
      role="dialog"
      aria-label={title}
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 280)),
        top: Math.max(8, Math.min(y, window.innerHeight - 470)),
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const items = Array.from(
            ref.current?.querySelectorAll<HTMLButtonElement>(
              "button[data-command]:not(:disabled)",
            ) || [],
          );
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          items[
            (index +
              (e.key === "ArrowDown" ? 1 : items.length - 1) +
              items.length) %
              items.length
          ]?.focus();
        }
      }}
    >
      <header>
        <b>{title}</b>
        <button aria-label="关闭画布菜单" onClick={close}>
          <X size={16} />
        </button>
      </header>
      <label className="vc-command-search">
        <Search size={15} />
        <input
          autoFocus
          aria-label="搜索画布命令"
          placeholder="搜索节点或操作…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const c = filtered.find((x) => !x.disabled);
              if (c) {
                e.preventDefault();
                execute(c);
              }
            }
          }}
        />
      </label>
      <div className="vc-command-list" role="menu">
        {filtered.map((c) => (
          <button
            data-command
            key={c.id}
            role="menuitem"
            disabled={c.disabled}
            onClick={() => execute(c)}
          >
            <span>{c.label}</span>
            {c.hint && <small>{c.hint}</small>}
          </button>
        ))}
        {!filtered.length && <p>没有匹配的节点或操作</p>}
      </div>
    </div>
  );
}
