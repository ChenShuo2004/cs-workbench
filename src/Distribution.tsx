import { useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { uiErrorMessage } from "./ui-error";
import type { MaitianFrame } from "./types";
import "./distribution.css";

export function Distribution() {
  const [state, setState] = useState<MaitianFrame | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void window.cs
      .maitianRead()
      .then((s) => {
        if (live) setState(s);
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
  }, [revision]);
  const refresh = () => setRevision((r) => r + 1);
  async function connect() {
    try {
      const s = await window.cs.maitianConnect();
      if (s) {
        setState(s);
        refresh();
      }
    } catch (e) {
      setError(uiErrorMessage(e));
    }
  }
  return (
    <section className="maitian-embedded" aria-label="麦田发布与数据看板">
      <div className="maitian-frame-toolbar">
        <span>
          <i className={state?.connected ? "online" : ""} />
          麦田 · 发布与复盘
        </span>
        <div>
          <button className="text-button" disabled={loading} onClick={refresh}>
            <RefreshCw size={14} />
            刷新网页
          </button>
          <button className="text-button" onClick={() => void connect()}>
            连接位置
          </button>
          <button
            className="text-button"
            disabled={!state?.installed}
            onClick={() =>
              void window.cs
                .maitianOpen()
                .catch((e) => setError(uiErrorMessage(e)))
            }
          >
            <ExternalLink size={14} />
            在浏览器打开
          </button>
        </div>
      </div>
      {error && (
        <div className="maitian-frame-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="maitian-frame-placeholder" role="status">
          <LoaderCircle className="spin" size={22} />
          <p>正在打开麦田…</p>
        </div>
      ) : state?.connected ? (
        <iframe
          key={revision}
          src={state.frameUrl}
          title="麦田看板"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="maitian-frame-placeholder">
          <h1>{state?.installed ? "麦田暂时无法连接" : "连接你的麦田"}</h1>
          <p>{state?.error || "请选择本机已安装的麦田目录。"}</p>
          <button
            className="button primary"
            onClick={state?.installed ? refresh : () => void connect()}
          >
            {state?.installed ? "重新连接" : "选择麦田目录"}
          </button>
        </div>
      )}
    </section>
  );
}
