const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

// Consume the installed cs-codex-image MCP's public tools. No credentials or
// provider settings are copied into the renderer or into a project.
function createImageBridge({
  node,
  server = path.join(
    os.homedir(),
    ".local/share/cs-codex-image-mcp/server.mjs",
  ),
  env = process.env,
}) {
  let child,
    ready,
    sequence = 0;
  const pending = new Map();
  function close() {
    ready = null;
    const old = child;
    child = null;
    old?.kill();
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("生图连接已关闭；已提交任务可稍后继续查询"));
    }
    pending.clear();
  }
  function request(method, params, timeout = 30000) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("生图连接超时，请检查连接后继续查询"));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        (error) => {
          if (error && pending.has(id)) {
            pending.delete(id);
            clearTimeout(timer);
            reject(Error("无法写入生图服务"));
          }
        },
      );
    });
  }
  function connect() {
    if (ready) return ready;
    ready = (async () => {
      if (!node || !fs.existsSync(server))
        throw Error("未找到 Codex 生图桥接，请安装 cs-codex-image 本地运行时");
      child = spawn(node, [server], { env, stdio: ["pipe", "pipe", "pipe"] });
      let buffer = "";
      child.stderr.resume();
      const connectedChild = child;
      const disconnect = () => {
        if (child === connectedChild) close();
      };
      child.on("error", disconnect);
      child.on("exit", disconnect);
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        if (buffer.length > 2 * 1024 * 1024) {
          close();
          return;
        }
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          const p = pending.get(message.id);
          if (!p) continue;
          pending.delete(message.id);
          clearTimeout(p.timer);
          if (message.error)
            p.reject(
              Error(
                "生图服务请求失败：" +
                  String(message.error.message || "未知错误").slice(0, 500),
              ),
            );
          else p.resolve(message.result);
        }
      });
      await request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "cs-workbench", version: "0.4.0" },
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }) + "\n",
      );
      const list = await request("tools/list", {});
      for (const name of ["generate_image", "get_image_job"])
        if (!list.tools?.some((t) => t.name === name))
          throw Error("生图桥接缺少必要工具，请更新 cs-codex-image");
      return true;
    })().catch((error) => {
      close();
      throw error;
    });
    return ready;
  }
  async function call(name, args) {
    await connect();
    const result = await request(
      "tools/call",
      { name, arguments: args },
      60000,
    );
    const text = result.content?.find((c) => c.type === "text")?.text;
    if (result.isError)
      throw Error(String(text || "生图请求失败").slice(0, 1000));
    try {
      return JSON.parse(text);
    } catch {
      throw Error("生图服务返回了无法识别的结果");
    }
  }
  return {
    check: connect,
    submit: (input) => call("generate_image", input),
    poll: (id) => call("get_image_job", { job_id: id, wait_seconds: 0 }),
    close,
  };
}
module.exports = { createImageBridge };
