const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("fs"),
  os = require("os"),
  path = require("path");
const {
  validate,
  weighted,
  createPublisher,
} = require("../lib/publisher/engine.cjs");
const { createPostStore } = require("../lib/post-store.cjs");
const { assertSafe } = require("../lib/publisher/cdp.cjs");
test("platform limits account for CJK and weighted X content", () => {
  assert.throws(() => validate({ title: "中".repeat(21) }, "xiaohongshu"));
  assert.equal(weighted("中文ab"), 6);
  assert.throws(() => validate({ title: "x", body: "中".repeat(140) }, "x"));
});
test("publication guard blocks all final button labels", () => {
  for (const label of [
    "发布",
    "发表",
    "投稿",
    "Post",
    "Publish",
    "Share",
    "Submit",
  ])
    assert.throws(() => assertSafe(label));
  assert.doesNotThrow(() => assertSafe("Next"));
});
test("drafts and records survive restart and only waiting tasks can be marked", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = createPostStore(dir);
  s.draft({ title: "keep" });
  s.record({ id: "a", status: "失败" });
  assert.throws(() => s.mark("a", ""));
  s.record({ id: "b", status: "待你确认" });
  assert.throws(() => s.mark("b", "javascript:bad"));
  s.mark("b", "https://example.com");
  const r = createPostStore(dir).read();
  assert.equal(r.draft.title, "keep");
  assert.equal(r.records[0].status, "已发布（手动标记）");
});
test("all adapters have filling contracts without submission or scheduling", () => {
  for (const p of Object.keys(require("../shared/platform-rules.json"))) {
    const a = require("../lib/publisher/adapters/" + p + ".cjs").default;
    assert.equal(typeof a.fill, "function");
    for (const key of ["submit", "schedule", "links"])
      assert.equal(a[key], undefined);
    const source = fs.readFileSync(
      path.join(__dirname, "../lib/publisher/adapters", p + ".cjs"),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /tweetButton|publish-button|submit-button|scheduledConfirmationPrimaryAction/,
    );
  }
});
