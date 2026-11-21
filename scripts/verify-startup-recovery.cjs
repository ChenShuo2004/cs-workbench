const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-startup-recovery-"));
const data = path.join(temp, "data");
const project = path.join(temp, "project");
const out = path.join(repo, "out/startup-recovery-qa");
for (const folder of [data, project, out])
  fs.mkdirSync(folder, { recursive: true });
const file = path.join(project, "project.json");
execFileSync("mkfifo", [file]);
fs.writeFileSync(
  path.join(data, "config.json"),
  JSON.stringify({
    workspace: path.join(temp, "projects"),
    projects: [project],
    library: "",
  }),
);
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
let app, page;
const report = { checks: [], errors: [] };
(async () => {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
    timeout: 30000,
  });
  report.version = await app.evaluate(({ app }) => app.getVersion());
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  page = await app.firstWindow({ timeout: 30000 });
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.getByText("正在打开工作台", { exact: true }).waitFor();
  // Even while an OS-level open() is blocked, main-process IPC stays responsive.
  const start = Date.now();
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );
  assert.ok(Date.now() - start < 2000);
  await page
    .getByRole("button", { name: "重新打开工作台", exact: true })
    .waitFor();
  assert.match(
    await page.getByRole("alert").innerText(),
    /读取项目或素材库超时/,
  );
  await page.screenshot({ path: path.join(out, "timeout.png") });
  report.checks.push(
    "a blocked filesystem open leaves Electron responsive and becomes a readable retry state",
  );
  const retry = page
    .getByRole("button", { name: "重新打开工作台", exact: true })
    .click();
  // Release the simulated unavailable file, preserving the existing pending read.
  const metadata = JSON.stringify({ title: "恢复后的工程" });
  await fs.promises.writeFile(file, metadata);
  fs.writeFileSync(file + ".recovered", metadata);
  fs.renameSync(file + ".recovered", file);
  await retry;
  await page.getByLabel("今日随手记").waitFor();
  await page.getByRole("button", { name: "全局搜索工作区" }).click();
  await page
    .getByRole("combobox", { name: "搜索工作区内容" })
    .fill("恢复后的工程");
  await page.getByRole("option", { name: /项目 恢复后的工程/ }).waitFor();
  report.checks.push(
    "retry recovers the original project and reaches the complete workspace without restarting or replacing data",
  );
  assert.deepEqual(report.errors, []);
})()
  .catch((e) => {
    report.failure = e.stack;
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
