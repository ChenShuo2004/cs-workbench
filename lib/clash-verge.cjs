const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const DEFAULT_SOCKET = "/tmp/verge/verge-mihomo.sock";

function resolveConfigFile(file) {
  const root = path.join(
    os.homedir(),
    "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev",
  );
  const candidates = file
    ? [file]
    : [
        path.join(root, "clash-verge.yaml"),
        path.join(root, "clash-verge-check.yaml"),
      ];
  return candidates.find((f) => f && fs.existsSync(f)) || "";
}

function readListeners(file) {
  const found = resolveConfigFile(file);
  const socketAvailable = fs.existsSync(DEFAULT_SOCKET);
  if (!found) {
    return {
      file: "",
      listeners: [],
      socketAvailable,
      error: "未找到 Clash Verge 运行配置",
    };
  }
  const s = fs.readFileSync(found, "utf8");
  const block =
    s.match(/^listeners:\s*\n([\s\S]*?)(?=^[\w-]+:|$(?![\s\S]))/m)?.[1] || "";
  const listeners = block
    .split(/(?=^\s*-\s*name:)/m)
    .map((t) => ({
      name: t.match(/name:\s*["']?([^\n"']+)/)?.[1]?.trim(),
      port: Number(t.match(/port:\s*(\d+)/)?.[1]),
      proxy: t.match(/proxy:\s*["']?([^\n"']+)/)?.[1]?.trim() || "",
    }))
    .filter((x) => x.name && x.port);
  return { file: found, listeners, socketAvailable, error: "" };
}

function reloadConfig(file, socketPath = DEFAULT_SOCKET) {
  const found = resolveConfigFile(file);
  if (!found) {
    return Promise.resolve({
      ok: false,
      file: "",
      error: "未找到 Clash Verge 配置文件，无法重载",
    });
  }
  if (!fs.existsSync(socketPath)) {
    return Promise.resolve({
      ok: false,
      file: found,
      error: "未检测到 Clash Verge 控制接口（请确认 Clash Verge 已启动）",
    });
  }
  return new Promise((resolve) => {
    const body = JSON.stringify({ path: found });
    const req = http.request(
      {
        socketPath,
        path: "/configs?force=true",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          chunks += c;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, file: found, error: "" });
          } else {
            resolve({
              ok: false,
              file: found,
              error: `Clash 重载返回 HTTP ${res.statusCode || 0}${chunks ? `：${chunks.slice(0, 120)}` : ""}`,
            });
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("请求超时"));
    });
    req.on("error", (err) => {
      resolve({
        ok: false,
        file: found,
        error: `重载失败：${err.message || "无法连接 Clash Verge"}`,
      });
    });
    req.write(body);
    req.end();
  });
}

module.exports = { readListeners, reloadConfig };
