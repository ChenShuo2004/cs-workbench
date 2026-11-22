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
test("multi-draft create, switch, duplicate, delete remain backward compatible", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-multi-draft-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createPostStore(dir);
  const first = store.draft({ title: "草稿一", body: "内容1" });
  assert.equal(first.draft.title, "草稿一");
  assert.equal(first.drafts.length, 1);

  const created = store.createDraft({ title: "草稿二", body: "内容2" });
  assert.equal(created.drafts.length, 2);
  assert.equal(created.draft.title, "草稿二");

  const dup = store.duplicateDraft(created.activeDraftId);
  assert.equal(dup.drafts.length, 3);
  assert.match(dup.drafts[0].name, /副本/);

  const switched = store.selectDraft(first.activeDraftId);
  assert.equal(switched.draft.title, "草稿一");

  const afterDel = store.deleteDraft(switched.activeDraftId);
  assert.equal(afterDel.drafts.length, 2);
  assert.equal(createPostStore(dir).read().drafts.length, 2);
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

test('platform metric aliases distinguish subscribers and avoid parsing period numbers as totals',()=>{const {platformSnapshot}=require('../lib/platform-data.cjs');assert.equal(platformSnapshot({metrics:['订阅人数 1.2万']},'youtube').kpis.followers,12000);assert.equal(platformSnapshot({metrics:['订阅人数 1.2万']},'wechat').kpis.followers,null);assert.equal(platformSnapshot({metrics:['总用户数 1234']},'wechat').kpis.followers,1234);assert.equal(platformSnapshot({metrics:['播放量 近7天 800']},'douyin').kpis.views,null);});

test("shared domestic broadband advisory does not block auto-fill start", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-net-warn-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const video = path.join(dir, "sample.mp4");
  fs.writeFileSync(video, "fake");
  const store = createPostStore(dir);
  const pub = createPublisher({
    store,
    accounts: {
      list: () => [
        {
          id: "acc-1",
          name: "陈硕-抖音",
          platform: "douyin",
          networkWarnings: ["与同平台账号「kaige」共用国内宽带直连（:7900），请错峰 1–2 小时发片并避免互赞互评"],
        },
      ],
      openBrowser: async () => {
        throw new Error("stop-after-queue");
      },
      publisherConnection: async () => {
        throw new Error("stop-after-queue");
      },
    },
  });
  const state = await pub.start({ title: "测试标题", body: "正文", topics: "", video, covers: {}, overrides: {} }, ["acc-1"]);
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].accountId, "acc-1");
  assert.match(state.records[0].logs[0], /网络提示：.*共用国内宽带直连/);
});
