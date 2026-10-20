import { connectCanvasSources } from "./canvas-editing.mjs";
const names = { image: "图片", video: "视频", audio: "声音", text: "文本" };
const kinds = {
  prompt_text: "text",
  image_reference: "image",
  first_frame: "image",
  last_frame: "image",
  reference_image: "image",
  reference_video: "video",
  reference_audio: "audio",
};
export function referenceBindings(edges, reserved = "") {
  const used = new Set(
    [...reserved.matchAll(/@(图片|视频|声音|文本)\d+/g)].map((m) => m[0]),
  );
  for (const e of edges) if (e.alias) used.add(e.alias);
  const counts = {};
  return edges.map((e) => {
    const kind = kinds[e.role];
    counts[kind] = (counts[kind] || 0) + 1;
    let alias = e.alias;
    if (!alias) {
      let n = 1;
      while (used.has(`@${names[kind]}${n}`)) n++;
      alias = `@${names[kind]}${n}`;
      used.add(alias);
    }
    const provider =
      e.role === "first_frame"
        ? "首帧"
        : e.role === "last_frame"
          ? "尾帧"
          : `${{ image: "Image", video: "Video", audio: "Audio", text: "Text" }[kind]} ${counts[kind]}`;
    return { ...e, alias, kind, provider };
  });
}
export function connectInputs(node, edges, sourceIds, lookup) {
  // Freeze existing aliases before changing role or input order.
  const existing = referenceBindings(edges.filter((e) => e.to === node.id));
  const kindsToAdd = sourceIds.map((id) => lookup(id)?.kind);
  if (
    kindsToAdd.some(
      (kind) =>
        !kind || (node.kind === "image" && !["image", "text"].includes(kind)),
    )
  )
    throw Error("生图节点可连接图片和文本");
  const switches =
    node.kind === "video" && kindsToAdd.some((k) => k !== "text");
  const nextNode = switches ? { ...node, mode: "omni" } : node;
  let next = [
    ...edges.filter((e) => e.to !== node.id),
    ...existing.map((e) => {
      const { kind, provider, ...edge } = e;
      return switches && ["first_frame", "last_frame"].includes(e.role)
        ? { ...edge, role: "reference_image" }
        : edge;
    }),
  ];
  for (const kind of ["image", "video", "audio", "text"]) {
    const ids = sourceIds.filter((id) => lookup(id)?.kind === kind);
    if (!ids.length) continue;
    const role =
      kind === "text"
        ? "prompt_text"
        : node.kind === "image"
          ? "image_reference"
          : `reference_${kind}`;
    next = connectCanvasSources(
      next,
      ids,
      node.id,
      role,
      ["video", "audio"].includes(kind) ? 3 : 9,
    );
  }
  const incoming = referenceBindings(
    next.filter((e) => e.to === node.id),
    node.prompt,
  );
  next = [
    ...next.filter((e) => e.to !== node.id),
    ...incoming.map(({ kind, provider, ...edge }) => edge),
  ];
  return { node: nextNode, edges: next };
}
export function resolveMentions(prompt, bindings, title) {
  const map = new Map(bindings.map((b) => [b.alias, b.provider]));
  return prompt.replace(/@(图片|视频|声音|文本)\d+/g, (alias) => {
    if (!map.has(alias))
      throw Error(`「${title}」中的 ${alias} 已断开，请重新连接或删除这处引用`);
    return map.get(alias);
  });
}

export function canvasMentionChoices(node, edges, candidates) {
  const blocked = new Set();
  const visit = (id) => {
    if (blocked.has(id)) return;
    blocked.add(id);
    edges.filter((e) => e.from === id).forEach((e) => visit(e.to));
  };
  visit(node.id);
  const bindings = referenceBindings(edges.filter((e) => e.to === node.id));
  return candidates
    .filter(
      (c) =>
        !blocked.has(c.id) &&
        (node.kind === "video" || ["image", "text"].includes(c.kind)),
    )
    .sort(
      (a, b) =>
        Number(bindings.some((e) => e.from === b.id)) -
        Number(bindings.some((e) => e.from === a.id)),
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      alias:
        bindings.find((b) => b.from === c.id)?.alias || `@${names[c.kind]}`,
    }));
}

export function selectCanvasMention(
  node,
  edges,
  sourceId,
  lookup,
  before,
  after,
) {
  const existing = referenceBindings(
    edges.filter((e) => e.to === node.id),
  ).find((e) => e.from === sourceId);
  const result = existing
    ? { node, edges }
    : connectInputs(node, edges, [sourceId], lookup);
  const binding =
    existing ||
    referenceBindings(result.edges.filter((e) => e.to === node.id)).find(
      (e) => e.from === sourceId,
    );
  if (!binding) throw Error("素材已不在画布上，请重新选择");
  const prompt = before + binding.alias + " " + after;
  if (prompt.length > 4000) throw Error("提示词不能超过 4000 字");
  return { ...result, node: { ...result.node, prompt }, alias: binding.alias };
}
