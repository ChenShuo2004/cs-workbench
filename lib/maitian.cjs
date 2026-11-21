const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// The original site runs in an isolated frame. Its access key stays in main.
function createMaitian({ getConfig, fetchImpl = fetch }) {
  function installation() {
    const root = path.resolve(
      String(
        getConfig().maitianRoot ||
          path.join(os.homedir(), "maitian/mdldm-maitian"),
      ).replace(/^~(?=\/|$)/, os.homedir()),
    );
    if (!fs.existsSync(path.join(root, "src/hub.mjs")))
      throw Error("未找到麦田，请连接已安装的 mdldm-maitian 文件夹");
    const file = path.join(root, "config.json");
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1_000_000)
      throw Error("麦田配置文件无效");
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      !Number.isInteger(cfg.web?.port) ||
      cfg.web.port < 1 ||
      cfg.web.port > 65535 ||
      typeof cfg.web.key !== "string" ||
      !cfg.web.key ||
      /[\r\n;]/.test(cfg.web.key)
    )
      throw Error("麦田网页配置无效，请先完成安装向导");
    return { root, cfg, base: `http://127.0.0.1:${cfg.web.port}` };
  }
  function acceptsURL(value) {
    try {
      const url = new URL(value);
      return (
        !url.username && !url.password && url.origin === installation().base
      );
    } catch {
      return false;
    }
  }
  function frameHeaders(url, headers = {}) {
    if (!acceptsURL(url)) return headers;
    const { cfg } = installation();
    const result = { ...headers };
    const cookies = [];
    for (const [key, value] of Object.entries(result))
      if (key.toLowerCase() === "cookie") {
        cookies.push(
          ...String(value)
            .split(";")
            .map((x) => x.trim())
            .filter((x) => x && !x.startsWith("mt_key=")),
        );
        delete result[key];
      }
    result.Cookie = [...cookies, `mt_key=${cfg.web.key}`].join("; ");
    return result;
  }
  async function snapshot() {
    const result = {
      installed: false,
      connected: false,
      frameUrl: "",
      root: "",
      error: "",
    };
    try {
      const { root, base } = installation();
      Object.assign(result, { installed: true, frameUrl: base + "/", root });
      const r = await fetchImpl(base + "/api/overview", {
        headers: frameHeaders(base + "/api/overview"),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!r.ok) throw Error(`麦田服务返回 ${r.status}，请检查本机服务与配置`);
      result.connected = true;
    } catch (e) {
      result.error =
        e.message === "fetch failed"
          ? "暂时连不上麦田，请确认本机麦田服务已启动后重试。"
          : e.message;
    }
    return result;
  }
  function dashboardURL() {
    const { base, cfg } = installation();
    return `${base}/?key=${encodeURIComponent(cfg.web.key)}`;
  }
  return { installation, acceptsURL, frameHeaders, snapshot, dashboardURL };
}
module.exports = { createMaitian };
