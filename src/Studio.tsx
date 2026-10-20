import { Dialog } from "./Dialog";
import { uiErrorMessage } from "./ui-error";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Copy,
  Film,
  FolderOpen,
  Grid2X2,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Subtitles,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import type {
  ProjectSummary,
  Section,
  StudioState,
  StudioClip,
  StudioJob,
  GenerationJob,
  GenerationInput,
} from "./types";
// @ts-ignore shared deterministic renderer is consumed by Electron and Vite.
import { sceneSVG, captionSVG } from "../shared/studio-visuals.mjs";
import "./studio.css";
import { StudioGeneration } from "./StudioGeneration";
import { StudioCanvas } from "./StudioCanvas";
import { EditingControls } from "./EditingControls";
const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(Math.max(0, seconds) % 60).toFixed(1).padStart(4, "0")}`;
const uid = () => crypto.randomUUID();
const templates = [
  {
    theme: "mint",
    title: "雾松森林 · 长期成长",
    tag: "PIXEL STORY",
    text: "让每一次练习，都向前一步。",
    desc: "观点解说 / 方法论 / 成长叙事",
  },
  {
    theme: "violet",
    title: "暮紫湖畔 · 灵感实验",
    tag: "IDEA LAB",
    text: "把一个想法，变成看得见的作品。",
    desc: "AI 工具 / 创作过程 / 知识分享",
  },
  {
    theme: "amber",
    title: "琥珀书房 · 日常观察",
    tag: "FIELD NOTES",
    text: "值得记录的，藏在平常的日子里。",
    desc: "个人经历 / 阅读笔记 / 生活洞察",
  },
] as const;
const jobLabels: Record<string, string> = {
  queued: "排队中",
  running: "正在渲染",
  complete: "已完成",
  failed: "导出失败",
  cancelled: "已取消",
  interrupted: "已中断",
};
export function Studio({
  projects,
  onRefresh,
  onNavigate,
  projectPath,
  onProjectChange,
  onBusyChange,
}: {
  onBusyChange: (busy: boolean) => void;
  projectPath?: string;
  onProjectChange: (root: string) => Promise<unknown>;
  projects: ProjectSummary[];
  onRefresh: () => Promise<unknown>;
  onNavigate: (s: Section) => unknown;
}) {
  const studioElement = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenPending = useRef(false);
  const [workspaceView, setWorkspaceView] = useState<"canvas" | "edit">(
    "canvas",
  );
  const [root, setRoot] = useState("");
  const [state, setState] = useState<StudioState | null>(null);
  const current = useRef<StudioState | null>(null);
  const rootRef = useRef("");
  const loadSequence = useRef(0);
  const [selected, setSelected] = useState("");
  const [mediaId, setMediaId] = useState("");
  const [tab, setTab] = useState<"script" | "media" | "templates">("script");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [jobsOpen, setJobsOpen] = useState(false);
  const [generationOpen, setGenerationOpen] = useState(false);
  const attaching = useRef(new Set<string>());
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaURL, setMediaURL] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const voice = useRef<HTMLAudioElement>(null),
    music = useRef<HTMLAudioElement>(null);
  const [voiceURL, setVoiceURL] = useState(""),
    [musicURL, setMusicURL] = useState("");
  const [script, setScript] = useState("");
  const [silence, setSilence] = useState<{
    ranges: number[][];
    removed: number;
    mediaId: string;
  } | null>(null);
  const [threshold, setThreshold] = useState(-35);
  const [minimum, setMinimum] = useState(0.45);
  const undo = useRef<StudioState[]>([]);
  const redo = useRef<StudioState[]>([]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const project = projects.find((p) => p.path === root);
  const enabled = useMemo(() => {
    let offset = 0;
    return (state?.clips || [])
      .filter((c) => c.enabled)
      .map((c) => {
        const v = { ...c, offset };
        offset += c.end - c.start;
        return v;
      });
  }, [state?.clips]);
  const total = enabled.reduce((a, c) => a + c.end - c.start, 0);
  const active =
    enabled.find(
      (c) => playhead >= c.offset && playhead < c.offset + c.end - c.start,
    ) || enabled.at(-1);
  const clip = state?.clips.find((c) => c.id === selected) || state?.clips[0];
  const activeMedia = state?.media.find((m) => m.id === active?.mediaId);
  const sceneActive =
    active?.visual === "scene" || (!active?.visual && state?.mode === "pixel");
  const imageActive = !sceneActive && activeMedia?.kind === "image";
  const selectedMedia =
    state?.media.find((m) => m.id === mediaId) || state?.media[0];
  const [w, h] =
    state?.aspect === "9:16"
      ? [720, 1280]
      : state?.aspect === "1:1"
        ? [720, 720]
        : state?.aspect === "4:3"
          ? [960, 720]
          : [1280, 720];
  const fail = (e: unknown) => setError(uiErrorMessage(e));
  const action = async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await chain.current;
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  const persist = (next: StudioState, target = rootRef.current) => {
    pending.current++;
    setSaving(true);
    chain.current = chain.current
      .catch(() => {})
      .then(() => window.cs.studioSave(target, next))
      .then(() => {
        setError("");
      })
      .catch((e) => {
        fail(e);
        throw e;
      })
      .finally(() => {
        pending.current--;
        setSaving(pending.current > 0);
      });
    chain.current.catch(() => {});
  };
  const change = (next: StudioState, record = true) => {
    if (next.canvas) {
      const ids = new Set(
        [
          ...next.clips,
          ...(next.canvas.generators || []),
          ...(next.canvas.sources || []),
          ...next.canvas.notes,
        ].map((n) => n.id),
      );
      next = {
        ...next,
        canvas: {
          ...next.canvas,
          groups: next.canvas.groups
            ?.map((g) => ({
              ...g,
              nodeIds: g.nodeIds.filter((id) => ids.has(id)),
            }))
            .filter((g) => g.nodeIds.length),
          edges: (next.canvas.edges || []).filter(
            (e) => ids.has(e.from) && ids.has(e.to),
          ),
        },
      };
    }
    if (record && current.current) {
      undo.current.push(structuredClone(current.current));
      if (undo.current.length > 50) undo.current.shift();
      redo.current = [];
    }
    current.current = next;
    setState(next);
    persist(next);
  };
  const patch = (patch: Partial<StudioState>, record = true) => {
    if (current.current) change({ ...current.current, ...patch }, record);
  };
  const saveGenerationDraft = (draft: GenerationInput) => {
    if (!current.current) return;
    patch(
      {
        canvas: {
          ...(current.current.canvas || {
            positions: {},
            notes: [],
            view: { x: 65, y: 85, zoom: 0.85 },
          }),
          generationDraft: draft,
        },
      },
      false,
    );
  };
  const openGeneration = (clip?: StudioClip) => {
    if (clip && current.current)
      saveGenerationDraft({
        kind: "image",
        prompt: clip.prompt || clip.text,
        aspect: current.current.aspect,
        duration: Math.max(1, Math.min(15, Math.round(clip.end - clip.start))),
        referenceId:
          current.current.media.find(
            (m) => m.id === clip.mediaId && m.kind === "image",
          )?.id || "",
        model: "",
      });
    setGenerationOpen(true);
  };
  const attachGenerated = async (job: GenerationJob) => {
    if (attaching.current.has(job.id)) return;
    attaching.current.add(job.id);
    try {
      await chain.current;
      if (rootRef.current !== job.root || !current.current) return;
      const result = await window.cs.generationAttach(job.id);
      await chain.current;
      if (rootRef.current !== job.root || !current.current) return;
      const latest = current.current;
      const media = result.media.find((m) => m.id === job.id);
      if (!media) throw Error("生成素材未成功导入，请重试加入画布");
      if (!latest.clips.some((c) => c.id === job.id)) {
        if (latest.clips.length >= 1000)
          throw Error("画布镜头已达上限，生成文件已保留");
        const clip: StudioClip = {
          id: job.id,
          mediaId: media.id,
          visual: "media",
          start: 0,
          end: media.kind === "image" ? job.duration : media.duration,
          text: "",
          prompt: job.prompt,
          enabled: !(
            job.kind === "image" &&
            job.nodeId &&
            latest.canvas?.edges?.some((e) => e.from === job.nodeId)
          ),
          generationBatchId: job.batchId,
          generationIndex: job.batchIndex,
        };
        const clips = [...latest.clips];
        const before = job.batchId
          ? clips.findIndex(
              (c) =>
                c.generationBatchId === job.batchId &&
                (c.generationIndex ?? 0) > (job.batchIndex ?? 0),
            )
          : -1;
        clips.splice(before < 0 ? clips.length : before, 0, clip);
        const canvas = latest.canvas;
        const origin = job.nodeId && canvas?.positions[job.nodeId];
        change({
          ...latest,
          media: [
            ...new Map(
              [...latest.media, ...result.media].map((m) => [m.id, m]),
            ).values(),
          ],
          clips,
          ...(canvas && job.nodeId
            ? {
                canvas: {
                  ...canvas,
                  generators: canvas.generators?.map((n) =>
                    n.id === job.nodeId ? { ...n, outputMediaId: media.id } : n,
                  ),
                  positions: {
                    ...canvas.positions,
                    ...(origin
                      ? { [clip.id]: { x: origin.x + 380, y: origin.y + 330 } }
                      : {}),
                  },
                },
              }
            : {}),
        });
        setSelected(clip.id);
        setMessage(
          `AI ${job.kind === "image" ? "图片" : "视频"}已生成并加入画布，原镜头保留。`,
        );
      }
      await chain.current;
      await window.cs.generationAcknowledge(job.id);
    } finally {
      attaching.current.delete(job.id);
    }
  };
  const updateClip = (id: string, patch: Partial<StudioClip>) => {
    const state = current.current,
      c = state?.clips.find((c) => c.id === id);
    if (!state || !c) return;
    const next = { ...c, ...patch };
    if (
      patch.start !== undefined &&
      c.voiceId &&
      patch.voiceStart === undefined
    )
      next.voiceStart = (c.voiceStart || 0) + patch.start - c.start;
    if (next.voiceId) {
      const m = state.media.find((m) => m.id === next.voiceId);
      if (
        !m ||
        (next.voiceStart || 0) < 0 ||
        (next.voiceStart || 0) + next.end - next.start > m.duration + 0.03
      ) {
        setError("调整后配音超出素材范围，请先改配音起点或更换声音");
        return;
      }
    }
    change({
      ...state,
      clips: state.clips.map((item) => (item.id === id ? next : item)),
    });
  };
  const load = async (target: string) => {
    const sequence = ++loadSequence.current;
    await chain.current;
    setPlaying(false);
    const data = await window.cs.studioRead(target);
    if (sequence !== loadSequence.current) return;
    rootRef.current = target;
    setRoot(target);
    current.current = data;
    setState(data);
    setSelected(data.clips[0]?.id || "");
    setMediaId(data.media[0]?.id || "");
    setPlayhead(0);
    undo.current = [];
    redo.current = [];
    setSilence(null);
  };
  const applyFromBackend = (data: StudioState) => {
    if (current.current) undo.current.push(structuredClone(current.current));
    current.current = data;
    setState(data);
    setSelected(data.clips[0]?.id || "");
    setMediaId(data.media.at(-1)?.id || "");
    setPlayhead(0);
    redo.current = [];
  };
  useEffect(() => {
    let live = true;
    const refresh = () =>
      window.cs
        .studioJobs()
        .then((j) => {
          if (live) setJobs(j);
        })
        .catch(fail);
    void refresh();
    const off = window.cs.onStudioChanged(refresh);
    return () => {
      live = false;
      off();
    };
  }, []);
  useEffect(() => {
    onBusyChange(!!busy || saving);
    return () => onBusyChange(false);
  }, [busy, saving, onBusyChange]);
  useEffect(() => {
    if (!projectPath) {
      if (projects[0]) void onProjectChange(projects[0].path).catch(fail);
      return;
    }
    if (projectPath !== rootRef.current) void load(projectPath).catch(fail);
    return () => {
      loadSequence.current++;
    };
  }, [projectPath, projects.length]);
  useEffect(() => {
    let live = true;
    setMediaURL("");
    if (root && active?.mediaId)
      window.cs
        .studioMediaURL(root, active.mediaId)
        .then((url) => {
          if (live) setMediaURL(url);
        })
        .catch(fail);
    return () => {
      live = false;
    };
  }, [root, active?.mediaId]);
  useEffect(() => {
    let alive = true;
    setVoiceURL("");
    if (root && active?.voiceId)
      void window.cs
        .studioMediaURL(root, active.voiceId)
        .then((url) => {
          if (alive) setVoiceURL(url);
        })
        .catch(fail);
    return () => {
      alive = false;
    };
  }, [root, active?.voiceId]);
  useEffect(() => {
    let alive = true;
    setMusicURL("");
    if (root && state?.audio?.musicId)
      void window.cs
        .studioMediaURL(root, state.audio.musicId)
        .then((url) => {
          if (alive) setMusicURL(url);
        })
        .catch(fail);
    return () => {
      alive = false;
    };
  }, [root, state?.audio?.musicId]);
  useEffect(() => {
    const gain = state?.audio?.voiceGain ?? 1;
    if (video.current) {
      video.current.volume = gain;
      video.current.muted = !!active?.muted || !!active?.voiceId;
    }
    const sync = (
      el: HTMLAudioElement | null,
      time: number,
      volume: number,
    ) => {
      if (!el) return;
      el.volume = Math.max(0, Math.min(1, volume));
      if (el.readyState >= 1 && Math.abs(el.currentTime - time) > 0.24)
        el.currentTime = time;
      if (playing && el.paused) void el.play().catch(fail);
      else if (!playing) el.pause();
    };
    sync(
      voice.current,
      (active?.voiceStart || 0) + Math.max(0, playhead - (active?.offset || 0)),
      active?.muted ? 0 : gain,
    );
    const mix = state?.audio || {},
      m = state?.media.find((m) => m.id === mix.musicId);
    const fade = Math.min(
      1,
      playhead / Math.max(0.001, mix.fadeIn ?? 1),
      Math.max(0, total - playhead) / Math.max(0.001, mix.fadeOut ?? 1),
    );
    const duck =
      mix.duck !== false &&
      !active?.muted &&
      (active?.voiceId || activeMedia?.hasAudio)
        ? 0.35
        : 1;
    sync(
      music.current,
      m ? ((mix.musicOffset || 0) + playhead) % m.duration : 0,
      (mix.musicGain ?? 0.12) * fade * duck,
    );
  }, [
    playing,
    playhead,
    voiceURL,
    musicURL,
    mediaURL,
    active?.id,
    active?.muted,
    active?.voiceId,
    state?.audio,
  ]);
  useEffect(() => {
    if (!playing || (!sceneActive && !imageActive)) return;
    let id = 0,
      last = performance.now();
    const tick = (now: number) => {
      setPlayhead((t) => {
        const n = t + (now - last) / 1000;
        if (n >= total) {
          setPlaying(false);
          return 0;
        }
        return n;
      });
      last = now;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, sceneActive, imageActive, total]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (sceneActive && active)
      el.currentTime = active.start + Math.max(0, playhead - active.offset);
    if (playing)
      void el.play().catch((e) => {
        setPlaying(false);
        fail(e);
      });
    else el.pause();
  }, [playing, mediaURL, active?.id, state?.mode]);
  const seek = (t: number) => {
    const time = Math.min(Math.max(0, t), Math.max(0, total - 0.001));
    setPlayhead(time);
    const c = enabled.find(
      (c) => time >= c.offset && time < c.offset + c.end - c.start,
    );
    if (video.current && c && c.mediaId === active?.mediaId)
      video.current.currentTime = c.start + time - c.offset;
  };
  const selectClip = (c: StudioClip) => {
    setSelected(c.id);
    const match = enabled.find((x) => x.id === c.id);
    if (match) seek(match.offset);
  };
  const timeUpdate = () => {
    const el = video.current;
    if (!el || !active || !playing) return;
    if (el.currentTime >= active.end - 0.035) {
      const next = enabled[enabled.findIndex((c) => c.id === active.id) + 1];
      if (next) {
        setPlayhead(next.offset);
        if (next.mediaId === active.mediaId) el.currentTime = next.start;
      } else {
        setPlaying(false);
        seek(0);
      }
    } else
      setPlayhead(active.offset + Math.max(0, el.currentTime - active.start));
  };
  const toggleFullscreen = async (enabled = !fullscreen) => {
    if (fullscreenPending.current) return;
    fullscreenPending.current = true;
    try {
      setFullscreen(await window.cs.windowFullscreen(enabled));
    } catch {
      setError("全屏切换未完成，请重试。");
    } finally {
      fullscreenPending.current = false;
    }
  };
  useEffect(() => {
    let mounted = true;
    void window.cs.windowFullscreenState().then((enabled) => {
      if (mounted) setFullscreen(enabled);
    });
    const unsubscribe = window.cs.onWindowFullscreen(setFullscreen);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  const history = (direction: "undo" | "redo") => {
    const from = direction === "undo" ? undo : redo,
      to = direction === "undo" ? redo : undo;
    const item = from.current.pop();
    if (item && current.current) {
      to.current.push(current.current);
      const liveCanvas = current.current.canvas;
      const restored = liveCanvas
        ? {
            ...item,
            canvas: {
              ...(item.canvas || { positions: {}, notes: [] }),
              view: liveCanvas.view,
              draft: liveCanvas.draft,
              generationDraft: liveCanvas.generationDraft,
            },
          }
        : item;
      change({ ...restored, media: current.current.media }, false);
      setPlaying(false);
      setPlayhead(0);
    }
  };
  useLayoutEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const input = (e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable]",
      );
      if (
        e.defaultPrevented ||
        (e.target as HTMLElement).closest('[role="dialog"]')
      )
        return;
      if (
        !input &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === "Escape" && fullscreen) {
        e.preventDefault();
        void toggleFullscreen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void action("保存工程", async () => {
          await chain.current;
          setMessage("工程已保存到本机");
        });
      } else if (!input && workspaceView === "edit" && e.code === "Space") {
        e.preventDefault();
        if (total) setPlaying((p) => !p);
      } else if (!input && (e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        history(e.shiftKey ? "redo" : "undo");
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [total, state, workspaceView, fullscreen]);
  const create = () =>
    action("创建项目", async () => {
      const p = await window.cs.createProject({
        title: name.trim(),
        audience: "视频内容",
        platforms: ["抖音", "小红书"],
      });
      await onRefresh();
      await onProjectChange(p.path);
      setNewOpen(false);
      setName("");
    });
  const importMedia = () =>
    action("导入媒体", async () => {
      const data = await window.cs.studioImport(root);
      if (data) {
        applyFromBackend(data);
        setTab("media");
        setMessage("素材已复制到工程，可以离线继续剪辑");
      }
    });
  const importAt = (
    point: { x: number; y: number },
    files?: File[],
    fromClipboard = false,
  ) =>
    action("导入素材节点", async () => {
      const before = current.current;
      try {
        const data = await window.cs.studioImportAt(
          root,
          point,
          files,
          fromClipboard,
        );
        if (data) {
          applyFromBackend(data);
          setMessage("素材已添加到鼠标位置，可直接连线生成");
        }
      } catch (e) {
        const data = await window.cs.studioRead(root);
        if (data.revision !== before?.revision) applyFromBackend(data);
        throw e;
      }
    });
  const useTemplate = (theme: StudioState["theme"], text: string) => {
    if (!state) return;
    patch({
      mode: "pixel",
      theme,
      clips: [{ id: uid(), start: 0, end: 5, text, enabled: true }],
    });
    setPlayhead(0);
    setPlaying(false);
    setTab("script");
  };
  const generateScenes = () => {
    const lines = script
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      setError("每行写一句画面文案");
      return;
    }
    if (lines.some((s) => s.length > 100)) {
      setError("每个场景请控制在 100 字以内，长句请换行");
      return;
    }
    patch({
      mode: "pixel",
      clips: lines.map((text) => ({
        id: uid(),
        start: 0,
        end: Math.max(3, Math.min(12, text.length / 4)),
        text,
        enabled: true,
      })),
    });
    setPlayhead(0);
  };
  const exportNow = () =>
    action("提交导出", async () => {
      await window.cs.studioExport(root);
      setJobsOpen(true);
      setJobs(await window.cs.studioJobs());
    });
  const split = () => {
    if (!active || !state) return;
    const cut = active.start + playhead - active.offset;
    if (cut - active.start < 0.08 || active.end - cut < 0.08) {
      setError("请把播放头移到片段中间再分割");
      return;
    }
    patch({
      clips: state.clips.flatMap((c) =>
        c.id === active.id
          ? [
              { ...c, end: cut },
              {
                ...c,
                id: uid(),
                start: cut,
                ...(c.voiceId
                  ? { voiceStart: (c.voiceStart || 0) + cut - c.start }
                  : {}),
              },
            ]
          : [c],
      ),
    });
  };
  const move = (id: string, delta: number) => {
    if (!state) return;
    const list = [...state.clips],
      i = list.findIndex((c) => c.id === id),
      j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    patch({ clips: list });
    setPlayhead(0);
  };
  const importSrt = () =>
    action("导入字幕", async () => {
      if (!selectedMedia) return;
      const data = await window.cs.studioSRT(root, selectedMedia.id);
      if (data) {
        applyFromBackend(data);
        setTab("script");
        setMessage("字幕已按源时码导入，字幕间空白时段完整保留；可撤销");
      }
    });
  const transcribe = () =>
    action("本地语音转写（首次模型加载可能较慢）", async () => {
      if (!selectedMedia || !current.current) return;
      const clips = await window.cs.studioTranscribe(root, selectedMedia.id);
      change({ ...current.current, mode: "talk", clips });
      setPlayhead(0);
      setTab("script");
      setMessage("语音已转为可剪辑片段，请校对专有名词与切点");
    });
  const detectSilence = () =>
    action("分析静音", async () => {
      if (!selectedMedia) return;
      const result = await window.cs.studioSilence(
        root,
        selectedMedia.id,
        threshold,
        minimum,
      );
      setSilence({ ...result, mediaId: selectedMedia.id });
    });
  const applySilence = () => {
    if (!silence || !state) return;
    const affected = state.clips.filter((c) => c.mediaId === silence.mediaId);
    const source = affected.length
      ? affected
      : [
          {
            id: uid(),
            mediaId: silence.mediaId,
            start: 0,
            end: selectedMedia!.duration,
            text: "",
            enabled: true,
          },
        ];
    const cutClip = (c: StudioClip) =>
      silence.ranges
        .map(([a, b]) => ({
          ...c,
          id: uid(),
          start: Math.max(a, c.start),
          end: Math.min(b, c.end),
          ...(c.voiceId
            ? {
                voiceStart:
                  (c.voiceStart || 0) + Math.max(a, c.start) - c.start,
              }
            : {}),
        }))
        .filter((c) => c.end - c.start >= 0.08);
    patch({
      mode: "talk",
      clips: state.clips.length
        ? state.clips.flatMap((c) =>
            c.mediaId === silence.mediaId ? cutClip(c) : [c],
          )
        : source.flatMap(cutClip),
    });
    setSilence(null);
    setPlayhead(0);
    setMessage("已应用静音剪辑，可撤销；原始媒体完整保留");
  };
  return (
    <div
      ref={studioElement}
      className={`studio ${workspaceView === "canvas" ? "canvas-mode" : ""} ${fullscreen ? "studio-fullscreen" : ""}`}
    >
      {voiceURL && (
        <audio
          aria-label="配音预览"
          ref={voice}
          src={voiceURL}
          preload="auto"
        />
      )}
      {musicURL && (
        <audio
          aria-label="背景音乐预览"
          ref={music}
          src={musicURL}
          preload="auto"
          loop
        />
      )}
      <div className="studio-heading">
        <div>
          <span className="studio-eyebrow">YOUR CREATIVE SPACE</span>
          <h1>
            {workspaceView === "canvas"
              ? "让创作，自由发生"
              : "把想法，剪成作品"}
            <span>。</span>
          </h1>
          <p>
            {workspaceView === "canvas"
              ? "从一个灵感，到一条视频。你的素材、分镜与故事，都在这里。"
              : "整理素材、精修口播、搭配字幕和声音，保留你的创作判断。"}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div className="studio-view-switch" aria-label="创作室视图">
            <button
              className={workspaceView === "canvas" ? "active" : ""}
              onClick={() => {
                setPlaying(false);
                setWorkspaceView("canvas");
              }}
            >
              创作画布
            </button>
            <button
              className={workspaceView === "edit" ? "active" : ""}
              onClick={() => setWorkspaceView("edit")}
            >
              时间线精剪
            </button>
          </div>
          <button
            className="s-button"
            aria-label={fullscreen ? "退出创作室全屏" : "全屏创作室"}
            title="F 全屏 / Esc 退出"
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {fullscreen ? "退出全屏" : "全屏"}
          </button>
          <button
            className="s-button"
            disabled={!state}
            onClick={() => openGeneration()}
          >
            <Sparkles size={16} />
            AI 生成
          </button>
          <button className="s-button" onClick={() => setJobsOpen(true)}>
            <ArrowDownToLine size={16} />
            导出队列
            {jobs.some((j) => j.status === "running") && (
              <i className="live-dot" />
            )}
          </button>
        </div>
      </div>
      <div className="studio-projectbar">
        <div className="project-select">
          <FolderOpen size={17} />
          <select
            aria-label="当前剪辑项目"
            disabled={!!busy || saving}
            value={root}
            onChange={(e) => {
              const target = e.target.value;
              void action("打开工程", async () => {
                await onProjectChange(target);
              });
            }}
          >
            <option value="" disabled>
              选择一个项目开始
            </option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.title}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <button
          className="s-icon"
          aria-label="新建剪辑项目"
          title="新建剪辑项目"
          onClick={() => setNewOpen(true)}
        >
          <Plus size={17} />
        </button>
        <span className="save-status">
          {saving ? (
            <>
              <LoaderCircle className="spin" size={13} />
              保存中
            </>
          ) : error ? (
            <span className="warning-text">需要处理</span>
          ) : root ? (
            <>
              <Check size={13} />
              已保存到本机
            </>
          ) : (
            <>本地优先 · 文件属于你</>
          )}
        </span>
        <div className="projectbar-right">
          <button
            className="s-icon"
            aria-label="撤销"
            disabled={!undo.current.length}
            onClick={() => history("undo")}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="s-icon"
            aria-label="重做"
            disabled={!redo.current.length}
            onClick={() => history("redo")}
          >
            <Redo2 size={16} />
          </button>
          <button
            className="s-button primary"
            disabled={!total || !!busy || saving}
            onClick={() => void exportNow()}
          >
            <ArrowDownToLine size={16} />
            导出视频
          </button>
        </div>
      </div>
      {error && (
        <div className="studio-banner error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="关闭错误">
            <X size={14} />
          </button>
        </div>
      )}
      {message && !error && (
        <div className="studio-banner" role="status">
          {message}
          <button onClick={() => setMessage("")} aria-label="关闭提示">
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="studio-busy" role="status">
          <LoaderCircle className="spin" size={14} />
          {busy}…
        </div>
      )}
      {workspaceView === "canvas" ? (
        <StudioCanvas
          key={root}
          root={root}
          state={state}
          patch={patch}
          updateClip={updateClip}
          selectClip={selectClip}
          selected={selected}
          importMedia={() => void importMedia()}
          importAt={importAt}
          onHistory={history}
          canUndo={!!undo.current.length}
          canRedo={!!redo.current.length}
          newProject={() => setNewOpen(true)}
          edit={() => setWorkspaceView("edit")}
          disabled={!!busy}
          notice={setMessage}
          generate={openGeneration}
          runGraph={async (ids, preview) => {
            const target = rootRef.current;
            await chain.current;
            if (target !== rootRef.current)
              throw Error("项目已切换，请在当前项目重新操作");
            return preview
              ? window.cs.generationPreviewGraph(target, ids)
              : window.cs.generationEnqueueGraph(target, ids);
          }}
        />
      ) : (
        <div className="editor-grid">
          <section className="studio-left">
            <div className="studio-tabs">
              {(
                [
                  ["script", "文稿"],
                  ["media", "媒体"],
                  ["templates", "模板"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "selected" : ""}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "script" && (
              <>
                <div className="panel-heading">
                  <span>
                    {state?.mode === "pixel" ? "场景文案" : "口播剪辑"}
                  </span>
                  <span className="subtle">
                    {state?.clips.length || 0} 个片段
                  </span>
                </div>
                <div className="mode-switch">
                  <button
                    disabled={!root || !!busy}
                    className={state?.mode !== "pixel" ? "active" : ""}
                    onClick={() => {
                      if (state?.mode === "pixel") {
                        patch({ mode: "talk", clips: [] });
                        setPlaying(false);
                        setPlayhead(0);
                      }
                    }}
                  >
                    <AudioLines size={14} />
                    口播
                  </button>
                  <button
                    disabled={!root || !!busy}
                    className={state?.mode === "pixel" ? "active" : ""}
                    onClick={() => {
                      if (state?.mode !== "pixel")
                        useTemplate("mint", templates[0].text);
                    }}
                  >
                    <Grid2X2 size={14} />
                    像素
                  </button>
                </div>
                {state?.mode === "pixel" && (
                  <div className="scene-writer">
                    <label htmlFor="scene-script">逐行输入，生成场景</label>
                    <textarea
                      id="scene-script"
                      placeholder={
                        "一句观点，一幅画面。\n用一次行动，验证一个想法。"
                      }
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                    />
                    <button className="s-button" onClick={generateScenes}>
                      <Sparkles size={14} />
                      生成场景
                    </button>
                    <small>
                      按字数估算时长，可逐段调整；配音可从媒体库绑定。
                    </small>
                  </div>
                )}
                {state?.mode !== "pixel" && (
                  <div className="script-actions">
                    <button
                      className="s-button"
                      disabled={!selectedMedia || !!busy}
                      onClick={() => void importSrt()}
                    >
                      <Subtitles size={14} />
                      导入 SRT
                    </button>
                    <button
                      className="s-button"
                      disabled={!selectedMedia?.hasAudio || !!busy}
                      onClick={() => void transcribe()}
                    >
                      <AudioLines size={14} />
                      转写
                    </button>
                    <button
                      className="s-icon"
                      title="导入媒体"
                      aria-label="导入媒体"
                      disabled={!root || !!busy}
                      onClick={() => void importMedia()}
                    >
                      <Upload size={15} />
                    </button>
                  </div>
                )}
                <div className="clip-list">
                  {state?.clips.length ? (
                    state.clips.map((c, i) => (
                      <div
                        key={c.id}
                        className={`script-clip ${c.id === clip?.id ? "selected" : ""} ${!c.enabled ? "excluded" : ""}`}
                      >
                        <div className="clip-meta">
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`保留片段 ${i + 1}`}
                              checked={c.enabled}
                              onChange={(e) =>
                                updateClip(c.id, { enabled: e.target.checked })
                              }
                            />
                            <span>{String(i + 1).padStart(2, "0")}</span>
                          </label>
                          <button onClick={() => selectClip(c)}>
                            {clock(c.start)} → {clock(c.end)}
                          </button>
                          <span>{(c.end - c.start).toFixed(1)}s</span>
                        </div>
                        <textarea
                          aria-label={`片段 ${i + 1} 文本`}
                          value={c.text}
                          placeholder="输入字幕或备注"
                          onFocus={() => setSelected(c.id)}
                          onChange={(e) =>
                            updateClip(c.id, { text: e.target.value })
                          }
                          maxLength={state.mode === "pixel" ? 100 : 500}
                        />
                        <div className="clip-controls">
                          <button
                            aria-label={`上移片段 ${i + 1}`}
                            disabled={i === 0}
                            onClick={() => move(c.id, -1)}
                          >
                            <ArrowLeft size={12} />
                          </button>
                          <button
                            aria-label={`下移片段 ${i + 1}`}
                            disabled={i === state.clips.length - 1}
                            onClick={() => move(c.id, 1)}
                          >
                            <ArrowRight size={12} />
                          </button>
                          <button
                            aria-label={`复制片段 ${i + 1}`}
                            onClick={() =>
                              patch({
                                clips: state.clips.flatMap((x) =>
                                  x.id === c.id
                                    ? [x, { ...x, id: uid() }]
                                    : [x],
                                ),
                              })
                            }
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            aria-label={`删除片段 ${i + 1}`}
                            onClick={() =>
                              patch({
                                clips: state.clips.filter((x) => x.id !== c.id),
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty">
                      <Subtitles size={29} />
                      <h3>用文字整理你的表达</h3>
                      <p>
                        导入一段口播和 SRT 字幕。
                        <br />
                        勾选保留的句子，成片随之改变。
                      </p>
                      <button
                        className="s-button"
                        onClick={() =>
                          root ? void importMedia() : setNewOpen(true)
                        }
                      >
                        <Plus size={15} />
                        {root ? "导入第一段素材" : "新建第一个项目"}
                      </button>
                      <small>也可直接按时间分割，无需字幕。</small>
                    </div>
                  )}
                </div>
                {state?.mode === "pixel" && (
                  <button
                    className="add-scene"
                    onClick={() =>
                      patch({
                        clips: [
                          ...state.clips,
                          {
                            id: uid(),
                            start: 0,
                            end: 5,
                            text: "新的观点，新的画面。",
                            enabled: true,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    添加场景
                  </button>
                )}
              </>
            )}
            {tab === "media" && (
              <>
                <div className="panel-heading">
                  <span>工程素材</span>
                  <button
                    className="s-icon"
                    aria-label="添加媒体"
                    disabled={!root || !!busy}
                    onClick={() => void importMedia()}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <label className="media-search">
                  <Search size={14} />
                  <input
                    aria-label="搜索工程素材"
                    placeholder="搜索素材名称"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="media-list">
                  {state?.media
                    .filter((m) =>
                      m.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((m) => (
                      <div
                        key={m.id}
                        className={`media-item ${selectedMedia?.id === m.id ? "selected" : ""}`}
                      >
                        <button
                          className="media-info"
                          onClick={() => setMediaId(m.id)}
                        >
                          <span className="media-icon">
                            {m.kind === "video" ? (
                              <Film size={22} />
                            ) : (
                              <AudioLines size={22} />
                            )}
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>
                              {clock(m.duration)} ·{" "}
                              {m.kind === "video"
                                ? `${m.width} × ${m.height}`
                                : "音频"}
                            </small>
                          </span>
                        </button>
                        <button
                          className="s-icon"
                          aria-label={`添加 ${m.name} 到轨道`}
                          title="添加到轨道"
                          onClick={() => {
                            patch({
                              clips: [
                                ...(state?.clips || []),
                                {
                                  id: uid(),
                                  mediaId: m.id,
                                  start: 0,
                                  end: m.duration,
                                  text: "",
                                  enabled: true,
                                },
                              ],
                            });
                            setTab("script");
                          }}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ))}
                  {!state?.media.length && (
                    <div className="panel-empty">
                      <Upload size={28} />
                      <h3>素材留在自己的电脑</h3>
                      <p>
                        视频、音频导入后复制到项目，
                        <br />
                        源文件始终保留。
                      </p>
                      <button
                        className="s-button"
                        disabled={!root || !!busy}
                        onClick={() => void importMedia()}
                      >
                        选择文件
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="library-link"
                  onClick={() => onNavigate("library")}
                >
                  <Volume2 size={15} />
                  打开声音与字体素材库
                  <ArrowRight size={14} />
                </button>
              </>
            )}
            {tab === "templates" && (
              <>
                <button
                  className="library-link"
                  onClick={() => onNavigate("references")}
                >
                  <Film size={15} /> 查看视频风格案例与提示词{" "}
                  <ArrowRight size={14} />
                </button>
                <div className="panel-heading">
                  <span>从一种表达开始</span>
                  <span className="subtle">3 款</span>
                </div>
                <div className="template-list">
                  {templates.map((t) => (
                    <button
                      key={t.theme}
                      disabled={!root}
                      className="template-card"
                      onClick={() => useTemplate(t.theme, t.text)}
                    >
                      <div
                        dangerouslySetInnerHTML={{
                          __html: sceneSVG(t.text, t.theme, 0.4, 640, 360),
                        }}
                      />
                      <span>
                        <b>{t.title}</b>
                        <small>{t.desc}</small>
                      </span>
                    </button>
                  ))}
                  <p className="panel-note">
                    模板会替换当前轨道，可撤销。角色为通用像素人物，不替代 KAI
                    母版。
                  </p>
                </div>
              </>
            )}
          </section>
          <section className="studio-center">
            <div className="viewer-toolbar">
              <span>
                <i className="live-dot" />
                预览画布
              </span>
              <span>
                {state?.aspect || "16:9"}
                <span className="separator">/</span>
                {state?.resolution || 720}p
              </span>
            </div>
            <div className="viewer-stage">
              <div
                className={`preview-canvas ${state?.mode === "pixel" ? "pixel" : ""}`}
                style={{ aspectRatio: `${w}/${h}` }}
              >
                {sceneActive && active && state ? (
                  <>
                    {mediaURL && (
                      <video
                        ref={video}
                        src={mediaURL}
                        style={{ display: "none" }}
                        onLoadedMetadata={() => {
                          if (video.current) {
                            video.current.currentTime =
                              active.start +
                              Math.max(0, playhead - active.offset);
                            if (playing) void video.current.play().catch(fail);
                          }
                        }}
                        onError={() =>
                          setError("场景配音无法预览，请检查素材编码。")
                        }
                      />
                    )}
                    <div
                      className="scene-svg"
                      dangerouslySetInnerHTML={{
                        __html: sceneSVG(
                          active.text,
                          state.theme,
                          ((playhead - active.offset) % 2) / 2,
                          w,
                          h,
                          state.sceneStyle || "pixel",
                        ),
                      }}
                    />
                  </>
                ) : imageActive && mediaURL ? (
                  <>
                    <img
                      src={mediaURL}
                      alt={activeMedia?.name || "镜头图片"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit:
                          state?.framing === "fill" ? "cover" : "contain",
                      }}
                    />
                    {state?.captions && active?.text && (
                      <div
                        className="caption-svg"
                        dangerouslySetInnerHTML={{
                          __html: captionSVG(
                            active.text,
                            w,
                            h,
                            state.captionStyle,
                          ),
                        }}
                      />
                    )}
                  </>
                ) : active && mediaURL ? (
                  <>
                    <video
                      ref={video}
                      src={mediaURL}
                      style={{
                        objectFit:
                          state?.framing === "fill" ? "cover" : "contain",
                      }}
                      onLoadedMetadata={() => {
                        if (video.current && active) {
                          video.current.currentTime =
                            active.start +
                            Math.max(0, playhead - active.offset);
                          if (playing) void video.current.play().catch(fail);
                        }
                      }}
                      onTimeUpdate={timeUpdate}
                      onEnded={() => {
                        setPlaying(false);
                        seek(0);
                      }}
                      onError={() =>
                        setError(
                          "此素材无法在内置播放器预览；可先转换为 H.264 MP4 后导入。",
                        )
                      }
                      playsInline
                    />
                    {activeMedia?.kind === "audio" && (
                      <div className="audio-preview">
                        <AudioLines size={60} />
                        <span>{activeMedia.name}</span>
                      </div>
                    )}
                    {state?.captions && active.text && (
                      <div
                        className="caption-svg"
                        dangerouslySetInnerHTML={{
                          __html: captionSVG(
                            active.text,
                            w,
                            h,
                            state.captionStyle,
                          ),
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="preview-empty">
                    <div className="empty-orbit">
                      <Clapperboard size={38} strokeWidth={1.2} />
                      <span />
                      <i />
                    </div>
                    <span className="studio-eyebrow">
                      MAKE SOMETHING THAT MATTERS
                    </span>
                    <h2>下一条好作品，从这里开始</h2>
                    <p>导入口播，或选一个像素模板。</p>
                    <div>
                      <button
                        className="s-button primary"
                        onClick={() =>
                          root ? void importMedia() : setNewOpen(true)
                        }
                      >
                        <Upload size={15} /> {root ? "导入素材" : "创建项目"}
                      </button>
                      <button
                        className="s-button"
                        onClick={() => setTab("templates")}
                      >
                        探索模板
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="viewer-controls">
              <span className="viewer-time">
                {clock(playhead)}
                <span> / {clock(total)}</span>
              </span>
              <div>
                <button
                  className="s-icon"
                  aria-label="回到开头"
                  disabled={!total}
                  onClick={() => seek(0)}
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  className="play-button"
                  aria-label={playing ? "暂停" : "播放"}
                  disabled={!total}
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? (
                    <Pause size={17} />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>
                <span className="key-hint">SPACE</span>
              </div>
              <button
                className="s-icon"
                aria-label="全屏预览"
                onClick={() =>
                  void document
                    .querySelector(".preview-canvas")
                    ?.requestFullscreen()
                    .catch(fail)
                }
              >
                <Maximize2 size={15} />
              </button>
            </div>
            <div className="timeline">
              <div className="timeline-toolbar">
                <span>
                  <Clapperboard size={15} />
                  时间线
                  <span className="subtle">
                    {enabled.length} 段 · {clock(total)}
                  </span>
                </span>
                <button
                  className="s-button compact"
                  disabled={!active}
                  onClick={split}
                >
                  <Scissors size={13} />
                  在播放头分割
                </button>
              </div>
              <input
                className="timeline-scrubber"
                aria-label="播放位置"
                type="range"
                min="0"
                max={Math.max(total, 0.01)}
                step="0.03"
                value={Math.min(playhead, total)}
                onChange={(e) => seek(Number(e.target.value))}
              />
              <div className="timeline-ruler">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i}>{clock((total * i) / 4)}</span>
                ))}
              </div>
              <div className="track-row">
                <span className="track-label">
                  <Film size={14} />
                  画面
                </span>
                <div className="track-content">
                  {!!state?.rhythm?.bpm && total > 0 && (
                    <div className="beat-grid" aria-label="参考节拍网格">
                      {Array.from({
                        length: Math.min(
                          400,
                          Math.ceil(total / (60 / state.rhythm.bpm)),
                        ),
                      }).map((_, i) => {
                        const t =
                          (state.rhythm?.offset || 0) +
                          (i * 60) / state.rhythm!.bpm!;
                        return t < total ? (
                          <i
                            key={i}
                            style={{ left: `${(t / total) * 100}%` }}
                          />
                        ) : null;
                      })}
                    </div>
                  )}
                  {enabled.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => selectClip(c)}
                      className={`timeline-clip ${c.id === clip?.id ? "selected" : ""} ${state?.mode === "pixel" ? "pixel" : ""}`}
                      style={{ flexGrow: c.end - c.start, flexBasis: 0 }}
                      title={c.text || `片段 ${i + 1}`}
                    >
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <b>{c.text || "原始片段"}</b>
                      <small>{(c.end - c.start).toFixed(1)}s</small>
                    </button>
                  ))}
                  {!enabled.length && (
                    <div className="track-placeholder">
                      你的故事将在这里展开
                    </div>
                  )}
                </div>
              </div>
              <div className="track-row caption-track">
                <span className="track-label">
                  <Subtitles size={14} />
                  字幕
                </span>
                <div className="track-content">
                  {enabled.map((c) => (
                    <button
                      key={c.id}
                      style={{ flexGrow: c.end - c.start, flexBasis: 0 }}
                      onClick={() => selectClip(c)}
                    >
                      {state?.captions ? c.text || "无字幕" : "已关闭字幕"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="timeline-bottom">
                <span>原始素材完整保留</span>
                <span>
                  ⌘ Z 撤销<span className="separator">·</span>⌘ S 保存
                </span>
              </div>
            </div>
          </section>
          <aside className="studio-inspector">
            <div className="panel-heading">
              <span>
                <SlidersHorizontal size={15} />
                制作设置
              </span>
              <Settings2 size={15} />
            </div>
            <div className="inspector-section">
              <h3>画布与输出</h3>
              <label>
                画面比例
                <select
                  aria-label="画面比例"
                  disabled={!state}
                  value={state?.aspect || "16:9"}
                  onChange={(e) =>
                    patch({ aspect: e.target.value as StudioState["aspect"] })
                  }
                >
                  <option>16:9</option>
                  <option>9:16</option>
                  <option>1:1</option>
                  <option>4:3</option>
                </select>
              </label>
              <label>
                分辨率
                <select
                  aria-label="分辨率"
                  disabled={!state}
                  value={state?.resolution || 720}
                  onChange={(e) =>
                    patch({ resolution: Number(e.target.value) as 720 | 1080 })
                  }
                >
                  <option value={720}>720p · 快速预览</option>
                  <option value={1080}>1080p · 正式导出</option>
                </select>
              </label>
              <div className="inspector-hint">
                H.264 MP4 · 30 FPS
                <br />
                音频 AAC · 48 kHz
              </div>
            </div>
            {state &&
              state.clips.some(
                (c) =>
                  c.visual === "scene" || (!c.visual && state.mode === "pixel"),
              ) && (
                <div className="inspector-section">
                  <h3>场景美术</h3>
                  <label>
                    画风
                    <select
                      aria-label="场景画风"
                      value={state.sceneStyle || "pixel"}
                      onChange={(e) =>
                        patch({
                          sceneStyle: e.target.value as
                            "pixel" | "illustration",
                        })
                      }
                    >
                      <option value="pixel">像素环境</option>
                      <option value="illustration">平面插画</option>
                    </select>
                  </label>
                  <div className="theme-swatches">
                    {templates.map((t) => (
                      <button
                        key={t.theme}
                        aria-label={t.title}
                        className={`${t.theme} ${state.theme === t.theme ? "selected" : ""}`}
                        onClick={() => patch({ theme: t.theme })}
                      >
                        {state.theme === t.theme && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                  <p className="inspector-hint">
                    P01 雾松 / P06 暮紫 / P04 书房
                  </p>
                </div>
              )}
            {state && (
              <EditingControls
                key={root}
                root={root}
                state={state}
                clip={clip}
                patch={patch}
                updateClip={updateClip}
                action={action}
                importMedia={importMedia}
                notice={setMessage}
              />
            )}
            {clip && (
              <div className="inspector-section">
                <h3>选中片段</h3>
                <div className="trim-inputs">
                  <label>
                    起点 / 秒
                    <input
                      aria-label="片段起点"
                      type="number"
                      min="0"
                      step=".1"
                      key={`${clip.id}-start-${clip.start}`}
                      defaultValue={clip.start.toFixed(2)}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n >= 0 && n < clip.end - 0.08)
                          updateClip(clip.id, { start: n });
                        else e.target.value = clip.start.toFixed(2);
                      }}
                    />
                  </label>
                  <label>
                    终点 / 秒
                    <input
                      aria-label="片段终点"
                      type="number"
                      min=".08"
                      step=".1"
                      key={`${clip.id}-end-${clip.end}`}
                      defaultValue={clip.end.toFixed(2)}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        const m = state?.media.find(
                          (m) => m.id === clip.mediaId,
                        );
                        if (
                          n > clip.start + 0.08 &&
                          n <=
                            (m?.kind === "image" ? 3600 : m?.duration || 3600)
                        )
                          updateClip(clip.id, { end: n });
                        else e.target.value = clip.end.toFixed(2);
                      }}
                    />
                  </label>
                </div>
                {state?.mode === "pixel" && (
                  <label>
                    场景配音
                    <select
                      aria-label="场景配音"
                      value={clip.mediaId || ""}
                      onChange={(e) => {
                        const m = state.media.find(
                          (m) => m.id === e.target.value,
                        );
                        updateClip(clip.id, {
                          mediaId: m?.id,
                          start: 0,
                          end: m ? Math.min(clip.end, m.duration) : clip.end,
                        });
                      }}
                    >
                      <option value="">无配音</option>
                      {state.media
                        .filter((m) => m.hasAudio)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {state?.mode !== "pixel" && (
              <div className="inspector-section">
                <h3>
                  <AudioLines size={14} />
                  静音检测
                </h3>
                <label>
                  分析素材
                  <select
                    aria-label="静音检测素材"
                    value={selectedMedia?.id || ""}
                    onChange={(e) => setMediaId(e.target.value)}
                  >
                    <option value="" disabled>
                      请先导入素材
                    </option>
                    {state?.media.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="trim-inputs">
                  <label>
                    阈值 / dB
                    <input
                      aria-label="静音阈值"
                      type="number"
                      min="-80"
                      max="-10"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    最短 / 秒
                    <input
                      aria-label="静音最短时长"
                      type="number"
                      min=".1"
                      max="5"
                      step=".05"
                      value={minimum}
                      onChange={(e) => setMinimum(Number(e.target.value))}
                    />
                  </label>
                </div>
                <button
                  className="s-button full"
                  disabled={!selectedMedia?.hasAudio || !!busy}
                  onClick={() => void detectSilence()}
                >
                  <Scissors size={14} />
                  检测停顿
                </button>
                {silence && (
                  <div className="silence-result">
                    <b>检测到 {silence.removed.toFixed(1)} 秒停顿</b>
                    <p>
                      保留 {silence.ranges.length} 个区间，切点各留 0.1 秒。
                    </p>
                    <button className="s-button primary" onClick={applySilence}>
                      应用到当前剪辑
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="inspector-footer">
              <span className="live-dot" />
              <span>
                本机处理
                <br />
                <small>媒体无需上传云端</small>
              </span>
            </div>
          </aside>
        </div>
      )}
      <div className="studio-footer">
        <span>
          CS STUDIO<span className="separator">/</span>你的内容，你的节奏。
        </span>
        <button onClick={() => onNavigate("projects")}>
          项目文档与发布管理
          <ArrowRight size={13} />
        </button>
      </div>
      <StudioGeneration
        root={root}
        state={state}
        open={generationOpen}
        close={() => setGenerationOpen(false)}
        attach={attachGenerated}
        saveDraft={saveGenerationDraft}
      />
      {newOpen && (
        <Dialog
          label="新建剪辑项目"
          onClose={() => setNewOpen(false)}
          dismissible={!busy}
          error={error}
        >
          <form
            className="studio-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <button
              type="button"
              className="modal-close s-icon"
              aria-label="关闭新建项目"
              onClick={() => setNewOpen(false)}
            >
              <X size={18} />
            </button>
            <span className="studio-eyebrow">A NEW BEGINNING</span>
            <h2>这次，你想讲什么？</h2>
            <p>视频、文稿和素材，都收进同一个工程。</p>
            <label>
              项目名称
              <input
                autoFocus
                aria-label="剪辑项目名称"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：把 AI 变成我的创作搭档"
              />
            </label>
            <button
              className="s-button primary"
              disabled={!name.trim() || !!busy}
            >
              创建项目
              <ArrowRight size={16} />
            </button>
          </form>
        </Dialog>
      )}
      {jobsOpen && (
        <Dialog
          label="导出队列"
          onClose={() => setJobsOpen(false)}
          error={error}
        >
          <section className="studio-modal jobs-modal">
            <button
              className="modal-close s-icon"
              aria-label="关闭导出队列"
              onClick={() => setJobsOpen(false)}
            >
              <X size={18} />
            </button>
            <span className="studio-eyebrow">RENDER QUEUE</span>
            <h2>让作品，走出画布。</h2>
            <p>导出后自动检查媒体与解码，工程保留在本机。</p>
            <div className="job-list">
              {jobs.length ? (
                jobs.map((j) => (
                  <article className="job" key={j.id}>
                    <div>
                      <Film size={19} />
                      <strong>{j.title}</strong>
                      <span
                        className={
                          j.status === "complete" ? "success-text" : ""
                        }
                      >
                        {jobLabels[j.status] || j.status}
                      </span>
                    </div>
                    <progress value={j.progress} max="100" />
                    <div>
                      <small>
                        {j.progress}% {j.error && `· ${j.error}`}
                      </small>
                      {["queued", "running"].includes(j.status) ? (
                        <button
                          className="s-button compact"
                          onClick={() =>
                            void action("取消任务", async () => {
                              await window.cs.studioCancel(j.id);
                              setJobs(await window.cs.studioJobs());
                            })
                          }
                        >
                          取消
                        </button>
                      ) : j.status === "complete" ? (
                        <button
                          className="s-button compact"
                          onClick={() =>
                            void action("打开成片", async () => {
                              const e = await window.cs.studioOpenExport(j.id);
                              if (e) throw new Error(e);
                            })
                          }
                        >
                          <Play size={12} />
                          打开成片
                        </button>
                      ) : (
                        <button
                          className="s-button compact"
                          onClick={() =>
                            void action("重新导出", async () => {
                              await window.cs.studioExport(j.root);
                              setJobs(await window.cs.studioJobs());
                            })
                          }
                        >
                          按已保存工程重试
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="panel-empty">
                  <ArrowDownToLine size={32} />
                  <p>剪好第一条视频，再来这里看成果。</p>
                </div>
              )}
            </div>
          </section>
        </Dialog>
      )}
    </div>
  );
}
