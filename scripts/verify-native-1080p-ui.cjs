const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const repo = path.resolve(__dirname, ".."),
  prior = JSON.parse(
    fs.readFileSync(path.join(repo, "out/generation-nodes-qa/report.json")),
  ),
  out = path.join(repo, "out/native-1080p-ui-qa");
fs.mkdirSync(out, { recursive: true });
let app;
const report = { checks: [], errors: [] };
(async () => {
  app = await electron.launch({
    executablePath:
      process.env.CS_PACKAGED_EXECUTABLE ||
      path.join(
        repo,
        "out/CS 工作台 Pro-darwin-arm64/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro",
      ),
    args: [],
    env: {
      ...process.env,
      CS_WORKBENCH_USER_DATA_DIR: path.join(prior.temp, "data"),
    },
  });
  report.version = await app.evaluate(({ app }) => app.getVersion());
  assert.equal(report.version, "0.5.2");
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创作室", exact: true })
    .click();
  await page.getByRole("button", { name: "自动排列镜头", exact: true }).click();
  await page
    .getByLabel("节点 2 模型", { exact: true })
    .selectOption("seedance-2.0");
  await page.getByLabel("节点 2 分辨率", { exact: true }).selectOption("1080P");
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.studioRead(root), prior.root))
      .canvas.generators[1].resolution,
    "1080P",
  );
  assert.match(await page.locator(".vg-node").nth(1).innerText(), /原生 1080P/);
  report.checks.push("Installed video node saves native 1080P");
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page.getByRole("button", { name: "AI 视频", exact: true }).click();
  await page.getByLabel("AI 视频模型").selectOption("seedance-2.0");
  await page.getByLabel("AI 视频分辨率").selectOption("1080P");
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.studioRead(root), prior.root))
      .canvas.generationDraft.resolution,
    "1080P",
  );
  assert.match(await page.locator(".sg-panel").innerText(), /原生 1080P/);
  await page.screenshot({ path: path.join(out, "installed-1080p.png") });
  report.checks.push(
    "AI generation panel also saves 1080P as native generation",
  );
  assert.deepEqual(report.errors, []);
  await page.reload();
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创作室", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("节点 2 模型", { exact: true }).inputValue(),
    "seedance-2.0",
  );
  report.checks.push("Seedance model and native resolution persist on reload");
  report.completed = true;
})()
  .catch((e) => {
    report.failure = e.stack;
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(
      path.join(out, "ui-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
