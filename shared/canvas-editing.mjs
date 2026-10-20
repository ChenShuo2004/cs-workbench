// Independent canvas editing operations. Clones retain internal graph links, never running job identity.
export function copyCanvasSelection(state, ids) {
  const selected = new Set(ids),
    c = state.canvas;
  if (!c) return null;
  const clips = state.clips.filter((n) => selected.has(n.id));
  const generators = (c.generators || []).filter((n) => selected.has(n.id));
  const sources = (c.sources || []).filter((n) => selected.has(n.id));
  const notes = c.notes.filter((n) => selected.has(n.id));
  if (![...clips, ...generators, ...sources, ...notes].length) return null;
  const positions = Object.fromEntries(
    [...clips, ...sources, ...generators].map((n) => {
      const i = [
        ...state.clips,
        ...(c.sources || []),
        ...(c.generators || []),
      ].findIndex((x) => x.id === n.id);
      return [
        n.id,
        c.positions[n.id] || { x: (i % 3) * 340, y: Math.floor(i / 3) * 300 },
      ];
    }),
  );
  return structuredClone({
    clips,
    generators,
    sources,
    notes,
    positions,
    groups: (c.groups || []).filter((g) =>
      g.nodeIds.every((id) => selected.has(id)),
    ),
    edges: (c.edges || []).filter(
      (e) => selected.has(e.from) && selected.has(e.to),
    ),
  });
}
export function pasteCanvasSelection(
  state,
  data,
  point,
  uuid = () => crypto.randomUUID(),
) {
  const c = state.canvas;
  if (!c || !data) throw Error("没有可粘贴的节点");
  const all = [
    ...data.clips,
    ...data.sources,
    ...data.generators,
    ...data.notes,
  ];
  if (
    all.length > 500 ||
    (c.generators || []).length + data.generators.length > 200 ||
    c.notes.length + data.notes.length > 200 ||
    state.clips.length + data.clips.length > 1000 ||
    (c.sources || []).length + data.sources.length > 500
  )
    throw Error("节点数量已达上限");
  if (
    [...data.clips, ...data.sources].some(
      (n) => n.mediaId && !state.media.some((m) => m.id === n.mediaId),
    )
  )
    throw Error("原素材不在此工程，请先导入素材");
  const map = Object.fromEntries(all.map((n) => [n.id, uuid()]));
  const points = [...Object.values(data.positions), ...data.notes];
  const dx = point.x - Math.min(...points.map((p) => p.x)),
    dy = point.y - Math.min(...points.map((p) => p.y));
  const shift = (p) => ({
    x: Math.max(-90000, Math.min(90000, p.x + dx)),
    y: Math.max(-90000, Math.min(90000, p.y + dy)),
  });
  const positions = {
    ...c.positions,
    ...Object.fromEntries(
      Object.entries(data.positions).map(([id, p]) => [map[id], shift(p)]),
    ),
  };
  return {
    ids: Object.values(map),
    patch: {
      clips: [
        ...state.clips,
        ...data.clips.map(({ generationBatchId, generationIndex, ...n }) => ({
          ...n,
          id: map[n.id],
        })),
      ],
      canvas: {
        ...c,
        positions,
        groups: [
          ...(c.groups || []),
          ...(data.groups || []).map((g) => ({
            ...g,
            id: uuid(),
            nodeIds: g.nodeIds.map((id) => map[id]),
          })),
        ],
        generators: [
          ...(c.generators || []),
          ...data.generators.map(({ outputMediaId, ...n }) => ({
            ...n,
            id: map[n.id],
            title: (n.title + " 副本").slice(0, 100),
          })),
        ],
        sources: [
          ...(c.sources || []),
          ...data.sources.map((n) => ({ ...n, id: map[n.id] })),
        ],
        notes: [
          ...c.notes,
          ...data.notes.map((n) => ({ ...n, id: map[n.id], ...shift(n) })),
        ],
        edges: [
          ...(c.edges || []),
          ...data.edges.map((e) => ({
            ...e,
            id: uuid(),
            from: map[e.from],
            to: map[e.to],
          })),
        ],
      },
    },
  };
}

export function layoutCanvasSelection(nodes, mode) {
  if (nodes.length < 2) return {};
  const left = Math.min(...nodes.map((n) => n.x)),
    top = Math.min(...nodes.map((n) => n.y)),
    right = Math.max(...nodes.map((n) => n.x + n.width)),
    bottom = Math.max(...nodes.map((n) => n.y + n.height));
  const result = Object.fromEntries(
    nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
  );
  for (const n of nodes) {
    const p = result[n.id];
    if (mode === "left") p.x = left;
    if (mode === "centerX") p.x = (left + right - n.width) / 2;
    if (mode === "right") p.x = right - n.width;
    if (mode === "top") p.y = top;
    if (mode === "centerY") p.y = (top + bottom - n.height) / 2;
    if (mode === "bottom") p.y = bottom - n.height;
    if (mode === "spread") {
      p.x = left + (n.x - left) * 1.3;
      p.y = top + (n.y - top) * 1.3;
    }
  }
  if (mode === "distributeX" || mode === "distributeY") {
    const horizontal = mode === "distributeX",
      axis = horizontal ? "x" : "y",
      size = horizontal ? "width" : "height";
    const sorted = [...nodes].sort((a, b) => a[axis] - b[axis]);
    const length = horizontal ? right - left : bottom - top;
    const gap = Math.max(
      32,
      (length - nodes.reduce((sum, n) => sum + n[size], 0)) /
        (nodes.length - 1),
    );
    let cursor = horizontal ? left : top;
    for (const n of sorted) {
      result[n.id][axis] = cursor;
      cursor += n[size] + gap;
    }
  }
  for (const p of Object.values(result)) {
    p.x = Math.max(-90000, Math.min(90000, p.x));
    p.y = Math.max(-90000, Math.min(90000, p.y));
  }
  return result;
}
export function connectCanvasSources(
  edges,
  fromIds,
  targetId,
  role,
  max,
  uuid = () => crypto.randomUUID(),
) {
  const sources = [...new Set(fromIds)].filter((id) => id !== targetId);
  if (!sources.length) throw Error("没有匹配类型的来源节点");
  const next =
    max === 1
      ? edges.filter((e) => !(e.to === targetId && e.role === role))
      : [...edges];
  for (const from of sources)
    if (
      !next.some((e) => e.from === from && e.to === targetId && e.role === role)
    )
      next.push({ id: uuid(), from, to: targetId, role });
  if (next.filter((e) => e.to === targetId && e.role === role).length > max)
    throw Error(`此输入最多连接 ${max} 个来源`);
  const reaches = (id, target, seen = new Set()) => {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return next
      .filter((e) => e.from === id)
      .some((e) => reaches(e.to, target, seen));
  };
  if (sources.some((from) => reaches(targetId, from)))
    throw Error("连接会形成循环");
  return next;
}
