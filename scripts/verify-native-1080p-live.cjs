// One real 4-second first/last-frame request. Explicit CS_NATIVE_LIVE_SUBMIT=1 required for a new run.
// Default resumes the recorded job; it never submits another generation.
const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const model = process.env.CS_NATIVE_MODEL || "MiniMax-H3";
assert.ok(["MiniMax-H3", "seedance-2.0"].includes(model));
const repo = path.resolve(__dirname, ".."),
  out = path.join(repo, "out/native-1080p-live-qa/" + model);
fs.mkdirSync(out, { recursive: true });
const reportFile = path.join(out, "report.json"),
  fresh = process.env.CS_NATIVE_LIVE_SUBMIT === "1";
if (fresh && fs.existsSync(reportFile))
  throw Error(
    "A recorded run exists. Resume without CS_NATIVE_LIVE_SUBMIT; do not duplicate a paid request.",
  );
const report = fresh
  ? {
      temp: fs.mkdtempSync(path.join(os.tmpdir(), "cs-native1080-live-qa-")),
      checks: [],
      errors: [],
      realGeneration: true,
      model,
    }
  : JSON.parse(fs.readFileSync(reportFile));
delete report.failure;
const data = path.join(report.temp, "data");
const save = () =>
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
let app;
(async () => {
  if (fresh) {
    fs.mkdirSync(path.join(data, "studio-generation"), { recursive: true });
    fs.copyFileSync(
      path.join(
        os.homedir(),
        "Library/Application Support/CS 工作台 Pro/studio-generation/metaso-key.enc",
      ),
      path.join(data, "studio-generation/metaso-key.enc"),
    );
    fs.chmodSync(path.join(data, "studio-generation/metaso-key.enc"), 0o600);
    fs.writeFileSync(
      path.join(data, "config.json"),
      JSON.stringify({
        workspace: path.join(report.temp, "projects"),
        projects: [],
        library: "",
      }),
    );
    save();
  }
  app = await electron.launch({
    executablePath:
      process.env.CS_PACKAGED_EXECUTABLE ||
      path.join(
        repo,
        "out/CS 工作台 Pro-darwin-arm64/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro",
      ),
    args: [],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  report.version = await app.evaluate(({ app }) => app.getVersion());
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.setBackgroundThrottling(false),
    ),
  );
  const openStudio = async () => {
    await page
      .getByRole("button", { name: "展开创作内容", exact: true })
      .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "创作室", exact: true })
      .click();
  };
  await openStudio();
  if (fresh) {
    await page
      .getByRole("button", { name: "新建剪辑项目", exact: true })
      .click();
    await page.getByLabel("剪辑项目名称").fill("原生1080P首尾帧验收");
    await page
      .getByRole("button", { name: "创建项目", exact: true })
      .last()
      .click();
    await page.waitForFunction(
      () => !!document.querySelector('[aria-label="当前剪辑项目"]').value,
    );
    report.root = await page.getByLabel("当前剪辑项目").inputValue();
    save();
    const prior = JSON.parse(
      fs.readFileSync(path.join(repo, "out/generation-qa/report.json")),
    );
    const priorState = JSON.parse(
      fs.readFileSync(path.join(prior.root, "video/studio.json")),
    );
    const picture = path.join(
      prior.root,
      priorState.media.find((m) => m.id === prior.jobId).path,
    );
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, picture);
    await page.getByRole("button", { name: "画布素材库", exact: true }).click();
    await page
      .getByRole("button", { name: "导入图片 / 视频 / 音频", exact: true })
      .click();
    await page
      .getByText("素材已复制到工程，可以离线继续剪辑", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "作为参考节点", exact: true })
      .click();
    await page.getByRole("button", { name: "视频节点", exact: true }).click();
    await page
      .getByLabel("节点 1 提示词", { exact: true })
      .fill(
        "保持参考首尾帧的陶瓷杯、植物和桌面构图。固定镜头，微风让嫩叶轻轻摆动，柔和晨光自然变化，首尾衔接，安静写实，无文字无标志。",
      );
    await page.getByLabel("节点 1 时长", { exact: true }).selectOption("4");
    await page
      .getByLabel("节点 1 分辨率", { exact: true })
      .selectOption("1080P");
    await page.getByLabel("节点 1 模型", { exact: true }).selectOption(model);
    await page
      .getByRole("button", { name: "自动排列镜头", exact: true })
      .click();
    for (const role of ["首帧", "尾帧"]) {
      await page
        .getByRole("button", { name: "连接素材 1 输出", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("button", { name: "连接节点 1 " + role, exact: true })
        .focus();
      await page.keyboard.press("Enter");
    }
    await page.getByText("已保存到本机", { exact: true }).waitFor();
    const state = await page.evaluate(
      (root) => window.cs.studioRead(root),
      report.root,
    );
    assert.equal(state.canvas.edges.length, 2);
    report.nodeId = state.canvas.generators[0].id;
    report.submitting = true;
    save();
    await page
      .locator(".vg-node")
      .getByRole("button", { name: "生成", exact: true })
      .click();
  }
  let previous;
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const jobs = await page.evaluate(
      (root) => window.cs.generationList(root),
      report.root,
    );
    assert.ok(jobs.length <= 1, "No duplicate paid request");
    const j = jobs[0];
    if (j) {
      report.jobId = j.id;
      report.remoteId = j.remoteId;
      report.status = j.status;
      if (previous !== j.status) {
        previous = j.status;
        save();
        console.log(
          JSON.stringify({
            status: j.status,
            stage: j.stage,
            remoteId: j.remoteId,
          }),
        );
      }
      if (["failed", "interrupted", "paused"].includes(j.status))
        throw Error(j.error || j.stage);
      if (j.applied) break;
    } else if (!fresh)
      throw Error("No recorded job to resume; no request submitted");
    await new Promise((r) => setTimeout(r, 4000));
  }
  const jobs = await page.evaluate(
    (root) => window.cs.generationList(root),
    report.root,
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].applied, true);
  assert.equal(jobs[0].nativeResolution, true);
  assert.equal(jobs[0].model, model);
  assert.equal(jobs[0].resolution, "1080P");
  assert.ok(!jobs[0].legacy1080Transcode);
  const state = await page.evaluate(
    (root) => window.cs.studioRead(root),
    report.root,
  );
  assert.equal(state.clips.filter((c) => c.id === report.jobId).length, 1);
  assert.equal(state.canvas.generators[0].outputMediaId, report.jobId);
  assert.deepEqual(
    jobs[0].inputs.map((r) => r.role),
    ["first_frame", "last_frame"],
  );
  const media = state.media.find((m) => m.id === report.jobId);
  report.media = {
    duration: media.duration,
    width: media.width,
    height: media.height,
  };
  assert.equal(Math.min(media.width, media.height), 1080);
  assert.ok(
    !fs.existsSync(
      path.join(data, "studio-generation", report.jobId, "source-2k.mp4"),
    ),
  );
  assert.ok(media.duration >= 3.8 && media.duration < 5);
  const video = path.join(report.root, media.path);
  fs.copyFileSync(video, path.join(out, "first-last-generated.mp4"));
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    "2",
    "-i",
    video,
    "-frames:v",
    "1",
    path.join(out, "frame.png"),
  ]);
  report.checks = [
    "Packaged 0.5.2 uses existing encrypted key without plaintext configuration",
    "Actual node with both first and last frame inputs creates exactly one real native 1080p 4s task",
    "Native 1080p video is downloaded unchanged, fully decodes and attaches to node and timeline once",
  ];
  await page.getByRole("button", { name: "全屏创作室", exact: true }).click();
  await page.getByRole("button", { name: "自动排列镜头", exact: true }).click();
  await page.screenshot({ path: path.join(out, "completed.png") });
  await page
    .getByRole("button", { name: "预览节点 1 结果", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector(".vc-preview-stage video")?.readyState >= 2,
  );
  await page.screenshot({ path: path.join(out, "preview.png") });
  await page.keyboard.press("Escape");
  await page.reload();
  await openStudio();
  await page.locator(".vg-node").waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.generationList(root), report.root))
      .length,
    1,
  );
  assert.equal(
    (
      await page.evaluate((root) => window.cs.studioRead(root), report.root)
    ).clips.filter((c) => c.id === report.jobId).length,
    1,
  );
  report.checks.push(
    "Actual generated result plays in preview and survives reload without another request",
  );
  assert.deepEqual(report.errors, []);
  report.completed = true;
})()
  .catch(async (e) => {
    report.failure = String(e.stack).replace(/mk-[a-z0-9]+/gi, "[redacted]");
    process.exitCode = 1;
    if (app)
      await (
        await app.firstWindow()
      )
        .screenshot({ path: path.join(out, "failure.png") })
        .catch(() => {});
  })
  .finally(async () => {
    save();
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
