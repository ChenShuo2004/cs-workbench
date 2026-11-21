const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createAccountStore,
  partitionFor,
  isDouyinURL,
} = require("../lib/douyin-accounts.cjs");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-douyin-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, store: createAccountStore(root) };
}
test("accounts retain stable isolated partitions across rename and application restart", (t) => {
  const { root, store } = fixture(t);
  const a = store.add("主号");
  const b = store.add("知识分享号");
  assert.notEqual(partitionFor(a.id), partitionFor(b.id));
  store.rename(a.id, "主号新备注");
  store.opened(a.id);
  const restored = createAccountStore(root);
  assert.equal(restored.get(a.id).name, "主号新备注");
  assert.ok(restored.get(a.id).lastOpenedAt);
  assert.equal(partitionFor(restored.get(a.id).id), partitionFor(a.id));
  restored.remove(a.id);
  assert.deepEqual(
    createAccountStore(root)
      .list()
      .map((item) => item.id),
    [b.id],
  );
  assert.equal(restored.get(b.id).lastOpenedAt, "");
});
test("invalid names, unknown accounts and partition path injection are rejected", (t) => {
  const { store } = fixture(t);
  for (const name of [null, {}, "   ", "字".repeat(41)])
    assert.throws(() => store.add(name), /账号备注/);
  assert.throws(() => store.rename("missing", "新名字"), /账号不存在/);
  for (const id of ["../Default", "", "persist:main", null])
    assert.throws(() => partitionFor(id), /无效账号/);
  assert.equal(store.list().length, 0);
});
test("only HTTPS Douyin navigation is accepted and host spoofing is blocked", () => {
  for (const url of [
    "https://creator.douyin.com/",
    "https://sso.douyin.com/login",
    "https://www.douyin.com/",
  ])
    assert.equal(isDouyinURL(url), true);
  for (const url of [
    "http://creator.douyin.com/",
    "https://douyin.com.evil.test",
    "https://evildouyin.com/",
    "https://douyin.com@evil.test",
    "https://evil.test@douyin.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "douyin://login",
    null,
  ])
    assert.equal(isDouyinURL(url), false);
});
test("unreadable account metadata is preserved rather than silently replaced", (t) => {
  const { root } = fixture(t);
  const file = path.join(root, "douyin-accounts.json");
  fs.writeFileSync(file, "broken-json");
  assert.throws(() => createAccountStore(root));
  assert.equal(fs.readFileSync(file, "utf8"), "broken-json");
});

test("legacy Douyin records retain their UUID and partition when adding other platforms", (t) => {
  const { root, store } = fixture(t);
  const original = store.add("原有主号");
  const legacy = { ...original };
  delete legacy.platform;
  const file = path.join(root, "douyin-accounts.json");
  fs.writeFileSync(file, JSON.stringify([legacy]));
  const restored = createAccountStore(root);
  assert.equal(restored.get(original.id).platform, "douyin");
  assert.equal(partitionFor(original.id, restored.get(original.id).platform), `persist:douyin-${original.id}`);
  for (const platform of ["xiaohongshu", "channels", "wechat"]) {
    const added = restored.add("同名账号", platform);
    assert.equal(createAccountStore(root).get(added.id).platform, platform);
    assert.notEqual(partitionFor(added.id, platform), partitionFor(original.id));
    restored.rename(added.id, "新备注");
    assert.equal(restored.get(added.id).platform, platform);
  }
  assert.equal(restored.list().length, 4);
  assert.throws(() => restored.add("错误", "__proto__"), /不支持的平台/);
  assert.throws(() => restored.add("错误", "unknown"), /不支持的平台/);
  assert.equal(restored.list().length, 4);
});

test("platform navigation permits its login hosts and rejects unrelated or spoofed domains", () => {
  const { PLATFORMS, isPlatformURL } = require("../lib/douyin-accounts.cjs");
  for (const [id, platform] of Object.entries(PLATFORMS)) {
    assert.equal(isPlatformURL(platform.url, id), true);
    for (const host of platform.hosts) {
      assert.equal(isPlatformURL(`https://${host}/login`, id), true);
      for (const url of [`https://${host}.evil.test`, `https://${host}@evil.test`, `http://${host}/`, `https://user@${host}/`, `https://${host}:8443/`])
        assert.equal(isPlatformURL(url, id), false, `${id}: ${url}`);
    }
    assert.equal(isPlatformURL("https://example.com", id), false);
  }
  assert.equal(isPlatformURL("https://creator.xiaohongshu.com/", "wechat"), false);
  assert.equal(isPlatformURL("https://unrelated.qq.com/", "channels"), false);
  assert.equal(isPlatformURL("https://mp.weixin.qq.com/", "unknown"), false);
});
