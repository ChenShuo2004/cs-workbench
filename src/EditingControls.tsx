import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Download,
  LoaderCircle,
  Music2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { StudioState, StudioClip, EditPlan, AgentProvider } from "./types";
// @ts-ignore Shared pure timeline operation used by UI and regression tests.
import { routeSourceVoice } from "../shared/voice-routing.mjs";
type Props = {
  root: string;
  state: StudioState;
  clip?: StudioClip;
  patch: (p: Partial<StudioState>) => void;
  updateClip: (id: string, p: Partial<StudioClip>) => void;
  action: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  importMedia: () => Promise<void>;
  notice: (message: string) => void;
};
export function EditingControls({
  root,
  state,
  clip,
  patch,
  updateClip,
  action,
  importMedia,
  notice,
}: Props) {
  const [assistOpen, setAssistOpen] = useState(false),
    [instruction, setInstruction] = useState(
      "保留核心观点，找出重复和多余口头禅，让开头更直接；不凭空改写内容。",
    ),
    [plan, setPlan] = useState<EditPlan | null>(null),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [provider, setProvider] = useState("codex"),
    [model, setModel] = useState(""),
    [providers, setProviders] = useState<AgentProvider[]>([]),
    [tempoText, setTempoText] = useState("");
  const runId = useRef(""),
    planRaw = useRef(""),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    setPlan(null);
    setError("");
    setTempoText("");
  }, [root]);
  const style = state.captionStyle || {},
    mix = state.audio || {};
  const sound = state.media.filter((m) => m.hasAudio);
  const caption = (value: NonNullable<StudioState["captionStyle"]>) =>
    patch({ captionStyle: { ...style, ...value } });
  const audio = (value: NonNullable<StudioState["audio"]>) =>
    patch({ audio: { ...mix, ...value } });
  const improve = () =>
    action("生成剪辑建议", async () => {
      setError("");
      setPlan(null);
      setRunning(true);
      try {
        const request = await window.cs.studioPlan(root, instruction);
        const c = await window.cs.personalConversation();
        runId.current = c.id;
        await window.cs.personalSend({
          id: c.id,
          provider,
          model,
          prompt: request.prompt,
          noteIds: [],
        });
        const end = Date.now() + 180000;
        while (live.current && Date.now() < end) {
          const d = await window.cs.personalRead(),
            conversation = d.conversations.find((x) => x.id === c.id);
          if (conversation && conversation.status !== "running") {
            if (conversation.status !== "complete")
              throw Error(conversation.error || "建议生成已停止");
            planRaw.current =
              conversation.messages.filter((m) => m.role === "assistant").at(-1)
                ?.text || "";
            const next = await window.cs.studioValidatePlan(
              root,
              planRaw.current,
              request.fingerprint,
            );
            if (live.current) setPlan(next);
            return;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        await window.cs.personalCancel(c.id);
        if (live.current) throw Error("生成超时，已停止，可重试");
      } catch (e) {
        if (live.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        runId.current = "";
        if (live.current) setRunning(false);
      }
    });
  return (
    <>
      <details className="inspector-section editing-details" open>
        <summary>字幕样式</summary>
        <label className="toggle-label">
          显示字幕
          <input
            aria-label="显示字幕"
            type="checkbox"
            disabled={state.mode === "pixel"}
            checked={state.captions}
            onChange={(e) => patch({ captions: e.target.checked })}
          />
        </label>
        {state.mode === "talk" && (
          <>
            <div className="caption-presets">
              {[
                ["clean", "清晰"],
                ["bold", "醒目"],
                ["card", "底板"],
              ].map(([id, name]) => (
                <button
                  key={id}
                  aria-label={`${name}字幕`}
                  className={(style.preset || "clean") === id ? "active" : ""}
                  onClick={() =>
                    caption({ preset: id as "clean" | "bold" | "card" })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
            <label>
              字幕字体
              <select
                aria-label="字幕字体"
                value={style.font || "PingFang SC"}
                onChange={(e) => caption({ font: e.target.value })}
              >
                <option value="PingFang SC">苹方 · 清晰</option>
                <option value="Songti SC">宋体 · 阅读</option>
                <option value="Kaiti SC">楷体 · 手记</option>
              </select>
            </label>
            <div className="trim-inputs">
              <label>
                字号
                <input
                  aria-label="字幕字号"
                  type="number"
                  min="2.5"
                  max="9"
                  step=".1"
                  value={Math.round((style.size || 0.047) * 1000) / 10}
                  onChange={(e) => {
                    const n = +e.target.value;
                    if (n >= 2.5 && n <= 9) caption({ size: n / 100 });
                  }}
                />
              </label>
              <label>
                颜色
                <input
                  aria-label="字幕颜色"
                  type="color"
                  value={
                    style.color ||
                    (style.preset === "bold" ? "#f3de86" : "#ffffff")
                  }
                  onChange={(e) => caption({ color: e.target.value })}
                />
              </label>
            </div>
            <label>
              位置
              <select
                aria-label="字幕位置"
                value={style.position ?? 0.91}
                onChange={(e) => caption({ position: +e.target.value })}
              >
                <option value="0.91">底部安全区</option>
                <option value="0.76">画面下方</option>
                <option value="0.5">画面中央</option>
                <option value="0.3">画面上方</option>
              </select>
            </label>
            <label>
              画面适配
              <select
                aria-label="画面适配"
                value={state.framing || "fit"}
                onChange={(e) =>
                  patch({ framing: e.target.value as "fit" | "fill" })
                }
              >
                <option value="fit">完整显示 · 留边</option>
                <option value="fill">居中填满 · 裁切</option>
              </select>
            </label>
            <button
              className="s-button"
              onClick={() =>
                void action("导出字幕", async () => {
                  const f = await window.cs.studioCaptions(root);
                  if (f) notice(`字幕已导出：${f}`);
                })
              }
            >
              <Download size={13} />
              单独导出 SRT
            </button>
          </>
        )}
      </details>
      <details className="inspector-section editing-details" open>
        <summary>
          <AudioLines size={14} />
          原声与配音
        </summary>
        <label className="toggle-label">
          统一音量
          <input
            aria-label="统一音量"
            type="checkbox"
            checked={state.normalize}
            onChange={(e) => patch({ normalize: e.target.checked })}
          />
        </label>
        <label>
          人声音量 · {Math.round((mix.voiceGain ?? 1) * 100)}%
          <input
            aria-label="人声音量"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={mix.voiceGain ?? 1}
            onChange={(e) => audio({ voiceGain: +e.target.value })}
          />
        </label>
        {clip && (
          <>
            <label>
              选中片段的声音
              <select
                aria-label="片段声音"
                value={clip.voiceId || ""}
                onChange={(e) => {
                  const m = state.media.find((m) => m.id === e.target.value);
                  if (m && m.duration < clip.end - clip.start) {
                    notice("声音素材短于片段，请先缩短片段或选择更长的声音");
                    return;
                  }
                  updateClip(clip.id, {
                    voiceId: e.target.value || undefined,
                    voiceStart: m && m.duration >= clip.end ? clip.start : 0,
                  });
                }}
              >
                <option value="">使用素材原声</option>
                {sound.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {clip.voiceId && (
              <label>
                配音起点 / 秒
                <input
                  aria-label="配音起点"
                  type="number"
                  min="0"
                  step=".1"
                  defaultValue={clip.voiceStart || 0}
                  key={`${clip.id}-${clip.voiceId}`}
                  onBlur={(e) => {
                    const m = state.media.find((m) => m.id === clip.voiceId),
                      n = +e.target.value;
                    if (n >= 0 && m && n + clip.end - clip.start <= m.duration)
                      updateClip(clip.id, { voiceStart: n });
                    else {
                      e.target.value = String(clip.voiceStart || 0);
                      notice("配音起点超出素材范围");
                    }
                  }}
                />
              </label>
            )}
            {state.mode === "talk" && <>
              <button className="s-button" onClick={()=>{try{const next=routeSourceVoice(state,clip.id);patch({clips:next.clips});notice(`已将${clip.voiceId?"配音按原片时间应用":"原声恢复"}到 ${next.count} 个同源片段，可撤销`);}catch(e){notice(e instanceof Error?e.message:String(e));}}}>应用到同源全部片段</button>
              <p className="inspector-hint">整条同步配音沿用原片时码；以选中片段的配音起点校准。其他素材不受影响，可撤销。</p>
            </>}
            <label className="toggle-label">
              此片段静音
              <input
                aria-label="此片段静音"
                type="checkbox"
                checked={!!clip.muted}
                onChange={(e) =>
                  updateClip(clip.id, { muted: e.target.checked })
                }
              />
            </label>
          </>
        )}
        <p className="inspector-hint">统一音量在导出时处理，目标 −16 LUFS。</p>
      </details>
      <details className="inspector-section editing-details" open>
        <summary>
          <Music2 size={14} />
          背景音乐
        </summary>
        <button className="s-button" onClick={() => void importMedia()}>
          导入音频 / 音乐
        </button>
        <label>
          选择音乐
          <select
            aria-label="背景音乐"
            value={mix.musicId || ""}
            onChange={(e) => audio({ musicId: e.target.value, musicOffset: 0 })}
          >
            <option value="">无背景音乐</option>
            {sound.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {mix.musicId && (
          <>
            <label>
              音乐音量 · {Math.round((mix.musicGain ?? 0.12) * 100)}%
              <input
                aria-label="音乐音量"
                type="range"
                min="0"
                max="1"
                step=".01"
                value={mix.musicGain ?? 0.12}
                onChange={(e) => audio({ musicGain: +e.target.value })}
              />
            </label>
            <label>
              音乐起点 / 秒
              <input
                aria-label="音乐起点"
                type="number"
                min="0"
                step=".1"
                key={mix.musicId}
                defaultValue={mix.musicOffset || 0}
                onBlur={(e) => {
                  const m = sound.find((m) => m.id === mix.musicId),
                    n = +e.target.value;
                  if (m && n >= 0 && n < m.duration) audio({ musicOffset: n });
                  else e.target.value = String(mix.musicOffset || 0);
                }}
              />
            </label>
            <div className="trim-inputs">
              {(["fadeIn", "fadeOut"] as const).map((k, i) => (
                <label key={k}>
                  {i ? "淡出" : "淡入"} / 秒
                  <input
                    aria-label={i ? "音乐淡出" : "音乐淡入"}
                    type="number"
                    min="0"
                    max="10"
                    step=".1"
                    value={mix[k] ?? 1}
                    onChange={(e) => {
                      const n = +e.target.value;
                      if (n >= 0 && n <= 10) audio({ [k]: n });
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="toggle-label">
              口播时压低音乐
              <input
                aria-label="音乐自动闪避"
                type="checkbox"
                checked={mix.duck !== false}
                onChange={(e) => audio({ duck: e.target.checked })}
              />
            </label>
            <p className="inspector-hint">
              音乐自动循环。预览按片段近似压低；导出按实际人声音量动态闪避。
            </p>
          </>
        )}
      </details>
      <details className="inspector-section editing-details" open>
        <summary>
          <Sparkles size={14} />
          节奏与剪辑助理
        </summary>
        <div className="trim-inputs">
          <label>
            BPM
            <input
              aria-label="节拍 BPM"
              type="number"
              min="0"
              max="240"
              value={state.rhythm?.bpm || 0}
              onChange={(e) => {
                const n = +e.target.value;
                if (n === 0 || (n >= 40 && n <= 240))
                  patch({ rhythm: { ...state.rhythm, bpm: n } });
              }}
            />
          </label>
          <label>
            首拍 / 秒
            <input
              aria-label="首拍偏移"
              type="number"
              min="0"
              max="60"
              step=".01"
              value={state.rhythm?.offset || 0}
              onChange={(e) => {
                const n = +e.target.value;
                if (n >= 0 && n <= 60)
                  patch({ rhythm: { ...state.rhythm, offset: n } });
              }}
            />
          </label>
        </div>
        <button
          className="s-button"
          disabled={!mix.musicId}
          onClick={() =>
            void action("分析音乐节拍", async () => {
              const r = await window.cs.studioTempo(root, mix.musicId!);
              const offset =
                (((r.offset - (mix.musicOffset || 0)) % (60 / r.bpm)) +
                  60 / r.bpm) %
                (60 / r.bpm);
              patch({
                rhythm: {
                  bpm: r.bpm,
                  offset: Math.round(offset * 1000) / 1000,
                },
              });
              setTempoText(
                `估计 ${r.bpm} BPM · 相关度 ${Math.round(r.confidence * 100)}%，请试听校准`,
              );
            })
          }
        >
          估计音乐节拍
        </button>
        {tempoText && <p className="inspector-hint">{tempoText}</p>}
        <button
          className="s-button"
          disabled={!clip || !state.rhythm?.bpm}
          onClick={() =>
            void action("对齐节拍", async () => {
              const r = await window.cs.studioSnap(root, clip!.id);
              patch({ clips: r.clips });
              notice(
                `片段尾部调整 ${r.delta.toFixed(3)} 秒，请试听确认；可撤销`,
              );
            })
          }
        >
          片段尾部贴近节拍
        </button>
        <p className="inspector-hint">
          只允许 0.18 秒内的微调。节拍估计可能半拍/倍拍，口播完整性优先。
        </p>
        <button
          className="s-button primary"
          disabled={
            !state.clips.some((c) => c.enabled) || state.mode !== "talk"
          }
          onClick={() => {
            setAssistOpen(true);
            void window.cs
              .personalProviders()
              .then(setProviders)
              .catch((e) => setError(e.message));
          }}
        >
          <Sparkles size={13} />
          打开剪辑助理
        </button>
      </details>
      {assistOpen && (
        <div
          className="studio-modal-backdrop"
          onClick={() => {
            if (!running) setAssistOpen(false);
          }}
        >
          <section
            className="studio-modal edit-assistant"
            role="dialog"
            aria-label="剪辑助理"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="studio-eyebrow">EDITOR ASSISTANT</span>
                <h2>先看建议，再应用到剪辑。</h2>
              </div>
              <button
                className="s-icon"
                aria-label="关闭剪辑助理"
                disabled={running}
                onClick={() => setAssistOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              发送字幕与时码给所选
              Agent，分析冗余和叙事节奏。原始音视频不会上传；建议不等于听音或看画面的判断。
            </p>
            <div className="assist-provider">
              <label>
                Agent
                <select
                  aria-label="剪辑助理 Agent"
                  disabled={running}
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setModel("");
                  }}
                >
                  {[
                    ["codex", "Codex / GPT"],
                    ["claude", "Claude Code"],
                  ].map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                      {providers.find((p) => p.id === id)?.loggedIn
                        ? " · 已连接"
                        : " · 需登录"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                模型
                <input
                  aria-label="剪辑助理模型"
                  disabled={running}
                  list="editing-models"
                  value={model}
                  placeholder="账户默认模型"
                  onChange={(e) => setModel(e.target.value)}
                />
                <datalist id="editing-models">
                  {providers
                    .find((p) => p.id === provider)
                    ?.models.filter(Boolean)
                    .map((m) => (
                      <option key={m} value={m} />
                    ))}
                </datalist>
              </label>
            </div>
            <label>
              这次怎样调整
              <textarea
                aria-label="剪辑优化要求"
                disabled={running}
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </label>
            {error && (
              <p className="assist-error" role="alert">
                {error}
              </p>
            )}
            <div className="assist-actions">
              <button
                className="s-button primary"
                disabled={
                  running || !providers.find((p) => p.id === provider)?.loggedIn
                }
                onClick={() => void improve()}
              >
                {running ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Sparkles size={14} />
                )}{" "}
                {running ? "正在分析字幕…" : "生成剪辑建议"}
              </button>
              {running && (
                <button
                  className="s-button"
                  onClick={() => void window.cs.personalCancel(runId.current)}
                >
                  <Square size={13} />
                  停止
                </button>
              )}
            </div>
            {plan && (
              <div className="edit-plan">
                <h3>
                  调整前 {plan.before.toFixed(1)}s → 调整后{" "}
                  {plan.after.toFixed(1)}s
                </h3>
                <p>{plan.summary}</p>
                {plan.changes.length ? (
                  plan.changes.map((c) => (
                    <article key={c.id}>
                      <strong>
                        {c.after.enabled ? "微调" : "移出成片"} · {c.text}
                      </strong>
                      <span>
                        {c.before.start.toFixed(2)}–{c.before.end.toFixed(2)} →{" "}
                        {c.after.start.toFixed(2)}–{c.after.end.toFixed(2)}
                      </span>
                      <p>{c.reason}</p>
                    </article>
                  ))
                ) : (
                  <p>建议保留当前剪辑，没有修改。</p>
                )}
                <button
                  className="s-button primary"
                  disabled={!plan.changes.length || running}
                  onClick={() =>
                    void action("应用剪辑建议", async () => {
                      try {
                        const checked = await window.cs.studioValidatePlan(
                          root,
                          planRaw.current,
                          plan.fingerprint,
                        );
                        patch({ clips: checked.clips });
                        setAssistOpen(false);
                        setPlan(null);
                        notice(
                          "已应用剪辑建议，⌘Z 可撤销；建议会话保留在 Agent 助手中",
                        );
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    })
                  }
                >
                  应用这些修改
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
