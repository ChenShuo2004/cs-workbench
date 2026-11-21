// Isolated UI + real queue/persistence integration. Synthetic providers, no paid requests.
const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-nodes-qa-"));
const out = path.join(repo, "out/generation-nodes-qa");
fs.mkdirSync(out, { recursive: true });
const data = path.join(temp, "data");
fs.mkdirSync(data);
const traceFile = path.join(temp, "requests.json");
fs.writeFileSync(traceFile, "[]");
fs.writeFileSync(
  path.join(data, "config.json"),
  JSON.stringify({
    workspace: path.join(temp, "projects"),
    projects: [],
    library: "",
  }),
);
const picture = path.join(temp, "参考图片.png"),
  movie = path.join(temp, "参考视频.mp4"),
  audio = path.join(temp, "参考声音.wav");
const report = {
  temp,
  provider:
    "synthetic transport; real application UI, queue and project persistence",
  checks: [],
  errors: [],
};
let app;
(async () => {
  await require("sharp")({
    create: { width: 640, height: 360, channels: 3, background: "#466d61" },
  })
    .png()
    .toFile(picture);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=24",
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    movie,
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    "2",
    audio,
  ]);
  const entry = path.join(temp, "entry.cjs");
  fs.writeFileSync(
    entry,
    `
const {app}=require('electron');const fs=require('node:fs'),path=require('node:path');
app.setPath('userData',${JSON.stringify(data)});
const repo=${JSON.stringify(repo)}, trace=${JSON.stringify(traceFile)};
const record=x=>{const a=JSON.parse(fs.readFileSync(trace));a.push(x);fs.writeFileSync(trace,JSON.stringify(a));};
const counts=new Map();
require(path.join(repo,'lib/image-bridge.cjs')).createImageBridge=()=>({
 check:async()=>true,close(){},submit:async args=>{record({kind:'image',prompt:args.prompt});fs.copyFileSync(${JSON.stringify(picture)},path.join(args.output_dir,'source.png'));return {job_id:args.output_dir};},
 poll:async remote=>({status:'completed',images:[{path:path.join(remote,'source.png')}]})
});
require(path.join(repo,'lib/metaso-video.cjs')).createMetasoVideo=()=>({
 validate(){},status:()=>({ready:true,detail:'QA synthetic provider',models:['MiniMax-H3','seedance-2.0']}),
 submit:async(job,refs)=>{record({kind:'video',prompt:job.prompt,model:job.model,resolution:job.resolution,nativeResolution:job.nativeResolution,duration:job.duration,nodeId:job.nodeId,refs:refs.map(r=>({kind:r.kind,role:r.role,exists:fs.existsSync(r.path)}))});return {request_id:job.id};},
 poll:async job=>{const n=(counts.get(job.id)||0)+1;counts.set(job.id,n);return n<(job.duration===5?8:2)?{status:'running'}:{status:'completed',path:${JSON.stringify(movie)}};}
});
const g=require(path.join(repo,'lib/studio-generation.cjs')),create=g.createGeneration;g.createGeneration=args=>create({...args,pollMs:100});
require(path.join(repo,'electron/main.cjs'));
`,
  );
  app = await electron.launch({
    executablePath: require("electron"),
    args: [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false),
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
  await page.getByRole("button", { name: "新建剪辑项目", exact: true }).click();
  await page.getByLabel("剪辑项目名称").fill("节点工作流验收");
  await page
    .getByRole("button", { name: "创建项目", exact: true })
    .last()
    .click();
  await page.waitForFunction(
    () => !!document.querySelector('[aria-label="当前剪辑项目"]').value,
  );
  const root = await page.getByLabel("当前剪辑项目").inputValue();
  report.root = root;
  const read = () => page.evaluate((root) => window.cs.studioRead(root), root);
  const waitJobs = async (count) => {
    for (let i = 0; i < 150; i++) {
      const jobs = await page.evaluate(
        (root) => window.cs.generationList(root),
        root,
      );
      if (jobs.length === count && jobs.every((j) => j.applied)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw Error(
      "Jobs did not attach: " +
        JSON.stringify(
          await page.evaluate((root) => window.cs.generationList(root), root),
        ),
    );
  };
  const saved = () => page.getByText("已保存到本机", { exact: true }).waitFor();
  const fit = async () => {
    await page
      .getByRole("button", { name: "自动排列镜头", exact: true })
      .click();
    await saved();
  };
  const connectKeys = async (outName, inName) => {
    await page.getByRole("button", { name: outName, exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: inName, exact: true }).focus();
    await page.keyboard.press("Enter");
    await saved();
  };
  await page.getByRole("button", { name: "生图节点", exact: true }).click();
  await page
    .getByLabel("节点 1 提示词", { exact: true })
    .fill("青绿色空间中的一棵树，晨光。");
  await page.getByRole("button", { name: "视频节点", exact: true }).click();
  await fit();
  await page
    .getByLabel("节点 2 提示词", { exact: true })
    .fill("镜头缓慢靠近树，叶片随风摆动。");
  await page.getByLabel("节点 2 时长", { exact: true }).selectOption("6");
  await page
    .getByLabel("节点 2 模型", { exact: true })
    .selectOption("seedance-2.0");
  await page.getByLabel("节点 2 分辨率", { exact: true }).selectOption("1080P");
  await saved();
  assert.equal((await read()).canvas.generators[1].resolution, "1080P");
  assert.equal((await read()).canvas.edges.length, 0);
  const prompt = page.getByLabel("节点 2 提示词", { exact: true });
  await prompt.fill("让 @");
  await page
    .locator(".vg-mention-menu")
    .getByRole("option", { name: /生图 1/ })
    .click();
  await saved();
  assert.equal((await read()).canvas.edges.length, 1);
  assert.match(await prompt.inputValue(), /@图片1/);
  await page
    .locator(".vg-node")
    .nth(1)
    .getByRole("button", { name: "首尾帧设置", exact: true })
    .click();
  const frameId = (await read()).canvas.edges[0].id;
  await page.getByLabel("节点 2 首帧", { exact: true }).selectOption(frameId);
  await saved();
  await prompt.fill("让 @");
  await page
    .locator(".vg-mention-menu")
    .getByRole("option", { name: /@图片1/ })
    .click();
  assert.match(await prompt.inputValue(), /@图片1/);
  await saved();
  assert.equal(
    await page.getByLabel("节点 2 比例", { exact: true }).isDisabled(),
    true,
  );
  report.checks.push(
    "Typing @ selects an unconnected upstream image node, atomically connects it, and repeated selection preserves its frame role without duplicate edges",
  );
  await page
    .locator(".vg-node")
    .nth(1)
    .getByRole("button", { name: "生成", exact: true })
    .click();
  await page.getByRole("dialog", { name: "确认批量生成" }).waitFor();
  assert.match(
    await page.locator(".vg-modal").innerText(),
    /准备生成 2 个节点/,
  );
  await page.getByRole("button", { name: "开始批量生成", exact: true }).click();
  await waitJobs(2);
  let state = await read();
  assert.equal(state.clips.length, 2);
  assert.equal(state.clips[0].enabled, false);
  let requests = JSON.parse(fs.readFileSync(traceFile));
  assert.deepEqual(
    requests.map((x) => x.kind),
    ["image", "video"],
  );
  assert.deepEqual(
    requests[1].refs.map((x) => x.role),
    ["first_frame"],
  );
  assert.ok(requests[1].refs.every((x) => x.exists));
  assert.match(requests[1].prompt, /首帧/);
  assert.equal(requests[1].model, "seedance-2.0");
  assert.equal(requests[1].resolution, "1080P");
  assert.equal(requests[1].nativeResolution, true);
  report.checks.push(
    "Generate on downstream node runs missing upstream first, uses its real local result, attaches each output once and excludes intermediate image from export",
  );
  await page.getByLabel("节点 2 首帧", { exact: true }).selectOption("");
  await saved();
  assert.equal((await read()).canvas.edges.length, 1);
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    },
    [movie, audio],
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
    .filter({ hasText: "参考视频.mp4" })
    .getByRole("button", { name: "添加素材节点", exact: true })
    .click();
  await page.getByRole("button", { name: "画布素材库", exact: true }).click();
  await page
    .locator(".vc-asset")
    .filter({ hasText: "参考声音.wav" })
    .getByRole("button", { name: "添加素材节点", exact: true })
    .click();
  await fit();
  await connectKeys("连接生成节点 1 输出", "连接节点 2 输入");
  await connectKeys("连接素材 1 输出", "连接节点 2 输入");
  await connectKeys("连接素材 2 输出", "连接节点 2 输入");
  await prompt.fill("主体 @图片");
  await page.keyboard.press("Enter");
  await prompt.press("End");
  await prompt.type("镜头 @视频");
  await page.keyboard.press("Enter");
  await prompt.press("End");
  await prompt.type("声音 @声音");
  await page.keyboard.press("Enter");
  await saved();
  assert.match(await prompt.inputValue(), /@图片1.*@视频1.*@声音1/);
  await page.getByLabel("节点 2 时长", { exact: true }).selectOption("7");
  await page
    .locator(".vg-node")
    .nth(1)
    .getByRole("button", { name: "重新生成", exact: true })
    .click();
  await waitJobs(3);
  requests = JSON.parse(fs.readFileSync(traceFile));
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests[2].refs.map((x) => x.role),
    ["reference_image", "reference_video", "reference_audio"],
  );
  assert.equal(requests[2].duration, 7);
  assert.match(requests[2].prompt, /Image 1.*Video 1.*Audio 1/);
  report.checks.push(
    "Direct mixed-media links retain stable @ aliases; provider receives matching Image/Video/Audio labels and reuses existing image",
  );
  await page
    .getByRole("button", { name: "分镜批量建节点", exact: true })
    .click();
  await page
    .getByLabel("批量分镜提示词")
    .fill("[5秒] 第一镜：清晨树叶的近景\n[8秒] 第二镜：镜头拉远，展示树林");
  await page.getByRole("button", { name: "创建分镜节点", exact: true }).click();
  await fit();
  state = await read();
  assert.deepEqual(
    state.canvas.generators.slice(-2).map((n) => n.duration),
    [5, 8],
  );
  await page.getByRole("button", { name: "批量生成", exact: true }).click();
  assert.match(
    await page.getByRole("dialog", { name: "确认批量生成" }).innerText(),
    /视频共 13 秒/,
  );
  await page.getByRole("button", { name: "开始批量生成", exact: true }).click();
  await waitJobs(5);
  state = await read();
  assert.match(state.clips.at(-2).prompt, /第一镜/);
  assert.match(state.clips.at(-1).prompt, /第二镜/);
  report.checks.push(
    "Batch parser creates 5s and 8s nodes, review reports 13s, reverse completion still attaches in storyboard order",
  );
  const graph = state.canvas;
  await page.reload();
  await openStudio();
  await page.waitForFunction(
    () => document.querySelectorAll(".vg-node").length > 0,
  );
  assert.deepEqual((await read()).canvas, graph);
  assert.equal(JSON.parse(fs.readFileSync(traceFile)).length, 5);
  report.checks.push(
    "Reload restores graph, all three reference roles and completed outputs without paid resubmission",
  );
  await page.getByRole("button", { name: "全屏创作室", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".studio.studio-fullscreen"),
  );
  await fit();
  await page.screenshot({ path: path.join(out, "nodes-fullscreen.png") });
  await page
    .getByRole("button", { name: "退出创作室全屏", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(out, "nodes-mobile.png"),
    fullPage: true,
  });
  report.checks.push(
    "Fullscreen node workspace and 390px layout have reachable controls and no page overflow",
  );
  assert.deepEqual(report.errors, []);
  report.completed = true;
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
