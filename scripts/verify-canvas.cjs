const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-canvas-qa-"));
const out = path.join(repo, "out/canvas-qa");
fs.mkdirSync(out, { recursive: true });
const dataDir = path.join(temp, "data");
fs.mkdirSync(dataDir);
fs.writeFileSync(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    workspace: path.join(temp, "projects"),
    library: "",
    projects: [],
  }),
);
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(dataDir)});require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
const report = { checks: [], errors: [], temp };
let app;
(async () => {
  const picture = path.join(temp, "画布测试图片.png"),
    movie = path.join(temp, "画布测试视频.mp4");
  await require("sharp")({
    create: { width: 1280, height: 720, channels: 3, background: "#426b62" },
  })
    .png()
    .toFile(picture);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "1.5",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    movie,
  ]);
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: dataDir },
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
  await page.getByRole("heading", { name: "让创作，自由发生。" }).waitFor();
  await page.screenshot({ path: path.join(out, "empty.png") });
  await page.getByRole("button", { name: "新建剪辑项目", exact: true }).click();
  await page.getByLabel("剪辑项目名称").fill("视频创作画布验收");
  await page
    .getByRole("button", { name: "创建项目", exact: true })
    .last()
    .click();
  await page.waitForFunction(
    () => !!document.querySelector('[aria-label="当前剪辑项目"]').value,
  );
  const root = await page.getByLabel("当前剪辑项目").inputValue();
  await page.getByLabel("画布分镜文案").fill("从灵感出发\n让故事慢慢发生");
  await page.getByRole("button", { name: "时间线精剪", exact: true }).click();
  await page.getByRole("button", { name: "创作画布", exact: true }).click();
  assert.equal(
    await page.getByLabel("画布分镜文案").inputValue(),
    "从灵感出发\n让故事慢慢发生",
  );
  report.checks.push("storyboard draft survives switching to the timeline");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].showInactive(),
  );
  await page.getByRole("button", { name: "全屏创作室", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".studio.studio-fullscreen"),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "导出视频", exact: true })
      .isVisible(),
    true,
  );
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isFullScreen() ||
        BrowserWindow.getAllWindows()[0].isSimpleFullScreen(),
    ),
    true,
  );
  await page.screenshot({ path: path.join(out, "fullscreen-empty.png") });
  await page
    .getByRole("button", { name: "退出创作室全屏", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".studio.studio-fullscreen"),
  );
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isFullScreen() ||
        BrowserWindow.getAllWindows()[0].isSimpleFullScreen(),
    ),
    false,
  );
  report.checks.push(
    "native macOS fullscreen enters and exits with editor actions retained",
  );
  // No content mutation between toggles: this catches stale shortcut closures.
  await page.getByRole("button", { name: "全屏创作室", exact: true }).focus();
  await page.keyboard.press("f");
  await page.waitForFunction(() => !!document.querySelector(".studio.studio-fullscreen"));
  await page.keyboard.press("f");
  await page.waitForFunction(() => !document.querySelector(".studio.studio-fullscreen"));
  await page.keyboard.press("f");
  await page.waitForFunction(() => !!document.querySelector(".studio.studio-fullscreen"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".studio.studio-fullscreen"));
  report.checks.push("F toggles repeatedly and immediate Escape exits without an intervening edit");
  await page.getByRole("button", { name: "添加分镜", exact: true }).click();
  await page.locator(".vc-node").nth(1).waitFor();
  await page.getByRole("button", { name: "镜头 1 设置", exact: true }).click();
  await page.getByLabel("画布镜头时长").fill("0.6");
  await page.getByLabel("画布镜头时长").blur();
  await page.getByRole("button", { name: "关闭画布面板" }).click();
  await page.getByRole("button", { name: "镜头 2 设置", exact: true }).click();
  await page.getByLabel("画布镜头时长").fill("0.6");
  await page.getByLabel("画布镜头时长").blur();
  await page.getByLabel("镜头提示词").fill("远景，缓慢推进，柔和自然光");
  await page.getByRole("button", { name: "关闭画布面板" }).click();
  await page.getByRole("button", { name: "添加便签", exact: true }).click();
  await page
    .getByLabel("便签内容")
    .fill("这是验收便签：先整理素材，再完成叙事。");
  await page.getByRole("button", { name: "关闭画布面板" }).click();
  const header = await page.locator(".vc-node header").first().boundingBox();
  await page.mouse.move(header.x + 120, header.y + 18);
  await page.mouse.down();
  await page.mouse.move(header.x + 200, header.y + 90, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "放大画布" }).click();
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  const saved = await page.evaluate((root) => window.cs.studioRead(root), root);
  assert.equal(saved.clips.length, 2);
  assert.equal(saved.canvas.notes.length, 1);
  assert.ok(Object.keys(saved.canvas.positions).length);
  report.checks.push(
    "create, storyboard, prompt, note, node drag and zoom saved to project",
  );
  await page.reload();
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创作室", exact: true })
    .click();
  await page.getByRole("button", { name: "创作画布", exact: true }).waitFor();
  await page.locator(".vc-node").nth(1).waitFor();
  assert.equal(await page.locator(".vc-node").count(), 2);
  const restored = await page.evaluate(
    (root) => window.cs.studioRead(root),
    root,
  );
  assert.deepEqual(restored.canvas, saved.canvas);
  report.checks.push("reload retains canvas positions, notes and viewport");
  await page.getByRole("button", { name: "镜头 2 设置", exact: true }).click();
  await page.getByRole("button", { name: "前移", exact: true }).click();
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.studioRead(root), root)).clips[0]
      .text,
    "让故事慢慢发生",
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "复制镜头", exact: true }).click();
  assert.equal(await page.locator(".vc-node").count(), 3);
  await page.getByRole("button", { name: "移除镜头", exact: true }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal(await page.locator(".vc-node").count(), 3);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  assert.equal(await page.locator(".vc-node").count(), 2);
  report.checks.push("shot ordering, duplication, removal, undo and redo work");

  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    },
    [picture, movie],
  );
  await page.getByRole("button", { name: "画布素材库", exact: true }).click();
  await page
    .getByRole("button", { name: "导入图片 / 视频 / 音频", exact: true })
    .click();
  await page
    .getByText("素材已复制到工程，可以离线继续剪辑", { exact: true })
    .waitFor();

  await page
    .locator(".vc-asset")
    .filter({ hasText: "画布测试图片.png" })
    .getByRole("button", { name: "添加到画布", exact: true })
    .click();
  await page
    .locator(".vc-asset")
    .filter({ hasText: "画布测试视频.mp4" })
    .getByRole("button", { name: "添加到画布", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭画布面板" }).click();
  await page.getByRole("button", { name: "自动排列镜头" }).click();
  await page.getByRole("button", { name: "镜头 3 设置", exact: true }).click();
  await page.getByLabel("画布镜头时长").fill("0.6");
  await page.getByLabel("画布镜头时长").blur();
  await page.getByRole("button", { name: "关闭画布面板" }).click();
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  assert.equal(await page.locator(".vc-node").count(), 4);
  await page.screenshot({ path: path.join(out, "canvas.png") });
  report.checks.push(
    "native import copied PNG and MP4; both added as renderable shots",
  );
  await page.getByRole("button", { name: "预览镜头 3", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".vc-preview-stage img")?.naturalWidth > 0,
  );
  await page.getByRole("button", { name: "放大预览图片", exact: true }).click();
  assert.equal(
    await page
      .locator(".vc-preview-overlay footer")
      .innerText()
      .then((t) => t.includes("125%")),
    true,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "镜头大图预览" })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "预览镜头 4", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".vc-preview-stage video")?.readyState >= 1,
  );
  await page.getByRole("button", { name: "关闭镜头预览", exact: true }).click();
  report.checks.push(
    "image zoom and video metadata load in dismissible media preview",
  );
  const orderBefore = (
    await page.evaluate((root) => window.cs.studioRead(root), root)
  ).clips.map((c) => c.id);
  await page
    .locator(".vc-sequence-clips button")
    .nth(3)
    .dragTo(page.locator(".vc-sequence-clips button").nth(0));
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.studioRead(root), root)).clips[0]
      .id,
    orderBefore[3],
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  assert.deepEqual(
    (await page.evaluate((root) => window.cs.studioRead(root), root)).clips.map(
      (c) => c.id,
    ),
    orderBefore,
  );
  report.checks.push("sequence drag reorder and undo retain all clips");
  await page
    .locator(".vc-node header")
    .nth(0)
    .click({ position: { x: 50, y: 15 } });
  await page
    .locator(".vc-node header")
    .nth(1)
    .click({ position: { x: 50, y: 15 }, modifiers: ["Shift"] });
  await page.getByText("已选择 2 项", { exact: true }).waitFor();
  const groupBefore = await page.evaluate(
    (root) => window.cs.studioRead(root),
    root,
  );
  const groupHeader = await page
    .locator(".vc-node header")
    .nth(0)
    .boundingBox();
  await page.mouse.move(groupHeader.x + 50, groupHeader.y + 15);
  await page.mouse.down();
  await page.mouse.move(groupHeader.x + 90, groupHeader.y + 55, { steps: 8 });
  await page.mouse.up();
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  const groupAfter = await page.evaluate(
    (root) => window.cs.studioRead(root),
    root,
  );
  const delta1 =
    groupAfter.canvas.positions[orderBefore[0]].x -
    groupBefore.canvas.positions[orderBefore[0]].x;
  const delta2 =
    groupAfter.canvas.positions[orderBefore[1]].x -
    groupBefore.canvas.positions[orderBefore[1]].x;
  assert.ok(delta1 > 20);
  assert.ok(Math.abs(delta1 - delta2) < 0.1);
  await page.getByRole("button", { name: "顶部对齐", exact: true }).click();
  await page.getByText("已保存到本机", { exact: true }).waitFor();
  const aligned = await page.evaluate(
    (root) => window.cs.studioRead(root),
    root,
  );
  assert.equal(
    aligned.canvas.positions[orderBefore[0]].y,
    aligned.canvas.positions[orderBefore[1]].y,
  );
  await page.getByRole("button", { name: "取消框选", exact: true }).click();
  report.checks.push(
    "Shift multi-select, group drag and alignment persist correctly",
  );
  await page.getByRole("button", { name: "全屏创作室", exact: true }).click();
  await page.waitForFunction(
    () => !!document.querySelector(".studio.studio-fullscreen"),
  );
  await page.getByRole("button", { name: "适应全部内容", exact: true }).click();
  await page.getByRole("button", { name: "自动排列镜头", exact: true }).click();
  const rect = await page.locator(".vc-node").first().boundingBox();
  const rect2 = await page.locator(".vc-node").nth(1).boundingBox();
  await page.mouse.move(rect.x - 8, rect.y - 8);
  await page.mouse.down();
  await page.mouse.move(rect2.x + rect2.width + 8, rect2.y + rect2.height + 8, {
    steps: 8,
  });
  await page.mouse.up();
  assert.equal(await page.locator(".vc-selection-actions").isVisible(), true);
  assert.ok((await page.locator(".vc-node.selected").count()) >= 1);
  await page.getByRole("button", { name: "取消框选", exact: true }).click();
  report.checks.push("blank-area rectangle selection selects visible shots");
  await page.screenshot({ path: path.join(out, "fullscreen-canvas.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector(".studio.studio-fullscreen"),
  );
  report.checks.push("Escape exits fullscreen without losing the canvas");

  await page.getByRole("button", { name: "时间线精剪", exact: true }).click();
  await page.getByRole("button", { name: "回到开头", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).waitFor();
  report.checks.push("mixed scene / image / video preview playback completes");
  await page.getByRole("button", { name: "创作画布", exact: true }).click();
  await page.getByRole("button", { name: "导出视频", exact: true }).click();
  await page.getByText("已完成", { exact: true }).waitFor({ timeout: 120000 });
  const jobs = await page.evaluate(() => window.cs.studioJobs());
  assert.equal(jobs[0].status, "complete");
  report.export = jobs[0];
  const output = jobs[0].output;
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
      { encoding: "utf8" },
    ),
  );
  assert.ok(Math.abs(Number(probe.format.duration) - 3.3) < 0.2);
  assert.ok(probe.streams.some((s) => s.codec_type === "video"));
  execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"]);
  report.checks.push(
    "mixed MP4 exported, duration verified and full decode passed",
  );
  await page.getByRole("button", { name: "关闭导出队列" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  report.checks.push("390px view has no page overflow");
  assert.deepEqual(report.errors, []);
})()
  .catch(async (e) => {
    if (app) {
      const p = await app.firstWindow();
      await p.screenshot({ path: path.join(out, "failure.png") });
      report.failureUI = await p.locator(".studio-banner").allTextContents();
      report.fullscreenState = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => ({
          full: w.isFullScreen(),
          visible: w.isVisible(),
        })),
      );
    }
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
