const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const tls = require("node:tls");
const http = require("node:http");
const PLATFORMS = require("../shared/account-platforms.json");

const VALID_MODES = new Set(["direct", "local_port", "proxy"]);
const VALID_PROTOCOLS = new Set(["http", "https", "socks5"]);

function defaultNetworkConfig() {
  return {
    mode: "direct",
    protocol: "http",
    host: "",
    port: 0,
    username: "",
    hasPassword: false,
    failClosed: true,
    blockWebRtc: true,
    timezone: "",
    lang: "",
    label: "",
  };
}

function normalizeHost(value) {
  const host = String(value || "").trim();
  if (!host) return "";
  if (host.length > 253 || /[\s/@\\:?#"'`;&|<>]/.test(host)) {
    throw new Error("代理地址格式无效，请只填写主机名或 IP（不含协议和端口）");
  }
  return host;
}

function normalizePort(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("代理端口必须是 1–65535 之间的整数");
  }
  return port;
}

function normalizeTimezone(value) {
  const tz = String(value || "").trim();
  if (!tz) return "";
  if (!/^[A-Za-z0-9_/+.-]{1,64}$/.test(tz)) {
    throw new Error("时区格式无效，例如 Asia/Shanghai 或 America/Los_Angeles");
  }
  return tz;
}

function normalizeLang(value) {
  const lang = String(value || "").trim();
  if (!lang) return "";
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang)) {
    throw new Error("语言代码格式无效，例如 zh-CN 或 en-US");
  }
  return lang;
}

function normalizeNetworkConfig(input = {}, existing = null) {
  const base = existing ? { ...defaultNetworkConfig(), ...existing } : defaultNetworkConfig();
  const mode = input.mode !== undefined ? String(input.mode) : base.mode;
  if (!VALID_MODES.has(mode)) throw new Error("不支持的网络模式");

  const protocol = input.protocol !== undefined ? String(input.protocol).toLowerCase() : base.protocol;
  if (!VALID_PROTOCOLS.has(protocol)) throw new Error("代理协议仅支持 HTTP、HTTPS 或 SOCKS5");

  let host = mode === "direct" ? "" : (input.host !== undefined ? normalizeHost(input.host) : base.host);
  let port = mode === "direct" ? 0 : (input.port !== undefined ? normalizePort(input.port) : base.port);
  let username = input.username !== undefined ? String(input.username || "").trim().slice(0, 128) : base.username;
  if (/[\r\n]/.test(username)) throw new Error("代理用户名包含非法字符");

  const label = input.label !== undefined ? String(input.label || "").trim().slice(0, 40) : base.label;
  const failClosed = input.failClosed !== undefined ? Boolean(input.failClosed) : base.failClosed;
  const blockWebRtc = input.blockWebRtc !== undefined ? Boolean(input.blockWebRtc) : base.blockWebRtc;
  const timezone = input.timezone !== undefined ? normalizeTimezone(input.timezone) : base.timezone;
  const lang = input.lang !== undefined ? normalizeLang(input.lang) : base.lang;

  if (mode === "direct") {
    host = "";
    port = 0;
    username = "";
  } else if (mode === "local_port") {
    host = host || "127.0.0.1";
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
      throw new Error("本机多端口分流模式仅允许 127.0.0.1 或 localhost");
    }
    if (!port) throw new Error("请填写本机代理端口（例如 Clash 多端口 7890 / 7891）");
    username = "";
  } else if (mode === "proxy") {
    if (!host) throw new Error("请填写独立代理服务器地址（主机名或 IP）");
    if (!port) throw new Error("请填写独立代理端口");
  }

  return {
    mode,
    protocol,
    host,
    port,
    username,
    hasPassword: Boolean(base.hasPassword),
    failClosed,
    blockWebRtc,
    timezone,
    lang,
    label,
  };
}

function createProxySecretStore(userData, secureStorage = null) {
  const file = path.join(userData, "account-proxy-secrets.json");
  let records = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) records = parsed;
  } catch (err) {
    if (err.code !== "ENOENT") records = {};
  }

  function save() {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(records, null, 2), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
  }

  function canEncrypt() {
    return Boolean(secureStorage && typeof secureStorage.isEncryptionAvailable === "function" && secureStorage.isEncryptionAvailable());
  }

  return {
    has(id) {
      return Boolean(records[id]);
    },
    get(id) {
      const entry = records[id];
      if (!entry) return "";
      if (entry.encrypted && canEncrypt()) {
        try {
          return secureStorage.decryptString(Buffer.from(entry.value, "base64"));
        } catch {
          return "";
        }
      }
      if (!entry.encrypted && typeof entry.value === "string") {
        return Buffer.from(entry.value, "base64").toString("utf8");
      }
      return "";
    },
    set(id, password) {
      const text = String(password || "");
      if (!text) {
        delete records[id];
        save();
        return false;
      }
      if (/[\r\n]/.test(text)) throw new Error("代理密码包含非法换行符");
      if (canEncrypt()) {
        records[id] = {
          encrypted: true,
          value: secureStorage.encryptString(text).toString("base64"),
        };
      } else {
        records[id] = {
          encrypted: false,
          value: Buffer.from(text, "utf8").toString("base64"),
        };
      }
      save();
      return true;
    },
    remove(id) {
      if (Object.hasOwn(records, id)) {
        delete records[id];
        save();
      }
    },
  };
}

// --- Low-level SOCKS5 / HTTP proxy dialers (zero external dependencies) ---

function readExact(socket, length, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let total = 0;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("代理握手超时"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    function onClose() {
      cleanup();
      reject(new Error("代理连接已断开"));
    }
    function onData(chunk) {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= length) {
        cleanup();
        const combined = Buffer.concat(chunks);
        const result = combined.subarray(0, length);
        const extra = combined.subarray(length);
        if (extra.length) socket.unshift(extra);
        resolve(result);
      }
    }
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

function connectTcp(host, port, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`连接 ${host}:${port} 超时`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function dialViaSocks5({ proxyHost, proxyPort, username, password, targetHost, targetPort, timeoutMs = 8000 }) {
  const socket = await connectTcp(proxyHost, proxyPort, timeoutMs);
  try {
    const hasAuth = Boolean(username || password);
    const methods = hasAuth ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]);
    socket.write(methods);
    const greeting = await readExact(socket, 2, timeoutMs);
    if (greeting[0] !== 0x05) throw new Error("目标不是有效的 SOCKS5 代理");
    if (greeting[1] === 0xff) throw new Error("SOCKS5 代理拒绝认证方式");
    if (greeting[1] === 0x02) {
      const userBuf = Buffer.from(username || "", "utf8");
      const passBuf = Buffer.from(password || "", "utf8");
      if (userBuf.length > 255 || passBuf.length > 255) throw new Error("SOCKS5 用户名或密码过长");
      const authReq = Buffer.concat([
        Buffer.from([0x01, userBuf.length]),
        userBuf,
        Buffer.from([passBuf.length]),
        passBuf,
      ]);
      socket.write(authReq);
      const authRes = await readExact(socket, 2, timeoutMs);
      if (authRes[1] !== 0x00) throw new Error("SOCKS5 代理用户名或密码认证失败");
    }

    const hostBuf = Buffer.from(targetHost, "utf8");
    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(targetPort, 0);
    const req = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
      hostBuf,
      portBuf,
    ]);
    socket.write(req);
    const head = await readExact(socket, 4, timeoutMs);
    if (head[0] !== 0x05 || head[1] !== 0x00) {
      throw new Error(`SOCKS5 代理连接目标失败（状态码 ${head[1]}）`);
    }
    const atyp = head[3];
    if (atyp === 0x01) await readExact(socket, 6, timeoutMs);
    else if (atyp === 0x04) await readExact(socket, 18, timeoutMs);
    else if (atyp === 0x03) {
      const lenBuf = await readExact(socket, 1, timeoutMs);
      await readExact(socket, lenBuf[0] + 2, timeoutMs);
    }
    return socket;
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

async function dialViaHttpConnect({ proxyHost, proxyPort, proxyTls = false, username, password, targetHost, targetPort, timeoutMs = 8000 }) {
  const socket = proxyTls
    ? await new Promise((resolve, reject) => {
        const s = tls.connect({ host: proxyHost, port: proxyPort, servername: proxyHost });
        const timer = setTimeout(() => { s.destroy(); reject(new Error(`连接 HTTPS 代理 ${proxyHost}:${proxyPort} 超时`)); }, timeoutMs);
        s.once("secureConnect", () => { clearTimeout(timer); resolve(s); });
        s.once("error", (e) => { clearTimeout(timer); reject(e); });
      })
    : await connectTcp(proxyHost, proxyPort, timeoutMs);

  return new Promise((resolve, reject) => {
    const headers = [
      `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
      `Host: ${targetHost}:${targetPort}`,
      "Proxy-Connection: Keep-Alive",
    ];
    if (username || password) {
      const token = Buffer.from(`${username || ""}:${password || ""}`).toString("base64");
      headers.push(`Proxy-Authorization: Basic ${token}`);
    }
    headers.push("", "");

    let raw = "";
    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error("HTTP 代理 CONNECT 握手超时"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    }
    function onError(err) {
      cleanup();
      socket.destroy();
      reject(err);
    }
    function onClose() {
      cleanup();
      reject(new Error("HTTP 代理提前断开连接"));
    }
    function onData(chunk) {
      raw += chunk.toString("latin1");
      const end = raw.indexOf("\r\n\r\n");
      if (end === -1) {
        if (raw.length > 16384) {
          cleanup();
          socket.destroy();
          reject(new Error("HTTP 代理响应头过长"));
        }
        return;
      }
      cleanup();
      const statusLine = raw.slice(0, raw.indexOf("\r\n"));
      const match = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})/);
      const code = match ? Number(match[1]) : 0;
      if (code === 407) {
        socket.destroy();
        reject(new Error("代理认证失败（407），请检查用户名和密码"));
        return;
      }
      if (code < 200 || code >= 300) {
        socket.destroy();
        reject(new Error(`代理连接被拒绝（HTTP ${code || "未知"}）`));
        return;
      }
      const leftover = raw.length - (end + 4);
      if (leftover > 0) {
        const extraBuf = chunk.subarray(chunk.length - leftover);
        if (extraBuf.length) socket.unshift(extraBuf);
      }
      resolve(socket);
    }

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
    socket.write(headers.join("\r\n"));
  });
}

async function fetchJsonThroughNetwork(urlString, network, password, timeoutMs = 8000) {
  const parsed = new URL(urlString);
  const isHttps = parsed.protocol === "https:";
  const targetHost = parsed.hostname;
  const targetPort = Number(parsed.port) || (isHttps ? 443 : 80);

  let rawSocket;
  if (!network || network.mode === "direct") {
    rawSocket = await connectTcp(targetHost, targetPort, timeoutMs);
  } else if (network.protocol === "socks5") {
    rawSocket = await dialViaSocks5({
      proxyHost: network.host,
      proxyPort: network.port,
      username: network.username,
      password,
      targetHost,
      targetPort,
      timeoutMs,
    });
  } else {
    rawSocket = await dialViaHttpConnect({
      proxyHost: network.host,
      proxyPort: network.port,
      proxyTls: network.protocol === "https",
      username: network.username,
      password,
      targetHost,
      targetPort,
      timeoutMs,
    });
  }

  const stream = isHttps
    ? await new Promise((resolve, reject) => {
        const tlsSocket = tls.connect({ socket: rawSocket, servername: targetHost });
        const timer = setTimeout(() => { tlsSocket.destroy(); reject(new Error("TLS 握手超时")); }, timeoutMs);
        tlsSocket.once("secureConnect", () => { clearTimeout(timer); resolve(tlsSocket); });
        tlsSocket.once("error", (e) => { clearTimeout(timer); reject(e); });
      })
    : rawSocket;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      stream.destroy();
      reject(new Error("出口 IP 探测超时"));
    }, timeoutMs);
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    stream.on("end", () => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString("utf8");
      const split = text.indexOf("\r\n\r\n");
      if (split === -1) return reject(new Error("IP 探测响应无效"));
      const header = text.slice(0, split);
      let body = text.slice(split + 4);
      if (/transfer-encoding:\s*chunked/i.test(header)) {
        body = decodeChunked(body);
      }
      try {
        resolve(JSON.parse(body.trim()));
      } catch {
        reject(new Error("IP 探测返回非 JSON 内容"));
      }
    });
    const reqPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
    stream.write(
      `GET ${reqPath} HTTP/1.1\r\nHost: ${parsed.host}\r\nUser-Agent: cs-work/1.0\r\nAccept: application/json\r\nConnection: close\r\n\r\n`,
    );
  });
}

function decodeChunked(body) {
  let out = "";
  let i = 0;
  while (i < body.length) {
    const lineEnd = body.indexOf("\r\n", i);
    if (lineEnd === -1) break;
    const size = parseInt(body.slice(i, lineEnd).trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    out += body.slice(lineEnd + 2, lineEnd + 2 + size);
    i = lineEnd + 2 + size + 2;
  }
  return out;
}

async function preflightProxy(network, password, timeoutMs = 3500) {
  if (!network || network.mode === "direct") return { ok: true };
  if (!network.host || !network.port) {
    throw new Error("代理配置不完整，请填写主机和端口");
  }
  const socket = await connectTcp(network.host, network.port, timeoutMs);
  try {
    if (network.protocol === "socks5") {
      const hasAuth = Boolean(network.username || password);
      socket.write(hasAuth ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]));
      const greeting = await readExact(socket, 2, timeoutMs);
      if (greeting[0] !== 0x05) throw new Error("目标端口不是有效的 SOCKS5 代理");
      if (greeting[1] === 0xff) throw new Error("SOCKS5 代理拒绝认证方式");
      if (greeting[1] === 0x02) {
        const userBuf = Buffer.from(network.username || "", "utf8");
        const passBuf = Buffer.from(password || "", "utf8");
        socket.write(Buffer.concat([Buffer.from([0x01, userBuf.length]), userBuf, Buffer.from([passBuf.length]), passBuf]));
        const authRes = await readExact(socket, 2, timeoutMs);
        if (authRes[1] !== 0x00) throw new Error("SOCKS5 代理认证失败，请检查用户名和密码");
      }
    }
    return { ok: true };
  } finally {
    socket.destroy();
  }
}

const DOMESTIC_PROBE_ENDPOINTS = [
  {
    url: "https://qifu-api.baidubce.com/ip/local/geo/v1/district",
    parse: (data) => ({
      ip: String(data?.ip || ""),
      country: String(data?.data?.country || ""),
      region: String(data?.data?.prov || ""),
      city: String(data?.data?.city || ""),
      isp: String(data?.data?.isp || ""),
    }),
  },
  {
    url: "https://myip.ipip.net/json",
    parse: (data) => {
      const loc = Array.isArray(data?.data?.location) ? data.data.location : [];
      return {
        ip: String(data?.data?.ip || ""),
        country: String(loc[0] || ""),
        region: String(loc[1] || ""),
        city: String(loc[2] || ""),
        isp: String(loc[4] || loc[3] || ""),
      };
    },
  },
];

const OVERSEAS_PROBE_ENDPOINTS = [
  {
    url: "https://api-ipv4.ip.sb/geoip",
    parse: (data) => ({
      ip: String(data.ip || ""),
      country: String(data.country || ""),
      region: String(data.region || ""),
      city: String(data.city || ""),
      isp: String(data.isp || data.organization || ""),
    }),
  },
  {
    url: "https://ipwho.is/",
    parse: (data) => ({
      ip: String(data.ip || ""),
      country: String(data.country || ""),
      region: String(data.region || ""),
      city: String(data.city || ""),
      isp: String(data.connection?.isp || data.connection?.org || ""),
    }),
  },
  {
    url: "https://api.ipify.org?format=json",
    parse: (data) => ({
      ip: String(data.ip || ""),
      country: "",
      region: "",
      city: "",
      isp: "",
    }),
  },
];

function orderedProbeEndpoints(network) {
  const preferDomestic =
    (network?.mode === "local_port" && Number(network?.port) === 7900) ||
    /国内|直连|中国|CN/i.test(String(network?.label || ""));
  return preferDomestic
    ? [...DOMESTIC_PROBE_ENDPOINTS, ...OVERSEAS_PROBE_ENDPOINTS]
    : [...OVERSEAS_PROBE_ENDPOINTS, ...DOMESTIC_PROBE_ENDPOINTS];
}

async function probeNetwork(network, password = "", { fetchEndpoint = fetchJsonThroughNetwork } = {}) {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  let lastError = null;
  for (const endpoint of orderedProbeEndpoints(network)) {
    try {
      const data = await fetchEndpoint(endpoint.url, network, password, 6000);
      const parsed = endpoint.parse(data || {});
      if (parsed.ip) {
        return {
          ok: true,
          ...parsed,
          latencyMs: Date.now() - started,
          checkedAt,
          error: "",
        };
      }
    } catch (err) {
      lastError = err;
    }
  }
  return {
    ok: false,
    ip: "",
    country: "",
    region: "",
    city: "",
    isp: "",
    latencyMs: Date.now() - started,
    checkedAt,
    error: lastError?.message || "无法通过当前网络探测出口 IP，请检查代理是否在线",
  };
}

// Per-account loopback HTTP CONNECT bridge for authenticated HTTP/HTTPS/SOCKS5 proxies.
// Chrome cannot safely accept proxy credentials directly via --proxy-server CLI flags.
function createProxyBridgeManager() {
  const bridges = new Map();

  function signatureFor(network, password) {
    return JSON.stringify([network.protocol, network.host, network.port, network.username || "", password || ""]);
  }

  async function ensureBridge(accountId, network, password) {
    const sig = signatureFor(network, password);
    const existing = bridges.get(accountId);
    if (existing && existing.sig === sig) {
      return `http://127.0.0.1:${existing.port}`;
    }
    await closeBridge(accountId);

    const server = http.createServer((clientReq, clientRes) => {
      let targetUrl;
      try {
        targetUrl = new URL(clientReq.url);
      } catch {
        clientRes.writeHead(400);
        clientRes.end("Bad proxy request");
        return;
      }
      const targetHost = targetUrl.hostname;
      const targetPort = Number(targetUrl.port) || (targetUrl.protocol === "https:" ? 443 : 80);

      if (network.protocol === "socks5") {
        dialViaSocks5({
          proxyHost: network.host,
          proxyPort: network.port,
          username: network.username,
          password,
          targetHost,
          targetPort,
        })
          .then((upstream) => {
            const reqPath = `${targetUrl.pathname}${targetUrl.search}`;
            const headerLines = [`${clientReq.method} ${reqPath} HTTP/1.1`];
            for (const [k, v] of Object.entries(clientReq.headers)) {
              if (k.toLowerCase() === "proxy-connection") continue;
              headerLines.push(`${k}: ${v}`);
            }
            headerLines.push("Connection: close", "", "");
            upstream.write(headerLines.join("\r\n"));
            clientReq.pipe(upstream);
            upstream.pipe(clientRes.socket);
            upstream.on("error", () => clientRes.socket?.destroy());
          })
          .catch((err) => {
            if (!clientRes.headersSent) clientRes.writeHead(502);
            clientRes.end(err.message);
          });
        return;
      }

      const headers = { ...clientReq.headers };
      delete headers["proxy-connection"];
      if (network.username || password) {
        headers["proxy-authorization"] =
          `Basic ${Buffer.from(`${network.username || ""}:${password || ""}`).toString("base64")}`;
      }
      const upstreamReq = http.request(
        {
          host: network.host,
          port: network.port,
          method: clientReq.method,
          path: clientReq.url,
          headers,
        },
        (upstreamRes) => {
          clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
          upstreamRes.pipe(clientRes);
        },
      );
      upstreamReq.on("error", (err) => {
        if (!clientRes.headersSent) clientRes.writeHead(502);
        clientRes.end(err.message);
      });
      clientReq.pipe(upstreamReq);
    });

    server.on("connect", (req, clientSocket, head) => {
      const [targetHost, rawPort] = String(req.url || "").split(":");
      const targetPort = Number(rawPort) || 443;
      const dial =
        network.protocol === "socks5"
          ? dialViaSocks5({
              proxyHost: network.host,
              proxyPort: network.port,
              username: network.username,
              password,
              targetHost,
              targetPort,
            })
          : dialViaHttpConnect({
              proxyHost: network.host,
              proxyPort: network.port,
              proxyTls: network.protocol === "https",
              username: network.username,
              password,
              targetHost,
              targetPort,
            });
      dial
        .then((upstream) => {
          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head?.length) upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
          upstream.on("error", () => clientSocket.destroy());
          clientSocket.on("error", () => upstream.destroy());
        })
        .catch(() => {
          try {
            clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
          } catch {}
          clientSocket.destroy();
        });
    });

    const port = await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    bridges.set(accountId, { server, port, sig });
    return `http://127.0.0.1:${port}`;
  }

  async function closeBridge(accountId) {
    const existing = bridges.get(accountId);
    if (!existing) return;
    bridges.delete(accountId);
    await new Promise((resolve) => existing.server.close(() => resolve()));
  }

  async function closeAll() {
    await Promise.all([...bridges.keys()].map((id) => closeBridge(id)));
  }

  return { ensureBridge, closeBridge, closeAll };
}

function chromeIsolationOptions(network, proxyUrlOverride = "") {
  const cfg = normalizeNetworkConfig(network || {});
  const args = [];
  const env = {};

  if (cfg.mode !== "direct") {
    const proxyServer = proxyUrlOverride || `${cfg.protocol}://${cfg.host}:${cfg.port}`;
    args.push(`--proxy-server=${proxyServer}`);
    args.push("--proxy-bypass-list=<-loopback>");
    if (cfg.protocol === "socks5" && !proxyUrlOverride) {
      args.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1");
    }
  }

  if (cfg.blockWebRtc) {
    args.push("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
  }
  if (cfg.lang) {
    args.push(`--lang=${cfg.lang}`);
  }
  if (cfg.timezone) {
    env.TZ = cfg.timezone;
  }

  const fingerprint = JSON.stringify({
    mode: cfg.mode,
    proxy: proxyUrlOverride || (cfg.mode === "direct" ? "direct" : `${cfg.protocol}://${cfg.host}:${cfg.port}`),
    blockWebRtc: cfg.blockWebRtc,
    lang: cfg.lang,
    timezone: cfg.timezone,
  });

  return { args, env, fingerprint };
}

function analyzeNetworkConflicts(accounts) {
  const byPlatformProxy = new Map();
  const byPlatformIp = new Map();
  const byPlatformDirect = new Map();

  for (const account of accounts) {
    const netCfg = account.network || defaultNetworkConfig();
    if (netCfg.mode === "direct") {
      const key = account.platform;
      if (!byPlatformDirect.has(key)) byPlatformDirect.set(key, []);
      byPlatformDirect.get(key).push(account);
    } else if (netCfg.host && netCfg.port) {
      const key = `${account.platform}::${netCfg.protocol}://${netCfg.host}:${netCfg.port}`;
      if (!byPlatformProxy.has(key)) byPlatformProxy.set(key, []);
      byPlatformProxy.get(key).push(account);
    }
    const ip = account.lastNetworkCheck?.ok ? account.lastNetworkCheck.ip : "";
    if (ip) {
      const key = `${account.platform}::${ip}`;
      if (!byPlatformIp.has(key)) byPlatformIp.set(key, []);
      byPlatformIp.get(key).push(account);
    }
  }

  const warningsByAccount = {};
  for (const account of accounts) {
    const warnings = [];
    const netCfg = account.network || defaultNetworkConfig();
    if (netCfg.mode === "direct") {
      const peers = (byPlatformDirect.get(account.platform) || []).filter((a) => a.id !== account.id);
      if (peers.length > 0) {
        warnings.push(`同平台还有 ${peers.length} 个直连账号（${peers.map((p) => p.name).join("、")}），共用本机网络，建议配置独立代理端口`);
      }
    } else if (netCfg.host && netCfg.port) {
      const key = `${account.platform}::${netCfg.protocol}://${netCfg.host}:${netCfg.port}`;
      const peers = (byPlatformProxy.get(key) || []).filter((a) => a.id !== account.id);
      if (peers.length > 0) {
        const isDomesticDirect = netCfg.mode === "local_port" && Number(netCfg.port) === 7900;
        warnings.push(
          isDomesticDirect
            ? `与同平台账号「${peers.map((p) => p.name).join("、")}」共用国内宽带直连（:7900），请错峰 1–2 小时发片并避免互赞互评`
            : `与同平台账号「${peers.map((p) => p.name).join("、")}」绑定了相同的代理端口`,
        );
      }
    }
    const ip = account.lastNetworkCheck?.ok ? account.lastNetworkCheck.ip : "";
    const country = account.lastNetworkCheck?.ok ? String(account.lastNetworkCheck.country || "") : "";
    if (
      PLATFORMS[account.platform]?.region === "cn" &&
      country &&
      !/(中国|china|^cn$)/i.test(country)
    ) {
      warnings.push(
        `国内平台当前出口为海外 IP（${country}），易触发限流或异常风控，建议切回国内宽带直连（:7900）或国内独享住宅代理`,
      );
    }
    if (ip) {
      const key = `${account.platform}::${ip}`;
      const peers = (byPlatformIp.get(key) || []).filter((a) => a.id !== account.id);
      const isDomesticDirect = netCfg.mode === "local_port" && Number(netCfg.port) === 7900;
      if (peers.length > 0 && !isDomesticDirect) {
        warnings.push(
          `检测到出口 IP（${ip}）与同平台账号「${peers.map((p) => p.name).join("、")}」相同，存在关联风险`,
        );
      }
    }
    warningsByAccount[account.id] = warnings;
  }

  return warningsByAccount;
}

const COMMON_LOCAL_PROXY_PORTS = [
  7900, 7901, 7902, 7903, 7904, 7905, 7906, 7907, 7908, 7909, 7910, 7911,
  7890, 7891, 7892, 7893, 7897, 10808,
];

function checkLocalPortOpen(port, timeoutMs = 250) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function detectLocalProxyPorts(ports = COMMON_LOCAL_PROXY_PORTS) {
  const checks = await Promise.all(
    ports.map(async (port) => ({ port, open: await checkLocalPortOpen(port) })),
  );
  return checks.filter((item) => item.open).map((item) => item.port);
}

function parseProxyString(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("请粘贴代理地址，例如 socks5://user:pass@1.2.3.4:10808 或 1.2.3.4:10808:user:pass");

  let protocol = "http";
  let host = "";
  let port = 0;
  let username = "";
  let password = "";

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      throw new Error("代理链接格式无效");
    }
    const proto = parsed.protocol.replace(/:$/, "").toLowerCase();
    if (proto === "socks5h") protocol = "socks5";
    else if (VALID_PROTOCOLS.has(proto)) protocol = proto;
    else throw new Error("代理协议仅支持 http / https / socks5");
    host = parsed.hostname;
    port = Number(parsed.port || 0);
    username = parsed.username ? decodeURIComponent(parsed.username) : "";
    password = parsed.password ? decodeURIComponent(parsed.password) : "";
  } else {
    // Support host:port or host:port:user:pass
    const parts = text.split(":");
    if (parts.length === 2) {
      [host, port] = [parts[0].trim(), Number(parts[1].trim())];
    } else if (parts.length === 4) {
      [host, port, username, password] = [
        parts[0].trim(),
        Number(parts[1].trim()),
        parts[2].trim(),
        parts[3].trim(),
      ];
    } else {
      throw new Error("无法识别代理格式，请使用 protocol://user:pass@host:port 或 host:port:user:pass");
    }
  }

  host = normalizeHost(host);
  port = normalizePort(port);
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(host) && !username && !password;
  return {
    mode: isLocal ? "local_port" : "proxy",
    protocol,
    host: isLocal ? "127.0.0.1" : host,
    port,
    username,
    password,
  };
}

module.exports = {
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
};
