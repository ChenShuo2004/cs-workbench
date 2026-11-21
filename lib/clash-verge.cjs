const fs = require("fs"),
  path = require("path"),
  os = require("os");
function readListeners(file) {
  const root = path.join(
    os.homedir(),
    "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev",
  );
  const files = file
    ? [file]
    : [
        path.join(root, "clash-verge.yaml"),
        path.join(root, "clash-verge-check.yaml"),
      ];
  const found = files.find((f) => fs.existsSync(f));
  if (!found)
    return { file: "", listeners: [], error: "未找到 Clash Verge 运行配置" };
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
  return { file: found, listeners, error: "" };
}
module.exports = { readListeners };
