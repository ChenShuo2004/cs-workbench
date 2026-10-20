const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const wb = require("../lib/workbench.cjs");
const repo = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-appearance-"));
const out = path.join(repo, "out/appearance-qa");
fs.mkdirSync(out, { recursive: true });
const data = path.join(temp, "data");
fs.mkdirSync(data);
const config = {
  workspace: path.join(temp, "projects"),
  library: "",
  projects: [],
};
const project = wb.createProject(config, {
  title: "内容系统 · 阅读体验验收",
  platforms: ["X"],
});
wb.saveDocument(
  config,
  project.path,
  "article",
  "# 把创作变成可复用的系统\n\n## 从一个清晰的问题开始\n\n" +
    "把真实资料整理成判断，再把判断写成可验证的内容。保留源文件、检查结果与交付记录，让下一次创作可以继续积累。".repeat(
      3,
    ) +
    "\n\n- 留下可编辑原稿\n- 检查真实产物\n- 记录尚未完成的部分",
);
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify(config));
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(data)});require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
let app, page;
const report = { checks: [], errors: [] };
async function launch() {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page
    .getByRole("heading", { name: "把今天，过成想要的样子。" })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function noOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
(async () => {
  await launch();
  for (const theme of ["forest", "paper", "ocean", "violet"]) {
    await page.getByLabel("工作台配色", { exact: true }).selectOption(theme);
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      theme,
    );
    await page.screenshot({
      animations: "disabled",
      path: path.join(out, `home-${theme}.png`),
    });
  }
  report.checks.push("all four themes switch through real UI");
  await page.getByLabel("工作台配色", { exact: true }).selectOption("paper");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("heading", { name: "外观与阅读" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "纯白 正在使用" })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.screenshot({
    animations: "disabled",
    path: path.join(out, "settings-paper.png"),
  });
  await page.getByRole("button", { name: "展开决定选题", exact: true }).click();
  await page.getByRole("button", { name: "项目", exact: true }).click();
  await page
    .getByRole("button", { name: /内容系统 · 阅读体验验收/ })
    .first()
    .click();
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page.getByRole("button", { name: "文章", exact: true }).first().click();
  const original = await page
    .getByLabel("文章正文", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "阅读预览", exact: true }).click();
  await page
    .getByRole("heading", { name: "把创作变成可复用的系统", exact: true })
    .waitFor();
  await page.screenshot({
    animations: "disabled",
    path: path.join(out, "article-paper.png"),
  });
  await page.getByRole("button", { name: "编辑原稿", exact: true }).click();
  assert.equal(
    await page.getByLabel("文章正文", { exact: true }).inputValue(),
    original,
  );
  report.checks.push(
    "read/edit toggle renders content without changing source",
  );
  // Keep the test from opening Finder, but use the real export IPC and filesystem.
  await app.evaluate(({ shell }) => {
    shell.openPath = async () => "";
  });
  await page.getByRole("button", { name: "导出文章包", exact: true }).click();
  await page.getByText("收尾检查", { exact: true }).waitFor();
  await page.getByText("尚未记录资料来源", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("尚未找到 outputs/final.mp4", { exact: true }).count(),
    0,
  );
  await page.screenshot({
    animations: "disabled",
    path: path.join(out, "closeout-paper.png"),
    fullPage: true,
  });
  report.checks.push(
    "export auto-checks article/shared scope and visibly reminds missing evidence",
  );
  await page.getByRole("button", { name: "Agent 助手", exact: true }).click();
  await page.screenshot({
    animations: "disabled",
    path: path.join(out, "agent-paper.png"),
  });
  await page.getByRole("button", { name: "我的工作台", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开导航", exact: true }).waitFor();
  await noOverflow();
  await page.screenshot({
    animations: "disabled",
    path: path.join(out, "mobile-paper.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await noOverflow();
  report.checks.push("home and appearance settings fit 390px viewport");
  await app.close();
  app = null;
  await launch();
  assert.equal(
    await page.getByLabel("工作台配色", { exact: true }).inputValue(),
    "paper",
  );
  report.checks.push("selected theme survives full app restart");
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
