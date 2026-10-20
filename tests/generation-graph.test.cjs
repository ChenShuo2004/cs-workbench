const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const sharp = require("sharp");
const { planGraph, graphData } = require("../lib/generation-graph.cjs");
const { createGeneration } = require("../lib/studio-generation.cjs");
const id = () => crypto.randomUUID();
const node = (kind, title = kind) => ({
  id: id(),
  kind,
  title,
  prompt: "A quiet room",
  aspect: "16:9",
  duration: 6,
  resolution: "2K",
  mode: "frames",
});
const edge = (from, to, role) => ({ id: id(), from: from.id, to: to.id, role });
function state(generators, edges = [], media = [], sources = []) {
  return { media, clips: [], canvas: { generators, edges, sources } };
}
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("timed out");
}
test("graph plans image → first/last-frame video once in dependency order and reuses existing results", () => {
  const image = node("image"),
    tail = node("image"),
    video = node("video");
  const s = state(
    [image, tail, video],
    [edge(image, video, "first_frame"), edge(tail, video, "last_frame")],
  );
  let plan = planGraph(s, [video.id]);
  assert.deepEqual(
    plan.nodes.map((n) => n.id),
    [image.id, tail.id, video.id],
  );
  assert.equal(plan.videoSeconds, 6);
  image.outputMediaId = "done";
  s.media.push({ id: "done", kind: "image" });
  plan = planGraph(s, [video.id]);
  assert.deepEqual(
    plan.nodes.map((n) => n.id),
    [tail.id, video.id],
  );
  assert.equal(plan.inputs[video.id][0].mediaId, "done");
  assert.equal(planGraph(s, [image.id, video.id]).nodes.length, 3);
});
test("graph rejects cycles, incompatible media, mixed modes, excessive inputs and invalid durations", () => {
  const a = node("image"),
    b = node("image"),
    v = node("video");
  assert.throws(
    () =>
      graphData(
        state(
          [a, b],
          [edge(a, b, "image_reference"), edge(b, a, "image_reference")],
        ),
      ),
    /循环/,
  );
  assert.throws(
    () => graphData(state([a, v], [edge(v, a, "image_reference")])),
    /类型/,
  );
  assert.throws(
    () => graphData(state([a, v], [edge(a, v, "reference_image")])),
    /混用/,
  );
  assert.throws(
    () =>
      graphData(
        state(
          [a, b, v],
          [edge(a, v, "first_frame"), edge(b, v, "first_frame")],
        ),
      ),
    /上限/,
  );
  assert.throws(() => graphData(state([{ ...v, duration: 3 }])), /参数/);
  const audio = { id: id(), mediaId: "audio" };
  assert.doesNotThrow(() =>
    graphData(
      state(
        [{ ...v, mode: "omni" }],
        [edge(audio, v, "reference_audio")],
        [{ id: "audio", kind: "audio" }],
        [audio],
      ),
    ),
  );
});
test("graph batch persists snapshots, waits for dependencies, caps concurrency and cancels downstream of failures", async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "cs-graph-unit-"));
  const a = node("image", "upstream"),
    v = node("video", "downstream"),
    bad = node("image", "bad"),
    skipped = node("video", "skipped");
  bad.prompt = "fail";
  const final = node("video", "final");
  final.mode = "omni";
  const s = state(
    [a, v, bad, skipped, final],
    [
      edge(a, v, "first_frame"),
      edge(bad, skipped, "first_frame"),
      edge(skipped, final, "reference_video"),
    ],
  );
  let submitted = [],
    polls = new Map(),
    sourcePaths = new Map(),
    videoRefs;
  const bridge = {
    check: async () => true,
    close() {},
    submit: async (args) => {
      const remote = id();
      submitted.push({ kind: "image", prompt: args.prompt });
      const dest = path.join(args.output_dir, "source.png");
      await sharp({
        create: { width: 300, height: 300, channels: 3, background: "#aaa" },
      })
        .png()
        .toFile(dest);
      sourcePaths.set(remote, { dest, failed: args.prompt.startsWith("fail") });
      return { job_id: remote };
    },
    poll: async (remote) => {
      const count = (polls.get(remote) || 0) + 1;
      polls.set(remote, count);
      if (count < 3) return { status: "running" };
      const source = sourcePaths.get(remote);
      return source.failed
        ? { status: "failed", error: "test rejection" }
        : { status: "completed", images: [{ path: source.dest }] };
    },
  };
  const provider = {
    validate() {},
    status: async () => ({ ready: true }),
    submit: async (job, refs) => {
      submitted.push({ kind: "video", prompt: job.prompt });
      videoRefs = refs;
      return { request_id: "video" };
    },
    poll: async () => ({ status: "failed", error: "test video result" }),
  };
  const studio = {
    read: () => structuredClone(s),
    mediaPath: () => {
      throw Error("unexpected media lookup");
    },
  };
  const gen = createGeneration({
    userData,
    studio,
    bridge,
    videoProvider: provider,
    pollMs: 10,
  });
  t.after(() => {
    gen.shutdown();
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const jobs = gen.enqueueGraph("project", [v.id, final.id]);
  assert.equal(jobs.length, 5);
  a.prompt = "changed after queue";
  await until(
    () =>
      gen.list("project").filter((j) => j.status === "running").length === 2,
  );
  assert.equal(submitted.length, 2);
  assert.equal(
    submitted.every((s) => s.kind === "image"),
    true,
  );
  assert.throws(() => gen.enqueueGraph("project", [v.id]), /进行中/);
  await until(
    () =>
      gen.list("project").find((j) => j.nodeId === v.id).status === "failed",
  );
  assert.equal(submitted.length, 3);
  assert.equal(submitted[0].prompt.includes("changed"), false);
  assert.equal(
    gen.list("project").find((j) => j.nodeId === skipped.id).status,
    "cancelled",
  );
  assert.equal(
    gen.list("project").find((j) => j.nodeId === final.id).status,
    "cancelled",
  );
  assert.equal(videoRefs[0].role, "first_frame");
  assert.equal(fs.existsSync(videoRefs[0].path), true);
});
test("invalid batch is rejected atomically before any provider request", (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "cs-graph-atomic-"));
  const a = node("image"),
    b = node("image");
  b.prompt = "";
  let requests = 0;
  const gen = createGeneration({
    userData,
    studio: { read: () => state([a, b]) },
    bridge: {
      close() {},
      submit() {
        requests++;
      },
    },
  });
  t.after(() => {
    gen.shutdown();
    fs.rmSync(userData, { recursive: true, force: true });
  });
  assert.throws(() => gen.enqueueGraph("root", [a.id, b.id]), /提示词/);
  assert.equal(requests, 0);
  assert.equal(gen.list("root").length, 0);
});

test("restart resumes upstream by original id and submits its queued dependent exactly once", async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "cs-graph-resume-"));
  const a = node("image"),
    v = node("video");
  const s = state([a, v], [edge(a, v, "first_frame")]);
  let submittedImages = 0,
    submittedVideos = 0,
    finished = false;
  const bridge = {
    close() {},
    submit: async (args) => {
      submittedImages++;
      const dest = path.join(args.output_dir, "source.png");
      await sharp({
        create: { width: 300, height: 300, channels: 3, background: "#fff" },
      })
        .png()
        .toFile(dest);
      return { job_id: dest };
    },
    poll: async (remote) =>
      finished
        ? { status: "completed", images: [{ path: remote }] }
        : { status: "running" },
  };
  const provider = {
    validate() {},
    submit: async () => {
      submittedVideos++;
      return { request_id: "same-video" };
    },
    poll: async () => ({ status: "failed", error: "synthetic end" }),
  };
  const options = {
    userData,
    studio: { read: () => structuredClone(s) },
    bridge,
    videoProvider: provider,
    pollMs: 10,
  };
  const first = createGeneration(options);
  first.enqueueGraph("project", [v.id]);
  await until(() => first.list("project").some((j) => j.status === "running"));
  first.shutdown();
  finished = true;
  const resumed = createGeneration(options);
  t.after(() => {
    resumed.shutdown();
    fs.rmSync(userData, { recursive: true, force: true });
  });
  resumed.start();
  await until(
    () =>
      resumed.list("project").find((j) => j.nodeId === v.id).status ===
      "failed",
  );
  assert.equal(submittedImages, 1);
  assert.equal(submittedVideos, 1);
});

test("text nodes contribute ordered prompt snapshots without becoming uploaded media or paid upstream tasks", () => {
  const video = node("video");
  video.prompt = "镜头向前";
  const first = { id: id(), text: "保持角色一致", x: 0, y: 0 },
    second = { id: id(), text: "温暖晨光", x: 100, y: 0 };
  const s = state(
    [video],
    [edge(first, video, "prompt_text"), edge(second, video, "prompt_text")],
  );
  s.canvas.notes = [first, second];
  const plan = planGraph(s, [video.id]);
  assert.equal(plan.nodes[0].prompt, "保持角色一致\n\n温暖晨光\n\n镜头向前");
  assert.deepEqual(plan.inputs[video.id], []);
  assert.equal(plan.nodes.length, 1);
  assert.equal(video.prompt, "镜头向前");
  video.prompt = "";
  assert.ok(planGraph(s, [video.id]).nodes[0].prompt);
  first.text = "x".repeat(4000);
  assert.throws(() => planGraph(s, [video.id]), /超过 4000/);
});
