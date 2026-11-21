import React, { useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { StudioClip, StudioMedia, StudioState } from "./types";
// @ts-ignore shared renderer
import { sceneSVG } from "../shared/studio-visuals.mjs";

export function CanvasMediaPreview({
  root,
  clip,
  media,
  state,
  close,
}: {
  root: string;
  clip: StudioClip;
  media?: StudioMedia;
  state: StudioState;
  close: () => void;
}) {
  const scene =
    clip.visual === "scene" || (!clip.visual && state.mode === "pixel");
  const [url, setURL] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const moving = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, []);
  useEffect(() => {
    let live = true;
    setError("");
    setURL("");
    if (!scene && media)
      window.cs
        .studioMediaURL(root, media.id)
        .then((u) => {
          if (live) setURL(u);
        })
        .catch(() => {
          if (live) setError("无法读取素材，请重新加载。");
        });
    return () => {
      live = false;
    };
  }, [root, media?.id, scene, attempt]);
  return (
    <div
      className="vc-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="镜头大图预览"
      ref={dialog}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        if (e.key === "Tab") {
          const targets = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),video[controls],audio[controls]",
            ) || [],
          );
          const i = targets.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && i <= 0) {
            e.preventDefault();
            targets.at(-1)?.focus();
          } else if (!e.shiftKey && (i === targets.length - 1 || i < 0)) {
            e.preventDefault();
            targets[0]?.focus();
          }
        }
        e.stopPropagation();
      }}
    >
      <header>
        <div>
          <span>镜头预览</span>
          <strong>{media?.name || clip.text || "场景模板"}</strong>
        </div>
        <button ref={closeButton} aria-label="关闭镜头预览" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div
        className="vc-preview-stage"
        onPointerDown={(e) => {
          if (!(scene || media?.kind === "image") || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          moving.current = {
            x: e.clientX,
            y: e.clientY,
            ox: offset.x,
            oy: offset.y,
          };
        }}
        onPointerMove={(e) => {
          const d = moving.current;
          if (d)
            setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
        }}
        onPointerUp={() => {
          moving.current = null;
        }}
        onPointerCancel={() => {
          moving.current = null;
        }}
      >
        {error ? (
          <div className="vc-preview-error">
            <p role="alert">{error}</p>
            <button onClick={() => setAttempt((a) => a + 1)}>
              <RotateCcw size={15} />
              重新加载
            </button>
          </div>
        ) : scene ? (
          <div
            className="vc-preview-still"
            style={{
              transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})`,
            }}
            dangerouslySetInnerHTML={{
              __html: sceneSVG(
                clip.text,
                state.theme,
                0.4,
                1280,
                720,
                state.sceneStyle || "pixel",
              ),
            }}
          />
        ) : !url ? (
          <p>正在读取素材…</p>
        ) : media?.kind === "image" ? (
          <img
            draggable={false}
            src={url}
            alt={media.name}
            style={{
              transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})`,
            }}
            onError={() => setError("图片无法解码，请检查源文件或重新加载。")}
          />
        ) : media?.kind === "video" ? (
          <video
            key={url}
            src={url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = clip.start;
            }}
            onError={() =>
              setError("无法播放此编码，可先转换成 H.264 MP4 再导入。")
            }
          />
        ) : (
          <audio
            src={url}
            controls
            onError={() => setError("音频无法播放，请重新加载。")}
          />
        )}
      </div>
      <footer>
        {scene || media?.kind === "image" ? (
          <>
            <button
              aria-label="缩小预览图片"
              disabled={zoom <= 0.25}
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            >
              <Minus size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="放大预览图片"
              disabled={zoom >= 4}
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            >
              <Plus size={16} />
            </button>
            <button
              aria-label="重置图片预览"
              onClick={() => {
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
            >
              <Maximize size={16} />
            </button>
            <small>拖动平移 · Esc 关闭</small>
          </>
        ) : (
          <small>原始素材预览 · 成片切点请在精剪中查看 · Esc 关闭</small>
        )}
      </footer>
    </div>
  );
}
