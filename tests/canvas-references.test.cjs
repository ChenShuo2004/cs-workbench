const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID: id } = require("node:crypto");
const {
  connectInputs,
  referenceBindings,
  resolveMentions,
} = require("../shared/canvas-references.mjs");
const { planGraph } = require("../lib/generation-graph.cjs");
const {
  canvasMentionChoices,
  selectCanvasMention,
} = require("../shared/canvas-references.mjs");
const node = () => ({
  id: id(),
  kind: "video",
  title: "镜头",
  prompt: "画面",
  mode: "frames",
  aspect: "16:9",
  duration: 5,
  resolution: "1080P",
});

test("canvas-wide mentions exclude self, cycles and incompatible media; selecting creates prompt and edge together", () => {
  const n = node(),
    picture = { id: id(), kind: "image", name: "画布图片" },
    movie = { id: id(), kind: "video", name: "画布视频" },
    child = { id: id(), kind: "image", name: "下游" };
  const candidates = [{ ...n, name: "自己" }, picture, movie, child];
  const edges = [
    { id: id(), from: n.id, to: child.id, role: "image_reference" },
  ];
  assert.deepEqual(
    canvasMentionChoices(n, edges, candidates).map((c) => c.id),
    [picture.id, movie.id],
  );
  assert.deepEqual(
    canvasMentionChoices({ ...n, kind: "image" }, edges, candidates).map(
      (c) => c.id,
    ),
    [picture.id],
  );
  const before = structuredClone(edges);
  const result = selectCanvasMention(
    n,
    edges,
    picture.id,
    (sourceId) => candidates.find((c) => c.id === sourceId),
    "使用 ",
    "的场景",
  );
  assert.equal(result.node.prompt, "使用 @图片1 的场景");
  assert.equal(result.edges.length, 2);
  assert.deepEqual(edges, before);
  const frameEdges = result.edges.map((e) =>
    e.to === n.id ? { ...e, role: "first_frame" } : e,
  );
  const repeated = selectCanvasMention(
    { ...result.node, mode: "frames" },
    frameEdges,
    picture.id,
    (sourceId) => candidates.find((c) => c.id === sourceId),
    "再次使用 ",
    "",
  );
  assert.equal(repeated.edges.length, 2);
  assert.equal(repeated.node.mode, "frames");
  assert.equal(repeated.edges.find((e) => e.to === n.id).role, "first_frame");
  assert.throws(
    () =>
      selectCanvasMention(
        n,
        edges,
        picture.id,
        (sourceId) => candidates.find((c) => c.id === sourceId),
        "x".repeat(4000),
        "",
      ),
    /4000/,
  );
  assert.deepEqual(edges, before);
});
test("one input routes mixed media and text, preserves aliases, rejects cycles and image-incompatible input", () => {
  const n = node(),
    sources = [
      { id: id(), kind: "image" },
      { id: id(), kind: "video" },
      { id: id(), kind: "audio" },
      { id: id(), kind: "text" },
    ];
  const lookup = (i) => sources.find((s) => s.id === i);
  const result = connectInputs(
    n,
    [],
    sources.map((s) => s.id),
    lookup,
  );
  assert.equal(result.node.mode, "omni");
  assert.deepEqual(
    result.edges.map((e) => e.role),
    ["reference_image", "reference_video", "reference_audio", "prompt_text"],
  );
  assert.deepEqual(
    result.edges.map((e) => e.alias),
    ["@图片1", "@视频1", "@声音1", "@文本1"],
  );
  assert.throws(
    () => connectInputs({ ...n, kind: "image" }, [], [sources[1].id], lookup),
    /生图/,
  );
  assert.throws(
    () =>
      connectInputs(
        n,
        [{ id: id(), from: n.id, to: sources[0].id, role: "image_reference" }],
        [sources[0].id],
        lookup,
      ),
    /循环/,
  );
});
test("deleted mentions never silently retarget another source or a newly connected replacement", () => {
  const n = node(),
    a = { id: id(), kind: "image" },
    b = { id: id(), kind: "image" },
    c = { id: id(), kind: "image" },
    lookup = (i) => [a, b, c].find((s) => s.id === i);
  const first = connectInputs(n, [], [a.id, b.id], lookup);
  const kept = first.edges.filter((e) => e.from !== a.id);
  assert.equal(
    resolveMentions("使用 @图片2", referenceBindings(kept), "镜头"),
    "使用 Image 1",
  );
  const next = connectInputs(
    { ...first.node, prompt: "使用 @图片1 和 @图片2" },
    kept,
    [c.id],
    lookup,
  );
  assert.equal(next.edges.find((e) => e.from === c.id).alias, "@图片3");
  assert.throws(
    () => resolveMentions("使用 @图片1", referenceBindings(next.edges), "镜头"),
    /已断开/,
  );
});
test("generation plan sends provider labels with the same media ordering and retains immutable source prompt", () => {
  const n = { ...node(), mode: "omni", prompt: "让 @图片2 的人物走进 @图片1" };
  const sources = [
    { id: id(), mediaId: "a" },
    { id: id(), mediaId: "b" },
  ];
  const edges = sources.map((s, i) => ({
    id: id(),
    from: s.id,
    to: n.id,
    role: "reference_image",
    alias: `@图片${i + 1}`,
  }));
  const state = {
    clips: [],
    media: [
      { id: "a", kind: "image" },
      { id: "b", kind: "image" },
    ],
    canvas: { generators: [n], sources, edges },
  };
  const plan = planGraph(state, [n.id]);
  assert.equal(plan.nodes[0].prompt, "让 Image 2 的人物走进 Image 1");
  assert.deepEqual(
    plan.inputs[n.id].map((i) => i.mediaId),
    ["a", "b"],
  );
  assert.equal(n.prompt, "让 @图片2 的人物走进 @图片1");
  state.canvas.edges = edges.slice(1);
  assert.throws(() => planGraph(state, [n.id]), /已断开/);
});
