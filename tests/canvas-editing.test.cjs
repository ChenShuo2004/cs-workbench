const test = require("node:test"),
  assert = require("node:assert/strict");
const fixture = () => ({
  media: [{ id: "media", kind: "image" }],
  clips: [],
  canvas: {
    positions: { image: { x: 50, y: 20 }, video: { x: 500, y: 20 } },
    notes: [{ id: "text", text: "灯光", x: -200, y: 20 }],
    sources: [],
    generators: [
      {
        id: "image",
        kind: "image",
        title: "图片",
        prompt: "",
        outputMediaId: "media",
      },
      {
        id: "video",
        kind: "video",
        title: "视频",
        prompt: "",
        model: "seedance-2.0",
        resolution: "1080P",
      },
    ],
    edges: [
      { id: "e1", from: "text", to: "image", role: "prompt_text" },
      { id: "e2", from: "image", to: "video", role: "first_frame" },
    ],
    groups: [{ id: "g", title: "分镜组", nodeIds: ["image", "video"] }],
  },
});
test("copy/paste remaps mixed graph IDs and groups, preserves model, and clears generated identity", async () => {
  const { copyCanvasSelection, pasteCanvasSelection } =
    await import("../shared/canvas-editing.mjs");
  const state = fixture();
  const source = JSON.stringify(state);
  const data = copyCanvasSelection(state, ["text", "image", "video"]);
  let i = 0;
  const next = pasteCanvasSelection(
    state,
    data,
    { x: 1000, y: 500 },
    () => `copy${++i}`,
  );
  assert.equal(JSON.stringify(state), source);
  const c = next.patch.canvas;
  assert.equal(c.generators.length, 4);
  assert.equal(c.edges.length, 4);
  assert.equal(c.notes.length, 2);
  assert.equal(c.groups.length, 2);
  assert.equal(c.generators[2].outputMediaId, undefined);
  assert.equal(c.generators[3].model, "seedance-2.0");
  assert.equal(c.generators[3].resolution, "1080P");
  assert.equal(c.edges[2].from, c.notes[1].id);
  assert.equal(c.edges[2].to, c.generators[2].id);
  assert.equal(c.edges[3].from, c.generators[2].id);
  assert.equal(c.edges[3].to, c.generators[3].id);
  assert.deepEqual(c.groups[1].nodeIds, [
    c.generators[2].id,
    c.generators[3].id,
  ]);
  assert.equal(c.notes[1].x, 1000);
  assert.equal(c.positions[c.generators[2].id].x, 1250);
});
test("partial copy excludes external links and incomplete groups; missing imported media blocks paste", async () => {
  const { copyCanvasSelection, pasteCanvasSelection } =
    await import("../shared/canvas-editing.mjs");
  const s = fixture();
  const data = copyCanvasSelection(s, ["video"]);
  assert.equal(data.edges.length, 0);
  assert.equal(data.groups.length, 0);
  s.canvas.sources = [{ id: "ref", mediaId: "media" }];
  s.canvas.positions.ref = { x: 0, y: 0 };
  const refs = copyCanvasSelection(s, ["ref"]);
  assert.throws(
    () => pasteCanvasSelection({ ...s, media: [] }, refs, { x: 0, y: 0 }),
    /原素材/,
  );
});
test("batch linking is atomic, rejects cycles and respects port limits", async () => {
  const { connectCanvasSources } = await import("../shared/canvas-editing.mjs");
  let i = 0;
  const uuid = () => String(++i);
  const edges = [
    { id: "old", from: "target", to: "ancestor", role: "image_reference" },
  ];
  assert.throws(
    () =>
      connectCanvasSources(
        edges,
        ["ancestor"],
        "target",
        "image_reference",
        9,
        uuid,
      ),
    /循环/,
  );
  assert.equal(edges.length, 1);
  assert.throws(
    () =>
      connectCanvasSources([], ["a", "b"], "target", "first_frame", 1, uuid),
    /最多/,
  );
  const linked = connectCanvasSources(
    [],
    ["a", "a", "b"],
    "target",
    "reference_image",
    9,
    uuid,
  );
  assert.equal(linked.length, 2);
  assert.equal(
    connectCanvasSources(linked, ["a"], "target", "reference_image", 9, uuid)
      .length,
    2,
  );
});
test("align and distribute use actual sizes and preserve orthogonal positions", async () => {
  const { layoutCanvasSelection } =
    await import("../shared/canvas-editing.mjs");
  const nodes = [
    { id: "a", x: 0, y: 0, width: 100, height: 100 },
    { id: "b", x: 150, y: 200, width: 200, height: 50 },
    { id: "c", x: 800, y: 300, width: 100, height: 100 },
  ];
  const centered = layoutCanvasSelection(nodes, "centerX");
  assert.equal(centered.a.x + 50, centered.b.x + 100);
  assert.equal(centered.b.y, 200);
  const distributed = layoutCanvasSelection(nodes, "distributeX");
  assert.equal(
    distributed.b.x - (distributed.a.x + 100),
    distributed.c.x - (distributed.b.x + 200),
  );
  assert.equal(distributed.c.y, 300);
});
