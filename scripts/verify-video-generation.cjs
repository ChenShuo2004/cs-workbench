// One real, billable 5s generation. Supply the key on stdin, never as an argument.
// CS_VIDEO_QA_RESUME=1 reuses the recorded task and never creates a new one.
const { _electron: electron } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, ".."), out = path.join(repo, "out/video-generation-qa");
fs.mkdirSync(out, { recursive: true });
const reportFile = path.join(out, "report.json");
const resume = process.env.CS_VIDEO_QA_RESUME === "1";
const report = resume ? JSON.parse(fs.readFileSync(reportFile)) : {
  temp: fs.mkdtempSync(path.join(os.tmpdir(), "cs-video-generation-qa-")), checks: [], errors: [],
};
delete report.failure;
const data = path.join(report.temp, "data");
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
let app;
(async () => {
  let token = resume ? "" : fs.readFileSync(0, "utf8").trim();
  if (!resume) {
    assert.match(token, /^mk-[a-z0-9]+$/i);
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({
      workspace: path.join(report.temp, "projects"), projects: [], library: "",
    }));
    save();
  }
  app = await electron.launch({
    executablePath: process.env.CS_PACKAGED_EXECUTABLE ||
      path.join(repo, "out/CS 工作台 Pro-darwin-arm64/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro"),
    args: [], env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  report.version = await app.evaluate(({ app }) => app.getVersion());
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", e => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(
    w => w.webContents.setBackgroundThrottling(false)));
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page.locator(".sidebar").getByRole("button", { name: "创作室", exact: true }).click();
  if (!resume) {
    await page.getByRole("button", { name: "新建剪辑项目", exact: true }).click();
    await page.getByLabel("剪辑项目名称").fill("秘塔视频生成验收");
    await page.getByRole("button", { name: "创建项目", exact: true }).last().click();
    await page.waitForFunction(() => !!document.querySelector('[aria-label="当前剪辑项目"]').value);
    report.root = await page.getByLabel("当前剪辑项目").inputValue();
    save();
  }
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page.getByRole("button", { name: "AI 视频", exact: true }).click();
  if (!resume) {
    await page.locator(".sg-config summary").click();
    await page.getByLabel("秘塔 API Key").fill(token);
    await page.getByRole("button", { name: "加密保存密钥", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="秘塔 API Key"]').value === "");
    assert.equal(fs.readFileSync(path.join(data, "studio-generation/metaso-key.enc")).includes(token), false);
    token = "";
    await page.locator(".sg-config summary").click();
    report.checks.push("API key saved through the UI, encrypted on disk and cleared from the field");
    await page.getByLabel("AI 生成提示词").fill("史诗级太空歌剧院线预告：女舰长独自站在巨大观景窗前，最后一支舰队正在集结并跃迁离去，强光爆闪、舰桥震动，她被留在原地。");
    await page.getByLabel("AI 生成时长").selectOption("5");
    await page.getByLabel("AI 视频分辨率").selectOption("2K");
    await page.getByRole("button", { name: "生成视频并加入画布", exact: true }).click();
    await page.waitForFunction(async root => (await window.cs.generationList(root)).length === 1, report.root);
  }
  let lastStatus;
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const jobs = await page.evaluate(root => window.cs.generationList(root), report.root);
    assert.equal(jobs.length, 1, "No duplicate paid requests");
    const j = jobs[0];
    report.jobId = j.id; report.remoteId = j.remoteId; report.status = j.status;
    if (j.status !== lastStatus) {
      console.log(JSON.stringify({ status: j.status, stage: j.stage, remoteId: j.remoteId }));
      lastStatus = j.status;
      save();
    }
    if (["failed", "interrupted", "paused"].includes(j.status)) throw Error(j.error || j.stage);
    if (j.applied) break;
    await new Promise(r => setTimeout(r, 4000));
  }
  const jobs = await page.evaluate(root => window.cs.generationList(root), report.root);
  assert.equal(jobs[0].applied, true);
  report.checks.push("Real MiniMax H3 task generated and automatically attached exactly once");
  const state = await page.evaluate(root => window.cs.studioRead(root), report.root);
  assert.equal(state.clips.length, 1);
  const media = state.media.find(m => m.id === report.jobId);
  assert.equal(media.kind, "video");
  report.media = { duration: media.duration, width: media.width, height: media.height };
  const video = path.join(report.root, media.path);
  fs.copyFileSync(video, path.join(out, "metaso-generated.mp4"));
  execFileSync("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], { timeout: 120000 });
  execFileSync("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-y", "-ss", "2", "-i", video, "-frames:v", "1", path.join(out, "video-frame.png")]);
  report.checks.push("Downloaded video has real dimensions/duration and full FFmpeg decode passes");
  await page.screenshot({ path: path.join(out, "video-completed.png") });
  await page.getByRole("button", { name: "关闭 AI 生成面板" }).click();
  await page.getByRole("button", { name: "预览镜头 1", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".vc-preview-overlay video")?.readyState >= 2);
  await page.screenshot({ path: path.join(out, "video-preview.png") });
  await page.keyboard.press("Escape");
  report.checks.push("Generated MP4 opens in the actual canvas preview");
  await page.reload();
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page.locator(".sidebar").getByRole("button", { name: "创作室", exact: true }).click();
  await page.getByRole("button", { name: "AI 生成", exact: true }).click();
  await page.getByText("已加入画布，可继续精剪", { exact: true }).waitFor();
  assert.equal((await page.evaluate(root => window.cs.studioRead(root), report.root)).clips.length, 1);
  report.checks.push("Reload preserves the completed task and clip without resubmitting");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(out, "video-mobile.png") });
  report.checks.push("Video settings work at 390px without horizontal overflow");
  assert.deepEqual(report.errors, []);
  report.completed = true;
})().catch(async e => {
  report.failure = String(e.stack).replace(/mk-[a-z0-9]+/gi, "[redacted]");
  process.exitCode = 1;
  if (app) await (await app.firstWindow()).screenshot({ path: path.join(out, "failure.png") }).catch(() => {});
}).finally(async () => {
  save();
  console.log(JSON.stringify(report, null, 2));
  if (app) await app.close();
});
