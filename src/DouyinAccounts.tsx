import { Dialog } from "./Dialog";
import { useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import platforms from "../shared/account-platforms.json";
import type { AccountPlatform, DouyinAccount } from "./types";

export function DouyinAccounts() {
  const [accounts, setAccounts] = useState<DouyinAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    id?: string;
    name: string;
    platform: AccountPlatform;
  } | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const refresh = async () => {
    const result = await window.cs.listDouyinAccounts();
    if (alive.current) setAccounts(result);
  };
  useEffect(() => {
    alive.current = true;
    const update = () => {
      void refresh().catch((e) => {
        if (alive.current) setError(String(e.message || e));
      });
    };
    const unsubscribe = window.cs.onDouyinAccountsChanged(update);
    void refresh()
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
    return () => {
      alive.current = false;
      unsubscribe();
    };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (!editor) return;
      if (editor.id)
        await window.cs.renameDouyinAccount(editor.id, editor.name);
      else await window.cs.addDouyinAccount(editor.name, editor.platform);
      setEditor(null);
    });
  return (
    <div className="accounts-page">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">CREATOR ACCOUNTS</span>
          <h1>平台账号</h1>
          <p>
            抖音、小红书、视频号、公众号，各自登录。打开对应后台，继续发布作品和查看数据。
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy || loading}
          onClick={() => setEditor({ name: "", platform: "douyin" })}
        >
          <Plus size={17} /> 添加平台账号
        </button>
      </div>
      <div className="accounts-info">
        <ShieldCheck size={19} />
        <p>
          通过独立 Chrome 窗口登录。每个账号使用专属浏览器空间，Cookie 由 Chrome
          保存在本机。首次需扫码或验证，平台登录过期后需重新登录。
        </p>
      </div>
      {error && (
        <div className="accounts-error" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void run(refresh)}
          >
            <RefreshCw size={15} /> 重试
          </button>
        </div>
      )}
      <div className="accounts-summary">
        <strong>{accounts.length} 个账号</strong>
        <span>独立 Chrome · 每个账号单独保存会话</span>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>
      {loading ? (
        <div className="accounts-empty" role="status">
          <LoaderCircle size={24} className="spin" />
          <p>正在读取账号</p>
        </div>
      ) : accounts.length ? (
        <div className="accounts-grid">
          {accounts.map((account, index) => (
            <article className="account-card" key={account.id}>
              <div className="account-heading">
                <div className="account-avatar">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h2 title={account.name}>{account.name}</h2>
                  <span>{platforms[account.platform].title}</span>
                </div>
                <span className="pill neutral">独立 Chrome</span>
              </div>
              <p className="account-time">
                {account.lastBrowserOpenedAt
                  ? `上次启动 Chrome：${new Date(account.lastBrowserOpenedAt).toLocaleString("zh-CN")}`
                  : "尚未打开 · 首次需登录"}
              </p>
              <div className="account-actions">
                <button
                  className="button dark"
                  disabled={busy}
                  onClick={() =>
                    void run(() => window.cs.openAccountBrowser(account.id))
                  }
                >
                  <ExternalLink size={15} /> 打开 Chrome / 登录
                </button>
                <button
                  className="icon-button"
                  disabled={busy}
                  title={`修改${account.name}备注`}
                  aria-label={`修改${account.name}备注`}
                  onClick={() =>
                    setEditor({
                      id: account.id,
                      name: account.name,
                      platform: account.platform,
                    })
                  }
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button account-remove"
                  disabled={busy}
                  title={`移除${account.name}`}
                  aria-label={`移除${account.name}`}
                  onClick={() =>
                    void run(() => window.cs.removeDouyinAccount(account.id))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="accounts-empty">
          <Users size={34} />
          <h2>添加第一个平台账号</h2>
          <p>使用「主号」「知识分享号」等备注，区分每个独立后台。</p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => setEditor({ name: "", platform: "douyin" })}
          >
            <Plus size={16} /> 添加平台账号
          </button>
        </div>
      )}
      <p className="accounts-footnote">
        打开窗口不代表登录成功，登录结果以官方后台为准。每次从这里打开，继续使用该账号的
        Chrome 会话；发布前请核对头像与昵称。
      </p>
      {editor && (
        <Dialog
          label={editor.id ? "修改账号备注" : "添加平台账号"}
          onClose={() => setEditor(null)}
          dismissible={!busy}
        >
          <form
            className="modal account-modal"
            aria-labelledby="account-editor-title"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy) setEditor(null);
            }}
          >
            <div className="account-modal-title">
              <h2 id="account-editor-title">
                {editor.id ? "修改账号备注" : "添加平台账号"}
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                <X size={18} />
              </button>
            </div>
            <label htmlFor="account-platform">平台</label>
            <select
              id="account-platform"
              value={editor.platform}
              disabled={busy || Boolean(editor.id)}
              onChange={(event) =>
                setEditor({
                  ...editor,
                  platform: event.target.value as AccountPlatform,
                })
              }
            >
              {Object.entries(platforms).map(([id, platform]) => (
                <option key={id} value={id}>
                  {platform.name}
                </option>
              ))}
            </select>
            <label htmlFor="account-name">账号备注</label>
            <input
              id="account-name"
              autoFocus
              required
              maxLength={40}
              value={editor.name}
              placeholder="例如：主号 / AI 知识分享号"
              disabled={busy}
              onChange={(event) =>
                setEditor({ ...editor, name: event.target.value })
              }
            />
            <p className="muted">
              备注只用于本机识别。保存后打开独立 Chrome，完成对应平台登录。
            </p>
            {error && (
              <p className="account-load-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button subtle"
                type="button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={busy || !editor.name.trim()}
              >
                {busy ? "正在保存…" : "保存备注"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
