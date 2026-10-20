const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const sharp = require("sharp");
const wb = require("../lib/workbench.cjs");
const { createStudio } = require("../lib/studio.cjs");
const { createGeneration } = require("../lib/studio-generation.cjs");
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("Timed out");
}
function fixture(t, bridge) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "cs-generation-unit-"));
  const config = { workspace: path.join(base, "projects"), projects: [] };
  const root = wb.createProject(config, {
    title: "generation",
    platforms: [],
  }).path;
  const studio = createStudio({
    config: () => config,
    tools: () => ({}),
    userData: base,
  });
  const gen = createGeneration({ userData: base, studio, bridge, pollMs: 10 });
  t.after(() => {
    gen.shutdown();
    studio.shutdown();
    fs.rmSync(base, { recursive: true, force: true });
  });
  return { base, root, config, studio, gen };
}
const input = {
  kind: "image",
  prompt: "a seedling",
  aspect: "16:9",
  duration: 5,
  referenceId: "",
  model: "",
};
test("generation imports once, preserves edits made during processing and requires saved attachment before acknowledgment", async (t) => {
  let submitted = 0,
    destination;
  const bridge = {
    check: async () => true,
    close() {},
    submit: async (args) => {
      submitted++;
      destination = path.join(args.output_dir, "test.png");
      await sharp({
        create: { width: 64, height: 32, channels: 3, background: "#628273" },
      })
        .png()
        .toFile(destination);
      return { job_id: "remote" };
    },
    poll: async () => ({
      status: "completed",
      images: [{ path: destination }],
    }),
  };
  const { root, studio, gen } = fixture(t, bridge);
  const job = gen.enqueue(root, input);
  const edited = studio.read(root);
  edited.clips.push({
    id: "manual",
    visual: "scene",
    start: 0,
    end: 2,
    text: "preserve me",
    enabled: true,
  });
  studio.save(root, edited);
  await until(() => gen.list(root)[0].status === "completed");
  const results = await Promise.all([gen.attach(job.id), gen.attach(job.id)]);
  assert.equal(results[1].media.length, 1);
  assert.equal(studio.read(root).clips[0].text, "preserve me");
  assert.equal(submitted, 1);
  assert.throws(() => gen.acknowledge(job.id), /尚未保存/);
  const next = studio.read(root);
  next.clips.push({
    id: job.id,
    mediaId: job.id,
    visual: "media",
    start: 0,
    end: 5,
    text: "",
    enabled: true,
  });
  studio.save(root, next);
  gen.acknowledge(job.id);
  assert.equal(gen.list(root)[0].applied, true);
});
test("interrupted polling resumes the same provider request without another submission", async (t) => {
  let submitted = 0,
    attempts = 0,
    destination;
  const bridge = {
    check: async () => true,
    close() {},
    submit: async (args) => {
      submitted++;
      destination = path.join(args.output_dir, "result.png");
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "red" },
      })
        .png()
        .toFile(destination);
      return { job_id: "same-remote-id" };
    },
    poll: async (id) => {
      assert.equal(id, "same-remote-id");
      if (!attempts++) throw Error("temporary offline");
      return { status: "completed", images: [{ path: destination }] };
    },
  };
  const { root, gen } = fixture(t, bridge);
  const job = gen.enqueue(root, input);
  await until(() => gen.list(root)[0].status === "paused");
  gen.resume(job.id);
  await until(() => gen.list(root)[0].status === "completed");
  assert.equal(submitted, 1);
  assert.equal(attempts, 2);
});
test("restart resumes known remote jobs but never resubmits an ambiguous submission", async (t) => {
  let submitted = 0,
    polled = 0;
  const bridge = {
    check: async () => true,
    close() {},
    submit: async () => {
      submitted++;
      throw Error("must not submit");
    },
    poll: async () => {
      polled++;
      return { status: "failed", error: "provider rejected" };
    },
  };
  const { base, root, studio, gen } = fixture(t, bridge);
  gen.shutdown();
  const known = {
    ...input,
    root,
    id: crypto.randomUUID(),
    status: "running",
    remoteId: "known",
    createdAt: new Date().toISOString(),
  };
  const ambiguous = {
    ...input,
    root,
    id: crypto.randomUUID(),
    status: "submitting",
    createdAt: new Date().toISOString(),
  };
  wb.writeJson(path.join(base, "studio-generation/jobs.json"), [
    known,
    ambiguous,
  ]);
  const restored = createGeneration({
    userData: base,
    studio,
    bridge,
    pollMs: 10,
  });
  t.after(() => restored.shutdown());
  restored.start();
  await until(() => restored.list(root)[0].status === "failed");
  assert.equal(restored.list(root)[1].status, "interrupted");
  assert.equal(submitted, 0);
  assert.equal(polled, 1);
});
test("validation rejects external references and invalid input without launching a model", (t) => {
  let calls = 0;
  const bridge = {
    check: async () => true,
    close() {},
    submit: async () => {
      calls++;
    },
    poll() {},
  };
  const { root, gen } = fixture(t, bridge);
  assert.throws(() => gen.enqueue(root, { ...input, prompt: "" }), /提示词/);
  assert.throws(() => gen.enqueue(root, { ...input, duration: 0 }), /时长/);
  assert.throws(
    () => gen.enqueue(root, { ...input, referenceId: "../../outside.png" }),
    /当前项目/,
  );
  assert.throws(() => gen.enqueue(root, { ...input, kind: "video" }), /配置/);
  assert.equal(calls, 0);
  assert.deepEqual(gen.list(root), []);
});

test("restart distinguishes legacy transcoding from native 1080P and preserves model snapshots", async (t) => {
  const bridge = { close() {}, check: async () => true };
  const { base, root, studio, gen } = fixture(t, bridge);
  gen.shutdown();
  const legacy = {
    ...input,
    kind: "video",
    root,
    id: crypto.randomUUID(),
    model: "MiniMax-H3",
    resolution: "1080P",
    status: "paused",
    remoteId: "old-2k",
  };
  const native = {
    ...legacy,
    id: crypto.randomUUID(),
    model: "seedance-2.0",
    nativeResolution: true,
    remoteId: "native1080",
  };
  wb.writeJson(path.join(base, "studio-generation/jobs.json"), [
    legacy,
    native,
  ]);
  const restored = createGeneration({
    userData: base,
    studio,
    bridge,
    videoProvider: {
      validate() {},
      submit: async () => ({ request_id: "new-native" }),
      poll: async () => ({ status: "running" }),
    },
  });
  t.after(() => restored.shutdown());
  assert.equal(restored.list(root)[0].legacy1080Transcode, true);
  assert.equal(restored.list(root)[1].legacy1080Transcode, undefined);
  assert.equal(restored.list(root)[1].model, "seedance-2.0");
  const added = restored.enqueue(root, {
    ...input,
    kind: "video",
    model: "seedance-2.0",
    resolution: "1080P",
  });
  assert.equal(added.nativeResolution, true);
  assert.equal(added.model, "seedance-2.0");
  assert.equal(added.legacy1080Transcode, undefined);
});
