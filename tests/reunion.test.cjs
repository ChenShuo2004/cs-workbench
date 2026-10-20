const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const { createReunion, validateAnalysis, buildPrompt } = require("../lib/reunion.cjs");

const analysis = () => ({
  confident: true, reason: "", comment: "爷爷去世8年了，最后一面没有见到。",
  relation: "爷爷", facts: ["爷爷去世8年", "未见最后一面"],
  appearance: "稀疏白发，浅色上衣与深色马甲", gesture: "双手比耶",
  photoBox: { x: 0.2, y: 0.3, width: 0.4, height: 0.6 },
  faceBox: { x: 0.3, y: 0.4, width: 0.2, height: 0.2 },
  opening: "八年了，再见爷爷一面。", greeting: "孩子，过来坐。",
  main: "让爷爷好好看看你。", closing: "爷爷想你了。", endingAction: "抬起双手比耶并微笑注视",
});
const until = async fn => {
  for (let i = 0; i < 300; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); }
  throw Error("任务未在预期内完成");
};
async function fixture(t, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-reunion-"));
  const input = path.join(root, "comment.png");
  await sharp({ create: { width: 900, height: 900, channels: 3, background: "#eee" } }).png().toFile(input);
  let submits = 0, result, pollMode = opts.pollMode || "completed";
  const analyzer = { available: () => true, close() {}, analyze: async () => opts.analysis || analysis() };
  const bridge = {
    check: async () => true, close() {},
    submit: async request => {
      submits++;
      if (opts.uncertain) throw Error("连接中断");
      const file = path.join(request.output_dir, "portrait.png");
      fs.copyFileSync(input, file);
      result = { status: "completed", images: [{ path: file }] };
      return { job_id: "remote-123" };
    },
    poll: async () => pollMode === "completed" ? result : { status: "running" },
  };
  const args = { userData: path.join(root, "data"), home: root, analyzer, bridge, pollMs: 5 };
  let manager = createReunion(args);
  await manager.setting("output", root);
  for (const kind of ["host", "scene", "television"]) await manager.setting(kind, input);
  manager.start();
  t.after(() => { manager.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, input, get manager() { return manager; }, submits: () => submits,
    complete: () => { pollMode = "completed"; },
    restart: () => { manager.shutdown(); manager = createReunion(args); manager.start(); },
  };
}
test("rejects ambiguous subjects, outside crops and scripts too long for 17 seconds", () => {
  const a = analysis();
  assert.equal(validateAnalysis(a, 900, 900).characterCount, 27);
  assert.throws(() => validateAnalysis({ ...a, confident: false, reason: "没有亲人照片" }, 900, 900), /没有亲人照片/);
  assert.throws(() => validateAnalysis({ ...a, relation: "奶奶" }, 900, 900), /称呼/);
  assert.throws(() => validateAnalysis({ ...a, faceBox: { x: 0, y: 0, width: 0.2, height: 0.2 } }, 900, 900), /不在/);
  assert.throws(() => validateAnalysis({ ...a, opening: "这是一句过长的开场白，肯定不能在三秒里面说完。" }, 900, 900), /预算/);
});
test("one screenshot produces five decodable references and a 17-second pack; duplicates do not resubmit", async t => {
  const f = await fixture(t);
  const imported = await f.manager.importFiles([f.input, f.input]);
  assert.equal(imported.added.length, 1); assert.equal(imported.skipped.length, 1);
  await until(() => f.manager.snapshot().jobs[0].status === "ready");
  const job = f.manager.snapshot().jobs[0];
  const files = fs.readdirSync(job.output);
  assert.equal(files.filter(x => x.endsWith(".png")).length, 5);
  for (const file of files.filter(x => x.endsWith(".png"))) await sharp(path.join(job.output, file)).raw().toBuffer();
  assert.match(job.prompt, /0—3秒/); assert.match(job.prompt, /14—17秒/);
  for (const key of ["opening", "greeting", "main", "closing"]) assert.ok(job.prompt.includes(analysis()[key]));
  assert.equal(fs.readFileSync(path.join(job.output, "06-完整视频提示词-17秒.txt"), "utf8").trim(), buildPrompt(analysis()));
  assert.ok(fs.existsSync(path.join(job.output, "来源与检查", "原始截图.png")));
  assert.equal((await f.manager.importFiles([f.input])).skipped.length, 1);
  assert.equal(f.submits(), 1);
  assert.throws(() => f.manager.media(job.id, "../state.json"), /尚未就绪/);
});
test("ambiguous screenshot goes to review without spending an image generation", async t => {
  const f = await fixture(t, { analysis: { ...analysis(), confident: false, reason: "有多个候选人物" } });
  await f.manager.importFiles([f.input]);
  await until(() => f.manager.snapshot().jobs[0].status === "needs_review");
  assert.match(f.manager.snapshot().jobs[0].error, /多个候选/);
  assert.equal(f.submits(), 0);
});
test("restart resumes remote portrait polling without submitting again", async t => {
  const f = await fixture(t, { pollMode: "running" });
  await f.manager.importFiles([f.input]);
  await until(() => f.manager.snapshot().jobs[0].status === "portrait_running");
  f.restart(); f.complete();
  await until(() => f.manager.snapshot().jobs[0].status === "ready");
  assert.equal(f.submits(), 1);
});
test("unknown submit outcome is never automatically retried", async t => {
  const f = await fixture(t, { uncertain: true });
  await f.manager.importFiles([f.input]);
  await until(() => f.manager.snapshot().jobs[0].status === "uncertain");
  const job = f.manager.snapshot().jobs[0];
  assert.throws(() => f.manager.retry(job.id), /核对/);
  f.restart();
  assert.equal(f.manager.snapshot().jobs[0].status, "uncertain");
  assert.equal(f.submits(), 1);
});
test("batch reports invalid files while continuing valid files", async t => {
  const f = await fixture(t);
  const bad = path.join(f.root, "bad.png"); fs.writeFileSync(bad, "not an image");
  const result = await f.manager.importFiles([bad, f.input]);
  assert.equal(result.rejected.length, 1); assert.equal(result.added.length, 1);
  await until(() => f.manager.snapshot().jobs[0].status === "ready");
});
