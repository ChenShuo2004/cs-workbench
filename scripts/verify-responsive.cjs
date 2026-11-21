const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const wb = require("../lib/workbench.cjs");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-responsive-"));
const data = path.join(temp, "data"),
  out = path.join(repo, "out/responsive-qa");
fs.mkdirSync(data);
fs.mkdirSync(out, { recursive: true });
const config = {
  workspace: path.join(temp, "projects"),
  projects: [],
  library: "",
};
const project = wb.createProject(config, {
  title: "把真实素材整理成可以持续复用的内容系统与创作工作流",
  platforms: ["X", "小红书", "抖音", "B站"],
});
wb.saveDocument(
  config,
  project.path,
  "article",
  "# 可持续的创作流程\n\n".repeat(5) + "保留来源、判断与实际验证。".repeat(40),
);
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify(config));
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
const routes = [
  "我的工作台",
  "内容总览",
  "每日任务",
  "健康",
  "资料收集",
  "文件空间",
  "素材库",
  "风格案例",
  "项目",
  "文章",
  "视频",
  "创作室",
  "亲人重逢",
  "发布",
  "平台账号",
  "Agent 助手",
  "个人记忆",
  "设置",
];
let app, page;
const report = { viewports: [], overflow: [], errors: [] };
async function navigate(name, category = "页面") {
  await page.getByRole("button", { name: "全局搜索工作区" }).click();
  await page.getByRole("combobox", { name: "搜索工作区内容" }).fill(name);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ hasText: category })
    .click();
  await page
    .getByRole("dialog", { name: "搜索工作区", exact: true })
    .waitFor({ state: "hidden" });
}
(async () => {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
    timeout: 45000,
  });
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  page = await app.firstWindow({ timeout: 45000 });
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.getByLabel("今日随手记").waitFor();
  await page
    .getByLabel("快速添加任务")
    .fill("把今天的新素材整理到创作室并核对来源、分镜、音频和最终交付状态");
  await page.getByLabel("快速添加任务").press("Enter");
  await navigate(project.title, "项目");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("button", { name: "打开导航", exact: true })
      .waitFor({ state: width <= 900 ? "visible" : "hidden" });
    const views = [];
    for (const name of routes) {
      await navigate(name);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const dimensions = await page.evaluate(() => {
        const main = document.querySelector("main");
        return {
          window: innerWidth,
          document: document.documentElement.scrollWidth,
          mainWidth: main.clientWidth,
          mainScroll: main.scrollWidth,
          overflowing: [...main.querySelectorAll("*")]
            .filter((el) => {
              if (el.closest(".vc-world,.vc-viewport,.vc-minimap,.vc-toolbar"))
                return false;
              const b = el.getBoundingClientRect();
              return (
                b.width > 0 &&
                b.right > innerWidth + 2 &&
                !["OPTION", "SVG", "PATH"].includes(el.tagName.toUpperCase())
              );
            })
            .slice(0, 8)
            .map((el) => ({
              tag: el.tagName,
              className: String(el.className),
              text: el.textContent?.slice(0, 50),
            })),
        };
      });
      views.push({ name, dimensions });
      if (
        dimensions.document > width + 2 ||
        dimensions.mainScroll > dimensions.mainWidth + 2
      )
        report.overflow.push({ width, name, ...dimensions });
      await page.screenshot({
        path: path.join(out, `${width}-${name}.png`),
        animations: "disabled",
      });
    }
    report.viewports.push({ width, routes: views });
  }
  assert.deepEqual(report.overflow, [], "page-level horizontal overflow");
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
    console.log(
      JSON.stringify(
        {
          ...report,
          viewports: report.viewports.map((v) => ({
            width: v.width,
            pages: v.routes.length,
          })),
        },
        null,
        2,
      ),
    );
    if (app) await app.close();
  });
