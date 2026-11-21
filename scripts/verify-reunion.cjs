const { _electron: electron } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict");
const repo = path.resolve(__dirname, "..");
const out = path.resolve(process.env.CS_REUNION_QA_OUTPUT || path.join(repo, "out/reunion-qa"));
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-reunion-ui-"));
const data = path.join(temp, "data");
fs.mkdirSync(data);
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ workspace: path.join(temp, "projects"), library: "", projects: [] }));
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(entry, `const {app}=require("electron");app.setPath("userData",${JSON.stringify(data)});require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`);
const report = { checks: [], errors: [], data, live: !!process.env.CS_REUNION_SCREENSHOT };
let app;
(async () => {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", e => report.errors.push(e.message));
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page.locator(".sidebar").getByRole("button", { name: "亲人重逢", exact: true }).click();
  await page.getByRole("heading", { name: "亲人重逢", exact: true }).waitFor();
  await page.getByText("从一张评论截图开始", { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(out, "empty.png") });
  report.checks.push("native page navigation and empty state");
  if (process.env.CS_REUNION_SCREENSHOT) {
    const input = path.resolve(process.env.CS_REUNION_SCREENSHOT);
    // Exercise the real import action, substituting only the OS picker selection.
    await app.evaluate(({ dialog }, input) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input, input] });
    }, input);
    await page.getByRole("button", { name: "选择截图并开始", exact: true }).click();
    await page.getByText("已加入 1 张，跳过 1 张重复截图", { exact: true }).waitFor();
    report.checks.push("native picker import and duplicate handling");
    let previous = "";
    for (let i = 0; i < 600; i++) {
      const state = await page.evaluate(() => window.cs.reunionRead());
      const job = state.jobs[0];
      if (job?.status !== previous) {
        previous = job?.status;
        console.log(JSON.stringify({ status: previous, stage: job?.stage, error: job?.error }));
      }
      if (job?.status === "ready") { report.job = job; break; }
      if (job && ["failed", "needs_review", "uncertain", "paused"].includes(job.status)) throw Error(`${job.stage}: ${job.error}`);
      await page.waitForTimeout(1000);
    }
    assert.ok(report.job, "live batch did not complete");
    await page.getByLabel("17秒完整提示词").waitFor();
    const prompt = await page.getByLabel("17秒完整提示词").inputValue();
    assert.match(prompt, /17秒/);
    await page.getByRole("button", { name: "复制提示词", exact: true }).click();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), prompt);
    const original = await page.evaluate(() => window.cs.reunionRead());
    assert.equal(original.jobs.length, 1);
    await app.evaluate(({ shell }) => { shell.openPath = async () => ""; });
    await page.getByRole("button", { name: "打开文件夹", exact: true }).click();
    await page.screenshot({ path: path.join(out, "completed.png"), fullPage: true });
    report.checks.push("real Codex screenshot analysis, crop, image bridge portrait, complete pack, clipboard and folder action");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(out, "narrow.png"), fullPage: true });
  report.checks.push("390px layout has no document overflow");
  assert.deepEqual(report.errors, []);
})().catch(e => { report.failure = e.message; process.exitCode = 1; console.error(e.message); })
  .finally(async () => { fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2)); if (app) await app.close(); console.log(JSON.stringify({ report: path.join(out, "report.json"), checks: report.checks, failure: report.failure, output: report.job?.output })); });
