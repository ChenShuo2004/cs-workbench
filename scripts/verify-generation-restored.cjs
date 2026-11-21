const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const repo = path.resolve(__dirname, ".."),
  out = path.join(repo, "out/generation-qa");
const source = JSON.parse(fs.readFileSync(path.join(out, "report.json")));
const dataDir = path.join(source.temp, "data");
const report = {
  checks: [],
  errors: [],
  priorRealGenerationJob: source.jobId,
  temp: source.temp,
};
let app;
(async () => {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE
      ? []
      : [path.join(source.temp, "entry.cjs")],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: dataDir },
  });
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创作室", exact: true })
    .click();
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page.getByText("已加入画布，可继续精剪", { exact: true }).waitFor();
  const jobs = await page.evaluate(
    (root) => window.cs.generationList(root),
    source.root,
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, source.jobId);
  assert.equal(jobs[0].applied, true);
  const state = await page.evaluate(
    (root) => window.cs.studioRead(root),
    source.root,
  );
  assert.equal(state.clips.length, 2);
  assert.equal(state.clips[0].text, "生成期间保留的编辑");
  report.checks.push(
    "relaunch restores the real generated image, history and both edited shots without another model call",
  );
  await page.getByText("已连接本机 Codex 生图，生成使用现有账户额度", { exact: true }).waitFor();
  report.checks.push("image bridge connects through the installed public MCP tools");
  await page.screenshot({ path: path.join(out, "generation-completed.png") });
  await page.getByRole("button", { name: "关闭 AI 生成面板" }).click();
  await page.getByRole("button", { name: "预览镜头 2", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".vc-preview-overlay img")?.naturalWidth > 0,
  );
  await page.screenshot({
    path: path.join(out, "generated-image-preview.png"),
  });
  await page.keyboard.press("Escape");
  report.checks.push("real generated image decodes in canvas media preview");
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  report.overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter(
        (e) =>
          e.getBoundingClientRect().right > innerWidth + 1 &&
          getComputedStyle(e).position !== "fixed",
      )
      .slice(0, 12)
      .map((e) => ({
        tag: e.tagName,
        class: e.className,
        right: e.getBoundingClientRect().right,
      })),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: path.join(out, "generation-mobile.png") });
  report.checks.push(
    "390px page and generation panel have no horizontal overflow",
  );
  assert.deepEqual(report.errors, []);
})()
  .catch(async (e) => {
    report.failure = e.stack;
    process.exitCode = 1;
    if (app)
      await (
        await app.firstWindow()
      )
        .screenshot({ path: path.join(out, "restored-failure.png") })
        .catch(() => {});
  })
  .finally(async () => {
    fs.writeFileSync(
      path.join(out, "restored-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
