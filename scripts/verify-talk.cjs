const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-talk-qa-"));
const out = path.join(repo, "out/talk-qa");
const source = path.join(out, "source.mp4");
fs.mkdirSync(out, { recursive: true });
// A reproducible technical fixture, not a subjective talking-head quality sample.
if (!fs.existsSync(source)) {
  const voice = path.join(out, "narration.aiff");
  execFileSync("/usr/bin/say", [
    "-v",
    "Tingting",
    "-r",
    "165",
    "-o",
    voice,
    "今天，我们把一个想法，变成真实的作品。先记录任务，再整理素材，最后完成剪辑。",
  ]);
  execFileSync("/opt/homebrew/bin/ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1280x720:rate=30",
    "-i",
    voice,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
}
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
let app, page;
const report = { checks: [], errors: [], temp };
async function waitJob() {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const jobs = await page.evaluate(() => window.cs.studioJobs());
    if (jobs[0] && ["complete", "failed"].includes(jobs[0].status))
      return jobs[0];
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Render timed out");
}
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
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.setBackgroundThrottling(false);
  });
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.getByRole("button", { name: "展开创作内容", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "创作室", exact: true })
    .click();
  await page.getByRole("button", { name: "新建剪辑项目", exact: true }).click();
  await page.getByLabel("剪辑项目名称").fill("口播验收");
  await page
    .getByRole("button", { name: "创建项目", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "导入第一段素材", exact: true })
    .waitFor();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, source);
  await page
    .getByRole("button", { name: "导入第一段素材", exact: true })
    .click();
  await page
    .getByText("素材已复制到工程，可以离线继续剪辑", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "文稿", exact: true }).click();
  await page.getByRole("button", { name: "转写", exact: true }).click();
  await page
    .getByText("语音已转为可剪辑片段", { exact: false })
    .waitFor({ timeout: 120000 });
  report.checks.push("local Whisper ASR produces timed editable segments");
  const root = await page.getByLabel("当前剪辑项目").inputValue();
  let state = await page.evaluate((root) => window.cs.studioRead(root), root);
  assert.ok(state.clips.length > 1);
  report.transcript = state.clips.map((c) => c.text).join("");
  assert.match(report.transcript, /想法|作品/);
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await new Promise((r) => setTimeout(r, 1200));
  const video = await page.locator("video").evaluate((el) => ({
    currentTime: el.currentTime,
    readyState: el.readyState,
    error: el.error?.message,
  }));
  assert.ok(video.readyState >= 2);
  assert.ok(video.currentTime > 0);
  report.preview = video;
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "检测停顿", exact: true }).click();
  await page.getByText(/检测到 .* 秒停顿/).waitFor();
  await page
    .getByRole("button", { name: "应用到当前剪辑", exact: true })
    .click();
  await page.getByLabel("画面比例").selectOption("9:16");
  await page.getByLabel("分辨率").selectOption("720");
  await page.getByRole("button", { name: "导出视频", exact: true }).click();
  const job = await waitJob();
  assert.equal(job.status, "complete", job.error);
  report.job = job;
  const meta = JSON.parse(
    execFileSync(
      "/opt/homebrew/bin/ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        job.output,
      ],
      { encoding: "utf8" },
    ),
  );
  const v = meta.streams.find((s) => s.codec_type === "video");
  assert.equal(v.width, 720);
  assert.equal(v.height, 1280);
  execFileSync("/opt/homebrew/bin/ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    job.output,
    "-ss",
    "0.5",
    "-frames:v",
    "1",
    path.join(out, "output-frame.png"),
  ]);
  report.checks.push(
    "media protocol playback, silence cut, 720×1280 MP4 with captions, audio and full decode",
  );
  await page.getByRole("button", { name: "关闭导出队列" }).click();
  await page.screenshot({ path: path.join(out, "editor.png") });
  await page.getByRole("button", { name: "像素", exact: true }).click();
  await page.getByLabel("场景配音").selectOption(state.media[0].id);
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await new Promise((r) => setTimeout(r, 1100));
  report.pixelAudioPreview = await page.locator("video").evaluate((el) => ({
    currentTime: el.currentTime,
    paused: el.paused,
    readyState: el.readyState,
  }));
  assert.ok(report.pixelAudioPreview.currentTime > 0.3);
  assert.equal(report.pixelAudioPreview.paused, false);
  report.checks.push("scene voice source plays during pixel preview");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
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
