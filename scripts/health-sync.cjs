// Receives data observed through supported browser UI tools. No credentials or private APIs.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createHealth } = require("../lib/health.cjs");
const dir = process.env.CS_HEALTH_DATA_DIR || path.join(os.homedir(), "Library/Application Support/CS 工作台 Pro");
const health = createHealth(dir);
const action = process.argv[2] || "status";
try {
  let result;
  if (action === "status") result = health.snapshot();
  else {
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    if (action === "import") result = health.importObservation(input);
    else if (action === "fail") result = health.syncFailure(input.error);
    else if (action === "configure") result = health.configureSync(input);
    else throw Error("用法：health-sync.cjs status|import|fail|configure；写入操作从 stdin 读取 JSON");
  }
  // Do not print health values to routine automation logs.
  console.log(JSON.stringify({ connection: result.connection, totalRecords: result.records.length, sync: result.sync || null }, null, 2));
} catch (e) { console.error(e.message); process.exitCode = 1; }
