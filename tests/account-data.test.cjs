const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  parseMetricNumber,
  extractKpisFromMetrics,
  snapshotFromPage,
  createAccountDataStore,
} = require("../lib/account-data.cjs");

test("parses Chinese and English metric units accurately", () => {
  assert.equal(parseMetricNumber("1,234"), 1234);
  assert.equal(parseMetricNumber("3.5万"), 35000);
  assert.equal(parseMetricNumber("1.2w"), 12000);
  assert.equal(parseMetricNumber("2.5K"), 2500);
  assert.equal(parseMetricNumber("1.1M"), 1100000);
  assert.equal(parseMetricNumber("--"), null);
});

test("extracts structured KPIs from Chinese and English platform lines", () => {
  const cn = extractKpisFromMetrics([
    "粉丝总数 4.2万",
    "播放量 18.5万",
    "获赞 9,820",
    "评论数 412",
    "收藏数 1,250",
  ]);
  assert.deepEqual(cn, {
    followers: 42000,
    views: 185000,
    likes: 9820,
    comments: 412,
    saves: 1250,
    shares: null,
  });

  const en = extractKpisFromMetrics(["Subscribers 12.4K", "Views 320K", "Likes 8,100"]);
  assert.equal(en.followers, 12400);
  assert.equal(en.views, 320000);
  assert.equal(en.likes, 8100);
});

test("account data store persists history and calculates deltas between captures", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-data-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createAccountDataStore(dir);

  const s1 = store.put("a1", snapshotFromPage({
    accountName: "陈硕AI",
    metrics: ["粉丝 1000", "播放量 5000", "点赞 300"],
  }));
  assert.equal(s1.kpis.followers, 1000);
  assert.equal(s1.deltas, null);

  const s2 = store.put("a1", snapshotFromPage({
    accountName: "陈硕AI",
    metrics: ["粉丝 1125", "播放量 7500", "点赞 420"],
  }));
  assert.equal(s2.deltas.followers, 125);
  assert.equal(s2.deltas.views, 2500);
  assert.equal(s2.deltas.likes, 120);
  assert.equal(s2.history.length, 2);

  const reloaded = createAccountDataStore(dir).get("a1");
  assert.equal(reloaded.deltas.followers, 125);
});
