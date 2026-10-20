import type { CanvasEdge, CanvasGenerator } from "../src/types";
export type ReferenceBinding = CanvasEdge & {
  alias: string;
  kind: string;
  provider: string;
};
export function referenceBindings(
  edges: CanvasEdge[],
  reserved?: string,
): ReferenceBinding[];
export function connectInputs(
  node: CanvasGenerator,
  edges: CanvasEdge[],
  sourceIds: string[],
  lookup: (id: string) => { kind: string } | null,
): { node: CanvasGenerator; edges: CanvasEdge[] };
export function resolveMentions(
  prompt: string,
  bindings: ReferenceBinding[],
  title: string,
): string;
export function canvasMentionChoices(
  node: CanvasGenerator,
  edges: CanvasEdge[],
  candidates: { id: string; kind: string; name: string }[],
): { id: string; alias: string; name: string }[];
export function selectCanvasMention(
  node: CanvasGenerator,
  edges: CanvasEdge[],
  sourceId: string,
  lookup: (id: string) => { kind: string } | null,
  before: string,
  after: string,
): { node: CanvasGenerator; edges: CanvasEdge[]; alias: string };
