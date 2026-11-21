const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-studio-qa-"));
const out = path.join(repo, "out/studio-qa");
fs.mkdirSync(out, { recursive: true });
const entry = path.join(temp, "entry.cjs");
fs.mkdirSync(path.join(temp, "data"), { recursive: true });
fs.writeFileSync(
  path.join(temp, "data/config.json"),
  JSON.stringify({
    workspace: path.join(temp, "projects"),
    library: "",
    projects: [],
  }),
);
fs.writeFileSync(
  entry,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp, "data"))});require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
let app;
const report = { checks: [], errors: [], temp };
(async () => {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: {
      ...process.env,
      CS_WORKBENCH_USER_DATA_DIR: path.join(temp, "data"),
    },
  });
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  if (process.env.CS_PACKAGED_EXECUTABLE) assert.equal(report.packaged, true);
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.setBackgroundThrottling(false);
  });
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page.locator(".sidebar").getByRole("button", { name: "创作室", exact: true }).click();
  await page.getByRole("button", { name: "时间线精剪", exact: true }).click();
  await page.getByRole("heading", { name: "把想法，剪成作品。" }).waitFor();
  await page.screenshot({ path: path.join(out, "empty.png") });
  await page.getByRole("button", { name: "新建剪辑项目", exact: true }).click();
  await page.getByLabel("剪辑项目名称").fill("创作室验收");
  await page
    .getByRole("button", { name: "创建项目", exact: true })
    .last()
    .click();
  await page
    .getByLabel("当前剪辑项目")
    .filter({ has: page.locator("option", { hasText: "创作室验收" }) })
    .waitFor();
  await page.getByRole("button", { name: "像素", exact: true }).click();
  await page.getByLabel("片段 1 文本").fill("把一个想法，变成真实的作品。");
  await page.getByLabel("片段终点").fill("1.2");
  await page.getByLabel("片段终点").blur();
  await page.getByRole("button", { name: "添加场景", exact: true }).click();
  await page.getByLabel("片段 2 文本").fill("从今天，开始行动。");
  await page.getByLabel("片段 2 文本").focus();
  await page.getByLabel("片段终点").fill("1.2");
  await page.getByLabel("片段终点").blur();
  await page.getByRole("button", { name: "导出视频", exact: true }).click();
  await page.getByText("已完成", { exact: true }).waitFor({ timeout: 120000 });
  report.checks.push("pixel scene edit and real MP4 render complete");
  const jobs = await page.evaluate(() => window.cs.studioJobs());
  assert.equal(jobs[0].status, "complete");
  report.pixel = jobs[0];
  await page.getByRole("button", { name: "关闭导出队列" }).click();
  await page.screenshot({ path: path.join(out, "pixel.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  report.checks.push("390px viewport without horizontal overflow");
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
