const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const {
  defaultNetworkConfig,
  normalizeNetworkConfig,
  createProxySecretStore,
  createProxyBridgeManager,
  chromeIsolationOptions,
  preflightProxy,
  probeNetwork,
  analyzeNetworkConflicts,
  detectLocalProxyPorts,
  parseProxyString,
} = require("../lib/network-isolation.cjs");

test("normalizes direct, local_port, and proxy configs and rejects invalid inputs", () => {
  const direct = normalizeNetworkConfig({ mode: "direct" });
  assert.equal(direct.mode, "direct");
  assert.equal(direct.port, 0);

  const local = normalizeNetworkConfig({ mode: "local_port", protocol: "http", port: 7891, label: "Clash 7891" });
  assert.equal(local.host, "127.0.0.1");
  assert.equal(local.port, 7891);
  assert.equal(local.label, "Clash 7891");

  const proxy = normalizeNetworkConfig({
    mode: "proxy",
    protocol: "socks5",
    host: "proxy.example.com",
    port: 10808,
    username: "alice",
    timezone: "America/Los_Angeles",
    lang: "en-US",
  });
  assert.equal(proxy.protocol, "socks5");
  assert.equal(proxy.host, "proxy.example.com");
  assert.equal(proxy.timezone, "America/Los_Angeles");

  assert.throws(() => normalizeNetworkConfig({ mode: "local_port", host: "8.8.8.8", port: 7890 }), /127\.0\.0\.1/);
  assert.throws(() => normalizeNetworkConfig({ mode: "proxy", host: "bad host/path", port: 8080 }), /代理地址格式无效/);
  assert.throws(() => normalizeNetworkConfig({ mode: "proxy", host: "1.2.3.4", port: 70000 }), /1–65535/);
  assert.throws(() => normalizeNetworkConfig({ mode: "direct", timezone: "bad tz!" }), /时区格式无效/);
});

test("chromeIsolationOptions builds proxy, WebRTC, DNS leak guard, lang, and TZ env", () => {
  const socks = chromeIsolationOptions({
    mode: "proxy",
    protocol: "socks5",
    host: "10.0.0.2",
    port: 1080,
    blockWebRtc: true,
    timezone: "Asia/Tokyo",
    lang: "ja-JP",
  });
  assert.ok(socks.args.includes("--proxy-server=socks5://10.0.0.2:1080"));
  assert.ok(socks.args.includes("--proxy-bypass-list=<-loopback>"));
  assert.ok(socks.args.includes("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"));
  assert.ok(socks.args.includes("--force-webrtc-ip-handling-policy=disable_non_proxied_udp"));
  assert.ok(socks.args.includes("--lang=ja-JP"));
  assert.equal(socks.env.TZ, "Asia/Tokyo");

  const bridged = chromeIsolationOptions(
    { mode: "proxy", protocol: "http", host: "1.2.3.4", port: 8080, blockWebRtc: true },
    "http://127.0.0.1:54321",
  );
  assert.ok(bridged.args.includes("--proxy-server=http://127.0.0.1:54321"));
  assert.equal(bridged.args.some((x) => x.includes("1.2.3.4")), false);
});

test("analyzeNetworkConflicts detects same-platform direct, same-proxy, and same-IP collisions", () => {
  const accounts = [
    {
      id: "1",
      platform: "xiaohongshu",
      name: "小红书1号",
      network: { ...defaultNetworkConfig(), mode: "local_port", protocol: "http", host: "127.0.0.1", port: 7891 },
      lastNetworkCheck: { ok: true, ip: "1.1.1.1" },
    },
    {
      id: "2",
      platform: "xiaohongshu",
      name: "小红书2号",
      network: { ...defaultNetworkConfig(), mode: "local_port", protocol: "http", host: "127.0.0.1", port: 7891 },
      lastNetworkCheck: { ok: true, ip: "1.1.1.1" },
    },
    {
      id: "3",
      platform: "douyin",
      name: "抖音1号",
      network: { ...defaultNetworkConfig(), mode: "local_port", protocol: "http", host: "127.0.0.1", port: 7891 },
      lastNetworkCheck: { ok: true, ip: "1.1.1.1" },
    },
    {
      id: "4",
      platform: "douyin",
      name: "抖音2号",
      network: { ...defaultNetworkConfig(), mode: "local_port", protocol: "http", host: "127.0.0.1", port: 7892 },
      lastNetworkCheck: { ok: true, ip: "2.2.2.2" },
    },
  ];

  const warnings = analyzeNetworkConflicts(accounts);
  assert.equal(warnings["1"].length, 2);
  assert.match(warnings["1"][0], /小红书2号/);
  assert.match(warnings["1"][1], /1\.1\.1\.1/);
  assert.equal(warnings["3"].length, 0);
  assert.equal(warnings["4"].length, 0);
});

test("proxy secret store encrypts passwords when secureStorage is available and removes cleanly", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-secret-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fakeSafe = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`enc:${s}`),
    decryptString: (b) => b.toString("utf8").replace(/^enc:/, ""),
  };
  const store = createProxySecretStore(dir, fakeSafe);
  store.set("acc-1", "s3cr3t!");
  assert.equal(store.has("acc-1"), true);
  assert.equal(store.get("acc-1"), "s3cr3t!");
  const rawDisk = fs.readFileSync(path.join(dir, "account-proxy-secrets.json"), "utf8");
  assert.equal(rawDisk.includes("s3cr3t!"), false);
  store.remove("acc-1");
  assert.equal(store.has("acc-1"), false);
});

test("preflightProxy rejects unreachable proxy (fail-closed) and accepts reachable local proxy", async (t) => {
  const server = net.createServer((s) => s.end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();

  const ok = await preflightProxy({ mode: "local_port", protocol: "http", host: "127.0.0.1", port }, "", 1500);
  assert.equal(ok.ok, true);

  await assert.rejects(
    preflightProxy({ mode: "local_port", protocol: "http", host: "127.0.0.1", port: 1 }, "", 1000),
  );
});

test("authenticated loopback proxy bridge forwards HTTP requests with upstream Proxy-Authorization", async (t) => {
  let receivedAuth = "";
  const upstream = http.createServer((req, res) => {
    receivedAuth = req.headers["proxy-authorization"] || "";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => upstream.close());
  const upstreamPort = upstream.address().port;

  const mgr = createProxyBridgeManager();
  t.after(() => mgr.closeAll());
  const bridgeUrl = await mgr.ensureBridge(
    "acc-bridge",
    { mode: "proxy", protocol: "http", host: "127.0.0.1", port: upstreamPort, username: "u1" },
    "p1",
  );
  const parsed = new URL(bridgeUrl);
  const body = await new Promise((resolve, reject) => {
    const req = http.request(
      { host: parsed.hostname, port: Number(parsed.port), method: "GET", path: "http://example.test/ping" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(JSON.parse(body).ok, true);
  assert.equal(receivedAuth, `Basic ${Buffer.from("u1:p1").toString("base64")}`);
});

test("probeNetwork falls back across endpoints and returns normalized exit IP metadata", async () => {
  let calls = 0;
  const res = await probeNetwork(defaultNetworkConfig(), "", {
    fetchEndpoint: async (url) => {
      calls++;
      if (calls === 1) throw new Error("first failed");
      if (url.includes("ip.sb")) {
        return { ip: "203.0.113.9", country: "Japan", region: "Tokyo", city: "Tokyo", isp: "ExampleNet" };
      }
      throw new Error("unexpected");
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.ip, "203.0.113.9");
  assert.equal(res.country, "Japan");
  assert.equal(calls, 2);
});

test("parseProxyString parses URL and colon formats and distinguishes local vs remote proxies", () => {
  const s1 = parseProxyString("socks5://alice:p%40ss@198.51.100.7:10808");
  assert.equal(s1.mode, "proxy");
  assert.equal(s1.protocol, "socks5");
  assert.equal(s1.host, "198.51.100.7");
  assert.equal(s1.port, 10808);
  assert.equal(s1.username, "alice");
  assert.equal(s1.password, "p@ss");

  const s2 = parseProxyString("198.51.100.8:8080:u2:p2");
  assert.equal(s2.mode, "proxy");
  assert.equal(s2.host, "198.51.100.8");
  assert.equal(s2.port, 8080);
  assert.equal(s2.username, "u2");
  assert.equal(s2.password, "p2");

  const local = parseProxyString("http://127.0.0.1:7891");
  assert.equal(local.mode, "local_port");
  assert.equal(local.port, 7891);
});

test("detectLocalProxyPorts finds active loopback listening ports", async (t) => {
  const srv = net.createServer((s) => s.end());
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  t.after(() => srv.close());
  const { port } = srv.address();

  const found = await detectLocalProxyPorts([port, 1]);
  assert.deepEqual(found, [port]);
});
