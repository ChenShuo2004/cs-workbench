const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createAccountStore } = require("../lib/douyin-accounts.cjs");
const {
  browserProfile,
  targetUrlFor,
  launchArguments,
  createAccountBrowser,
} = require("../lib/account-browser.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-browser-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, store: createAccountStore(root) };
}

test("each account and platform uses a stable dedicated Chrome profile and target URLs", (t) => {
  const { root, store } = fixture(t);
  const a = store.add("相同名字", "channels");
  const b = store.add("相同名字", "channels");
  assert.notEqual(browserProfile(root, a), browserProfile(root, b));
  store.rename(a.id, "新备注");
  assert.equal(
    browserProfile(root, a),
    browserProfile(root, createAccountStore(root).get(a.id)),
  );
  const args = launchArguments(root, a);
  assert.ok(args.includes("--app=https://channels.weixin.qq.com/"));
  assert.ok(args.includes(`--user-data-dir=${browserProfile(root, a)}`));
  assert.equal(
    args.some((x) =>
      /remote-debugging|disable-web-security|no-sandbox|enable-automation/.test(x),
    ),
    false,
  );

  const pubArgs = launchArguments(root, a, { target: "publish" });
  assert.ok(pubArgs.includes(`--app=${targetUrlFor(a, "publish")}`));
  assert.throws(() =>
    browserProfile(root, { id: "../Default", platform: "channels" }),
  );
});

test("network proxy and WebRTC isolation arguments are passed when launching Chrome", (t) => {
  const { root, store } = fixture(t);
  const xhs = store.add("小红书矩阵1", "xiaohongshu", {
    mode: "local_port",
    protocol: "http",
    host: "127.0.0.1",
    port: 7891,
    blockWebRtc: true,
    timezone: "Asia/Shanghai",
    lang: "zh-CN",
  });
  const args = launchArguments(root, xhs, { target: "publish" });
  assert.ok(args.includes("--proxy-server=http://127.0.0.1:7891"));
  assert.ok(args.includes("--proxy-bypass-list=<-loopback>"));
  assert.ok(
    args.includes("--force-webrtc-ip-handling-policy=disable_non_proxied_udp"),
  );
  assert.ok(args.includes("--lang=zh-CN"));
  assert.ok(args.includes("--app=https://creator.xiaohongshu.com/publish/publish"));
});

test("missing Chrome and process launch failures are reported without deleting existing data", async (t) => {
  const { root, store } = fixture(t);
  const a = store.add("主号", "channels");
  await assert.rejects(
    createAccountBrowser(root, {
      findChrome() {
        throw Error("未找到 Chrome");
      },
    }).open(a),
    /未找到/,
  );
  const mgr = createAccountBrowser(root, { findChrome: () => "/missing/chrome" });
  await assert.rejects(mgr.open(a), /启动失败/);
  assert.equal(store.get(a.id).name, "主号");
});

test("concurrent opens are deduplicated and shell interpolation is never used", async (t) => {
  const { root, store } = fixture(t);
  const a = store.add("主号", "channels");
  let count = 0;
  const mgr = createAccountBrowser(root, {
    findChrome: () => "/fake/Chrome",
    spawnBrowser(_exe, args, options) {
      count++;
      assert.equal(options.shell, false);
      assert.ok(args.includes(`--user-data-dir=${browserProfile(root, a)}`));
      const child = new EventEmitter();
      const {PassThrough}=require('node:stream');
      child.stdio=[null,null,null,new PassThrough(),new PassThrough()];
      child.exitCode=null;
      assert.ok(args.includes('--remote-debugging-pipe'));
      assert.equal(args.some(a=>a.startsWith('--remote-debugging-port')),false);
      child.unref = () => {};
      process.nextTick(() => {
        child.emit("spawn");
        child.emit("exit", 0);
      });
      return child;
    },
  });
  await Promise.all([mgr.open(a), mgr.open(a)]);
  assert.equal(count, 1);
});

test("removal only clears the selected profile and fails closed for a foreign live lock", async (t) => {
  const { root, store } = fixture(t);
  const a = store.add("a", "channels");
  const b = store.add("b", "douyin");
  for (const account of [a, b]) {
    fs.mkdirSync(browserProfile(root, account), { recursive: true });
    fs.writeFileSync(path.join(browserProfile(root, account), "sentinel"), "keep");
  }
  const mgr = createAccountBrowser(root);
  fs.symlinkSync(
    `host-${process.pid}`,
    path.join(browserProfile(root, a), "SingletonLock"),
  );
  await assert.rejects(mgr.remove(a), /正在使用/);
  assert.ok(fs.existsSync(path.join(browserProfile(root, a), "sentinel")));
  fs.unlinkSync(path.join(browserProfile(root, a), "SingletonLock"));
  await mgr.remove(a);
  assert.equal(fs.existsSync(browserProfile(root, a)), false);
  assert.ok(fs.existsSync(path.join(browserProfile(root, b), "sentinel")));
});
