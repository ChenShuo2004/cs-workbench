import React, { useEffect, useState } from "react";
import { NetworkIsolation } from "../NetworkIsolation";
export function Environment(
  props: React.ComponentProps<typeof NetworkIsolation>,
) {
  const [nodes, N] = useState<Awaited<
    ReturnType<typeof window.cs.clashRead>
  > | null>(null);
  useEffect(() => {
    window.cs
      .clashRead()
      .then(N)
      .catch((e) => props.onNotice(String(e), true));
  }, []);
  return (
    <>
      <section className="settings-card">
        <h2>Clash Verge 运行配置</h2>
        <p className="file-path muted">
          {nodes?.file || nodes?.error || "读取中"}
        </p>
        <div className="cover-row">
          {nodes?.listeners.map((n) => (
            <span key={n.port}>
              {n.name} · {n.port} · {n.proxy}
            </span>
          ))}
        </div>
        <button
          className="button subtle"
          onClick={() =>
            void window.cs
              .closeAll()
              .then(() => props.onNotice("账号窗口已关闭"))
              .catch((e) => props.onNotice(String(e), true))
          }
        >
          关闭全部账号窗口
        </button>
      </section>
      <NetworkIsolation {...props} />
    </>
  );
}
