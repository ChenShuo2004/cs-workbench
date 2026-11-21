import { videoModel, videoModelChange } from "./video-models";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Film,
  ImagePlus,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type {
  GenerationInput,
  GenerationJob,
  GenerationStatus,
  StudioState,
} from "./types";
import "./studio-generation.css";

const active = (job: GenerationJob) =>
  ["queued", "submitting", "running", "saving"].includes(job.status);
export function StudioGeneration({
  root,
  state,
  open,
  close,
  attach,
  saveDraft,
}: {
  root: string;
  state: StudioState | null;
  open: boolean;
  close: () => void;
  attach: (job: GenerationJob) => Promise<void>;
  saveDraft: (draft: GenerationInput) => void;
}) {
  const initial: GenerationInput = {
    kind: "image",
    prompt: "",
    aspect: state?.aspect || "16:9",
    duration: 5,
    referenceId: "",
    model: "",
  };
  const draft = state?.canvas?.generationDraft || initial;
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [connection, setConnection] = useState<GenerationStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState("");
  const [autoErrors, setAutoErrors] = useState<Record<string, string>>({});
  const processing = useRef(new Set<string>());
  const attempted = useRef(new Set<string>());
  const attachRef = useRef(attach);
  attachRef.current = attach;
  const prompt = useRef<HTMLTextAreaElement>(null);
  const edit = (p: Partial<GenerationInput>) => saveDraft({ ...draft, ...p });
  const check = async () => {
    setChecking(true);
    try {
      setConnection(await window.cs.generationStatus());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    prompt.current?.focus();
    if (!connection) void check();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  useEffect(() => {
    let live = true,
      loading = false;
    setJobs([]);
    setAutoErrors({});
    attempted.current.clear();
    if (!root) return;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const rows = await window.cs.generationList(root);
        if (!live) return;
        setJobs(rows);
        for (const job of rows.filter(
          (j) => j.status === "completed" && !j.applied,
        )) {
          if (
            !live ||
            processing.current.has(job.id) ||
            attempted.current.has(job.id)
          )
            continue;
          processing.current.add(job.id);
          attempted.current.add(job.id);
          try {
            await attachRef.current(job);
          } catch (e) {
            if (live)
              setAutoErrors((v) => ({
                ...v,
                [job.id]: e instanceof Error ? e.message : String(e),
              }));
          } finally {
            processing.current.delete(job.id);
          }
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally {
        loading = false;
      }
    };
    void refresh();
    const off = window.cs.onGenerationChanged(() => void refresh());
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      live = false;
      off();
      clearInterval(timer);
    };
  }, [root]);
  const run = async (operation: () => Promise<unknown>) => {
    try {
      setError("");
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const submit = async () => {
    if (sending) return;
    setSending(true);
    await run(() => window.cs.generationEnqueue(root, draft));
    setSending(false);
  };
  const ready =
    draft.kind === "image" ? connection?.imageReady : connection?.video.ready;
  if (!open) return null;
  return (
    <aside
      className="sg-panel"
      role="dialog"
      aria-label="AI 生成面板"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <header>
        <div>
          <span>CREATE WITH AI</span>
          <h2>
            <Sparkles size={19} /> 在画布里生成
          </h2>
        </div>
        <button aria-label="关闭 AI 生成面板" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div className="sg-body">
        <div className="sg-tabs" role="group" aria-label="生成类型">
          <button
            aria-pressed={draft.kind === "image"}
            onClick={() => edit({ kind: "image" })}
          >
            <ImagePlus size={16} /> AI 生图
          </button>
          <button
            aria-pressed={draft.kind === "video"}
            onClick={() =>
              edit({
                kind: "video",
                duration: Math.max(4, draft.duration),
                ...videoModelChange(
                  draft.model || "MiniMax-H3",
                  draft.resolution,
                ),
              })
            }
          >
            <Film size={16} /> AI 视频
          </button>
        </div>
        <div className="sg-connection">
          <span className={ready ? "ready" : ""} />{" "}
          <b>{draft.kind === "image" ? "Codex 内置生图" : "视频生成服务"}</b>
          <button
            aria-label="刷新生成服务连接"
            disabled={checking}
            onClick={() => void check()}
          >
            <RefreshCw size={14} className={checking ? "spin" : ""} />
          </button>
        </div>
        <p className="sg-hint">
          {checking
            ? "正在检查连接…"
            : draft.kind === "image"
              ? connection?.imageDetail || "打开面板后检查本机生图连接"
              : connection?.video.detail || "连接你的视频 API 服务后即可生成"}
        </p>
        {error && (
          <p role="alert" className="sg-error">
            {error}
          </p>
        )}
        {draft.kind === "video" && (
          <details className="sg-config">
            <summary>
              {connection?.video.ready
                ? "更换秘塔 API Key"
                : "配置秘塔 API Key"}
            </summary>
            <label>
              API Key
              <input
                type="password"
                aria-label="秘塔 API Key"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="mk-…"
              />
            </label>
            <button
              disabled={configuring || !apiKey.trim()}
              onClick={() =>
                void run(async () => {
                  setConfiguring(true);
                  try {
                    const video =
                      await window.cs.generationConfigureVideo(apiKey);
                    setApiKey("");
                    setConnection((v) => ({
                      imageReady: v?.imageReady || false,
                      imageDetail: v?.imageDetail || "",
                      video,
                    }));
                  } finally {
                    setConfiguring(false);
                  }
                })
              }
            >
              {configuring ? "正在保存…" : "加密保存密钥"}
            </button>
            <p className="sg-hint">
              密钥由系统加密保存在本机，不写入工程或生成记录。此处保存不产生生成费用。
            </p>
          </details>
        )}
        <label>
          画面描述
          <textarea
            ref={prompt}
            aria-label="AI 生成提示词"
            value={draft.prompt}
            maxLength={4000}
            rows={5}
            placeholder={
              draft.kind === "image"
                ? "描述主体、场景、光线、风格，以及画面里需要出现的文字…"
                : "描述场景、角色动作、镜头运动和声音…"
            }
            onChange={(e) => edit({ prompt: e.target.value })}
          />
        </label>
        <label>
          {draft.kind === "image" ? "参考图片（可选）" : "首帧图片（可选）"}
          <select
            aria-label="AI 生成参考图片"
            value={draft.referenceId}
            onChange={(e) => edit({ referenceId: e.target.value })}
          >
            <option value="">
              {draft.kind === "image" ? "从文字生成新图" : "从文字生成视频"}
            </option>
            {state?.media
              .filter((m) => m.kind === "image")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        {draft.referenceId && (
          <p className="sg-hint">
            生成时会将所选图片交给当前生成服务作为参考。
            {draft.kind === "video" && "视频比例跟随首帧图片。"}
          </p>
        )}
        <div className="sg-options">
          <label>
            画面比例
            <select
              aria-label="AI 生成比例"
              disabled={draft.kind === "video" && !!draft.referenceId}
              value={draft.aspect}
              onChange={(e) => edit({ aspect: e.target.value })}
            >
              {["16:9", "9:16", "4:3", "1:1"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            {draft.kind === "image" ? "镜头停留" : "视频时长"}
            <select
              aria-label="AI 生成时长"
              value={draft.duration}
              onChange={(e) => edit({ duration: Number(e.target.value) })}
            >
              {(draft.kind === "video"
                ? Array.from({ length: 12 }, (_, i) => i + 4)
                : [3, 5, 8, 10, 15]
              ).map((t) => (
                <option value={t} key={t}>
                  {t} 秒
                </option>
              ))}
            </select>
          </label>
        </div>
        {draft.kind === "video" && (
          <label>
            视频分辨率
            <select
              aria-label="AI 视频分辨率"
              value={draft.resolution || "1080P"}
              onChange={(e) =>
                edit({
                  resolution: e.target.value as GenerationInput["resolution"],
                })
              }
            >
              {videoModel(draft.model).resolutions.map((r) => (
                <option key={r} value={r}>
                  {r === "1080P" ? "1080P · 原生生成" : r}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.kind === "video" && draft.resolution === "1080P" && (
          <p className="sg-hint">直接请求原生 1080P，按所选模型与时长计费。</p>
        )}
        {draft.kind === "video" && !!connection?.video.models.length && (
          <label>
            视频模型
            <select
              aria-label="AI 视频模型"
              value={draft.model}
              onChange={(e) =>
                edit(videoModelChange(e.target.value, draft.resolution))
              }
            >
              <option value="">服务默认模型</option>
              {connection.video.models.map((m) => (
                <option key={m} value={m}>
                  {videoModel(m).label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="sg-generate"
          disabled={!root || !ready || sending || !draft.prompt.trim()}
          onClick={() => void submit()}
        >
          {sending ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Sparkles size={17} />
          )}
          {sending
            ? "正在加入任务"
            : draft.kind === "image"
              ? "生成图片并加入画布"
              : "生成视频并加入画布"}
        </button>
        <p className="sg-hint">
          {draft.kind === "image"
            ? "使用现有 Codex 账户额度，实际尺寸由模型决定。"
            : "使用所连接服务的 API 额度。"}
          完成后自动保存到当前项目，不覆盖原镜头。关闭面板可继续编辑。
        </p>
        <div className="sg-history-title">
          <h3>生成记录</h3>
          <span>
            {jobs.filter(active).length
              ? `${jobs.filter(active).length} 个任务进行中`
              : `${jobs.length} 个任务`}
          </span>
        </div>
        {!jobs.length && (
          <div className="sg-empty">
            <Sparkles size={25} />
            <p>从一句描述开始。</p>
            <span>生成的图片和视频会出现在这里。</span>
          </div>
        )}
        <div className="sg-jobs">
          {jobs.map((job) => (
            <article key={job.id} className="sg-job">
              <div className="sg-job-title">
                {job.kind === "image" ? (
                  <ImagePlus size={15} />
                ) : (
                  <Film size={15} />
                )}
                <b>{job.stage}</b>
                {active(job) && <LoaderCircle className="spin" size={14} />}
                {job.status === "completed" && <Check size={16} />}
              </div>
              <p>{job.prompt}</p>
              <small>
                {job.referenceId && job.kind === "video"
                  ? "跟随首帧"
                  : job.aspect}{" "}
                · {job.duration}s ·{" "}
                {job.kind === "video"
                  ? `${videoModel(job.model).label} · `
                  : ""}
                {job.resolution
                  ? `${job.resolution}${job.legacy1080Transcode ? "（历史转码任务）" : ""} · `
                  : ""}{" "}
                {new Date(job.createdAt).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
              {job.error && <p className="sg-error">{job.error}</p>}
              {autoErrors[job.id] && (
                <p className="sg-error">加入画布未完成：{autoErrors[job.id]}</p>
              )}
              <div className="sg-job-actions">
                {job.status === "completed" &&
                  (job.applied ? (
                    <span>已加入画布，可继续精剪</span>
                  ) : (
                    <button
                      onClick={() =>
                        void run(async () => {
                          await attachRef.current(job);
                          setAutoErrors((v) => {
                            const next = { ...v };
                            delete next[job.id];
                            return next;
                          });
                        })
                      }
                    >
                      加入画布
                    </button>
                  ))}
                {["queued", "running"].includes(job.status) && (
                  <button
                    onClick={() =>
                      void run(() => window.cs.generationPause(job.id))
                    }
                  >
                    <Pause size={13} />
                    {job.status === "queued" ? "取消排队" : "暂停查询"}
                  </button>
                )}
                {job.status === "paused" && (
                  <button
                    onClick={() =>
                      void run(() => window.cs.generationResume(job.id))
                    }
                  >
                    <Play size={13} />
                    继续查询
                  </button>
                )}
                {!active(job) && (
                  <button
                    onClick={() =>
                      saveDraft({
                        kind: job.kind,
                        prompt: job.prompt,
                        aspect: job.aspect,
                        duration: job.duration,
                        referenceId: job.referenceId,
                        model: job.model,
                        resolution: job.resolution,
                      })
                    }
                  >
                    复用提示词
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}
