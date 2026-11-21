import {
  connectInputs,
  referenceBindings,
  canvasMentionChoices,
  selectCanvasMention,
} from "../shared/canvas-references.mjs";
import { CanvasCommandMenu, type CanvasCommand } from "./CanvasCommandMenu";
import {
  copyCanvasSelection,
  pasteCanvasSelection,
  layoutCanvasSelection,
} from "../shared/canvas-editing.mjs";
import { videoModel } from "./video-models";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Eye,
  Keyboard,
  AlignStartVertical,
  Clapperboard,
  Copy,
  ExternalLink,
  Film,
  Hand,
  ImagePlus,
  LayoutGrid,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Search,
  StickyNote,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  StudioState,
  StudioClip,
  StudioMedia,
  StudioCanvasData,
  CanvasGenerator,
  CanvasEdge,
  GenerationJob,
  GenerationGraphPlan,
} from "./types";
// @ts-ignore shared renderer
import { sceneSVG } from "../shared/studio-visuals.mjs";
import "./studio-canvas.css";
import { CanvasGeneratorNode, runningJob } from "./CanvasGeneratorNode";
import "./canvas-generation.css";
import { CanvasMediaPreview } from "./CanvasMediaPreview";

const initialCanvas = (): StudioCanvasData => ({
  positions: {},
  notes: [],
  view: { x: 65, y: 85, zoom: 0.85 },
});
const duration = (c: StudioClip) => c.end - c.start;
const isScene = (c: StudioClip, state: StudioState) =>
  c.visual === "scene" || (!c.visual && state.mode === "pixel");
function MediaThumb({ root, media }: { root: string; media: StudioMedia }) {
  const [url, setURL] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setURL("");
    setError(false);
    window.cs
      .studioMediaURL(root, media.id)
      .then((u) => {
        if (live) setURL(u);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [root, media.id]);
  if (error) return <span className="vc-media-error">素材预览不可用</span>;
  if (media.kind === "image")
    return url ? (
      <img
        src={url}
        alt={media.name}
        draggable={false}
        onError={() => setError(true)}
      />
    ) : null;
  if (media.kind === "video")
    return url ? (
      <video
        src={url}
        muted
        preload="metadata"
        onError={() => setError(true)}
      />
    ) : null;
  return (
    <div className="vc-audio">
      <AudioLines size={38} />
      <span>音频素材</span>
    </div>
  );
}
export function StudioCanvas({
  root,
  state,
  patch,
  updateClip,
  selectClip,
  selected,
  importMedia,
  importAt,
  onHistory,
  canUndo,
  canRedo,
  newProject,
  edit,
  disabled,
  notice,
  generate,
  runGraph,
}: {
  root: string;
  state: StudioState | null;
  patch: (s: Partial<StudioState>, record?: boolean) => void;
  updateClip: (id: string, s: Partial<StudioClip>) => void;
  selectClip: (c: StudioClip) => void;
  selected: string;
  onHistory: (direction: "undo" | "redo") => void;
  canUndo: boolean;
  canRedo: boolean;
  importMedia: () => void;
  importAt: (
    point: { x: number; y: number },
    files?: File[],
    fromClipboard?: boolean,
  ) => Promise<unknown>;
  newProject: () => void;
  edit: () => void;
  disabled: boolean;
  notice: (s: string) => void;
  generate: (clip?: StudioClip) => void;
  runGraph: (
    ids: string[],
    preview: boolean,
  ) => Promise<GenerationGraphPlan | GenerationJob[]>;
}) {
  const canvas = state?.canvas || initialCanvas();
  const generators = canvas.generators || [],
    sources = canvas.sources || [],
    edges = generators.flatMap((n) =>
      referenceBindings((canvas.edges || []).filter((e) => e.to === n.id)).map(
        ({ kind, provider, ...e }) => e,
      ),
    );
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [wire, setWire] = useState<{
    id: string;
    kind: string;
    x: number;
    y: number;
  } | null>(null);
  const wireRef = useRef(wire);
  wireRef.current = wire;
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    point: { x: number; y: number };
    kind: "create" | "node" | "edge" | "search" | "group" | "connect";
    id?: string;
    from?: string;
  } | null>(null);
  const groups = canvas.groups || [];
  const [selectedEdge, setSelectedEdge] = useState("");
  const clipboardRef = useRef<{ root: string; data: any } | null>(null);
  const wireStart = useRef<{ x: number; y: number } | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setMenu(null);
    setSelectedEdge("");
    clipboardRef.current = null;
  }, [root]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchKind, setBatchKind] = useState<"image" | "video">("video");
  const [plan, setPlan] = useState<{
    ids: string[];
    data: GenerationGraphPlan;
  } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [modalError, setModalError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      if (!root) return;
      try {
        const jobs = await window.cs.generationList(root);
        if (live) setGenerationJobs(jobs);
      } catch {}
    };
    void refresh();
    const off = window.cs.onGenerationChanged(() => void refresh());
    const timer = setInterval(refresh, 4000);
    return () => {
      live = false;
      off();
      clearInterval(timer);
    };
  }, [root]);
  const [view, setView] = useState(canvas.view);
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [panel, setPanel] = useState<"media" | "details" | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(canvas.draft || "");
  const [selection, setSelection] = useState<string[]>([]);
  const [box, setBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const livePositions = useRef(dragPositions);
  const [space, setSpace] = useState(false);
  const spaceRef = useRef(false);
  const [previewId, setPreviewId] = useState("");
  const [help, setHelp] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: 1200,
    height: 600,
  });
  const sequenceDrag = useRef("");
  const [seconds, setSeconds] = useState(5);
  const [query, setQuery] = useState("");
  const [noteId, setNoteId] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: "pan" | "nodes" | "box";
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
    origins?: Record<string, { x: number; y: number }>;
    initial?: string[];
  } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const latest = useRef(canvas);
  latest.current = canvas;
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clips = state?.clips || [];
  const clip = clips.find((c) => c.id === selected);
  const note = canvas.notes.find((n) => n.id === noteId);
  const total = clips
    .filter((c) => c.enabled)
    .reduce((n, c) => n + duration(c), 0);
  useEffect(() => {
    setView(canvas.view);
  }, [state?.canvas?.view]);
  useEffect(
    () => () => {
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    },
    [],
  );
  const saveCanvas = (partial: Partial<StudioCanvasData>, record = true) => {
    latest.current = { ...latest.current, ...partial };
    const validIds = new Set(
      [
        ...clips,
        ...(latest.current.generators || []),
        ...(latest.current.sources || []),
        ...latest.current.notes,
      ].map((n) => n.id),
    );
    if (latest.current.groups)
      latest.current.groups = latest.current.groups
        .map((g) => ({
          ...g,
          nodeIds: g.nodeIds.filter((id) => validIds.has(id)),
        }))
        .filter((g) => g.nodeIds.length);
    if (latest.current.edges)
      latest.current.edges = latest.current.edges.filter(
        (e) => validIds.has(e.from) && validIds.has(e.to),
      );
    patch({ canvas: latest.current }, record);
  };
  const position = (id: string, i: number) =>
    dragPositions[id] ||
    canvas.positions[id] || {
      x: (i % 3) * 340,
      y: Math.floor(i / 3) * 300,
    };
  const commitView = (v: typeof view) => {
    setView(v);
    saveCanvas({ view: v }, false);
  };
  const fit = (
    points = [...clips, ...sources, ...generators]
      .map((c, i) => position(c.id, i))
      .concat(canvas.notes),
  ) => {
    if (!points.length) {
      commitView(initialCanvas().view);
      return;
    }
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.min(...points.map((p) => p.x)),
      top = Math.min(...points.map((p) => p.y));
    const width =
        Math.max(...points.map((p) => p.x + (generators.length ? 320 : 296))) -
        left,
      height =
        Math.max(...points.map((p) => p.y + (generators.length ? 570 : 250))) -
        top;
    const zoom = Math.max(
      0.25,
      Math.min(
        1,
        (box.width - 130) / width,
        (box.height -
          (composerOpen ||
          (!clips.length && !generators.length && !sources.length)
            ? 255
            : 100)) /
          height,
      ),
    );
    commitView({
      x: (box.width - width * zoom) / 2 - left * zoom,
      y: 65 - top * zoom,
      zoom,
    });
  };
  const zoomAt = (zoom: number, x: number, y: number, persist = true) => {
    const old = viewRef.current,
      z = Math.max(0.25, Math.min(2, zoom));
    const v = {
      zoom: z,
      x: x - ((x - old.x) * z) / old.zoom,
      y: y - ((y - old.y) * z) / old.zoom,
    };
    viewRef.current = v;
    setView(v);
    if (persist) saveCanvas({ view: v }, false);
  };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "textarea,input,select,.vg-body,.vc-floating,.vc-composer,.vc-tools,.vc-zoom",
        )
      )
        return;
      e.preventDefault();
      const box = el.getBoundingClientRect(),
        old = viewRef.current;
      if (e.ctrlKey || e.metaKey)
        zoomAt(
          old.zoom * Math.exp(-e.deltaY * 0.008),
          e.clientX - box.left,
          e.clientY - box.top,
          false,
        );
      else {
        const v = {
          ...old,
          x: Math.max(-90000, Math.min(90000, old.x - e.deltaX)),
          y: Math.max(-90000, Math.min(90000, old.y - e.deltaY)),
        };
        viewRef.current = v;
        setView(v);
      }
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(
        () => saveCanvas({ view: viewRef.current }, false),
        180,
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [root, state !== null]);
  const nodes = clips
    .map((c, i) => ({
      id: c.id,
      ...position(c.id, i),
      width: 296,
      height: 250,
    }))
    .concat(
      [...sources, ...generators].map((n, i) => ({
        id: n.id,
        ...position(n.id, clips.length + i),
        width: generators.some((g) => g.id === n.id) ? 320 : 296,
        height: generators.some((g) => g.id === n.id) ? 570 : 250,
      })),
      canvas.notes.map((n) => ({
        ...n,
        ...(dragPositions[n.id] || {}),
        width: 265,
        height: 230,
      })),
    );
  const beginNodeSelection = (id: string, additive: boolean) => {
    const ids = additive
      ? selection.includes(id)
        ? selection.filter((x) => x !== id)
        : [...selection, id]
      : selection.includes(id)
        ? selection
        : [id];
    setSelection(ids);
    return ids;
  };
  const startDrag = (
    e: React.PointerEvent,
    id?: string,
    members?: string[],
  ) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".vc-command-menu")) setMenu(null);
    setSelectedEdge("");
    if (
      disabled ||
      ![0, 1].includes(e.button) ||
      target.closest(
        "input,textarea,select,.vc-floating,.vc-composer,.vc-tools,.vc-zoom,.vc-minimap,.vc-selection-actions,.vc-help-popover,.vc-command-menu",
      )
    )
      return;
    const pan =
      spaceRef.current ||
      tool === "hand" ||
      e.button === 1 ||
      e.pointerType === "touch";
    if (target.closest("button") && !pan) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const bounds = viewport.current!.getBoundingClientRect();
    const x = (e.clientX - bounds.left - view.x) / view.zoom,
      y = (e.clientY - bounds.top - view.y) / view.zoom;
    if (pan)
      drag.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        ox: view.x,
        oy: view.y,
        moved: false,
      };
    else if (id) {
      const ids = members || beginNodeSelection(id, e.shiftKey);
      if (members) setSelection(members);
      drag.current = {
        kind: "nodes",
        x: e.clientX,
        y: e.clientY,
        ox: 0,
        oy: 0,
        moved: false,
        origins: Object.fromEntries(
          nodes
            .filter((n) => ids.includes(n.id))
            .map((n) => [n.id, { x: n.x, y: n.y }]),
        ),
      };
    } else {
      const initial = e.shiftKey ? selection : [];
      setSelection(initial);
      setNoteId("");
      drag.current = {
        kind: "box",
        x: e.clientX,
        y: e.clientY,
        ox: x,
        oy: y,
        initial,
        moved: false,
      };
    }
  };
  const pointerMove = (e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (wireRef.current && viewport.current) {
      const rect = viewport.current.getBoundingClientRect();
      setWire({
        ...wireRef.current,
        x: (e.clientX - rect.left - view.x) / view.zoom,
        y: (e.clientY - rect.top - view.y) / view.zoom,
      });
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.kind === "pan") {
      const v = {
        ...viewRef.current,
        x: Math.max(-90000, Math.min(90000, d.ox + dx)),
        y: Math.max(-90000, Math.min(90000, d.oy + dy)),
      };
      viewRef.current = v;
      setView(v);
    } else if (d.kind === "nodes") {
      const points = Object.values(d.origins || {});
      const tx = Math.max(
        -90000 - Math.min(...points.map((p) => p.x)),
        Math.min(90000 - Math.max(...points.map((p) => p.x)), dx / view.zoom),
      );
      const ty = Math.max(
        -90000 - Math.min(...points.map((p) => p.y)),
        Math.min(90000 - Math.max(...points.map((p) => p.y)), dy / view.zoom),
      );
      const positions = Object.fromEntries(
        Object.entries(d.origins || {}).map(([id, p]) => [
          id,
          { x: p.x + tx, y: p.y + ty },
        ]),
      );
      livePositions.current = positions;
      setDragPositions(positions);
    } else {
      const x2 = d.ox + dx / view.zoom,
        y2 = d.oy + dy / view.zoom;
      const rect = {
        x: Math.min(d.ox, x2),
        y: Math.min(d.oy, y2),
        width: Math.abs(x2 - d.ox),
        height: Math.abs(y2 - d.oy),
      };
      setBox(rect);
      setSelection([
        ...new Set([
          ...(d.initial || []),
          ...nodes
            .filter(
              (n) =>
                n.x < rect.x + rect.width &&
                n.x + n.width > rect.x &&
                n.y < rect.y + rect.height &&
                n.y + n.height > rect.y,
            )
            .map((n) => n.id),
        ]),
      ]);
    }
  };
  const stopDrag = (e?: React.PointerEvent) => {
    if (
      e &&
      wireRef.current &&
      wireStart.current &&
      Math.hypot(
        e.clientX - wireStart.current.x,
        e.clientY - wireStart.current.y,
      ) > 8 &&
      blankTarget(e.target as HTMLElement)
    ) {
      const from = wireRef.current.id;
      openMenu(e.clientX, e.clientY, "create", undefined, from);
      setWire(null);
      wireRef.current = null;
    }
    wireStart.current = null;
    const d = drag.current;
    drag.current = null;
    if (d?.moved && d.kind === "nodes") {
      const positions = { ...canvas.positions };
      for (const c of [...clips, ...sources, ...generators])
        if (livePositions.current[c.id])
          positions[c.id] = livePositions.current[c.id];
      saveCanvas({
        positions,
        notes: canvas.notes.map((n) => ({
          ...n,
          ...(livePositions.current[n.id] || {}),
        })),
      });
    } else if (d?.moved && d.kind === "pan")
      saveCanvas({ view: viewRef.current }, false);
    setBox(null);
    setDragPositions({});
    livePositions.current = {};
  };
  const removeSelection = (ids = selection) => {
    if (!ids.length || disabled) return;
    const positions = { ...canvas.positions };
    ids.forEach((id) => delete positions[id]);
    patch({
      clips: clips.filter((c) => !ids.includes(c.id)),
      canvas: {
        ...canvas,
        positions,
        groups: groups
          .map((g) => ({
            ...g,
            nodeIds: g.nodeIds.filter((id) => !ids.includes(id)),
          }))
          .filter((g) => g.nodeIds.length),
        generators: generators.filter((n) => !ids.includes(n.id)),
        sources: sources.filter((n) => !ids.includes(n.id)),
        edges: edges.filter(
          (e) => !ids.includes(e.from) && !ids.includes(e.to),
        ),
        notes: canvas.notes.filter((n) => !ids.includes(n.id)),
      },
    });
    setSelection([]);
    setNoteId("");
    setPanel(null);
  };
  const alignSelection = () => {
    const selectedNodes = nodes.filter((n) => selection.includes(n.id));
    if (selectedNodes.length < 2) return;
    const y = Math.min(...selectedNodes.map((n) => n.y));
    const positions = { ...canvas.positions };
    [...clips, ...sources, ...generators].forEach((c, i) => {
      if (selection.includes(c.id))
        positions[c.id] = { ...position(c.id, i), y };
    });
    saveCanvas({
      positions,
      notes: canvas.notes.map((n) =>
        selection.includes(n.id) ? { ...n, y } : n,
      ),
    });
  };
  useEffect(() => {
    setDraft(canvas.draft || "");
  }, [canvas.draft]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setViewportSize({ width: r.width, height: r.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable],[role="dialog"]',
        ) ||
        previewId ||
        batchOpen ||
        plan
      )
        return;
      if (e.defaultPrevented || menu) return;
      const command = e.metaKey || e.ctrlKey;
      if (
        command &&
        ["c", "v", "d", "f", "1", "2", "3", "+", "=", "-"].includes(
          e.key.toLowerCase(),
        )
      ) {
        const k = e.key.toLowerCase();
        if (k === "c" && window.getSelection()?.toString()) return;
        e.preventDefault();
        if (k === "c") copyNodes();
        else if (k === "v") void pasteNodes();
        else if (k === "d") duplicateNodes(selection);
        else if (k === "f") openMenuAtCenter("search");
        else if (k === "1")
          zoomAt(1, viewportSize.width / 2, viewportSize.height / 2);
        else if (k === "2") fit();
        else if (k === "3") fit(nodes.filter((n) => selection.includes(n.id)));
        else
          zoomAt(
            view.zoom + (k === "-" ? -0.1 : 0.1),
            viewportSize.width / 2,
            viewportSize.height / 2,
          );
        return;
      }
      if (command && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroup();
        else groupSelection();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        openMenuAtCenter("create");
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        spaceRef.current = true;
        setSpace(true);
      } else if (e.key === "Escape") {
        setWire(null);
        wireRef.current = null;
        setMenu(null);
        setSelectedEdge("");
        setSelection([]);
        setPanel(null);
        setHelp(false);
      } else if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "v"
      )
        setTool("select");
      else if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "h"
      )
        setTool("hand");
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(nodes.map((n) => n.id));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedEdge) {
          saveCanvas({ edges: edges.filter((e) => e.id !== selectedEdge) });
          setSelectedEdge("");
        } else removeSelection();
      } else if (e.key === "0" && !e.metaKey && !e.ctrlKey) fit();
    };
    const release = (e?: KeyboardEvent) => {
      if (!e || e.code === "Space") {
        spaceRef.current = false;
        setSpace(false);
      }
    };
    const blur = () => release();
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
    };
  });
  const previewClip = clips.find((c) => c.id === previewId);
  const visible = (p: { x: number; y: number }) =>
    p.x * view.zoom + view.x < viewportSize.width + 250 &&
    (p.x + 296) * view.zoom + view.x > -250 &&
    p.y * view.zoom + view.y < viewportSize.height + 250 &&
    (p.y + 570) * view.zoom + view.y > -250;
  const mapBounds = {
    x: Math.min(-view.x / view.zoom, ...nodes.map((n) => n.x)),
    y: Math.min(-view.y / view.zoom, ...nodes.map((n) => n.y)),
    right: Math.max(
      (viewportSize.width - view.x) / view.zoom,
      ...nodes.map((n) => n.x + n.width),
    ),
    bottom: Math.max(
      (viewportSize.height - view.y) / view.zoom,
      ...nodes.map((n) => n.y + n.height),
    ),
  };
  const mapWidth = Math.max(1, mapBounds.right - mapBounds.x),
    mapHeight = Math.max(1, mapBounds.bottom - mapBounds.y);
  const addShots = () => {
    if (!state) {
      newProject();
      return;
    }
    const lines = draft
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) return;
    if (
      lines.some((s) => s.length > 500) ||
      clips.length + lines.length > 1000
    ) {
      notice("每个镜头最多 500 字，工程最多 1000 个镜头。");
      return;
    }
    const added = lines.map((text) => ({
      id: crypto.randomUUID(),
      visual: "scene" as const,
      start: 0,
      end: seconds,
      enabled: true,
      text,
      prompt: text,
    }));
    patch({ clips: [...clips, ...added] });
    setDraft("");
    saveCanvas({ draft: "" }, false);
    setComposerOpen(false);
    setNoteId("");
    selectClip(added[0]);
    const p = position(added[0].id, clips.length);
    commitView({ ...view, x: 80 - p.x * view.zoom, y: 80 - p.y * view.zoom });
    notice(
      `已添加 ${added.length} 个分镜。当前为本地场景模板，可绑定自己的图片或视频。`,
    );
  };
  const addNote = (point?: { x: number; y: number }, text = "") => {
    if (!state) {
      newProject();
      return;
    }
    if (canvas.notes.length >= 200) {
      notice("每个画布最多 200 个文本节点。");
      return;
    }
    const id = crypto.randomUUID(),
      x = Math.max(-90000, Math.min(90000, (130 - view.x) / view.zoom)),
      y = Math.max(-90000, Math.min(90000, (110 - view.y) / view.zoom));
    saveCanvas({
      notes: [
        ...canvas.notes,
        { id, text, x: point?.x ?? x, y: point?.y ?? y },
      ],
    });
    setSelection([id]);
    setNoteId(id);
    setPanel("details");
  };
  const addMedia = (m: StudioMedia) => {
    if (!state) return;
    if (m.kind === "audio") {
      patch({ audio: { ...state.audio, musicId: m.id, musicOffset: 0 } });
      notice("已设为全片背景音乐，可在精剪中调整音量。");
      return;
    }
    const c: StudioClip = {
      id: crypto.randomUUID(),
      visual: "media",
      mediaId: m.id,
      start: 0,
      end: m.kind === "image" ? seconds : m.duration,
      text: "",
      enabled: true,
    };
    patch({ clips: [...clips, c] });
    selectClip(c);
    setNoteId("");
    const p = position(c.id, clips.length);
    commitView({ ...view, x: 80 - p.x * view.zoom, y: 80 - p.y * view.zoom });
  };
  const move = (delta: number) => {
    if (!clip) return;
    const list = [...clips],
      i = list.findIndex((c) => c.id === clip.id),
      j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    patch({ clips: list });
  };
  const arrange = () => {
    const items = [...clips, ...sources, ...generators];
    const columns = generators.length
      ? Math.min(
          6,
          Math.max(
            2,
            Math.ceil(
              Math.sqrt(
                (((items.length * 640) / 380) * viewportSize.width) /
                  Math.max(400, viewportSize.height),
              ),
            ),
          ),
        )
      : 3;
    const positions = Object.fromEntries(
      items.map((c, i) => [
        c.id,
        {
          x: (i % columns) * 380,
          y: Math.floor(i / columns) * (generators.length ? 640 : 300),
        },
      ]),
    );
    const notes = canvas.notes.map((n, i) => ({ ...n, x: -320, y: i * 280 }));
    saveCanvas({ positions, notes });
    fit(Object.values(positions).concat(notes));
  };
  const sourceInfo = (id: string) => {
    const text = canvas.notes.find((n) => n.id === id);
    if (text)
      return { kind: "text", name: text.text.slice(0, 24) || "文本节点" };
    const gen = generators.find((n) => n.id === id);
    if (gen) return { kind: gen.kind, name: gen.title };
    const mediaId =
      sources.find((n) => n.id === id)?.mediaId ||
      clips.find((n) => n.id === id)?.mediaId;
    const media = state?.media.find((m) => m.id === mediaId);
    return media ? { kind: media.kind, name: media.name } : null;
  };
  const mentionCandidates = [
    ...clips,
    ...sources,
    ...generators,
    ...canvas.notes,
  ].flatMap((n) => {
    const source = sourceInfo(n.id);
    return source ? [{ id: n.id, ...source }] : [];
  });
  const pickMention = (
    node: CanvasGenerator,
    sourceId: string,
    before: string,
    after: string,
  ): string | false => {
    try {
      const result = selectCanvasMention(
        node,
        edges,
        sourceId,
        sourceInfo,
        before,
        after,
      );
      saveCanvas({
        edges: result.edges,
        generators: generators.map((n) => (n.id === node.id ? result.node : n)),
      });
      return result.alias;
    } catch (e) {
      notice(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const pointFor = (id: string) =>
    nodes.find((n) => n.id === id) ||
    position(
      id,
      [...clips, ...sources, ...generators].findIndex((n) => n.id === id),
    );
  const outputPoint = (id: string) => {
    const p = pointFor(id),
      gen = generators.some((n) => n.id === id);
    return {
      x: p.x + (gen ? 320 : canvas.notes.some((n) => n.id === id) ? 265 : 296),
      y: p.y + (gen || canvas.notes.some((n) => n.id === id) ? 19 : 118),
    };
  };
  const beginWire = (id: string, e?: React.PointerEvent) => {
    const source = sourceInfo(id);
    if (!source) return;
    e?.stopPropagation();
    wireStart.current = e ? { x: e.clientX, y: e.clientY } : null;
    const p = outputPoint(id);
    const next = { id, kind: source.kind, ...p };
    wireRef.current = next;
    setWire(next);
  };
  const connect = (
    node: CanvasGenerator,
    ids = wireRef.current ? [wireRef.current.id] : [],
  ) => {
    if (!ids.length) {
      notice("先从素材节点右侧拖出连线。");
      return;
    }
    try {
      const result = connectInputs(node, edges, ids, sourceInfo);
      saveCanvas({
        edges: result.edges,
        generators: generators.map((n) => (n.id === node.id ? result.node : n)),
      });
      setWire(null);
      wireRef.current = null;
      notice("已连接，在提示词中输入 @ 选择素材。");
    } catch (e) {
      notice(e instanceof Error ? e.message : String(e));
    }
  };
  const setFrame = (
    node: CanvasGenerator,
    role: "first_frame" | "last_frame",
    edgeId: string,
  ) => {
    const bindings = referenceBindings(edges.filter((e) => e.to === node.id));
    const media = bindings.filter((e) => e.kind !== "text");
    if (media.length > 2 || media.some((e) => e.kind !== "image")) {
      notice("首尾帧需要 1–2 张图片，请先断开多余素材。");
      return;
    }
    const incoming = bindings.map(({ kind, provider, ...e }) => ({
      ...e,
      role:
        kind === "text"
          ? ("prompt_text" as const)
          : !edgeId
            ? ("reference_image" as const)
            : e.id === edgeId
              ? role
              : role === "first_frame"
                ? ("last_frame" as const)
                : ("first_frame" as const),
    }));
    saveCanvas({
      edges: [...edges.filter((e) => e.to !== node.id), ...incoming],
      generators: generators.map((n) =>
        n.id === node.id ? { ...n, mode: edgeId ? "frames" : "omni" } : n,
      ),
    });
    if (!edgeId) notice("已取消首尾帧，可继续用 @ 引用素材。");
  };
  const blankTarget = (target: HTMLElement) =>
    !target.closest(
      ".vc-node,.vc-note,.vc-floating,.vc-tools,.vc-zoom,.vc-minimap,.vc-command-menu,.vc-composer,.vc-selection-actions,.vc-help-popover,.vc-group,button,input,textarea,select,[data-edge-id]",
    );
  const worldPoint = (x: number, y: number) => {
    const r = viewport.current!.getBoundingClientRect();
    return {
      x: Math.max(
        -80000,
        Math.min(
          80000,
          (x - r.left - viewRef.current.x) / viewRef.current.zoom,
        ),
      ),
      y: Math.max(
        -80000,
        Math.min(80000, (y - r.top - viewRef.current.y) / viewRef.current.zoom),
      ),
    };
  };
  const openMenu = (
    x: number,
    y: number,
    kind: "create" | "node" | "edge" | "search" | "group" | "connect",
    id?: string,
    from?: string,
  ) => {
    if (disabled) return;
    setMenu({ x, y, kind, id, from, point: worldPoint(x, y) });
  };
  const openMenuAtCenter = (kind: "create" | "search" | "connect") => {
    const r = viewport.current?.getBoundingClientRect();
    if (r)
      openMenu(r.left + r.width / 2, r.top + Math.min(100, r.height / 3), kind);
  };
  const copyNodes = (ids = selection) => {
    if (!state) return;
    const data = copyCanvasSelection(state, ids);
    if (!data) return;
    clipboardRef.current = { root, data };
    void window.cs.copy(
      JSON.stringify({ type: "cs-canvas-nodes-v1", root, data }),
    );
    notice(`已复制 ${ids.length} 个节点及内部连线`);
  };
  const pasteData = (data: any, point: { x: number; y: number }) => {
    if (!state) return;
    try {
      const next = pasteCanvasSelection(state, data, point);
      patch(next.patch);
      setSelection(next.ids);
    } catch (e) {
      notice(String(e));
    }
  };
  const pasteNodes = async (point?: { x: number; y: number }) => {
    if (!state) {
      newProject();
      return;
    }
    const r = viewport.current!.getBoundingClientRect();
    const at =
      point ||
      worldPoint(
        lastPointer.current?.x || r.left + r.width / 2,
        lastPointer.current?.y || r.top + 100,
      );
    try {
      const clipboard = await window.cs.studioClipboard();
      if (clipboard.image) {
        await importAt(at, undefined, true);
        return;
      }
      const text = clipboard.text;
      if (text) {
        let value;
        try {
          value = JSON.parse(text);
        } catch {}
        if (value?.type === "cs-canvas-nodes-v1") {
          if (value.root !== root) {
            notice("请在原工程粘贴节点，跨工程请先导入素材。");
            return;
          }
          pasteData(value.data, at);
          return;
        }
        addNote(at, text.slice(0, 4000));
        return;
      }
    } catch {}
    if (clipboardRef.current?.root === root)
      pasteData(clipboardRef.current.data, at);
    else notice("剪贴板中没有可粘贴的节点或文本。");
  };
  const duplicateNodes = (ids: string[]) => {
    if (!state) return;
    const data = copyCanvasSelection(state, ids);
    const points = nodes.filter((n) => ids.includes(n.id));
    if (data && points.length)
      pasteData(data, {
        x: Math.min(...points.map((n) => n.x)) + 48,
        y: Math.min(...points.map((n) => n.y)) + 48,
      });
  };
  const groupSelection = () => {
    if (selection.length < 2) return;
    const id = crypto.randomUUID();
    saveCanvas({
      groups: [
        ...groups
          .map((g) => ({
            ...g,
            nodeIds: g.nodeIds.filter((id) => !selection.includes(id)),
          }))
          .filter((g) => g.nodeIds.length),
        { id, title: `分镜组 ${groups.length + 1}`, nodeIds: selection },
      ],
    });
  };
  const ungroup = () =>
    saveCanvas({
      groups: groups.filter(
        (g) => !g.nodeIds.some((id) => selection.includes(id)),
      ),
    });
  const layoutSelection = (mode: string) => {
    const locations: Record<string, { x: number; y: number }> =
      layoutCanvasSelection(
        nodes.filter((n) => selection.includes(n.id)),
        mode,
      );
    saveCanvas({
      positions: {
        ...canvas.positions,
        ...Object.fromEntries(
          Object.entries(locations).filter(
            ([id]) => !canvas.notes.some((n) => n.id === id),
          ),
        ),
      },
      notes: canvas.notes.map((n) =>
        locations[n.id] ? { ...n, ...locations[n.id] } : n,
      ),
    });
  };
  const menuCommands = (): CanvasCommand[] => {
    if (!menu) return [];
    const at = menu.point;
    if (menu.kind === "connect")
      return generators.flatMap((n) => {
        const ids = selection.filter(
          (id) =>
            id !== n.id &&
            sourceInfo(id) &&
            (n.kind === "video" ||
              ["image", "text"].includes(sourceInfo(id)!.kind)),
        );
        return ids.length
          ? [
              {
                id: n.id,
                label: n.title,
                hint: `连接 ${ids.length} 个节点`,
                run: () => connect(n, ids),
              },
            ]
          : [];
      });
    if (menu.kind === "group")
      return [
        {
          id: "ungroup",
          label: "解散分镜组",
          run: () =>
            saveCanvas({ groups: groups.filter((g) => g.id !== menu.id) }),
        },
      ];
    if (menu.kind === "search")
      return nodes.map((n) => {
        const gen = generators.find((x) => x.id === n.id),
          note = canvas.notes.find((x) => x.id === n.id),
          clip = clips.find((x) => x.id === n.id);
        return {
          id: n.id,
          label:
            gen?.title ||
            note?.text.slice(0, 40) ||
            sourceInfo(n.id)?.name ||
            clip?.text ||
            "镜头",
          hint: gen?.prompt.slice(0, 32),
          run: () => {
            setSelection([n.id]);
            fit([n]);
          },
        };
      });
    if (menu.kind === "edge")
      return [
        {
          id: "unlink",
          label: "删除连线",
          hint: "Delete",
          run: () => {
            saveCanvas({ edges: edges.filter((e) => e.id !== menu.id) });
            setSelectedEdge("");
          },
        },
      ];
    if (menu.kind === "node") {
      const ids =
          menu.id && selection.includes(menu.id) ? selection : [menu.id!],
        gen = generators.find((n) => n.id === menu.id),
        mediaId =
          gen?.outputMediaId ||
          sources.find((n) => n.id === menu.id)?.mediaId ||
          clips.find((n) => n.id === menu.id)?.mediaId;
      return [
        ...(ids.length > 1
          ? [
              {
                id: "group",
                label: "创建分镜组",
                hint: "⌘/Ctrl G",
                run: () => groupSelection(),
              },
            ]
          : []),
        {
          id: "copy",
          label: "复制节点",
          hint: "⌘/Ctrl C",
          run: () => copyNodes(ids),
        },
        {
          id: "duplicate",
          label: "创建副本",
          hint: "⌘/Ctrl D",
          run: () => duplicateNodes(ids),
        },
        ...(mediaId
          ? [
              {
                id: "preview",
                label: "预览素材",
                run: () => setPreviewId(mediaId),
              },
            ]
          : []),
        ...(sourceInfo(menu.id!)
          ? [
              {
                id: "next",
                label: "引用该节点生成",
                run: () =>
                  openMenu(menu.x, menu.y, "create", undefined, menu.id),
              },
            ]
          : []),
        ...(gen
          ? [
              {
                id: "run",
                label: "生成所选节点",
                disabled:
                  planning ||
                  runningJob(generationJobs.find((j) => j.nodeId === gen.id)),
                run: () =>
                  void runNodes(
                    ids.filter((id) => generators.some((n) => n.id === id)),
                    ids.length > 1,
                  ),
              },
            ]
          : []),
        {
          id: "fit",
          label: "适应选中内容",
          hint: "⌘/Ctrl 3",
          run: () => fit(nodes.filter((n) => ids.includes(n.id))),
        },
        {
          id: "delete",
          label: "删除节点",
          hint: "Delete",
          run: () => removeSelection(ids),
        },
      ];
    }
    const source = menu.from ? sourceInfo(menu.from) : null;
    return [
      ...(!source
        ? [
            {
              id: "text",
              label: "文本节点",
              hint: "提示词 / 灵感",
              run: () => addNote(at),
            },
          ]
        : []),
      ...(!source || ["text", "image"].includes(source.kind)
        ? [
            {
              id: "image",
              label: "图片生成",
              hint: "Codex 生图",
              run: () => addGenerators([newGenerator("image")], at, menu.from),
            },
          ]
        : []),
      {
        id: "video",
        label: "视频生成",
        hint: "H3 / Seedance · 原生 1080P",
        run: () => addGenerators([newGenerator("video")], at, menu.from),
      },
      ...(!source
        ? [
            {
              id: "batch",
              label: "批量分镜",
              hint: "一行一镜",
              run: () => {
                setBatchOpen(true);
                setModalError("");
              },
            },
            {
              id: "import",
              label: "导入图片 / 视频 / 音频",
              run: () => {
                if (!state) newProject();
                else void importAt(at);
              },
            },
            {
              id: "clipboard-image",
              label: "粘贴剪贴板图片",
              run: () => {
                if (!state) newProject();
                else void importAt(at, undefined, true);
              },
            },
            {
              id: "assets",
              label: "从素材库添加",
              run: () => setPanel("media"),
            },
            {
              id: "paste",
              label: "粘贴",
              hint: "⌘/Ctrl V",
              run: () => void pasteNodes(at),
            },
            {
              id: "undo",
              label: "撤销",
              hint: "⌘/Ctrl Z",
              disabled: !canUndo,
              run: () => onHistory("undo"),
            },
            {
              id: "redo",
              label: "重做",
              hint: "⌘/Ctrl Shift Z",
              disabled: !canRedo,
              run: () => onHistory("redo"),
            },
            {
              id: "arrange",
              label: "自动排列画布",
              disabled: !nodes.length,
              run: arrange,
            },
            {
              id: "fit",
              label: "适应全部内容",
              hint: "⌘/Ctrl 2",
              run: () => fit(),
            },
            {
              id: "search",
              label: "搜索画布节点",
              hint: "⌘/Ctrl F",
              run: () => openMenu(menu.x, menu.y, "search"),
            },
          ]
        : []),
    ];
  };
  const newGenerator = (
    kind: "image" | "video",
    prompt = "",
    duration = seconds,
  ): CanvasGenerator => ({
    id: crypto.randomUUID(),
    kind,
    prompt,
    duration: Math.max(kind === "video" ? 4 : 1, Math.min(15, duration)),
    title: `${kind === "image" ? "生图" : "视频"} ${generators.length + 1}`,
    aspect: state?.aspect || "16:9",
    mode: "omni",
    resolution: "1080P",
    model: kind === "video" ? "MiniMax-H3" : undefined,
  });
  const addGenerators = (
    added: CanvasGenerator[],
    point?: { x: number; y: number },
    from?: string,
  ) => {
    if (!state) {
      newProject();
      return;
    }
    if (generators.length + added.length > 200) {
      notice("每个画布最多 200 个生成节点。");
      return;
    }
    let x = Math.max(
      -80000,
      Math.min(80000, (viewportSize.width * 0.4 - view.x) / view.zoom),
    );
    let y = Math.max(-80000, Math.min(80000, (55 - view.y) / view.zoom));
    if (point) {
      x = point.x;
      y = point.y;
    }
    const positions = { ...canvas.positions };
    const occupied = [...clips, ...sources, ...generators].map((n, i) =>
      position(n.id, i),
    );
    while (
      !point &&
      occupied.some((p) => Math.abs(p.x - x) < 350 && Math.abs(p.y - y) < 600)
    ) {
      x += 380;
      if (x > 80000) {
        x = 0;
        y += 620;
      }
    }
    added.forEach((n, i) => {
      positions[n.id] = {
        x: x + (i % 3) * 380,
        y: y + Math.floor(i / 3) * 620,
      };
    });
    let linkedEdges: CanvasEdge[] = edges;
    const linkedNodes = added.map((n) => {
      if (!from) return n;
      const result = connectInputs(n, linkedEdges, [from], sourceInfo);
      linkedEdges = result.edges;
      return result.node;
    });
    saveCanvas({
      generators: [...generators, ...linkedNodes],
      positions,
      edges: linkedEdges,
    });
    setSelection(added.map((n) => n.id));
    setComposerOpen(false);
    if (point) return;
    const zoom = Math.max(
      0.3,
      Math.min(0.85, (viewportSize.height - 100) / 570),
    );
    commitView({
      zoom,
      x: Math.max(65, viewportSize.width / 2 - 160 * zoom) - x * zoom,
      y: 55 - y * zoom,
    });
  };
  const editGenerator = (id: string, value: Partial<CanvasGenerator>) => {
    const current = generators.find((n) => n.id === id);
    const modeChanged = value.mode && current?.mode !== value.mode;
    saveCanvas({
      generators: generators.map((n) => (n.id === id ? { ...n, ...value } : n)),
      ...(modeChanged
        ? {
            edges: edges.filter((e) => e.to !== id || e.role === "prompt_text"),
          }
        : {}),
    });
    if (modeChanged)
      notice("生成方式已切换，已移除不兼容的输入连线，原素材保留。");
  };
  const removeGenerator = (id: string) =>
    saveCanvas({
      groups: groups
        .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((n) => n !== id) }))
        .filter((g) => g.nodeIds.length),
      generators: generators.filter((n) => n.id !== id),
      edges: edges.filter((e) => e.from !== id && e.to !== id),
    });
  const addSource = (media: StudioMedia) => {
    const id = crypto.randomUUID();
    saveCanvas({
      sources: [...sources, { id, mediaId: media.id }],
      positions: {
        ...canvas.positions,
        [id]: { x: (100 - view.x) / view.zoom, y: (70 - view.y) / view.zoom },
      },
    });
    setPanel(null);
    setSelection([id]);
  };
  const runNodes = async (ids: string[], review = false) => {
    if (planning) return;
    setPlanning(true);
    try {
      const data = (await runGraph(ids, true)) as GenerationGraphPlan;
      if (review || data.nodes.length > 1) {
        setModalError("");
        setPlan({ ids, data });
      } else {
        await runGraph(ids, false);
        notice("生成任务已排队，可继续编辑画布。");
      }
    } catch (e) {
      notice(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  };
  const taskAction = async (job: GenerationJob, resume: boolean) => {
    try {
      await (resume
        ? window.cs.generationResume(job.id)
        : window.cs.generationPause(job.id));
    } catch (e) {
      notice(e instanceof Error ? e.message : String(e));
    }
  };
  const buildBatch = () => {
    const lines = batchText
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length || lines.length > 50) {
      setModalError("每次输入 1–50 行分镜。");
      return;
    }
    const added = lines.map((line, i) => {
      const match = line.match(/^\[?(\d+)\s*(?:s|秒)\]?\s*[:：|｜-]?\s*(.+)$/i);
      const n = newGenerator(
        batchKind,
        match ? match[2] : line,
        match ? Number(match[1]) : seconds,
      );
      return {
        ...n,
        title: `分镜 ${String(generators.length + i + 1).padStart(2, "0")}`,
        duration: match ? Number(match[1]) : n.duration,
      };
    });
    if (
      added.some(
        (n) =>
          n.prompt.length > 4000 ||
          n.duration < (n.kind === "video" ? 4 : 1) ||
          n.duration > 15,
      )
    ) {
      setModalError(
        "视频时长为 4–15 秒，图片停留为 1–15 秒；每镜提示词最多 4000 字。",
      );
      return;
    }
    addGenerators(added);
    setBatchOpen(false);
    setBatchText("");
    notice(`已创建 ${added.length} 个生成节点；检查参数后点击批量生成。`);
  };
  return (
    <div className="vc-workspace">
      <div className="vc-topline">
        <span>
          <Clapperboard size={15} /> 视频创作画布 <b>{clips.length} 个镜头</b>
        </span>
        <div className="vg-toolbar">
          <button
            className="s-button compact"
            disabled={!root || disabled}
            onClick={() => addGenerators([newGenerator("image")])}
          >
            <ImagePlus size={13} />
            生图节点
          </button>
          <button
            className="s-button compact"
            disabled={!root || disabled}
            onClick={() => addGenerators([newGenerator("video")])}
          >
            <Film size={13} />
            视频节点
          </button>
          <button
            className="s-button compact"
            disabled={!root || disabled}
            onClick={() => {
              setModalError("");
              setBatchOpen(true);
            }}
          >
            分镜批量建节点
          </button>
          <button
            className="s-button compact"
            disabled={!generators.length || planning}
            onClick={() => {
              const ids = generators
                .filter((n) => selection.includes(n.id))
                .map((n) => n.id);
              void runNodes(
                ids.length
                  ? ids
                  : generators
                      .filter(
                        (n) =>
                          !n.outputMediaId &&
                          !runningJob(
                            generationJobs.find((j) => j.nodeId === n.id),
                          ),
                      )
                      .map((n) => n.id),
                true,
              );
            }}
          >
            批量生成
          </button>
        </div>
        <button
          className="s-button compact"
          onClick={() => setComposerOpen((v) => !v)}
        >
          <Plus size={13} /> 撰写分镜
        </button>
        <button
          className="s-button compact"
          disabled={!clips.length}
          onClick={edit}
        >
          <Film size={13} /> 预览与精剪 <ArrowRight size={13} />
        </button>
      </div>
      <div
        className={`vc-viewport ${tool === "hand" || space ? "is-hand" : "is-select"}`}
        ref={viewport}
        aria-label="视频创作画布"
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          if (!state) {
            newProject();
            return;
          }
          void importAt(
            worldPoint(e.clientX, e.clientY),
            Array.from(e.dataTransfer.files),
          );
        }}
        onDoubleClick={(e) => {
          if (blankTarget(e.target as HTMLElement)) {
            e.preventDefault();
            openMenu(e.clientX, e.clientY, "create");
          }
        }}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("input,textarea,select,[contenteditable]")) return;
          e.preventDefault();
          const edge =
            target.closest<SVGElement>("[data-edge-id]")?.dataset.edgeId;
          const element = target.closest<HTMLElement>(
            "[data-generator-id],[data-clip-id],[data-source-id],[data-note-id]",
          );
          const id =
            element?.dataset.generatorId ||
            element?.dataset.clipId ||
            element?.dataset.sourceId ||
            element?.dataset.noteId;
          if (id && !selection.includes(id)) setSelection([id]);
          if (edge) setSelectedEdge(edge);
          openMenu(
            e.clientX,
            e.clientY,
            edge ? "edge" : id ? "node" : "create",
            edge || id,
          );
        }}
        onPointerDown={(e) => startDrag(e)}
        onPointerMove={pointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={() => {
          drag.current = null;
          setDragPositions({});
          livePositions.current = {};
          setBox(null);
        }}
        style={{
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
        }}
      >
        <div
          className="vc-world"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          {groups.map((g) => {
            const members = nodes.filter((n) => g.nodeIds.includes(n.id));
            if (!members.length) return null;
            const x = Math.min(...members.map((n) => n.x)) - 24,
              y = Math.min(...members.map((n) => n.y)) - 50;
            return (
              <div
                key={g.id}
                className="vc-group"
                data-group-id={g.id}
                style={{
                  left: x,
                  top: y,
                  width:
                    Math.max(...members.map((n) => n.x + n.width)) - x + 24,
                  height:
                    Math.max(...members.map((n) => n.y + n.height)) - y + 24,
                }}
              >
                <header
                  onPointerDown={(e) => startDrag(e, g.nodeIds[0], g.nodeIds)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openMenu(e.clientX, e.clientY, "group", g.id);
                  }}
                >
                  <span>分镜组</span>
                  <input
                    aria-label="分镜组名称"
                    value={g.title}
                    maxLength={100}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      saveCanvas({
                        groups: groups.map((v) =>
                          v.id === g.id ? { ...v, title: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <small>{members.length} 个节点</small>
                </header>
              </div>
            );
          })}
          <svg className="vc-connections" aria-hidden="true">
            {edges.map((e) => {
              const node = generators.find((n) => n.id === e.to);
              if (!node || !sourceInfo(e.from)) return null;
              const a = outputPoint(e.from),
                p = pointFor(e.to),
                b = {
                  x: p.x,
                  y: p.y + 60,
                };
              return (
                <path
                  className={`vg-edge ${selectedEdge === e.id ? "is-selected" : ""}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedEdge(e.id);
                    setSelection([]);
                  }}
                  key={e.id}
                  data-edge-id={e.id}
                  d={`M${a.x},${a.y} C${a.x + 90},${a.y} ${b.x - 90},${b.y} ${b.x},${b.y}`}
                />
              );
            })}
            {wire &&
              (() => {
                const a = outputPoint(wire.id);
                return (
                  <path
                    className="vg-edge pending"
                    d={`M${a.x},${a.y} C${a.x + 90},${a.y} ${wire.x - 90},${wire.y} ${wire.x},${wire.y}`}
                  />
                );
              })()}
            {clips.slice(1).map((c, i) => {
              const a = position(clips[i].id, i),
                b = position(c.id, i + 1);
              return (
                <path
                  key={c.id}
                  d={`M${a.x + 296},${a.y + 118} C${a.x + 324},${a.y + 118} ${b.x - 28},${b.y + 118} ${b.x},${b.y + 118}`}
                />
              );
            })}
          </svg>
          {clips.map((c, i) => {
            const p = position(c.id, i),
              media = state?.media.find((m) => m.id === c.mediaId);
            if (!visible(p) && !selection.includes(c.id)) return null;
            return (
              <article
                key={c.id}
                className={`vc-node ${selection.includes(c.id) || (!selection.length && c.id === selected && !noteId) ? "selected" : ""} ${!c.enabled ? "excluded" : ""}`}
                style={{ left: p.x, top: p.y }}
                data-clip-id={c.id}
                onPointerDown={(e) => {
                  startDrag(e, c.id);
                  if (tool !== "hand" && !spaceRef.current && e.button === 0) {
                    selectClip(c);
                    setNoteId("");
                  }
                }}
              >
                <header>
                  <span>
                    <i /> 镜头 {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="vc-node-header-actions">
                    <span>{duration(c).toFixed(1)}s</span>
                    <button
                      aria-label={`预览镜头 ${i + 1}`}
                      title="放大查看素材"
                      onClick={() => setPreviewId(c.id)}
                    >
                      <Eye size={14} />
                    </button>
                  </span>
                </header>
                <button
                  className="vc-node-image"
                  aria-label={`编辑镜头 ${i + 1}`}
                  onClick={() => {
                    selectClip(c);
                    setNoteId("");
                    setPanel("details");
                  }}
                >
                  {state && isScene(c, state) ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: sceneSVG(
                          c.text,
                          state.theme,
                          0.4,
                          640,
                          360,
                          state.sceneStyle || "pixel",
                        ),
                      }}
                    />
                  ) : media ? (
                    <MediaThumb root={root} media={media} />
                  ) : (
                    <ImagePlus size={30} />
                  )}
                  <span className="vc-node-tag">
                    {state && isScene(c, state)
                      ? "场景模板"
                      : media?.kind === "image"
                        ? "图片"
                        : "视频"}
                  </span>
                </button>
                <footer>
                  <strong>{c.text || media?.name || "未命名镜头"}</strong>
                  <button
                    aria-label={`镜头 ${i + 1} 设置`}
                    onClick={() => {
                      selectClip(c);
                      setNoteId("");
                      setPanel("details");
                    }}
                  >
                    <ArrowRight size={15} />
                  </button>
                </footer>
                <span className="vc-port left" />
                {media ? (
                  <button
                    className="vg-media-output"
                    aria-label={`连接镜头 ${i + 1} 输出`}
                    title="拖到生成节点的输入"
                    onPointerDown={(e) => beginWire(c.id, e)}
                    onKeyDown={(e) => {
                      if (["Enter", " "].includes(e.key)) {
                        e.preventDefault();
                        beginWire(c.id);
                      }
                    }}
                  />
                ) : (
                  <span className="vc-port right" />
                )}
              </article>
            );
          })}
          {sources.map((source, i) => {
            const media = state?.media.find((m) => m.id === source.mediaId),
              p = pointFor(source.id);
            if (!media || (!visible(p) && !selection.includes(source.id)))
              return null;
            return (
              <article
                key={source.id}
                className={`vc-node vg-source ${selection.includes(source.id) ? "selected" : ""}`}
                style={{ left: p.x, top: p.y }}
                data-source-id={source.id}
                onPointerDown={(e) => startDrag(e, source.id)}
              >
                <header>
                  <span>
                    {media.kind === "audio" ? (
                      <AudioLines size={13} />
                    ) : media.kind === "video" ? (
                      <Film size={13} />
                    ) : (
                      <ImagePlus size={13} />
                    )}
                    素材
                  </span>
                  <button
                    aria-label={`移除素材 ${i + 1}`}
                    onClick={() =>
                      saveCanvas({
                        sources: sources.filter((n) => n.id !== source.id),
                        edges: edges.filter((e) => e.from !== source.id),
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </header>
                <div className="vc-node-image">
                  <MediaThumb root={root} media={media} />
                </div>
                <footer>
                  <strong>{media.name}</strong>
                  <small>
                    {media.kind !== "image"
                      ? `${media.duration.toFixed(1)}s`
                      : "图片"}
                  </small>
                </footer>
                <button
                  className="vg-media-output"
                  aria-label={`连接素材 ${i + 1} 输出`}
                  onPointerDown={(e) => beginWire(source.id, e)}
                  onKeyDown={(e) => {
                    if (["Enter", " "].includes(e.key)) {
                      e.preventDefault();
                      beginWire(source.id);
                    }
                  }}
                />
              </article>
            );
          })}
          {generators.map((node, i) => {
            const p = pointFor(node.id);
            if (!visible(p) && !selection.includes(node.id)) return null;
            const job = generationJobs.find((j) => j.nodeId === node.id),
              media = state?.media.find((m) => m.id === node.outputMediaId);
            return (
              <CanvasGeneratorNode
                key={node.id}
                node={node}
                index={i}
                job={job}
                selected={selection.includes(node.id)}
                style={{ left: p.x, top: p.y }}
                wireKind={wire?.kind}
                mentionChoices={canvasMentionChoices(
                  node,
                  edges,
                  mentionCandidates,
                )}
                selectMention={(choice, before, after) =>
                  pickMention(node, choice.id, before, after)
                }
                inputs={referenceBindings(
                  edges.filter((e) => e.to === node.id),
                ).map((e) => ({
                  ...e,
                  name: sourceInfo(e.from)?.name || "上游",
                }))}
                drag={(e) => startDrag(e, node.id)}
                change={(p) => editGenerator(node.id, p)}
                connect={() => connect(node)}
                setFrame={(role, id) => setFrame(node, role, id)}
                output={(e) => beginWire(node.id, e)}
                run={() => void runNodes([node.id])}
                resume={() => job && void taskAction(job, true)}
                pause={() => job && void taskAction(job, false)}
                remove={() => removeGenerator(node.id)}
                unlink={(id) =>
                  saveCanvas({
                    edges: [
                      ...edges.filter((e) => e.to !== node.id),
                      ...referenceBindings(
                        edges.filter((e) => e.to === node.id),
                      )
                        .filter((e) => e.id !== id)
                        .map(({ kind, provider, ...e }) => e),
                    ],
                  })
                }
                duplicate={() => {
                  const id = crypto.randomUUID();
                  saveCanvas({
                    generators: [
                      ...generators,
                      {
                        ...node,
                        id,
                        title: `${node.title} 副本`,
                        outputMediaId: undefined,
                      },
                    ],
                    positions: {
                      ...canvas.positions,
                      [id]: { x: p.x + 370, y: p.y },
                    },
                    edges: [
                      ...edges,
                      ...edges
                        .filter((e) => e.to === node.id)
                        .map((e) => ({
                          ...e,
                          id: crypto.randomUUID(),
                          to: id,
                        })),
                    ],
                  });
                }}
                preview={
                  media ? (
                    <button
                      aria-label={`预览节点 ${i + 1} 结果`}
                      onClick={() => setPreviewId(media.id)}
                    >
                      <MediaThumb root={root} media={media} />
                    </button>
                  ) : null
                }
              />
            );
          })}
          {canvas.notes.map((n) => {
            const p = dragPositions[n.id] || n;
            if (!visible(p) && !selection.includes(n.id)) return null;
            return (
              <article
                data-note-id={n.id}
                className={`vc-note ${selection.includes(n.id) || noteId === n.id ? "selected" : ""}`}
                key={n.id}
                style={{ left: p.x, top: p.y }}
                onPointerDown={(e) => {
                  startDrag(e, n.id);
                  setNoteId(n.id);
                }}
              >
                <header>
                  <StickyNote size={14} /> 文本提示词{" "}
                  <button
                    aria-label="编辑便签"
                    onClick={() => {
                      setNoteId(n.id);
                      setPanel("details");
                    }}
                  >
                    <ArrowRight size={14} />
                  </button>
                </header>
                <button
                  className="vg-output"
                  aria-label={`连接文本 ${canvas.notes.indexOf(n) + 1} 输出`}
                  onPointerDown={(e) => beginWire(n.id, e)}
                  onKeyDown={(e) => {
                    if (["Enter", " "].includes(e.key)) {
                      e.preventDefault();
                      beginWire(n.id);
                    }
                  }}
                />
                <textarea
                  aria-label={`文本节点 ${canvas.notes.indexOf(n) + 1} 内容`}
                  value={n.text}
                  maxLength={4000}
                  placeholder="写提示词，连到生图或视频节点…"
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    saveCanvas({
                      notes: canvas.notes.map((x) =>
                        x.id === n.id ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
                <small>连接到提示词输入，复用同一段描述</small>
              </article>
            );
          })}
          {box && (
            <div
              className="vc-selection-box"
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
              }}
            />
          )}
        </div>
        {menu && (
          <CanvasCommandMenu
            key={`${menu.kind}-${menu.x}-${menu.y}-${menu.id}`}
            x={menu.x}
            y={menu.y}
            title={
              menu.kind === "connect"
                ? "批量连接到节点"
                : menu.kind === "search"
                  ? "搜索画布"
                  : menu.kind === "node"
                    ? "节点操作"
                    : menu.kind === "edge"
                      ? "连线操作"
                      : menu.from
                        ? "引用该节点生成"
                        : "添加节点"
            }
            commands={menuCommands()}
            close={() => setMenu(null)}
          />
        )}
        {wire && (
          <div className="vg-wire-hint">
            正在连接
            {wire.kind === "text"
              ? "文本"
              : wire.kind === "image"
                ? "图片"
                : wire.kind === "video"
                  ? "视频"
                  : "声音"}{" "}
            · 点击匹配的输入圆点{" "}
            <button
              onClick={() => {
                setWire(null);
                wireRef.current = null;
              }}
            >
              取消
            </button>
          </div>
        )}
        {selection.length > 1 && (
          <div className="vc-selection-actions">
            <b>已选择 {selection.length} 项</b>
            <button onClick={() => copyNodes()}>复制</button>
            <button onClick={() => duplicateNodes(selection)}>创建副本</button>
            <select
              aria-label="对齐与分布"
              value=""
              onChange={(e) => layoutSelection(e.target.value)}
            >
              <option value="" disabled>
                对齐与分布
              </option>
              {[
                ["left", "左对齐"],
                ["centerX", "水平居中"],
                ["right", "右对齐"],
                ["top", "顶部对齐"],
                ["centerY", "垂直居中"],
                ["bottom", "底部对齐"],
                ["distributeX", "水平等距"],
                ["distributeY", "垂直等距"],
                ["spread", "自适应展开"],
              ].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <button onClick={() => openMenuAtCenter("connect")}>
              批量连接
            </button>
            <button onClick={groupSelection}>创建分镜组</button>
            <button onClick={ungroup}>解散分镜组</button>
            <button disabled={disabled} onClick={alignSelection}>
              <AlignStartVertical size={14} /> 顶部对齐
            </button>
            <button disabled={disabled} onClick={() => removeSelection()}>
              <Trash2 size={14} /> 移除选中
            </button>
            <button aria-label="取消框选" onClick={() => setSelection([])}>
              <X size={14} />
            </button>
          </div>
        )}
        {!nodes.length && (
          <div className="vc-empty">
            <div className="vc-empty-mark">
              <Clapperboard size={32} strokeWidth={1.3} />
            </div>
            <span className="studio-eyebrow">A SPACE FOR YOUR NEXT STORY</span>
            <h2>让想法，在画布上发生。</h2>
            <p>放入素材，写下分镜。把零散的灵感连成一条视频。</p>
            <div>
              <button
                className="s-button"
                onClick={() => (root ? importMedia() : newProject())}
                disabled={disabled}
              >
                <Upload size={15} /> 导入素材
              </button>
              <button
                className="s-button"
                onClick={() => addNote()}
                disabled={disabled}
              >
                <StickyNote size={15} /> 记录灵感
              </button>
            </div>
            <small>图片 · 视频 · 音频，都保存在本地项目</small>
          </div>
        )}
        <div className="vc-tools" aria-label="画布工具">
          <button
            aria-label="添加画布节点"
            title="添加节点 · 双击空白处 / Tab"
            onClick={() => openMenuAtCenter("create")}
          >
            <Plus size={19} />
          </button>
          <button
            title="框选 / Shift 多选 · V"
            aria-label="选择工具"
            aria-pressed={tool === "select"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 size={18} />
          </button>
          <button
            title="平移画布"
            aria-label="平移工具"
            aria-pressed={tool === "hand"}
            onClick={() => setTool("hand")}
          >
            <Hand size={18} />
          </button>
          <button
            title="快捷键"
            aria-label="画布快捷键"
            aria-pressed={help}
            onClick={() => setHelp((v) => !v)}
          >
            <Keyboard size={18} />
          </button>
          <hr />
          <button
            title="素材库"
            aria-label="画布素材库"
            aria-pressed={panel === "media"}
            onClick={() => setPanel(panel === "media" ? null : "media")}
          >
            <ImagePlus size={19} />
          </button>
          <button
            title="添加便签"
            aria-label="添加便签"
            disabled={disabled}
            onClick={() => addNote()}
          >
            <StickyNote size={18} />
          </button>
          <button
            title="自动排列"
            aria-label="自动排列镜头"
            disabled={!nodes.length || disabled}
            onClick={arrange}
          >
            <LayoutGrid size={18} />
          </button>
        </div>
        <div className="vc-zoom">
          <button
            aria-label="缩小画布"
            onClick={() => zoomAt(view.zoom - 0.1, 300, 200)}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <button
            aria-label="放大画布"
            onClick={() => zoomAt(view.zoom + 0.1, 300, 200)}
          >
            <Plus size={15} />
          </button>
          <i />
          <button aria-label="适应全部内容" onClick={() => fit()}>
            <Maximize size={15} />
          </button>
        </div>
        <div className="vc-gesture">
          双击 / 右键添加节点 · 拖线到空白处创建下游 · 空格平移 · F 全屏
        </div>
        {help && (
          <div className="vc-help-popover">
            <header>
              <b>画布快捷键</b>
              <button aria-label="关闭快捷键" onClick={() => setHelp(false)}>
                <X size={14} />
              </button>
            </header>
            <p>
              <kbd>F</kbd> 创作室全屏 <kbd>Esc</kbd> 退出全屏
            </p>
            <p>
              <kbd>V</kbd> 框选 <kbd>H</kbd> 抓手 <kbd>空格</kbd> 临时抓手
            </p>
            <p>
              <kbd>Shift + 点击</kbd> 多选 <kbd>⌘ / Ctrl A</kbd> 全选
            </p>
            <p>
              <kbd>Delete</kbd> 移除选中 <kbd>⌘ / Ctrl Z</kbd> 撤销
            </p>
            <p>
              <kbd>双击 / Tab</kbd> 添加节点 <kbd>⌘ C / V / D</kbd> 复制 / 粘贴
              / 副本
            </p>
            <p>
              <kbd>⌘ F</kbd> 搜索节点 <kbd>⌘ G</kbd> 创建分镜组
            </p>
            <p>
              <kbd>0</kbd> 适应全部 <kbd>⌘ / Ctrl + 滚轮</kbd> 缩放
            </p>
          </div>
        )}
        {!!nodes.length && (
          <button
            className="vc-minimap"
            aria-label="画布导航图"
            title="点击定位画布"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x =
                  mapBounds.x + ((e.clientX - r.left) / r.width) * mapWidth,
                y = mapBounds.y + ((e.clientY - r.top) / r.height) * mapHeight;
              commitView({
                ...view,
                x: Math.max(
                  -90000,
                  Math.min(90000, viewportSize.width / 2 - x * view.zoom),
                ),
                y: Math.max(
                  -90000,
                  Math.min(90000, viewportSize.height / 2 - y * view.zoom),
                ),
              });
            }}
          >
            <svg
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {nodes.map((n) => (
                <rect
                  key={n.id}
                  x={n.x - mapBounds.x}
                  y={n.y - mapBounds.y}
                  width={n.width}
                  height={n.height}
                  className={selection.includes(n.id) ? "active" : ""}
                />
              ))}
              <rect
                className="vc-map-viewport"
                x={-view.x / view.zoom - mapBounds.x}
                y={-view.y / view.zoom - mapBounds.y}
                width={viewportSize.width / view.zoom}
                height={viewportSize.height / view.zoom}
              />
            </svg>
            <span>画布导航</span>
          </button>
        )}
        {(!nodes.length || composerOpen) && (
          <form
            className="vc-composer"
            onSubmit={(e) => {
              e.preventDefault();
              addShots();
            }}
          >
            <div className="vc-composer-label">
              <Clapperboard size={15} />
              <b>分镜创作</b>
              <span>每行一个镜头</span>
            </div>
            <textarea
              aria-label="画布分镜文案"
              placeholder="写下你的故事，或粘贴分镜文案…"
              value={draft}
              maxLength={20000}
              onChange={(e) => {
                setDraft(e.target.value);
                saveCanvas({ draft: e.target.value }, false);
              }}
            />
            <div className="vc-composer-bottom">
              <button
                type="button"
                title="导入素材"
                aria-label="导入画布素材"
                disabled={disabled}
                onClick={() => (root ? importMedia() : newProject())}
              >
                <Plus size={17} />
              </button>
              <select
                aria-label="画布画面比例"
                value={state?.aspect || "16:9"}
                disabled={!state || disabled}
                onChange={(e) =>
                  patch({ aspect: e.target.value as StudioState["aspect"] })
                }
              >
                {["16:9", "9:16", "4:3", "1:1"].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <select
                aria-label="新镜头时长"
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
              >
                {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                  <option value={n} key={n}>
                    {n} 秒 / 镜头
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="vc-submit"
                disabled={disabled || !draft.trim()}
              >
                {root ? "添加分镜" : "创建项目"}
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
        )}
        {panel && (
          <aside className="vc-floating">
            <header>
              <b>
                {panel === "media"
                  ? "项目素材"
                  : note
                    ? "创意便签"
                    : "镜头设置"}
              </b>
              <button aria-label="关闭画布面板" onClick={() => setPanel(null)}>
                <X size={16} />
              </button>
            </header>
            {panel === "media" ? (
              <>
                <button
                  className="s-button full"
                  disabled={disabled}
                  onClick={() => (root ? importMedia() : newProject())}
                >
                  <Upload size={14} /> 导入图片 / 视频 / 音频
                </button>
                <label className="vc-search">
                  <Search size={14} />
                  <input
                    aria-label="搜索画布素材"
                    placeholder="搜索素材"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="vc-asset-list">
                  {state?.media
                    .filter((m) =>
                      m.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((m) => (
                      <div className="vc-asset" key={m.id}>
                        <div className="vc-asset-thumb">
                          <MediaThumb root={root} media={m} />
                        </div>
                        <strong title={m.name}>{m.name}</strong>
                        <button
                          className="s-button compact"
                          disabled={disabled}
                          onClick={() => addMedia(m)}
                        >
                          <Plus size={12} />{" "}
                          {m.kind === "audio" ? "设为背景音乐" : "添加到画布"}
                        </button>
                        <button
                          className="s-button compact"
                          onClick={() => addSource(m)}
                        >
                          添加素材节点
                        </button>
                      </div>
                    ))}
                  {!state?.media.length && (
                    <p className="vc-help">
                      导入的素材会复制进项目。即梦生成的图片和视频也可以下载后放进这里。
                    </p>
                  )}
                </div>
                <button
                  className="vc-external"
                  onClick={() =>
                    void window.cs
                      .studioOpenJimeng()
                      .catch(() =>
                        notice("无法打开浏览器，请访问 jimeng.jianying.com。"),
                      )
                  }
                >
                  打开即梦制作素材 <ExternalLink size={13} />
                </button>
              </>
            ) : note ? (
              <>
                <label>
                  便签内容
                  <textarea
                    aria-label="便签内容"
                    value={note.text}
                    maxLength={4000}
                    onChange={(e) =>
                      saveCanvas({
                        notes: canvas.notes.map((n) =>
                          n.id === note.id ? { ...n, text: e.target.value } : n,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="s-button"
                  onClick={() => {
                    saveCanvas({
                      notes: canvas.notes.filter((n) => n.id !== note.id),
                    });
                    setNoteId("");
                    setPanel(null);
                  }}
                >
                  <Trash2 size={14} /> 移除便签
                </button>
              </>
            ) : clip && state ? (
              <>
                <span className="vc-detail-kicker">
                  SHOT {String(clips.indexOf(clip) + 1).padStart(2, "0")}
                </span>
                <label>
                  字幕 / 场景文字
                  <textarea
                    aria-label="画布镜头文字"
                    value={clip.text}
                    maxLength={500}
                    onChange={(e) =>
                      updateClip(clip.id, { text: e.target.value })
                    }
                  />
                </label>
                <label>
                  画面提示词
                  <textarea
                    aria-label="镜头提示词"
                    placeholder="主体、环境、动作、运镜…"
                    value={clip.prompt || ""}
                    maxLength={4000}
                    onChange={(e) =>
                      updateClip(clip.id, { prompt: e.target.value })
                    }
                  />
                </label>
                <button
                  className="s-button compact"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(clip.prompt || clip.text)
                      .then(
                        () => notice("提示词已复制，可粘贴到即梦生成素材。"),
                        () => notice("复制失败，请手动选择提示词复制。"),
                      )
                  }
                >
                  <Copy size={12} /> 复制提示词
                </button>
                <button
                  className="s-button compact"
                  onClick={() => generate(clip)}
                >
                  <Sparkles size={13} />
                  用这个提示词生成
                </button>
                <label>
                  画面素材
                  <select
                    aria-label="镜头画面素材"
                    value={isScene(clip, state) ? "" : clip.mediaId || ""}
                    onChange={(e) => {
                      const m = state.media.find(
                        (m) => m.id === e.target.value,
                      );
                      updateClip(clip.id, {
                        visual: m ? "media" : "scene",
                        mediaId: m?.id,
                        start: 0,
                        end:
                          m && m.kind !== "image"
                            ? Math.min(duration(clip), m.duration)
                            : duration(clip),
                        voiceId: undefined,
                        voiceStart: undefined,
                      });
                    }}
                  >
                    <option value="">本地场景模板</option>
                    {state.media
                      .filter((m) => m.kind !== "audio")
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  镜头时长 / 秒
                  <input
                    aria-label="画布镜头时长"
                    type="number"
                    min="0.1"
                    max="3600"
                    step="0.1"
                    key={`${clip.id}-${clip.end}`}
                    defaultValue={duration(clip).toFixed(1)}
                    onBlur={(e) => {
                      const n = Number(e.target.value),
                        m = state.media.find((m) => m.id === clip.mediaId);
                      if (
                        n >= 0.1 &&
                        n <= 3600 &&
                        (!m ||
                          m.kind === "image" ||
                          clip.start + n <= m.duration)
                      )
                        updateClip(clip.id, { end: clip.start + n });
                      else {
                        e.target.value = duration(clip).toFixed(1);
                        notice("时长需为 0.1–3600 秒，且不能超出视频素材。");
                      }
                    }}
                  />
                </label>
                <label className="vc-toggle">
                  <input
                    type="checkbox"
                    checked={clip.enabled}
                    onChange={(e) =>
                      updateClip(clip.id, { enabled: e.target.checked })
                    }
                  />{" "}
                  加入成片
                </label>
                <div className="vc-detail-actions">
                  <button
                    className="s-button compact"
                    disabled={clips[0].id === clip.id}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={13} /> 前移
                  </button>
                  <button
                    className="s-button compact"
                    disabled={clips.at(-1)?.id === clip.id}
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={13} /> 后移
                  </button>
                  <button
                    className="s-button compact"
                    aria-label="复制镜头"
                    onClick={() => {
                      const c = { ...clip, id: crypto.randomUUID() };
                      const list = [...clips];
                      list.splice(list.indexOf(clip) + 1, 0, c);
                      patch({ clips: list });
                      selectClip(c);
                    }}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="s-button compact"
                    aria-label="移除镜头"
                    onClick={() => {
                      patch({ clips: clips.filter((c) => c.id !== clip.id) });
                      setPanel(null);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="vc-help">
                  提示词用于创作参考；绑定素材后会替换模板画面。进入精剪可设置配音、字幕和背景音乐。
                </p>
              </>
            ) : (
              <p className="vc-help">选择画布上的镜头或便签。</p>
            )}
          </aside>
        )}
      </div>
      {batchOpen && (
        <div
          className="studio-modal-backdrop"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <section
            className="studio-modal vg-modal"
            role="dialog"
            aria-label="批量创建分镜节点"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setBatchOpen(false);
              }
            }}
          >
            <button
              className="s-icon modal-close"
              aria-label="关闭批量分镜"
              onClick={() => setBatchOpen(false)}
            >
              <X size={18} />
            </button>
            <h2>每个分镜，一个生成节点</h2>
            <p>
              一行一个分镜。可用「[6秒]
              提示词」分别设定时长；创建后还能逐个修改。
            </p>
            <label>
              节点类型
              <select
                aria-label="批量节点类型"
                value={batchKind}
                onChange={(e) =>
                  setBatchKind(e.target.value as "image" | "video")
                }
              >
                <option value="video">视频生成</option>
                <option value="image">图片生成</option>
              </select>
            </label>
            <textarea
              autoFocus
              aria-label="批量分镜提示词"
              rows={8}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              maxLength={50000}
              placeholder={
                "[5秒] 女舰长望向观景窗，镜头缓慢推进\n[8秒] 舰队跃迁，闪光照亮面庞"
              }
            />
            {modalError && <p role="alert">{modalError}</p>}
            <button className="s-button primary" onClick={buildBatch}>
              创建分镜节点
            </button>
            <small>
              此步只建节点，不提交生成、不扣费。未写时长时使用 {seconds} 秒。
            </small>
          </section>
        </div>
      )}
      {plan && (
        <div
          className="studio-modal-backdrop"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <section
            className="studio-modal vg-modal"
            role="dialog"
            aria-label="确认批量生成"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !planning) {
                e.stopPropagation();
                setPlan(null);
              }
            }}
          >
            <button
              className="s-icon modal-close"
              aria-label="关闭批量确认"
              onClick={() => setPlan(null)}
            >
              <X size={18} />
            </button>
            <h2>准备生成 {plan.data.nodes.length} 个节点</h2>
            <p>
              {plan.data.imageCount} 张图片 · {plan.data.videoCount} 条视频 ·
              视频共 {plan.data.videoSeconds} 秒
            </p>
            <div className="vg-plan-list">
              {plan.data.nodes.map((n) => (
                <div key={n.id}>
                  <b>{n.title}</b>
                  <span>
                    {n.kind === "image"
                      ? "生图"
                      : n.resolution === "1080P"
                        ? `${videoModel(n.model).label} · 原生 1080P`
                        : n.resolution}{" "}
                    · {n.duration} 秒
                  </span>
                  <p>{n.prompt}</p>
                </div>
              ))}
            </div>
            <p>
              包含尚未完成的上游节点，按连线依赖执行，最多同时运行 2
              个任务。生成会使用 Codex / 秘塔账户额度。
            </p>
            {modalError && <p role="alert">{modalError}</p>}
            <button
              className="s-button primary"
              disabled={planning}
              onClick={async () => {
                setPlanning(true);
                try {
                  await runGraph(plan.ids, false);
                  setPlan(null);
                  notice("批量任务已加入队列，完成后自动加入画布。");
                } catch (e) {
                  setModalError(e instanceof Error ? e.message : String(e));
                } finally {
                  setPlanning(false);
                }
              }}
            >
              {planning ? "正在提交队列…" : "开始批量生成"}
            </button>
          </section>
        </div>
      )}
      {previewClip && state && (
        <CanvasMediaPreview
          key={previewClip.id}
          root={root}
          clip={previewClip}
          state={state}
          media={state.media.find((m) => m.id === previewClip.mediaId)}
          close={() => setPreviewId("")}
        />
      )}
      <div className="vc-sequence">
        <div className="vc-sequence-heading">
          <span>
            <Film size={14} /> 成片顺序
          </span>
          <b>{total.toFixed(1)}s</b>
          <small>按镜头编号导出</small>
        </div>
        <div className="vc-sequence-clips">
          {clips
            .filter((c) => c.enabled)
            .map((c) => (
              <button
                key={c.id}
                draggable={!disabled}
                title="拖动调整成片顺序"
                onDragStart={(e) => {
                  sequenceDrag.current = c.id;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", c.id);
                }}
                onDragOver={(e) => {
                  if (sequenceDrag.current && sequenceDrag.current !== c.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                }}
                onDragEnd={() => {
                  sequenceDrag.current = "";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = sequenceDrag.current;
                  sequenceDrag.current = "";
                  if (!from || from === c.id || disabled) return;
                  const list = [...clips],
                    i = list.findIndex((n) => n.id === from),
                    j = list.findIndex((n) => n.id === c.id);
                  if (i < 0 || j < 0) return;
                  const [item] = list.splice(i, 1);
                  list.splice(j, 0, item);
                  patch({ clips: list });
                }}
                className={c.id === selected ? "active" : ""}
                onClick={() => {
                  selectClip(c);
                  setNoteId("");
                  setPanel("details");
                  const p = position(c.id, clips.indexOf(c));
                  commitView({
                    ...view,
                    x: 90 - p.x * view.zoom,
                    y: 80 - p.y * view.zoom,
                  });
                }}
              >
                <span>{String(clips.indexOf(c) + 1).padStart(2, "0")}</span>
                <b>
                  {c.text ||
                    state?.media.find((m) => m.id === c.mediaId)?.name ||
                    "镜头"}
                </b>
                <small>{duration(c).toFixed(1)}s</small>
              </button>
            ))}
          {!clips.length && <p>添加分镜或素材后，在这里预览故事顺序</p>}
        </div>
        <button className="s-button" disabled={!total} onClick={edit}>
          预览 <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
