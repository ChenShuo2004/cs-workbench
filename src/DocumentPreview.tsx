import React from "react";

// Deliberately text-only: local drafts cannot inject HTML or execute scripts.
// Supports the common writing blocks; the editable source remains untouched.
export function DocumentPreview({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <article className="document-reading" aria-label="稿件阅读预览">
      {text.trim() ? (
        blocks.map((block, index) => {
          if (/^```/.test(block))
            return (
              <pre key={index}>
                <code>
                  {block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "")}
                </code>
              </pre>
            );
          const heading = block.match(/^(#{1,3}) (.+)$/);
          if (heading)
            return React.createElement(
              `h${heading[1].length}`,
              { key: index },
              heading[2],
            );
          if (block.split("\n").every((line) => /^[-*] /.test(line)))
            return (
              <ul key={index}>
                {block.split("\n").map((line, i) => (
                  <li key={i}>{line.slice(2)}</li>
                ))}
              </ul>
            );
          if (block.startsWith("> "))
            return (
              <blockquote key={index}>{block.replace(/^> ?/gm, "")}</blockquote>
            );
          return <p key={index}>{block}</p>;
        })
      ) : (
        <p className="muted">写下内容后，阅读预览会出现在这里。</p>
      )}
    </article>
  );
}
