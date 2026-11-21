import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Dialog } from "./Dialog";
import platforms from "../shared/account-platforms.json";
import type {
  AccountNetworkInput,
  NetworkMode,
  PlatformAccount,
  ProxyProtocol,
} from "./types";
import { uiErrorMessage } from "./ui-error";

const TIMEZONE_PRESETS = [
  { value: "", label: "跟随系统时区" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai（中国标准时间）" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong（香港）" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo（东京）" },
  { value: "Asia/Singapore", label: "Asia/Singapore（新加坡）" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles（美西）" },
  { value: "America/New_York", label: "America/New_York（美东）" },
  { value: "Europe/London", label: "Europe/London（伦敦）" },
];

const LANG_PRESETS = [
  { value: "", label: "跟随系统语言" },
  { value: "zh-CN", label: "zh-CN（简体中文）" },
  { value: "zh-HK", label: "zh-HK（繁體中文）" },
  { value: "en-US", label: "en-US（English US）" },
  { value: "ja-JP", label: "ja-JP（日本語）" },
];

export function NetworkEditorModal({
  account,
  onClose,
  onSaved,
}: {
  account: PlatformAccount;
  onClose: () => void;
  onSaved: (checkAfterSave: boolean) => Promise<void>;
}) {
  const initial = account.network;
  const [mode, setMode] = useState<NetworkMode>(initial.mode);
  const [protocol, setProtocol] = useState<ProxyProtocol>(initial.protocol || "http");
  const [host, setHost] = useState(
    initial.mode === "local_port" ? initial.host || "127.0.0.1" : initial.host || "",
  );
  const [port, setPort] = useState(initial.port ? String(initial.port) : "");
  const [username, setUsername] = useState(initial.username || "");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [label, setLabel] = useState(initial.label || "");
  const [failClosed, setFailClosed] = useState(initial.failClosed ?? true);
  const [blockWebRtc, setBlockWebRtc] = useState(initial.blockWebRtc ?? true);
  const [timezone, setTimezone] = useState(initial.timezone || "");
  const [lang, setLang] = useState(initial.lang || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(checkAfterSave: boolean) {
    setBusy(true);
    setError("");
    try {
      const payload: AccountNetworkInput = {
        mode,
        protocol,
        host: mode === "local_port" ? host || "127.0.0.1" : host,
        port: mode === "direct" ? 0 : Number(port || 0),
        username: mode === "proxy" ? username : "",
        failClosed,
        blockWebRtc,
        timezone,
        lang,
        label,
        ...(password ? { password } : {}),
        ...(clearPassword ? { clearPassword: true } : {}),
      };
      await window.cs.updateAccountNetwork(account.id, payload);
      await onSaved(checkAfterSave);
      onClose();
    } catch (err) {
      setError(uiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      label={`网络隔离配置 · ${account.name}`}
      onClose={onClose}
      dismissible={!busy}
    >
      <form
        className="modal network-modal"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <div className="account-modal-title">
          <div>
            <h2>网络与环境隔离</h2>
            <p className="muted small">
              {platforms[account.platform].name} · {account.name}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="network-mode-tabs" role="radiogroup" aria-label="网络模式">
          {(
            [
              {
                id: "local_port",
                title: "本机多端口分流",
                desc: "Clash Verge / Surge 多端口",
              },
              {
                id: "proxy",
                title: "独立代理服务器",
                desc: "住宅 / 静态 HTTP · SOCKS5",
              },
              {
                id: "direct",
                title: "本机直连",
                desc: "不使用独立代理",
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={mode === item.id}
              className={`mode-card ${mode === item.id ? "active" : ""}`}
              disabled={busy}
              onClick={() => {
                setMode(item.id);
                if (item.id === "local_port" && !host) setHost("127.0.0.1");
                if (item.id === "local_port" && !port) setPort("7890");
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>

        {mode !== "direct" && (
          <div className="network-form-grid">
            <label>
              <span>代理协议</span>
              <select
                value={protocol}
                disabled={busy}
                onChange={(e) => setProtocol(e.target.value as ProxyProtocol)}
              >
                <option value="http">HTTP</option>
                <option value="socks5">SOCKS5</option>
                {mode === "proxy" && <option value="https">HTTPS</option>}
              </select>
            </label>
            <label>
              <span>{mode === "local_port" ? "本机监听地址" : "代理主机 / IP"}</span>
              <input
                value={host}
                disabled={busy}
                required
                placeholder={mode === "local_port" ? "127.0.0.1" : "例如 45.12.34.56"}
                onChange={(e) => setHost(e.target.value)}
              />
            </label>
            <label>
              <span>端口</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                disabled={busy}
                required
                placeholder={mode === "local_port" ? "7890" : "10808"}
                onChange={(e) => setPort(e.target.value)}
              />
            </label>
            <label>
              <span>线路备注（可选）</span>
              <input
                value={label}
                maxLength={40}
                disabled={busy}
                placeholder="例如：香港住宅1 / Clash 7891"
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          </div>
        )}

        {mode === "local_port" && (
          <div className="port-presets">
            <span>常用本地端口：</span>
            {[7890, 7891, 7892, 7893, 7897, 10808].map((p) => (
              <button
                key={p}
                type="button"
                className={`chip-btn ${String(p) === port ? "active" : ""}`}
                disabled={busy}
                onClick={() => {
                  setHost("127.0.0.1");
                  setPort(String(p));
                }}
              >
                :{p}
              </button>
            ))}
          </div>
        )}

        {mode === "proxy" && (
          <div className="network-form-grid two-col">
            <label>
              <span>代理用户名（可选）</span>
              <input
                value={username}
                disabled={busy}
                placeholder="无认证可留空"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              <span>
                代理密码（可选）
                {initial.hasPassword && !clearPassword && !password && (
                  <em className="saved-hint"> · 已加密保存</em>
                )}
              </span>
              <input
                type="password"
                value={password}
                disabled={busy || clearPassword}
                placeholder={
                  initial.hasPassword ? "留空保持原密码" : "无认证可留空"
                }
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {initial.hasPassword && (
              <label className="checkbox-inline full-span">
                <input
                  type="checkbox"
                  checked={clearPassword}
                  disabled={busy}
                  onChange={(e) => {
                    setClearPassword(e.target.checked);
                    if (e.target.checked) setPassword("");
                  }}
                />
                <span>清除已保存的代理密码</span>
              </label>
            )}
          </div>
        )}

        <div className="network-guards">
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={failClosed}
              disabled={busy || mode === "direct"}
              onChange={(e) => setFailClosed(e.target.checked)}
            />
            <span>
              <strong>代理不通禁止启动（Fail-Closed）</strong>
              <small>启动前先探测代理，失败则阻断打开 Chrome，防止漏出本机真实 IP</small>
            </span>
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={blockWebRtc}
              disabled={busy}
              onChange={(e) => setBlockWebRtc(e.target.checked)}
            />
            <span>
              <strong>防 WebRTC IP 泄露</strong>
              <small>禁用非代理 UDP，防止网页通过 WebRTC 探测本机内网/公网 IP</small>
            </span>
          </label>
        </div>

        <div className="network-form-grid two-col">
          <label>
            <span>浏览器时区（可选）</span>
            <select
              value={timezone}
              disabled={busy}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONE_PRESETS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>浏览器语言（可选）</span>
            <select
              value={lang}
              disabled={busy}
              onChange={(e) => setLang(e.target.value)}
            >
              {LANG_PRESETS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="network-security-note">
          <ShieldCheck size={16} />
          <span>
            密码使用 macOS 钥匙串加密保存在本机；修改网络后再次打开该账号会自动重启其独立 Chrome 使新代理立即生效。
          </span>
        </div>

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
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button subtle"
            type="button"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            {busy ? "处理中…" : "保存并检测出口 IP"}
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "正在保存…" : "保存配置"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
