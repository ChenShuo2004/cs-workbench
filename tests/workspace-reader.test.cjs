const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createWorkspaceReader } = require("../lib/workspace-reader.cjs");
const workbench = require("../lib/workbench.cjs");

test("background workspace read returns the same projects and catalog without mutating inputs", async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "cs-read-unit-"));
  const reader = createWorkspaceReader({ timeoutMs: 5000 });
  t.after(() => {
    reader.shutdown();
    fs.rmSync(base, { recursive: true, force: true });
  });
  const config = {
    workspace: path.join(base, "projects"),
    projects: [],
    library: "",
  };
  workbench.createProject(config, { title: "读取验收", platforms: ["X"] });
  const before = structuredClone(config);
  const result = await reader.read(config);
  assert.deepEqual(result.projects, workbench.listProjects(config));
  assert.deepEqual(result.catalog, workbench.libraryCatalog(""));
  assert.deepEqual(config, before);
});

test(
  "blocked file reads time out without blocking the main thread, then the same pending read recovers",
  { skip: process.platform === "win32" },
  async (t) => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "cs-read-blocked-"));
    const project = path.join(base, "project");
    fs.mkdirSync(project);
    const file = path.join(project, "project.json");
    execFileSync("mkfifo", [file]);
    const reader = createWorkspaceReader({ timeoutMs: 300 });
    t.after(() => {
      reader.shutdown();
      fs.rmSync(base, { recursive: true, force: true });
    });
    const config = { projects: [project], library: "" };
    let heartbeat = false;
    const tick = setTimeout(() => {
      heartbeat = true;
    }, 20);
    await assert.rejects(reader.read(config), /读取项目或素材库超时/);
    clearTimeout(tick);
    assert.equal(heartbeat, true);
    const retry = reader.read(config);
    await fs.promises.writeFile(
      file,
      JSON.stringify({ title: "恢复后的工程" }),
    );
    assert.equal((await retry).projects[0].title, "恢复后的工程");
    reader.shutdown();
    await assert.rejects(reader.read(config), /正在关闭/);
  },
);
