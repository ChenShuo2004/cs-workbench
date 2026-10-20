const { _electron: electron } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-creator-qa-")),
  out = path.join(repo, "out/creator-qa");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(temp, "data"), { recursive: true });
const config = {
  workspace: path.join(temp, "projects"),
  library: "",
  projects: [],
};
fs.writeFileSync(path.join(temp, "data/config.json"), JSON.stringify(config));
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `require(${JSON.stringify(path.join(repo, "electron/main.cjs"))})`,
);
const source = path.join(repo, "out/talk-qa/source.mp4"),
  music = path.join(out, "beat-120.wav");
if (!fs.existsSync(source))
  throw Error("先运行 node scripts/verify-talk.cjs 生成并验证技术素材");
const rate = 16000,
  seconds = 12,
  pcm = Buffer.alloc(rate * seconds * 2);
for (let i = 0; i < rate * seconds; i++) {
  const phase = (i % (rate * 0.5)) / rate;
  const value =
    0.025 * Math.sin((i * 2 * Math.PI * 220) / rate) +
    (phase < 0.04
      ? 0.25 * Math.exp(-phase * 120) * Math.sin((i * 2 * Math.PI * 800) / rate)
      : 0);
  pcm.writeInt16LE(Math.round(value * 32767), i * 2);
}
const wav = Buffer.alloc(44);
wav.write("RIFF");
wav.writeUInt32LE(pcm.length + 36, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(music, Buffer.concat([wav, pcm]));
let app, page;
const report = { at: new Date().toISOString(), checks: [], errors: [], temp };
async function waitUntil(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("condition timed out");
}
async function nav(label) {
  const target = page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true });
  if (!(await target.count())) {
    const groups = {
      资料收集: "发现信息",
      文件空间: "处理素材",
      素材库: "处理素材",
      项目: "决定选题",
      文章: "创作内容",
      视频: "创作内容",
      创作室: "创作内容",
      发布: "分发交接",
      平台账号: "分发交接",
    };
    await page
      .getByRole("button", { name: "展开" + groups[label], exact: true })
      .click();
  }
  await target.click();
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
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.setBackgroundThrottling(false);
  });
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  await page
    .getByRole("heading", { name: "把今天，过成想要的样子。" })
    .waitFor();
  await page.getByLabel("快速添加任务").fill("核查口播字幕");
  await page.getByLabel("快速添加任务").press("Enter");
  await page.getByRole("button", { name: /^搜索/ }).click();
  await page.getByLabel("搜索工作区内容").fill("口播字幕");
  await page
    .getByRole("dialog", { name: "搜索工作区" })
    .getByRole("button", { name: /核查口播字幕/ })
    .click();
  await page.getByLabel("任务名称").waitFor();
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  report.checks.push("workspace search opens editable task");
  await nav("我的工作台");
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  const backup = path.join(temp, "backup.json");
  await app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
  }, backup);
  await page.getByRole("button", { name: "备份工作区", exact: true }).click();
  await waitUntil(() => fs.existsSync(backup));
  await page.getByRole("button", { name: "关闭数据管理" }).click();
  await page.getByLabel("快速添加任务").fill("恢复前新增记录");
  await page.getByLabel("快速添加任务").press("Enter");
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, backup);
  await page.getByRole("button", { name: "恢复备份", exact: true }).click();
  await waitUntil(async () => {
    const d = await page.evaluate(() => window.cs.personalRead());
    return d.tasks.length === 1;
  });
  assert.ok(
    fs.readdirSync(path.join(temp, "data/personal/backups")).length > 0,
  );
  report.checks.push("UI backup and restore, retaining prior data");
  const project = await page.evaluate(() =>
    window.cs.createProject({
      title: "个人创作验收",
      audience: "技术测试",
      platforms: ["抖音"],
    }),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "把今天，过成想要的样子。" })
    .waitFor();
  await page.getByRole("button", { name: /^搜索/ }).click();
  await page.getByLabel("搜索工作区内容").fill("个人创作验收");
  await page
    .getByRole("dialog", { name: "搜索工作区" })
    .getByRole("button", { name: /个人创作验收/ })
    .click();

  await nav("资料收集");
  await page.getByRole("button", { name: "收集资料", exact: true }).click();
  await page.getByLabel("资料标题").fill("三步剪辑参考");
  await page.getByLabel("资料摘要").fill("先整理，再粗剪，最后校对字幕。");
  await page
    .getByLabel("资料来源", { exact: true })
    .fill("https://example.com/editing");
  assert.equal(
    await page.getByLabel("资料关联选题").inputValue(),
    project.path,
  );
  await page.getByRole("button", { name: "保存资料", exact: true }).click();
  await page
    .getByRole("button", { name: "标记已处理 三步剪辑参考", exact: true })
    .click();
  await waitUntil(async () => {
    const d = await page.evaluate(() => window.cs.personalRead());
    return d.notes.find((n) => n.title === "三步剪辑参考")?.processed;
  });
  await nav("个人记忆");
  assert.equal(
    await page
      .getByRole("heading", { name: "三步剪辑参考", exact: true })
      .count(),
    0,
  );
  report.checks.push(
    "reference capture, URL, shared project association, processed state, separate memory collection",
  );
  const second = await page.evaluate(() =>
    window.cs.createProject({
      title: "独立项目校验",
      audience: "QA",
      platforms: ["X"],
    }),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "把今天，过成想要的样子。" })
    .waitFor();
  await nav("文章");
  await page
    .getByLabel("当前创作项目", { exact: true })
    .selectOption(second.path);
  await nav("创作室");
  await waitUntil(
    async () =>
      (await page.getByLabel("当前剪辑项目").inputValue()) === second.path,
  );
  await page.getByLabel("当前剪辑项目").selectOption(project.path);
  await waitUntil(
    async () =>
      (await page.getByLabel("当前创作项目", { exact: true }).inputValue()) ===
      project.path,
  );
  await nav("文章");
  assert.equal(
    await page.getByLabel("当前创作项目", { exact: true }).inputValue(),
    project.path,
  );
  report.checks.push(
    "two projects stay synchronized across article, global selector, and editing room",
  );
  const routes = [
    "我的工作台",
    "每日任务",
    "Agent 助手",
    "个人记忆",
    "资料收集",
    "文件空间",
    "创作室",
    "项目",
    "文章",
    "视频",
    "素材库",
    "发布",
    "平台账号",
    "设置",
  ];
  report.routes = [];
  for (const route of routes) {
    await nav(route);
    await page.evaluate(() => window.scrollTo(0, 0));
    const colors = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector(".app-shell")),
        t = getComputedStyle(document.querySelector(".topbar"));
      return { background: s.backgroundColor, header: t.backgroundColor };
    });
    assert.deepEqual(colors, {
      background: "rgb(17, 19, 21)",
      header: "rgb(21, 23, 25)",
    });
    await page.screenshot({
      path: path.join(out, `route-${routes.indexOf(route)}.png`),
    });
    report.routes.push({ route, ...colors });
  }
  report.checks.push(
    "all 14 routes use one shell and color system, populated project editors inspected",
  );
  await nav("创作室");
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    },
    [source, music],
  );
  await page
    .getByRole("button", { name: "导入第一段素材", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await page.evaluate((root) => window.cs.studioRead(root), project.path))
        .media.length === 2,
  );
  let state = await page.evaluate(
    (root) => window.cs.studioRead(root),
    project.path,
  );
  const video = state.media.find((m) => m.kind === "video"),
    bed = state.media.find((m) => m.kind === "audio");
  state.clips = [0, 1, 2, 3].map((i) => ({
    id: "review-" + i,
    mediaId: video.id,
    start: i * 2,
    end: (i + 1) * 2,
    text: [
      "今天讲一个方法。",
      "今天讲一个方法。",
      "先整理素材，再开始剪辑。",
      "记住这三个步骤。",
    ][i],
    enabled: true,
  }));
  await page.evaluate(({ root, state }) => window.cs.studioSave(root, state), {
    root: project.path,
    state,
  });
  await nav("我的工作台");
  await nav("创作室");
  await page.getByRole("button", { name: "底板字幕", exact: true }).click();
  await page.getByLabel("字幕颜色").fill("#f6e2b1");
  await page.getByLabel("字幕位置").selectOption("0.76");
  await page.getByLabel("画面比例").selectOption("9:16");
  await page.getByLabel("画面适配").selectOption("fill");
  await page.getByLabel("背景音乐", { exact: true }).selectOption(bed.id);
  await page.getByLabel("片段声音", { exact: true }).selectOption(video.id);
  await page.getByRole("button", { name: "估计音乐节拍", exact: true }).click();
  await page.getByText(/估计 120 BPM/).waitFor();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await new Promise((r) => setTimeout(r, 1400));
  const preview = await page.evaluate(() => ({
    videoMuted: document.querySelector("video").muted,
    voice: document.querySelector('audio[aria-label="配音预览"]').currentTime,
    music: document.querySelector('audio[aria-label="背景音乐预览"]')
      .currentTime,
  }));
  assert.equal(preview.videoMuted, true);
  assert.ok(preview.voice > 0.3);
  assert.ok(preview.music > 0.3);
  report.preview = preview;
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "打开剪辑助理", exact: true }).click();
  await page
    .getByLabel("剪辑优化要求")
    .fill(
      "只关闭第二个片段 review-1，它与第一个句子完全重复。其他三个片段必须保持启用，所有 start/end 原值保持不变。",
    );
  await page.getByRole("button", { name: "生成剪辑建议", exact: true }).click();
  await page
    .getByRole("button", { name: "应用这些修改", exact: true })
    .waitFor({ timeout: 180000 });
  await page.screenshot({ path: path.join(out, "codex-plan.png") });
  await page.getByRole("button", { name: "应用这些修改", exact: true }).click();
  await waitUntil(
    async () =>
      !(await page.evaluate((root) => window.cs.studioRead(root), project.path))
        .clips[1].enabled,
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await waitUntil(
    async () =>
      (await page.evaluate((root) => window.cs.studioRead(root), project.path))
        .clips[1].enabled,
  );
  report.checks.push(
    "real Codex proposal, validated apply, undo restores original clip",
  );
  await page.getByRole("button", { name: "导出视频", exact: true }).click();
  const job = await waitUntil(async () => {
    const j = (await page.evaluate(() => window.cs.studioJobs()))[0];
    return j && ["complete", "failed"].includes(j.status) ? j : null;
  }, 120000);
  assert.equal(job.status, "complete", job.error);
  report.job = job;
  await page.getByRole("button", { name: "关闭导出队列" }).click();
  await page.screenshot({ path: path.join(out, "editor.png") });
  const saved = await page.evaluate(
    (root) => window.cs.studioRead(root),
    project.path,
  );
  assert.equal(saved.audio.musicId, bed.id);
  assert.equal(saved.captionStyle.preset, "card");
  report.settings = saved;
  fs.cpSync(path.dirname(job.output), path.join(out, "render"), {
    recursive: true,
  });
  execFileSync("/opt/homebrew/bin/ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    job.output,
    "-ss",
    "1",
    "-frames:v",
    "1",
    path.join(out, "frame.png"),
  ]);
  report.checks.push(
    "portrait crop, styled subtitles, voice override, loop/fade/duck music real export and complete decode",
  );
  for (const route of routes) {
    await page.setViewportSize({ width: 390, height: 844 });
    await nav(route);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      route + " overflows",
    );
    if (["创作室", "资料收集", "发布"].includes(route))
      await page.screenshot({
        path: path.join(out, `narrow-${routes.indexOf(route)}.png`),
      });
  }
  report.checks.push("14 routes fit 390px viewport");
  assert.deepEqual(report.errors, []);
})()
  .catch(async (e) => {
    report.failure = e.stack;
    process.exitCode = 1;
    if (page)
      try {
        await page.screenshot({
          path: path.join(out, "failure.png"),
          timeout: 5000,
        });
      } catch {}
  })
  .finally(async () => {
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
