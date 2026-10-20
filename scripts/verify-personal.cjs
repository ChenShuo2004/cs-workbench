const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-personal-qa-"));
const out = path.join(repo, "out/personal-qa");
fs.mkdirSync(out, { recursive: true });
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
async function launch() {
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
  await page
    .getByRole("heading", { name: "把今天，过成想要的样子。" })
    .waitFor();
}
(async () => {
  await launch();
  await page.getByLabel("快速添加任务").fill("完成创作工作台验收");
  await page.getByLabel("快速添加任务").press("Enter");
  await page
    .getByRole("button", { name: "完成任务 完成创作工作台验收", exact: true })
    .click();
  await page
    .getByLabel("今日随手记")
    .fill("任务、记忆与文件空间已连接，继续真实验收。");
  await page.getByLabel("今日随手记").blur();
  await page.getByText("自动保存", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, "home.png") });
  report.checks.push("task create/complete and autosaved journal via UI");
  await page.getByRole("button", { name: "每日任务", exact: true }).click();
  await page
    .getByRole("button", { name: "归档任务 完成创作工作台验收", exact: true })
    .click();
  await page.getByRole("button", { name: "已归档", exact: true }).click();
  await page
    .getByRole("button", { name: "恢复任务 完成创作工作台验收", exact: true })
    .click();
  await page.getByRole("button", { name: "当天", exact: true }).click();
  await page
    .getByRole("button", { name: "完成任务 完成创作工作台验收", exact: true })
    .click();
  report.checks.push("archived task can be restored from the UI");
  await page.getByRole("button", { name: "个人记忆", exact: true }).click();
  await page.getByRole("button", { name: "记下一条经验", exact: true }).click();
  await page.getByLabel("记忆标题").fill("测试记忆");
  await page.getByLabel("记忆内容").fill("验收暗号：青松 731。");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await page.getByRole("heading", { name: "测试记忆", exact: true }).waitFor();
  const files = path.join(temp, "files");
  fs.mkdirSync(files);
  fs.writeFileSync(
    path.join(files, "项目说明.md"),
    "这是用于测试的公开示例文本。",
  );
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, files);
  await page.getByRole("button", { name: "展开处理素材", exact: true }).click();
  await page.getByRole("button", { name: "文件空间", exact: true }).click();
  await page
    .getByRole("button", { name: "连接文件夹", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /项目说明.md/ }).click();
  await page
    .getByText("这是用于测试的公开示例文本。", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "带到 Agent 会话" }).click();
  await page.getByText("项目说明.md", { exact: true }).waitFor();
  report.checks.push("connected folder preview and explicit Agent attachment");
  await page
    .getByLabel("发送给 Agent 的消息")
    .fill("请仅回复：工作台连接成功。不要调用任何工具。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const d = await page.evaluate(() => window.cs.personalRead());
      if (
        d.conversations[0] &&
        ["complete", "failed"].includes(d.conversations[0].status)
      )
        break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const data = await page.evaluate(() => window.cs.personalRead());
  report.agent = {
    status: data.conversations[0].status,
    error: data.conversations[0].error,
    answer: data.conversations[0].messages.at(-1).text,
  };
  assert.equal(report.agent.status, "complete");
  assert.match(report.agent.answer, /工作台连接成功/);
  await page.screenshot({ path: path.join(out, "agent.png") });
  report.checks.push(
    "real Codex / GPT reply through existing ChatGPT CLI authentication",
  );
  await app.close();
  app = null;
  await launch();
  const restored = await page.evaluate(() => window.cs.personalRead());
  assert.equal(restored.tasks[0].status, "done");
  assert.equal(restored.notes[0].title, "测试记忆");
  assert.equal(restored.folders.length, 1);
  assert.equal(restored.conversations[0].status, "complete");
  assert.equal(
    Object.values(restored.journal)[0].body,
    "任务、记忆与文件空间已连接，继续真实验收。",
  );
  report.checks.push(
    "tasks, memories, files, conversation and journal survive full restart",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  report.checks.push("home fits 390px viewport");
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
