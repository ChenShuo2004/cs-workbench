const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const wb = require("../lib/workbench.cjs");
const repo = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-experience-"));
const data = path.join(temp, "data");
const out = path.join(repo, "out/experience-qa");
fs.mkdirSync(data);
fs.mkdirSync(out, { recursive: true });
const config = {
  workspace: path.join(temp, "projects"),
  library: "",
  projects: [],
};
const project = wb.createProject(config, {
  title: "体验验收工程",
  platforms: ["X"],
});
wb.saveDocument(
  config,
  project.path,
  "article",
  "# 体验验收\n\n保留真实原稿。",
);
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify(config));
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(data)});require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
let app, page;
const report = { checks: [], errors: [], screenshots: [], packaged: false };
async function launch() {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("heading", { name: "把今天，过成想要的样子。" })
    .waitFor();
}
async function capture(name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  report.screenshots.push(file);
}
async function search(query) {
  await page.getByRole("button", { name: "全局搜索工作区" }).click();
  await page.getByRole("dialog", { name: "搜索工作区", exact: true }).waitFor();
  const input = page.getByRole("combobox", { name: "搜索工作区内容" });
  await input.fill(query);
  return input;
}
async function navigate(name) {
  const input = await search(name);
  await page
    .getByRole("option", { name: new RegExp(`页面 ${name}`) })
    .waitFor();
  await input.press("Enter");
  await page
    .getByRole("dialog", { name: "搜索工作区", exact: true })
    .waitFor({ state: "hidden" });
}
async function noOverflow(label) {
  const result = await page.evaluate(() => ({
    outer: document.documentElement.scrollWidth > innerWidth + 1,
    main:
      document.querySelector("main")?.getBoundingClientRect().right >
      innerWidth + 1,
  }));
  if (result.outer)
    report.overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.right > innerWidth + 1;
        })
        .map((el) => ({
          tag: el.tagName,
          className: el.className,
          text: el.textContent?.slice(0, 70),
          right: el.getBoundingClientRect().right,
        }))
        .slice(0, 20),
    );
  assert.deepEqual(result, { outer: false, main: false }, label);
}
(async () => {
  await launch();
  await capture("home-desktop");
  await page.getByLabel("快速添加任务").fill("检查键盘体验");
  await page.getByLabel("快速添加任务").press("Enter");
  await page.getByRole("button", { name: "个人记忆", exact: true }).click();
  await page.getByRole("button", { name: "记下一条经验", exact: true }).click();
  await page.getByLabel("记忆标题").fill("画布创作原则");
  await page.getByLabel("记忆内容").fill("输入 @ 选择素材，自动连线。");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await page
    .getByRole("heading", { name: "画布创作原则", exact: true })
    .waitFor();
  const input = await search("体验验收工程");
  await input.press("Enter");
  await page
    .getByRole("dialog", { name: "搜索工作区", exact: true })
    .waitFor({ state: "hidden" });
  await navigate("文章");
  const article = page.getByLabel("文章正文", { exact: true });
  await article.fill("# 仍在编辑\n\n搜索不应离开当前文稿。");
  await article.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "搜索工作区内容" }).fill("画布");
  await page.getByRole("option", { name: /记忆 画布创作原则/ }).waitFor();
  await capture("search-in-editor");
  await page.keyboard.press("Escape");
  assert.equal(
    await article.inputValue(),
    "# 仍在编辑\n\n搜索不应离开当前文稿。",
  );
  assert.equal(
    await article.evaluate((el) => el === document.activeElement),
    true,
  );
  report.checks.push(
    "search opens in place, finds memory, Escape restores editor and unsaved draft",
  );
  const memorySearch = await search("画布创作原则");
  await page.getByRole("option", { name: /记忆 画布创作原则/ }).waitFor();
  await memorySearch.press("Enter");
  await page.getByLabel("记忆标题").waitFor();
  assert.equal(
    await page.getByLabel("记忆内容").inputValue(),
    "输入 @ 选择素材，自动连线。",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    (await page.evaluate((root) => window.cs.readProject(root), project.path))
      .docs.article,
    "# 仍在编辑\n\n搜索不应离开当前文稿。",
  );
  report.checks.push(
    "search opens exact memory and flushes document before navigation",
  );
  await search("检查键盘体验");
  await page.getByRole("option", { name: /任务 检查键盘体验/ }).click();
  await page.getByRole("dialog", { name: "编辑任务" }).waitFor();
  for (let n = 0; n < 18; n++) {
    await page.keyboard.press(n < 9 ? "Tab" : "Shift+Tab");
    assert.equal(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest("dialog[open]")),
      ),
      true,
    );
  }
  await page.keyboard.press("Escape");
  report.checks.push(
    "task search opens exact task; Tab and Shift+Tab remain inside modal; Escape closes",
  );
  await navigate("设置");
  await page.getByLabel("界面密度", { exact: true }).selectOption("compact");
  await page.getByLabel("动态效果", { exact: true }).selectOption("reduced");
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.density),
    "compact",
  );
  await page.getByRole("button", { name: "新建选题", exact: true }).click();
  await page.getByRole("dialog", { name: "新建选题", exact: true }).waitFor();
  assert.ok(
    await page
      .getByRole("dialog", { name: "新建选题", exact: true })
      .evaluate(
        (el) => parseFloat(getComputedStyle(el).animationDuration) < 0.001,
      ),
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "新建选题", exact: true })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  await capture("settings-desktop");
  for (const theme of ["forest", "paper", "ocean", "violet"]) {
    await page.getByLabel("工作台配色", { exact: true }).selectOption(theme);
    await capture(`settings-${theme}`);
  }
  await page.getByLabel("工作台配色", { exact: true }).selectOption("paper");
  await page.getByLabel("动态效果", { exact: true }).selectOption("system");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "新建选题", exact: true }).click();
  assert.ok(
    await page
      .getByRole("dialog", { name: "新建选题", exact: true })
      .evaluate(
        (el) => parseFloat(getComputedStyle(el).animationDuration) < 0.001,
      ),
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("动态效果", { exact: true }).selectOption("gentle");
  await page.getByRole("button", { name: "新建选题", exact: true }).click();
  assert.ok(
    await page
      .getByRole("dialog", { name: "新建选题", exact: true })
      .evaluate(
        (el) => parseFloat(getComputedStyle(el).animationDuration) > 0.1,
      ),
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("动态效果", { exact: true }).selectOption("reduced");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  report.checks.push(
    "four themes, compact density, explicit/system reduced motion and gentle override work",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开导航", exact: true }).waitFor();
  await noOverflow("mobile settings");
  await capture("settings-mobile");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  const nav = page.getByRole("dialog", { name: "工作台导航", exact: true });
  const stage = nav.getByRole("button", { name: "展开创作内容", exact: true });
  if ((await stage.getAttribute("aria-expanded")) !== "true")
    await stage.click();
  await capture("navigation-mobile");
  await nav.getByRole("button", { name: "创作室", exact: true }).click();
  await nav.waitFor({ state: "hidden" });
  await noOverflow("mobile studio");
  await capture("studio-mobile");
  await navigate("我的工作台");
  await noOverflow("mobile home");
  await capture("home-mobile");
  await search("不存在的关键词-731");
  await page.getByText("没有找到相关内容", { exact: true }).waitFor();
  await noOverflow("mobile search");
  await capture("search-empty-mobile");
  await page.keyboard.press("Escape");
  report.checks.push(
    "390px navigation has readable destinations, dismisses after selection; home/settings/studio/search fit",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const name of [
    "内容总览",
    "每日任务",
    "健康",
    "资料收集",
    "文件空间",
    "素材库",
    "风格案例",
    "项目",
    "视频",
    "创作室",
    "发布",
    "平台账号",
    "Agent 助手",
  ]) {
    await navigate(name);
    await noOverflow(`desktop ${name}`);
    await capture(`route-${name}`);
  }
  report.checks.push(
    "13 destinations navigate through unified search without renderer errors or viewport overflow",
  );
  const personal = await page.evaluate(() => window.cs.personalRead());
  await app.evaluate(({ ipcMain }, snapshot) => {
    ipcMain.removeHandler("personal:read");
    let fail = true;
    ipcMain.handle("personal:read", () => {
      if (fail) {
        fail = false;
        throw new Error("验收用搜索读取失败");
      }
      return snapshot;
    });
  }, personal);
  await search("画布创作原则");
  await page
    .getByRole("dialog", { name: "搜索工作区" })
    .getByRole("alert")
    .waitFor();
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await page.getByRole("option", { name: /记忆 画布创作原则/ }).waitFor();
  await page.keyboard.press("Escape");
  report.checks.push(
    "search read failure is visible and retry restores searchable content",
  );
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("project:create");
    globalThis.experienceCreateCount = 0;
    ipcMain.handle("project:create", async () => {
      globalThis.experienceCreateCount++;
      await new Promise((resolve) => setTimeout(resolve, 150));
      throw new Error("验收用项目写入失败");
    });
  });
  await page.getByRole("button", { name: "新建选题", exact: true }).click();
  const creation = page.getByRole("dialog", { name: "新建选题", exact: true });
  await creation
    .getByPlaceholder("例如：普通人如何用 AI 做第一条视频")
    .fill("保留失败后的输入");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await creation.getByRole("alert").waitFor();
  assert.match(await creation.getByRole("alert").textContent(), /项目写入失败/);
  assert.doesNotMatch(
    await creation.getByRole("alert").textContent(),
    /invoking remote method/,
  );
  assert.ok(
    Math.abs(
      (await creation.getByRole("alert").boundingBox()).width -
        (await creation.boundingBox()).width,
    ) < 2,
  );
  assert.equal(
    await creation
      .getByPlaceholder("例如：普通人如何用 AI 做第一条视频")
      .inputValue(),
    "保留失败后的输入",
  );
  assert.equal(await app.evaluate(() => globalThis.experienceCreateCount), 1);
  await capture("modal-save-recovery");
  await page.keyboard.press("Escape");
  report.checks.push(
    "failed project creation retains input, shows error inside modal and prevents double submission",
  );
  // Inject a recoverable bootstrap failure in this isolated process only.
  const snapshot = await page.evaluate(() => window.cs.bootstrap());
  await app.evaluate(({ ipcMain }, snapshot) => {
    ipcMain.removeHandler("bootstrap");
    let fail = true;
    ipcMain.handle("bootstrap", () => {
      if (fail) {
        fail = false;
        throw new Error("验收用临时读取失败");
      }
      return snapshot;
    });
  }, snapshot);
  await page.reload();
  await page.getByRole("button", { name: "重新打开工作台" }).waitFor();
  await capture("startup-recovery");
  await page.getByRole("button", { name: "重新打开工作台" }).click();
  await page
    .getByRole("heading", { name: "把今天，过成想要的样子。" })
    .waitFor();
  report.checks.push(
    "bootstrap failure displays retry and recovers without restarting",
  );
  await app.close();
  app = null;
  await launch();
  await navigate("设置");
  assert.equal(
    await page.getByLabel("动态效果", { exact: true }).inputValue(),
    "reduced",
  );
  assert.equal(
    await page.getByLabel("界面密度", { exact: true }).inputValue(),
    "compact",
  );
  assert.equal(
    await page.getByLabel("工作台配色", { exact: true }).inputValue(),
    "paper",
  );
  report.checks.push("appearance preferences survive full Electron restart");
  assert.deepEqual(report.errors, []);
})()
  .catch((e) => {
    report.failure = e.stack;
    process.exitCode = 1;
  })
  .finally(async () => {
    if (page && !page.isClosed() && report.failure)
      await capture("failure").catch(() => {});
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
