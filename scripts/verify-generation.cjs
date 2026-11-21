const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, "..");
const out = path.join(repo, "out/generation-qa");
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-generation-qa-"));
const data = path.join(temp, "data");
fs.mkdirSync(data);
fs.writeFileSync(
  path.join(data, "config.json"),
  JSON.stringify({
    workspace: path.join(temp, "projects"),
    projects: [],
    library: "",
  }),
);
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(data)});require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
const report = { temp, checks: [], errors: [], realGeneration: true };
let app;
(async () => {
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.setBackgroundThrottling(false),
    ),
  );
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创作室", exact: true })
    .click();
  await page.getByRole("button", { name: "新建剪辑项目", exact: true }).click();
  await page.getByLabel("剪辑项目名称").fill("AI 画布真实生图验收");
  await page
    .getByRole("button", { name: "创建项目", exact: true })
    .last()
    .click();
  await page.waitForFunction(
    () => !!document.querySelector('[aria-label="当前剪辑项目"]').value,
  );
  const root = await page.getByLabel("当前剪辑项目").inputValue();
  report.root = root;
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page
    .getByLabel("AI 生成提示词")
    .fill(
      "A cinematic macro photograph of a tiny green seedling growing in a handmade ceramic cup on a pale wooden desk, soft morning window light, gentle shadows, quiet editorial photography, natural textures, landscape 16:9, no people, no letters or logos.",
    );
  await page.getByLabel("AI 生成时长").selectOption("3");
  const button = page.getByRole("button", {
    name: "生成图片并加入画布",
    exact: true,
  });
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.includes("生成图片并加入画布"),
      )?.disabled,
    undefined,
    { timeout: 60000 },
  );
  await button.click();
  await page.waitForFunction(
    async (root) => (await window.cs.generationList(root)).length === 1,
    root,
  );
  let jobs = await page.evaluate(
    (root) => window.cs.generationList(root),
    root,
  );
  report.jobId = jobs[0].id;
  console.log(
    JSON.stringify({ event: "submitted", id: report.jobId, data, root }),
  );
  // Continue authoring while the model works. The returning result must merge.
  await page.getByRole("button", { name: "关闭 AI 生成面板" }).click();
  await page.getByLabel("画布分镜文案").fill("生成期间保留的编辑");
  await page.getByLabel("新镜头时长").selectOption("3");
  await page.getByRole("button", { name: "添加分镜", exact: true }).click();
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  await page.getByRole("button", { name: "时间线精剪", exact: true }).click();
  await page.getByRole("button", { name: "创作画布", exact: true }).click();
  let last = "";
  for (let i = 0; i < 180; i++) {
    jobs = await page.evaluate((root) => window.cs.generationList(root), root);
    const job = jobs[0];
    if (job.status !== last) {
      console.log(
        JSON.stringify({
          event: "status",
          status: job.status,
          stage: job.stage,
        }),
      );
      last = job.status;
    }
    if (["failed", "interrupted", "paused"].includes(job.status))
      throw Error(`${job.stage}: ${job.error}`);
    if (job.status === "completed" && job.applied) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  assert.equal(jobs[0].status, "completed");
  assert.equal(jobs[0].applied, true);
  report.job = jobs[0];
  const state = await page.evaluate((root) => window.cs.studioRead(root), root);
  assert.equal(state.clips.length, 2);
  assert.equal(state.clips[0].text, "生成期间保留的编辑");
  assert.equal(state.clips[1].mediaId, report.jobId);
  const media = state.media.find((m) => m.id === report.jobId);
  assert.equal(media.kind, "image");
  assert.ok(media.width > 0 && media.height > 0);
  const original = path.join(root, media.path);
  fs.copyFileSync(original, path.join(out, "actual-generated.png"));
  report.image = { path: original, width: media.width, height: media.height };
  report.checks.push(
    "real Codex image generated and automatically merged without losing concurrent edits",
  );
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page.getByText("已加入画布，可继续精剪", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, "generation-completed.png") });
  await page.getByRole("button", { name: "关闭 AI 生成面板" }).click();
  await page.getByRole("button", { name: "导出视频", exact: true }).click();
  await page.getByText("已完成", { exact: true }).waitFor({ timeout: 120000 });
  const exports = await page.evaluate(() => window.cs.studioJobs());
  assert.equal(exports[0].status, "complete");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    exports[0].output,
    "-f",
    "null",
    "-",
  ]);
  fs.copyFileSync(
    exports[0].output,
    path.join(out, "generated-image-film.mp4"),
  );
  report.checks.push(
    "generated image participates in a real MP4 export and full decode",
  );
  await page.reload();
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创作室", exact: true })
    .click();
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page.getByText("已加入画布，可继续精剪", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.studioRead(root), root)).clips
      .length,
    2,
  );
  report.checks.push(
    "reload preserves the generation history and does not duplicate the shot",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: path.join(out, "generation-mobile.png") });
  report.checks.push("390px generation panel stays inside the viewport");
  assert.deepEqual(report.errors, []);
})()
  .catch(async (e) => {
    report.failure = e.stack;
    process.exitCode = 1;
    if (app)
      await (
        await app.firstWindow()
      )
        .screenshot({ path: path.join(out, "failure.png") })
        .catch(() => {});
  })
  .finally(async () => {
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
