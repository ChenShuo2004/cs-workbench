import React, { useEffect, useMemo, useState } from "react";
import {
  LoaderCircle,
  Power,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import platforms from "../../shared/account-platforms.json";
import { PLATFORM_BRAND, PlatformIcon } from "../platform-icons";
import type {
  AccountPlatform,
  ClashReadResult,
  MediaFileInfo,
  PlatformAccount,
  PostDraft,
  PostRecord,
  Section,
} from "../types";
import { uiErrorMessage } from "../ui-error";

const ORDERED_PLATFORMS: AccountPlatform[] = [
  "bilibili",
  "douyin",
  "xiaohongshu",
  "channels",
  "wechat",
  "youtube",
  "x",
  "instagram",
];

const PLATFORM_CSS_COLOR: Record<AccountPlatform, string> = {
  bilibili: "#00a1d6",
  douyin: "#1d1d1f",
  xiaohongshu: "#ff2442",
  channels: "#fa9d3b",
  wechat: "#07c160",
  youtube: "#ff0033",
  x: "#6e6e73",
  instagram: "#d6246e",
};

const fmt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.round(n).toLocaleString("en-US")
    : "–";

const kfmt = (n: number | null | undefined) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  if (Math.abs(n) >= 100000) return `${(n / 10000).toFixed(1)} 万`;
  return fmt(n);
};

const sgn = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const dayStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function daysBack(n: number) {
  return Array.from({ length: n }, (_, i) =>
    dayStr(new Date(Date.now() - (n - 1 - i) * 864e5)),
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  const m = v / p;
  return (
    (m <= 1
      ? 1
      : m <= 1.5
        ? 1.5
        : m <= 2
          ? 2
          : m <= 3
            ? 3
            : m <= 4
              ? 4
              : m <= 5
                ? 5
                : m <= 7.5
                  ? 7.5
                  : 10) * p
  );
}

function interOf(
  kpis?: {
    likes: number | null;
    comments: number | null;
    saves: number | null;
    shares: number | null;
  } | null,
) {
  if (!kpis) return 0;
  return (
    (kpis.likes || 0) +
    (kpis.comments || 0) +
    (kpis.saves || 0) +
    (kpis.shares || 0)
  );
}

export function Dashboard({
  accounts,
  loading,
  onRefresh,
  onNavigate,
  onNotice,
}: {
  accounts: PlatformAccount[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (section: Section) => void;
  onNotice: (msg: string, error?: boolean) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [records, setRecords] = useState<PostRecord[]>([]);
  const [coverInfo, setCoverInfo] = useState<MediaFileInfo | null>(null);
  const [clash, setClash] = useState<ClashReadResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([
      window.cs
        .postsRead()
        .then((s) => {
          if (!live) return;
          setDraft(s.draft);
          setRecords(s.records || []);
          const coverPath =
            s.draft?.covers?.["3x4"] ||
            s.draft?.covers?.["16x9"] ||
            s.draft?.covers?.["4x3"] ||
            "";
          if (coverPath) {
            void window.cs
              .postsMediaInfo(coverPath)
              .then((info) => {
                if (live) setCoverInfo(info);
              })
              .catch(() => {});
          } else {
            setCoverInfo(null);
          }
        })
        .catch(() => {}),
      window.cs
        .clashRead()
        .then((c) => {
          if (live) setClash(c);
        })
        .catch(() => {}),
    ]);
    return () => {
      live = false;
    };
  }, [accounts.length]);

  const platformStats = useMemo(() => {
    const byPlatform = new Map<
      AccountPlatform,
      {
        platform: AccountPlatform;
        accounts: PlatformAccount[];
        fans: number | null;
        views: number | null;
        inter: number;
        deltaFans: number | null;
        daily: Record<string, number>;
        synced: boolean;
      }
    >();

    for (const pid of ORDERED_PLATFORMS) {
      const list = accounts.filter((a) => a.platform === pid);
      let fans = 0;
      let hasFans = false;
      let views = 0;
      let hasViews = false;
      let inter = 0;
      let deltaFans = 0;
      let hasDelta = false;
      let synced = false;
      const dailyByAcc = new Map<string, Record<string, number>>();
      const allDays = new Set<string>();

      for (const a of list) {
        if (a.dataSnapshot) synced = true;
        const k = a.dataSnapshot?.kpis;
        if (k?.followers != null) {
          fans += k.followers;
          hasFans = true;
        }
        if (k?.views != null) {
          views += k.views;
          hasViews = true;
        }
        inter += interOf(k);
        if (a.dataSnapshot?.deltas?.followers != null) {
          deltaFans += a.dataSnapshot.deltas.followers;
          hasDelta = true;
        }
        const m: Record<string, number> = {};
        for (const h of a.dataSnapshot?.history || []) {
          if (typeof h.kpis?.followers === "number") {
            const d = h.capturedAt.slice(0, 10);
            m[d] = h.kpis.followers;
            allDays.add(d);
          }
        }
        if (Object.keys(m).length) dailyByAcc.set(a.id, m);
      }

      const daily: Record<string, number> = {};
      const sortedDays = [...allDays].sort();
      const carry = new Map<string, number>();
      for (const d of sortedDays) {
        let sum = 0;
        for (const [accId, m] of dailyByAcc.entries()) {
          if (m[d] != null) carry.set(accId, m[d]);
          if (carry.has(accId)) sum += carry.get(accId)!;
        }
        daily[d] = sum;
      }

      byPlatform.set(pid, {
        platform: pid,
        accounts: list,
        fans: hasFans ? fans : null,
        views: hasViews ? views : null,
        inter,
        deltaFans: hasDelta ? deltaFans : null,
        daily,
        synced,
      });
    }

    return byPlatform;
  }, [accounts]);

  const activePlatforms = useMemo(
    () =>
      ORDERED_PLATFORMS.filter(
        (pid) => (platformStats.get(pid)?.accounts.length || 0) > 0,
      ),
    [platformStats],
  );

  const summary = useMemo(() => {
    let fansTotal = 0;
    let hasFans = false;
    let viewsTotal = 0;
    let interTotal = 0;
    let deltaTotal = 0;
    let hasDelta = false;
    for (const pid of activePlatforms) {
      const s = platformStats.get(pid)!;
      if (s.fans != null) {
        fansTotal += s.fans;
        hasFans = true;
      }
      if (s.views != null) viewsTotal += s.views;
      interTotal += s.inter;
      if (s.deltaFans != null) {
        deltaTotal += s.deltaFans;
        hasDelta = true;
      }
    }
    const onlineCount = accounts.filter((a) => a.dataConnected).length;
    const isolatedCount = accounts.filter((a) => a.network.mode !== "direct").length;
    const loginBad = accounts.filter((a) => a.error && /登录|扫码/.test(a.error)).length;
    const syncedCount = accounts.filter((a) => Boolean(a.dataSnapshot)).length;
    return {
      fansTotal,
      hasFans,
      viewsTotal,
      interTotal,
      deltaTotal,
      hasDelta,
      onlineCount,
      isolatedCount,
      loginBad,
      syncedCount,
    };
  }, [accounts, activePlatforms, platformStats]);

  const barChart = useMemo(() => {
    const days = daysBack(30);
    const rows = days.map((d) => {
      const prevD = dayStr(new Date(new Date(`${d}T12:00`).getTime() - 864e5));
      const segs: { p: AccountPlatform; v: number }[] = [];
      for (const pid of activePlatforms) {
        const daily = platformStats.get(pid)?.daily || {};
        if (daily[d] != null && daily[prevD] != null) {
          const diff = daily[d] - daily[prevD];
          if (diff > 0) segs.push({ p: pid, v: diff });
        }
      }
      const tot = segs.reduce((s, x) => s + x.v, 0);
      return { d, segs, tot };
    });
    const maxTot = Math.max(...rows.map((r) => r.tot), 0);
    return { days, rows, top: niceMax(Math.max(maxTot, 1)), hasAny: maxTot > 0 };
  }, [activePlatforms, platformStats]);

  const latestByPlatform = useMemo(() => {
    const m = new Map<AccountPlatform, PostRecord>();
    for (const r of records) {
      if (!m.has(r.platform)) m.set(r.platform, r);
    }
    return m;
  }, [records]);

  const insights = useMemo(() => {
    const out: { cls: string; tag: string; text: React.ReactNode }[] = [];
    const withFans = activePlatforms
      .map((p) => ({ p, v: platformStats.get(p)!.fans }))
      .filter((x): x is { p: AccountPlatform; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v);

    if (withFans.length && summary.fansTotal > 0) {
      const top = withFans[0];
      const share = ((top.v / summary.fansTotal) * 100).toFixed(0);
      out.push({
        cls: "k3",
        tag: "主力",
        text: (
          <>
            粉丝最多的是 <b>{platforms[top.p].name} {fmt(top.v)}</b>，占全平台合计的 <b>{share}%</b>。
          </>
        ),
      });
    }

    const withGain = activePlatforms
      .map((p) => ({ p, v: platformStats.get(p)!.deltaFans }))
      .filter((x): x is { p: AccountPlatform; v: number } => x.v != null && x.v !== 0)
      .sort((a, b) => b.v - a.v);
    if (withGain.length) {
      out.push({
        cls: "k3",
        tag: "涨粉",
        text: (
          <>
            较上次快照增长最多的是 <b>{platforms[withGain[0].p].name} {sgn(withGain[0].v)}</b>。
          </>
        ),
      });
    }

    const waiting = records.filter((r) => r.status === "待你确认").length;
    if (waiting > 0) {
      out.push({
        cls: "k4",
        tag: "待确认",
        text: (
          <>
            有 <b>{waiting} 个平台</b> 表单已自动填好，停在发布按钮前等你人工检查点发。
          </>
        ),
      });
    }

    if (summary.loginBad > 0) {
      out.push({
        cls: "",
        tag: "登录",
        text: (
          <>
            有 <b>{summary.loginBad} 个账号</b> 登录态失效，点「账号与数据」打开对应窗口扫码即可。
          </>
        ),
      });
    }

    if (summary.syncedCount < accounts.length) {
      out.push({
        cls: "",
        tag: "同步",
        text: (
          <>
            还有 <b>{accounts.length - summary.syncedCount} 个账号</b> 未采集快照，点「同步数据」自动抓取并在完成后自动关闭浏览器。
          </>
        ),
      });
    }

    return out.slice(0, 5);
  }, [accounts.length, activePlatforms, platformStats, records, summary]);

  async function syncAll() {
    setSyncing(true);
    try {
      await window.cs.syncAll();
      await onRefresh();
      onNotice("全平台同步完成，抓取浏览器已自动关闭");
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setSyncing(false);
    }
  }

  async function closeAllWindows() {
    try {
      await window.cs.closeAll();
      await onRefresh();
      onNotice("已关闭全部已打开的账号浏览器");
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    }
  }

  const pubDoneCount = records.filter((r) => r.status.startsWith("已发布")).length;
  const waitingCount = records.filter((r) => r.status === "待你确认").length;
  const failedCount = records.filter((r) => r.status === "失败").length;
  const heroTitle = draft?.title?.trim() || "准备发布下一期内容";
  const heroStatus = failedCount
    ? `${failedCount} 个平台异常`
    : waitingCount
      ? `${waitingCount} 个平台等你点发布`
      : pubDoneCount
        ? `累计已发 ${pubDoneCount} 条`
        : `${accounts.length} 个独立隔离账号就绪`;

  return (
    <div
      className="kaige-board"
      onMouseMove={(e) => {
        const t = (e.target as HTMLElement)?.closest?.("[data-tip]") as HTMLElement | null;
        if (!t || !t.dataset.tip) {
          if (tip) setTip(null);
          return;
        }
        setTip({
          text: t.dataset.tip,
          x: Math.min(window.innerWidth - 220, e.clientX + 14),
          y: Math.max(12, e.clientY - 38),
        });
      }}
      onMouseLeave={() => setTip(null)}
    >
      <div className="kb-bgfx" />

      <div className="kb-screen">
        <header className="kb-top">
          <h1 className="kb-logo">
            Ka<i>ige</i>
          </h1>
          <div className="kb-tag">内容与粉丝监控</div>

          <div className="kb-actions">
            <button
              className="kb-btn pri"
              disabled={syncing || loading || !accounts.length}
              onClick={() => void syncAll()}
            >
              {syncing ? (
                <LoaderCircle size={13} className="spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {syncing ? "自动抓取中…" : "同步数据"}
            </button>
            <button className="kb-btn" onClick={() => onNavigate("publish")}>
              <UploadCloud size={13} /> 一稿多发
            </button>
            {summary.onlineCount > 0 && (
              <button className="kb-btn" onClick={() => void closeAllWindows()}>
                <Power size={13} /> 关窗 ({summary.onlineCount})
              </button>
            )}
          </div>

          <div className="kb-lights">
            <span
              className={`kb-light ${summary.isolatedCount === accounts.length && accounts.length > 0 ? "ok" : "warn"}`}
              onClick={() => onNavigate("network")}
            >
              代理隔离 {summary.isolatedCount}/{accounts.length}
            </span>
            <span
              className={`kb-light ${clash?.listeners?.length ? "ok" : "warn"}`}
              onClick={() => onNavigate("network")}
            >
              Clash {clash?.listeners?.length || 0} 端口
            </span>
            <span
              className={`kb-light ${summary.loginBad ? "bad" : summary.syncedCount > 0 ? "ok" : "warn"}`}
              onClick={() => onNavigate("accounts")}
            >
              账号{" "}
              {summary.loginBad
                ? `${summary.loginBad} 需扫码`
                : `${summary.syncedCount}/${accounts.length} 已同步`}
            </span>
          </div>

          <div className="kb-clock">
            <small>
              {now.getMonth() + 1}/{now.getDate()} 周{"日一二三四五六"[now.getDay()]}
            </small>
            {pad(now.getHours())}:{pad(now.getMinutes())}
          </div>
        </header>

        <div className="kb-r1">
          <section className="kb-panel kb-hero">
            {coverInfo?.previewDataUrl && (
              <div
                className="kb-amb"
                style={{ backgroundImage: `url('${coverInfo.previewDataUrl}')` }}
              />
            )}
            <div className="kb-stage">
              <div className="kb-float">
                <div
                  className="kb-cv"
                  role="button"
                  tabIndex={0}
                  onClick={() => onNavigate("publish")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onNavigate("publish");
                  }}
                >
                  <i className="kb-edge" />
                  {coverInfo?.previewDataUrl ? (
                    <img src={coverInfo.previewDataUrl} alt="当前草稿封面" />
                  ) : (
                    <div className="kb-cv-fallback">
                      <span>Kaige</span>
                      <small>{accounts.length} 矩阵号</small>
                    </div>
                  )}
                  <i className="kb-glare" />
                  <span className="kb-tagz a">Kaige 发布台</span>
                  <span className="kb-tagz b">
                    <i />
                    {activePlatforms.length} 平台就绪
                  </span>
                </div>
              </div>
            </div>

            <div className="kb-inf">
              <div className="kb-eyebrow">
                {waitingCount ? "发布待确认" : draft?.title ? "当前草稿" : "分发工作台"}
              </div>
              <h2>{heroTitle}</h2>
              <div className="kb-when">
                <span>{heroStatus}</span>
              </div>

              <div className="kb-plats">
                {activePlatforms.map((pid) => {
                  const rec = latestByPlatform.get(pid);
                  const st = platformStats.get(pid)!;
                  const cls =
                    rec?.status.startsWith("已发布")
                      ? "on"
                      : rec?.status === "待你确认"
                        ? "todo"
                        : rec?.status === "失败"
                          ? "bad"
                          : "";
                  return (
                    <button
                      type="button"
                      key={pid}
                      className={`kb-pl ${cls}`}
                      onClick={() => onNavigate("accounts")}
                      data-tip={`${platforms[pid].name} · ${st.accounts.length} 个账号\n${rec ? `最近任务：${rec.status}` : st.synced ? "已采集快照" : "等待同步"}`}
                    >
                      <PlatformIcon platform={pid} size={22} />
                      <div>
                        <b>{platforms[pid].name}</b>
                        <span>
                          {rec
                            ? rec.status
                            : st.views != null
                              ? `${kfmt(st.views)} 播`
                              : `${st.accounts.length} 号`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="kb-nums">
                <div>
                  <div className="kb-lab">全平台播放</div>
                  <div className="kb-val">
                    {summary.viewsTotal > 0 ? kfmt(summary.viewsTotal) : "–"}
                  </div>
                </div>
                <div>
                  <div className="kb-lab">互动（赞评藏转）</div>
                  <div className="kb-val">
                    {summary.interTotal > 0 ? kfmt(summary.interTotal) : "–"}
                  </div>
                </div>
                <div>
                  <div className="kb-lab">互动率</div>
                  <div className="kb-val">
                    {summary.viewsTotal > 0
                      ? `${((summary.interTotal / summary.viewsTotal) * 100).toFixed(1)}%`
                      : "–"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="kb-panel kb-fans">
            <div className="kb-ph">
              <h3>粉丝</h3>
              <span className="kb-note">{activePlatforms.length} 个平台合计</span>
            </div>
            <div className="kb-headline">
              <div className="kb-val xl">
                {summary.hasFans ? fmt(summary.fansTotal) : "–"}
              </div>
              <div className="kb-g">
                {summary.hasDelta && (
                  <span className="kb-gpill">
                    较上次
                    <b className={summary.deltaTotal < 0 ? "neg" : ""}>
                      {sgn(summary.deltaTotal)}
                    </b>
                  </span>
                )}
              </div>
            </div>
            <div className="kb-ph" style={{ marginTop: 10, marginBottom: 4 }}>
              <h3 style={{ fontSize: 12.5, color: "var(--kb-t2)", fontWeight: 500 }}>
                每日净增 · 近 30 天
              </h3>
            </div>
            <div className="kb-pb kb-chart">
              {barChart.hasAny ? (
                <svg viewBox="0 0 420 150" preserveAspectRatio="none" className="kb-bars-svg">
                  {[0, barChart.top / 2, barChart.top].map((t, idx) => {
                    const y = 128 - (t / barChart.top) * 108;
                    return (
                      <g key={idx}>
                        <line x1="34" x2="414" y1={y} y2={y} stroke="rgba(0,0,0,0.07)" />
                        <text x="28" y={y + 3} textAnchor="end">
                          {t ? `+${fmt(t)}` : "0"}
                        </text>
                      </g>
                    );
                  })}
                  {barChart.rows.map((r, i) => {
                    const band = 380 / barChart.rows.length;
                    const bw = Math.max(4, Math.min(11, band - 3));
                    const x = 34 + i * band + (band - bw) / 2;
                    let acc = 0;
                    return (
                      <g key={r.d}>
                        {r.segs.map((g, j) => {
                          const y1 = 128 - (acc / barChart.top) * 108;
                          const y2 = 128 - ((acc + g.v) / barChart.top) * 108;
                          acc += g.v;
                          return (
                            <rect
                              key={j}
                              x={x}
                              y={y2}
                              width={bw}
                              height={Math.max(2, y1 - y2)}
                              rx={2}
                              fill={PLATFORM_CSS_COLOR[g.p]}
                              data-tip={`${r.d.slice(5)}\n${platforms[g.p].name} +${fmt(g.v)}`}
                            />
                          );
                        })}
                        {(i % 6 === 0 || i === barChart.rows.length - 1) && (
                          <text x={x + bw / 2} y="145" textAnchor="middle">
                            {r.d.slice(5)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <div className="kb-empty">
                  点击右上角「同步数据」记录每日快照后，这里自动显示 30 天按平台堆叠涨粉柱状图
                </div>
              )}
            </div>
            <div className="kb-cap">
              抓数据完成后自动关闭后台浏览器，不占桌面窗口
            </div>
          </section>

          <section className="kb-panel">
            <div className="kb-ph">
              <h3>数据分析</h3>
              <span className="kb-note">实时按快照计算</span>
            </div>
            <div className="kb-pb kb-ins">
              {insights.length ? (
                insights.map((item, i) => (
                  <div className="kb-in" key={i}>
                    <em className={item.cls}>{item.tag}</em>
                    <div>{item.text}</div>
                  </div>
                ))
              ) : (
                <div className="kb-empty">同步数据后这里会自动生成分析结论</div>
              )}
            </div>
          </section>
        </div>

        <div
          className="kb-cards"
          style={{ ["--n" as string]: Math.max(4, activePlatforms.length) }}
        >
          {activePlatforms.map((pid) => {
            const st = platformStats.get(pid)!;
            const brand = PLATFORM_BRAND[pid];
            const color = PLATFORM_CSS_COLOR[pid];
            const histDays = Object.keys(st.daily).sort().slice(-30);
            const vals = histDays.map((d) => st.daily[d]);
            const pts =
              vals.length >= 2
                ? (() => {
                    const lo = Math.min(...vals);
                    const hi = Math.max(...vals);
                    const sp = Math.max(1, hi - lo);
                    return vals
                      .map(
                        (v, i) =>
                          `${((i / (vals.length - 1)) * 200).toFixed(1)},${(37 - ((v - lo) / sp) * 32).toFixed(1)}`,
                      )
                      .join(" ");
                  })()
                : "";

            return (
              <article
                className="kb-panel kb-pc"
                key={pid}
                style={{ ["--c" as string]: color }}
                onClick={() => onNavigate("accounts")}
              >
                <div className="kb-nm">
                  <PlatformIcon platform={pid} size={26} />
                  <span>{platforms[pid].name}</span>
                  <small>{brand.fanUnit}</small>
                </div>
                <div className="kb-val">{kfmt(st.fans)}</div>
                <div className="kb-gl">
                  {st.deltaFans != null ? (
                    <span className="kb-gpill">
                      变化
                      <b className={st.deltaFans < 0 ? "neg" : ""}>
                        {sgn(st.deltaFans)}
                      </b>
                    </span>
                  ) : (
                    <span className="kb-gpill">{st.accounts.length} 个账号</span>
                  )}
                </div>
                <div className="kb-sp">
                  {pts && (
                    <svg viewBox="0 0 200 40" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={`kbsl-${pid}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                          <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <polygon points={`0,40 ${pts} 200,40`} fill={`url(#kbsl-${pid})`} />
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  )}
                </div>
                <div className="kb-ft">
                  <div>
                    <span>播放</span>
                    <b>{kfmt(st.views)}</b>
                  </div>
                  <div>
                    <span>互动</span>
                    <b>{st.synced ? kfmt(st.inter) : "–"}</b>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {tip && (
        <div className="kb-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
