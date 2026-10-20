import { CanvasPromptInput, type MentionChoice } from "./CanvasPromptInput";
import { videoModel, videoModels, videoModelChange } from "./video-models";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, PointerEvent } from "react";
import {
  Copy,
  Film,
  ImagePlus,
  LoaderCircle,
  Play,
  Trash2,
  X,
} from "lucide-react";
import type { CanvasGenerator, CanvasInputRole, GenerationJob } from "./types";
export const runningJob = (j?: GenerationJob) =>
  !!j &&
  ["queued", "submitting", "running", "saving", "paused"].includes(j.status);
export function CanvasGeneratorNode({
  node,
  index,
  job,
  selected,
  style,
  wireKind,
  inputs,
  mentionChoices,
  selectMention,
  preview,
  drag,
  change,
  connect,
  setFrame,
  output,
  run,
  duplicate,
  remove,
  unlink,
  resume,
  pause,
}: {
  node: CanvasGenerator;
  index: number;
  job?: GenerationJob;
  selected: boolean;
  style: { left: number; top: number };
  wireKind?: string;
  inputs: {
    id: string;
    role: CanvasInputRole;
    name: string;
    alias: string;
    kind: string;
  }[];
  mentionChoices: MentionChoice[];
  selectMention: (
    choice: MentionChoice,
    before: string,
    after: string,
  ) => string | false;
  preview: ReactNode;
  drag: (e: PointerEvent) => void;
  change: (p: Partial<CanvasGenerator>) => void;
  connect: () => void;
  setFrame: (role: "first_frame" | "last_frame", id: string) => void;
  output: (e?: PointerEvent) => void;
  run: () => void;
  duplicate: () => void;
  remove: () => void;
  unlink: (id: string) => void;
  resume: () => void;
  pause: () => void;
}) {
  const active = runningJob(job);
  const [editingName, setEditingName] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [framesOpen, setFramesOpen] = useState(
    node.mode === "frames" &&
      inputs.some((i) => ["first_frame", "last_frame"].includes(i.role)),
  );
  const frameCompatible =
    inputs.filter((i) => i.kind !== "text").length <= 2 &&
    inputs.every((i) => ["image", "text"].includes(i.kind));
  return (
    <article
      className={`vc-node vg-node ${selected ? "selected" : ""}`}
      style={style}
      data-generator-id={node.id}
      aria-label={`生成节点 ${index + 1}`}
      onPointerDown={drag}
      onPointerUp={(e) => {
        if (wireKind && !(e.target as HTMLElement).closest(".vg-output"))
          connect();
      }}
    >
      {promptOpen &&
        createPortal(
          <div
            className="vc-prompt-backdrop"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setPromptOpen(false);
            }}
          >
            <section
              className="vc-prompt-modal"
              role="dialog"
              aria-label={`编辑节点 ${index + 1} 提示词`}
            >
              <header>
                <b>{node.title} · 提示词</b>
                <button
                  aria-label="关闭提示词编辑"
                  onClick={() => setPromptOpen(false)}
                >
                  <X size={18} />
                </button>
              </header>
              <CanvasPromptInput
                expanded
                label="放大的提示词"
                value={node.prompt}
                change={(prompt) => change({ prompt })}
                choices={mentionChoices}
                select={selectMention}
              />
              <footer>
                <span>
                  {node.prompt.length} / 4000 ·
                  修改自动保存，连接文本会在生成时合并
                </span>
                <button onClick={() => setPromptOpen(false)}>完成</button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      <header>
        <span>
          {node.kind === "image" ? <ImagePlus size={14} /> : <Film size={14} />}{" "}
          {editingName ? (
            <input
              autoFocus
              className="vg-title-input"
              aria-label={`节点 ${index + 1} 名称`}
              maxLength={100}
              value={node.title}
              onChange={(e) => change({ title: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (["Enter", "Escape"].includes(e.key)) setEditingName(false);
              }}
            />
          ) : (
            <span
              title="双击重命名"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingName(true);
              }}
            >
              {node.title}
            </span>
          )}
        </span>
        <span>
          <button aria-label={`复制生成节点 ${index + 1}`} onClick={duplicate}>
            <Copy size={13} />
          </button>
          <button aria-label={`移除生成节点 ${index + 1}`} onClick={remove}>
            <Trash2 size={13} />
          </button>
        </span>
      </header>
      <button
        className="vg-output"
        aria-label={`连接生成节点 ${index + 1} 输出`}
        title="拖到另一个节点的输入；也可先点输出再点输入"
        onPointerDown={(e) => {
          e.stopPropagation();
          output(e);
        }}
        onKeyDown={(e) => {
          if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            output();
          }
        }}
      />
      <div className="vg-inputs">
        <div className="vg-input-row">
          <button
            className={`vg-input ${wireKind ? "compatible" : ""}`}
            aria-label={`连接节点 ${index + 1} 输入`}
            style={{ top: 60 }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              connect();
            }}
            onKeyDown={(e) => {
              if (["Enter", " "].includes(e.key)) {
                e.preventDefault();
                connect();
              }
            }}
          />
          <span>连接素材</span>
          <small>{inputs.length} 个已连接</small>
        </div>
      </div>
      <div
        className="vg-body"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <label>
          <span className="vg-prompt-title">
            画面与动作{" "}
            <button
              type="button"
              aria-label={`放大编辑节点 ${index + 1} 提示词`}
              onClick={() => setPromptOpen(true)}
            >
              放大编辑
            </button>
          </span>
          <CanvasPromptInput
            label={`节点 ${index + 1} 提示词`}
            value={node.prompt}
            change={(prompt) => change({ prompt })}
            choices={mentionChoices}
            select={selectMention}
          />
        </label>
        {node.kind === "video" && (
          <div className="vg-frames">
            <button
              type="button"
              onClick={() => setFramesOpen(!framesOpen)}
              aria-expanded={framesOpen}
            >
              首尾帧{framesOpen ? "收起" : "设置"}
            </button>
            {framesOpen && (
              <>
                {!frameCompatible && (
                  <small>首尾帧使用 1–2 张图片；请先断开多余素材。</small>
                )}
                {(["first_frame", "last_frame"] as const).map((role) => (
                  <label key={role}>
                    {role === "first_frame" ? "首帧" : "尾帧"}
                    <select
                      aria-label={`节点 ${index + 1} ${role === "first_frame" ? "首帧" : "尾帧"}`}
                      disabled={!frameCompatible}
                      value={inputs.find((i) => i.role === role)?.id || ""}
                      onChange={(e) => setFrame(role, e.target.value)}
                    >
                      <option value="">不指定</option>
                      {inputs
                        .filter((i) => i.kind === "image")
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.alias} · {i.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </>
            )}
          </div>
        )}
        <div className="vg-options">
          <label>
            {node.kind === "image" ? "镜头停留" : "视频时长"}
            <select
              aria-label={`节点 ${index + 1} 时长`}
              value={node.duration}
              onChange={(e) => change({ duration: Number(e.target.value) })}
            >
              {Array.from(
                { length: node.kind === "image" ? 15 : 12 },
                (_, i) => i + (node.kind === "image" ? 1 : 4),
              ).map((n) => (
                <option key={n} value={n}>
                  {n} 秒
                </option>
              ))}
            </select>
          </label>
          <label>
            画面比例
            <select
              aria-label={`节点 ${index + 1} 比例`}
              value={node.aspect}
              disabled={
                node.kind === "video" &&
                node.mode === "frames" &&
                inputs.some((i) =>
                  ["first_frame", "last_frame"].includes(i.role),
                )
              }
              onChange={(e) => change({ aspect: e.target.value })}
            >
              {["16:9", "9:16", "4:3", "1:1"].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        {node.kind === "video" && (
          <>
            <label>
              视频模型
              <select
                aria-label={`节点 ${index + 1} 模型`}
                value={node.model || "MiniMax-H3"}
                onChange={(e) =>
                  change(videoModelChange(e.target.value, node.resolution))
                }
              >
                {videoModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              分辨率
              <select
                aria-label={`节点 ${index + 1} 分辨率`}
                value={node.resolution}
                onChange={(e) =>
                  change({
                    resolution: e.target.value as CanvasGenerator["resolution"],
                  })
                }
              >
                {videoModel(node.model).resolutions.map((r) => (
                  <option key={r} value={r}>
                    {r === "1080P" ? "1080P · 原生生成" : r}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {node.kind === "video" && node.resolution === "1080P" && (
          <small className="vg-hint">
            直接请求原生 1080P，按所选模型与时长计费。
          </small>
        )}
        {inputs.length > 0 && (
          <div className="vg-references">
            {inputs.map((input) => (
              <span key={input.id}>
                <button
                  type="button"
                  className="vg-mention-chip"
                  title={input.name}
                  onClick={() =>
                    change({
                      prompt: (node.prompt + " " + input.alias + " ")
                        .trimStart()
                        .slice(0, 4000),
                    })
                  }
                >
                  {input.alias} · {input.name}
                </button>
                <button
                  aria-label={`断开 ${input.name}`}
                  onClick={() => unlink(input.id)}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <small className="vg-hint">
          输入 @ 选择画布素材，选中后自动连线。
          {inputs.some((i) => ["first_frame", "last_frame"].includes(i.role))
            ? "画面比例跟随首尾帧。"
            : ""}
        </small>
        {preview && (
          <div className="vg-result">
            {preview}
            <small>最近生成结果</small>
          </div>
        )}
        {job && (
          <div
            className={`vg-status ${job.error ? "has-error" : ""}`}
            role="status"
          >
            {active && job.status !== "paused" && (
              <LoaderCircle size={12} className="spin" />
            )}
            {job.stage}
            {job.error && <p>{job.error}</p>}
            {active && <small>当前参数修改用于下次生成。</small>}
          </div>
        )}
      </div>
      <div className="vg-actions">
        {job?.status === "paused" ? (
          <button onClick={resume}>继续查询原任务</button>
        ) : (
          <button
            className="vg-run"
            disabled={
              active ||
              (!node.prompt.trim() &&
                !inputs.some((i) => i.role === "prompt_text"))
            }
            onClick={run}
          >
            <Play size={12} />
            {active ? "任务进行中" : node.outputMediaId ? "重新生成" : "生成"}
          </button>
        )}
        {job && ["queued", "running"].includes(job.status) && (
          <button onClick={pause}>
            {job.status === "queued" ? "取消排队" : "暂停查询"}
          </button>
        )}
      </div>
    </article>
  );
}
