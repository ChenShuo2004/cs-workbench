import type {
  CanvasEdge,
  CanvasGenerator,
  CanvasInputRole,
  StudioCanvasData,
  StudioClip,
  StudioState,
} from "../src/types";

type Point = { x: number; y: number };
export interface CanvasSelection {
  clips: StudioClip[];
  generators: CanvasGenerator[];
  sources: NonNullable<StudioCanvasData["sources"]>;
  notes: StudioCanvasData["notes"];
  groups: NonNullable<StudioCanvasData["groups"]>;
  positions: Record<string, Point>;
  edges: CanvasEdge[];
}
export function copyCanvasSelection(
  state: StudioState,
  ids: string[],
): CanvasSelection | null;
export function pasteCanvasSelection(
  state: StudioState,
  data: CanvasSelection,
  point: Point,
  uuid?: () => string,
): { ids: string[]; patch: Pick<StudioState, "clips" | "canvas"> };
export function layoutCanvasSelection(
  nodes: (Point & { id: string; width: number; height: number })[],
  mode: string,
): Record<string, Point>;
export function connectCanvasSources(
  edges: CanvasEdge[],
  fromIds: string[],
  targetId: string,
  role: CanvasInputRole,
  max: number,
  uuid?: () => string,
): CanvasEdge[];
