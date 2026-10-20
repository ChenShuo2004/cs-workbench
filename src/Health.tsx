import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, HeartPulse, RefreshCw } from "lucide-react";
import type { HealthData, HealthRecord, Section } from "./types";
import "./operations.css";
const metrics = [
  ["steps", "步数", "步"],
  ["distance", "步行与跑步", "公里"],
  ["sleep", "睡眠", "小时"],
  ["restingHeartRate", "静息心率", "次/分"],
] as const;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function stale(date: string) {
  return (
    date.length === 7 || Date.parse(today()) - Date.parse(date) > 3 * 86400000
  );
}
function latest(records: HealthRecord[], key: string) {
  return records
    .filter((r) => r.metric === key)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.recordedAt.localeCompare(a.recordedAt),
    )[0];
}
function syncLabel(data: HealthData | null) {
  if (!data?.sync) return "本地记录 · 尚未配置定时同步";
  if (data.sync.status === "error") return "同步遇到问题 · 旧记录已保留";
  if (!data.sync.lastSuccessAt) return "定时同步已配置 · 等待首次读取";
  if (Date.now() - Date.parse(data.sync.lastSuccessAt) > 45 * 60000) return "同步已超过 45 分钟 · 请检查 Codex 和 Chrome";
  return data.connection === "scheduled-browser" ? "网页定时同步 · 最近读取成功" : "网页读取成功 · 尚未配置定时任务";
}
const localTime = (value?: string) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "尚未运行";
export function HealthPeek({
  onNavigate,
}: {
  onNavigate: (s: Section) => unknown;
}) {
  const [data, setData] = useState<HealthData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () => void window.cs
      .healthRead()
      .then((value) => { setData(value); setError(""); })
      .catch((e) => setError(String(e)));
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, []);
  const steps = data && latest(data.records, "steps");
  return (
    <section className="ops-peek" aria-label="健康概览">
      <HeartPulse size={21} />
      <div>
        <strong>身体状态，也在工作台里</strong>
        <p>
          {error
            ? "健康记录读取失败，请进入查看"
            : data
              ? steps ? `${steps.date} · ${steps.value.toLocaleString()} 步` : "尚无步数记录"
              : "读取本地记录…"}
        </p>
        <small>{syncLabel(data)}</small>
      </div>
      <button className="button subtle" onClick={() => onNavigate("health")}>
        查看健康 <ArrowUpRight size={14} />
      </button>
    </section>
  );
}
export function Health() {
  const [data, setData] = useState<HealthData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false),
    [refreshNotice, setRefreshNotice] = useState("");
  const dataRef = useRef<HealthData | null>(null);
  const pendingRead = useRef<Promise<HealthData> | null>(null);
  const manualRefresh = useRef(false);
  const [trend, setTrend] = useState("steps");
  // Focus, polling and button clicks share a read, so an older response cannot
  // overwrite a newer snapshot. A stalled IPC must not leave the button stuck.
  const readHealth = useCallback(() => {
    if (pendingRead.current) return pendingRead.current;
    let timer: ReturnType<typeof setTimeout>;
    const request = Promise.race<HealthData>([
      Promise.resolve().then(() => window.cs.healthRead()),
      new Promise<HealthData>((_, reject) => {
        timer = setTimeout(() => reject(new Error("读取超时，请重试。原有记录已保留。")), 15000);
      }),
    ]).then((value) => {
      dataRef.current = value;
      setData(value);
      return value;
    }).finally(() => {
      clearTimeout(timer);
      pendingRead.current = null;
    });
    pendingRead.current = request;
    return request;
  }, []);
  const refresh = useCallback(async (manual = false) => {
    if (manual && manualRefresh.current) return;
    const before = dataRef.current;
    if (manual) {
      manualRefresh.current = true;
      setRefreshing(true);
      setRefreshNotice("");
      setError("");
    }
    try {
      const value = await readHealth();
      setError("");
      if (manual) {
        const visible = (snapshot: HealthData | null) => (snapshot?.records || [])
          .filter((r) => metrics.some(([key]) => key === r.metric));
        const fingerprint = (snapshot: HealthData | null) => JSON.stringify(visible(snapshot)
          .map((r) => JSON.stringify([r.metric, r.date, r.value, r.source, r.sourceLabel])).sort());
        const date = visible(value).map((r) => r.date).sort().at(-1);
        const result = !date ? "本机暂无健康记录，等待网页定时采集。"
          : before && fingerprint(before) === fingerprint(value)
            ? `没有新的本地记录，最新记录日期：${date}。`
            : `已载入本地记录，最新记录日期：${date}。`;
        setRefreshNotice(`本地检查完成（${localTime(new Date().toISOString())}）。${result}`);
      }
    } catch (e) {
      setError(`本地记录读取失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (manual) {
        manualRefresh.current = false;
        setRefreshing(false);
      }
    }
  }, [readHealth]);
  useEffect(() => {
    void refresh();
    const load = () => void refresh();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [refresh]);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const series = (data?.records || [])
    .filter((r) => r.metric === trend && r.date.length === 10)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.recordedAt.localeCompare(b.recordedAt),
    );
  const days = [...new Map(series.map((r) => [r.date, r])).values()].slice(-30);
  const range = days.map((r) => r.value),
    low = Math.min(...range),
    high = Math.max(...range);
  const points = days
    .map(
      (r, i) =>
        `${20 + (i * 560) / Math.max(1, days.length - 1)},${110 - ((r.value - low) * 80) / Math.max(1, high - low)}`,
    )
    .join(" ");
  return (
    <div className="operations">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PERSONAL HEALTH</span>
          <h1>照顾好自己，再把事情做好。</h1>
          <p>每个数字都有日期和来源。记录用于了解变化，不提供诊断。</p>
        </div>
        <button
          className="button subtle"
          onClick={() => void run(() => window.cs.healthOpen())}
        >
          打开 ChatGPT Health <ArrowUpRight size={15} />
        </button>
      </header>
      <div className="ops-notice">
        <HeartPulse size={18} />
        <div>
          <strong>{syncLabel(data)}</strong>
          <p>
            {data?.sync?.scheduleLabel ? `${data.sync.scheduleLabel}。` : "尚未配置定时任务。"}
            从已登录的 ChatGPT Health 网页读取，再保存到本机。需要 Mac、Codex 与 Chrome 可用；这是定时网页同步，不是官方实时接口。
          </p>
          <p>最近网页采集成功：{localTime(data?.sync?.lastSuccessAt)} · 上游最新记录日期：{data?.sync?.lastDataDate || "未知"}。读取成功不代表上游已更新。</p>
          {data?.sync?.error && <p className="ops-error" role="alert">{data.sync.error} · 尝试时间：{localTime(data.sync.lastAttemptAt)}</p>}
          <small>页面每 30 秒重读本机数据；可在 Codex 自动任务中暂停或调整频率。记录不进入内容项目或创作 Agent 上下文。</small>
          <p id="health-refresh-help">“刷新本地记录”立即重读已保存的数据，不会触发网页采集。新数据由定时任务读取后显示。</p>
        </div>
        <button className="button subtle" disabled={refreshing} aria-busy={refreshing} aria-describedby="health-refresh-help" onClick={() => void refresh(true)}>
          <RefreshCw size={14} className={refreshing ? "health-refresh-spinning" : undefined} />
          {refreshing ? "正在读取本地记录…" : "刷新本地记录"}
        </button>
      </div>
      {error && (
        <div role="alert" className="ops-error">
          {error}
          <button disabled={refreshing} onClick={() => void refresh(true)}>重新读取</button>
        </div>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" className="health-refresh-result">
        {refreshing ? "正在检查本机保存的健康记录…" : refreshNotice}
      </p>
      {notice && <p role="status">{notice}</p>}
      <div className="health-grid">
        {metrics.map(([key, label, unit]) => {
          const row = latest(data?.records || [], key);
          return (
            <section className="health-metric" key={key}>
              <span>{label}</span>
              <strong>
                {row
                  ? row.value.toLocaleString("zh-CN", {
                      maximumFractionDigits: 2,
                    })
                  : "—"}{" "}
                <small>{unit}</small>
              </strong>
              <p>
                {row ? row.date : "尚无记录"}{" "}
                {row && stale(row.date) && (
                  <b className="ops-warning">历史记录</b>
                )}
              </p>
              <small>{row ? row.sourceLabel : "等待数据源自动同步"}</small>
            </section>
          );
        })}
      </div>
      <div className="ops-two">
        <section className="ops-panel">
          <div className="ops-title">
            <h2>变化记录</h2>
            <select
              aria-label="趋势指标"
              value={trend}
              onChange={(e) => setTrend(e.target.value)}
            >
              {metrics.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <p className="muted">
            最近 30 个有记录的日期；不补齐缺失日期。月度旧记录只显示在概览中。
          </p>
          {days.length < 2 ? (
            <div className="ops-empty">
              {days.length
                ? "已有 1 个日期，再记录一天即可比较。"
                : "还没有可比较的每日记录。"}
            </div>
          ) : (
            <>
              <svg
                viewBox="0 0 600 140"
                role="img"
                aria-label={`${metrics.find((m) => m[0] === trend)?.[1]}记录折线图，横轴为有记录日期，缺失日期未补值`}
                className="health-chart"
              >
                <line x1="20" x2="580" y1="110" y2="110" stroke="var(--line)" />
                <polyline
                  points={points}
                  fill="none"
                  stroke="var(--accent-text)"
                  strokeWidth="3"
                />
                {days.map((r, i) => (
                  <circle
                    key={r.date}
                    cx={20 + (i * 560) / (days.length - 1)}
                    cy={110 - ((r.value - low) * 80) / Math.max(1, high - low)}
                    r="4"
                    fill="var(--accent-text)"
                  >
                    <title>
                      {r.date}：{r.value}
                    </title>
                  </circle>
                ))}
              </svg>
              <div className="ops-title">
                <small>
                  {days[0].date} · {days[0].value}
                </small>
                <small>
                  {days.at(-1)?.date} · {days.at(-1)?.value}
                </small>
              </div>
            </>
          )}
          <div className="health-history">
            {days
              .slice(-7)
              .reverse()
              .map((r) => (
                <div key={r.date}>
                  <span>{r.date}</span>
                  <strong>{r.value}</strong>
                  <small>{r.sourceLabel}</small>
                </div>
              ))}
          </div>
        </section>
        <section className="ops-panel">
          <h2>自动跟进，无需补录</h2>
          <p className="muted">活动、睡眠和静息心率来自已连接的 ChatGPT Health。新数据读取成功后会自动更新到这里。</p>
          <p className="muted">数据源暂未提供的指标保持空白；你无需填写。同步异常会显示原因，原有记录会保留。</p>
          <button
            className="button subtle ops-export"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await window.cs.healthExport();
                if (result) setNotice(`已导出：${result}`);
              })
            }
          >
            导出健康记录
          </button>
          <small className="ops-path">{data?.dataPath}</small>
        </section>
      </div>
    </div>
  );
}
