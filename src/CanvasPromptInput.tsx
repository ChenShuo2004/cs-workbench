import { useRef, useState } from "react";

export type MentionChoice = { id: string; alias: string; name: string };
export function CanvasPromptInput({
  value,
  change,
  choices,
  select,
  label,
  expanded = false,
}: {
  value: string;
  change: (value: string) => void;
  choices: MentionChoice[];
  select: (
    choice: MentionChoice,
    before: string,
    after: string,
  ) => string | false;
  label: string;
  expanded?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [range, setRange] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [active, setActive] = useState(0);
  const inspect = (text: string, cursor: number) => {
    const match = text.slice(0, cursor).match(/@([^@\s]*)$/);
    setRange(
      match
        ? { start: cursor - match[0].length, end: cursor, query: match[1] }
        : null,
    );
    setActive(0);
  };
  const filtered = choices.filter((c) =>
    `${c.alias} ${c.name}`
      .toLowerCase()
      .includes((range?.query || "").toLowerCase()),
  );
  const insert = (choice: MentionChoice) => {
    if (!range) return;
    const alias = select(
      choice,
      value.slice(0, range.start),
      value.slice(range.end),
    );
    if (!alias) return;
    setRange(null);
    const cursor = range.start + alias.length + 1;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(cursor, cursor);
    });
  };
  return (
    <div className={`vg-prompt-input ${expanded ? "expanded" : ""}`}>
      <textarea
        ref={ref}
        autoFocus={expanded}
        aria-label={label}
        value={value}
        maxLength={4000}
        rows={3}
        placeholder="描述画面与动作，输入 @ 选择画布素材，自动连线…"
        onChange={(e) => {
          change(e.target.value);
          inspect(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => inspect(value, e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (!range) return;
          if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") setRange(null);
            else if (e.key === "Enter" && filtered[active])
              insert(filtered[active]);
            else if (filtered.length)
              setActive(
                (active + (e.key === "ArrowUp" ? -1 : 1) + filtered.length) %
                  filtered.length,
              );
          }
        }}
        onBlur={() => setRange(null)}
      />
      {range && (
        <div
          className="vg-mention-menu"
          role="listbox"
          aria-label="选择画布素材"
        >
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(c)}
            >
              <b>{c.alias}</b>
              <span>{c.name}</span>
            </button>
          ))}
          {!filtered.length && (
            <small>
              {choices.length
                ? "没有匹配的素材"
                : "画布中暂无可用素材，可先添加素材或生图节点"}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
