import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FolderOpen, RefreshCw, Copy, ImagePlus, Settings2 } from "lucide-react";
import type { ReunionJob, ReunionSnapshot } from "./types";
import "./reunion.css";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function Preview({ job, role }: { job: ReunionJob; role: "screenshot" | "portrait" | "photo" }) {
  const [url, setURL] = useState("");
  useEffect(() => {
    let active = true;
    setURL("");
    window.cs.reunionMedia(job.id, role).then(value => { if (active) setURL(value); }).catch(() => {});
    return () => { active = false; };
  }, [job.id, job.status, role]);
  return url ? <img src={url} alt={role === "screenshot" ? "原始评论截图" : role === "photo" ? "提取的亲人照片" : "AI辅助大头照"} /> : <span>尚未就绪</span>;
}
export function Reunion() {
  const [data, setData] = useState<ReunionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [remoteId, setRemoteId] = useState("");
  const [drag, setDrag] = useState(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++revision.current;
    try { const result = await window.cs.reunionRead(); if (seq === revision.current) { setData(result); setError(""); } }
    catch (e) { if (seq === revision.current) setError(message(e)); }
  }, []);
  useEffect(() => { void refresh(); return window.cs.onReunionChanged(() => { void refresh(); }); }, [refresh]);
  const importScreenshots = async (files?: File[]) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await window.cs.reunionImport(files);
      if (result) {
        setData(result.snapshot);
        if (result.added[0]) setSelected(result.added[0]);
        setNotice(`已加入 ${result.added.length} 张${result.skipped.length ? `，跳过 ${result.skipped.length} 张重复截图` : ""}`);
        if (result.rejected.length) setError(result.rejected.map(r => `${r.name}：${r.error}`).join("；"));
      }
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  };
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); await refresh(); } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  };
  const job = data?.jobs.find(j => j.id === selected) || data?.jobs[0];
  const configured = data?.analyzerAvailable && Object.values(data.presets).every(Boolean);
  const pending = data?.jobs.filter(j => ["queued", "analyzing", "portrait_submitting", "portrait_running", "packaging"].includes(j.status)).length || 0;
  const ready = data?.jobs.filter(j => j.status === "ready").length || 0;
  return <div className="reunion-page">
    <div className="page-heading"><div><span className="eyebrow">COMMENT TO REUNION</span><h1>亲人重逢</h1><p>放入评论截图，自动准备大头照、17秒文案与全能参考上传包。</p></div>
      <button className="button subtle" onClick={() => void refresh()}><RefreshCw size={16} />刷新任务</button></div>
    {error && <div className="reunion-error" role="alert">{error}</div>}
    {notice && <div className="reunion-notice" role="status">{notice}</div>}
    <div className="reunion-summary"><span><b>{pending}</b> 处理中</span><span><b>{ready}</b> 上传包就绪</span><span>17秒 · 开头直接进入情绪 · 结尾两秒停留</span></div>
    <details className="reunion-settings"><summary><Settings2 size={15} />固定参考与输出位置 {data && !configured ? "· 需要设置" : "· 已预设"}</summary>
      {data && <div className="reunion-preset-grid">{(["host", "scene", "television", "output"] as const).map((kind, index) => <div key={kind}>
        <b>{["男主参考", "老屋场景", "旧电视", "输出文件夹"][index]}</b><p>{data.settings[kind]}</p>
        {kind !== "output" && !data.presets[kind] && <span className="reunion-error-text">文件未找到</span>}
        <button className="button subtle small" disabled={busy} onClick={() => void action(() => window.cs.reunionSetting(kind))}>更换{["男主参考", "老屋场景", "旧电视", "输出文件夹"][index]}</button>
      </div>)}</div>}
      <p>固定素材只需设置一次。截图识别使用已登录的 Codex；大头照沿用本机生图连接和账户额度。</p>
      {data && !data.analyzerAvailable && <p role="alert">未找到 Codex CLI，请先在 Agent 助手中配置。</p>}
    </details>
    <div className={`reunion-upload ${drag ? "dragging" : ""}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (!busy && configured) void importScreenshots(Array.from(e.dataTransfer.files)); }}>
      <ImagePlus size={28} /><div><b>将评论截图拖到这里</b><p>一次最多50张 · 每张独立任务 · 自动跳过重复截图</p></div>
      <button className="button primary" disabled={busy || !configured} onClick={() => void importScreenshots()}><Upload size={16} />{busy ? "正在处理…" : "选择截图并开始"}</button>
    </div>
    {!data ? <p role="status">正在读取任务…</p> : !data.jobs.length ? <div className="reunion-empty">
      <h2>从一张评论截图开始</h2><p>识别评论与亲人照片 → 提取原图 → 制作大头照 → 编写17秒文案与转场 → 整理上传包</p><p>没有照片或关系不明确时，会标出需要核对的原因。这里只准备素材，不提交视频生成。</p>
    </div> : <div className="reunion-layout">
      <nav aria-label="截图批量任务" className="reunion-list">{data.jobs.map(item => <button key={item.id} className={job?.id === item.id ? "selected" : ""} onClick={() => { setSelected(item.id); setRemoteId(""); }}>
        <span><b>{item.relation || "评论截图"}</b><small>{item.name}</small></span><em data-status={item.status}>{item.stage}</em>
      </button>)}</nav>
      {job && <section className="reunion-detail" aria-label="任务详情">
        <header><div><h2>{job.relation ? `${job.relation}重逢` : job.name}</h2><p role="status">{job.stage}</p></div>
          <button className="button subtle small" onClick={() => void action(() => window.cs.reunionFolder(job.id))}><FolderOpen size={15} />打开文件夹</button></header>
        <div className="reunion-images"><figure><Preview job={job} role="screenshot" /><figcaption>原始截图</figcaption></figure><figure><Preview job={job} role="photo" /><figcaption>提取原照片</figcaption></figure><figure><Preview job={job} role="portrait" /><figcaption>AI辅助大头照</figcaption></figure></div>
        {job.comment && <blockquote>{job.comment}</blockquote>}
        {job.facts.length > 0 && <p className="reunion-facts">截图事实：{job.facts.join("；")}</p>}
        {job.dialogue.length > 0 && <div className="reunion-dialogue"><b>17秒创作对白</b>{job.dialogue.map((line, i) => <p key={i}><small>{i === 0 ? "男主" : "亲人"}</small>{line}</p>)}<small>新写对白，不是亲人生前原话。大头照含AI补全细节。</small></div>}
        {job.error && <div className="reunion-error" role="alert">{job.error}</div>}
        {["failed", "needs_review", "interrupted", "cancelled", "paused"].includes(job.status) && <button className="button primary" disabled={busy} onClick={() => void action(() => window.cs.reunionRetry(job.id))}>{job.status === "paused" ? "继续查询原任务" : "重试这条"}</button>}
        {["queued", "portrait_running"].includes(job.status) && <button className="button subtle" disabled={busy} onClick={() => void action(() => window.cs.reunionPause(job.id))}>{job.status === "queued" ? "取消排队" : "暂停查询"}</button>}
        {job.status === "uncertain" && <div><label>服务端原任务编号<input aria-label="服务端原任务编号" value={remoteId} onChange={e => setRemoteId(e.target.value)} /></label><button className="button subtle" disabled={busy || !remoteId.trim()} onClick={() => void action(() => window.cs.reunionRecover(job.id, remoteId.trim()))}>关联原任务并继续查询</button></div>}
        {job.status === "ready" && <><div className="reunion-prompt-title"><b>全能参考完整视频提示词</b><button className="button subtle small" onClick={() => void action(async () => { await window.cs.copy(job.prompt); setNotice("已复制17秒提示词"); })}><Copy size={15} />复制提示词</button></div><textarea readOnly aria-label="17秒完整提示词" value={job.prompt} /><p>上传包已包含5张参考图与提示词。检查人物相似度后，在你使用的全能参考工具中生成视频。</p></>}
      </section>}
    </div>}
  </div>;
}
