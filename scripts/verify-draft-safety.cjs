// Real renderer and files, with deterministic IPC delays/failures in a temporary profile.
const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const wb = require("../lib/workbench.cjs");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-draft-safety-"));
const data = path.join(temp, "data"),
  out = path.join(repo, "out/draft-safety-qa");
fs.mkdirSync(data);
fs.mkdirSync(out, { recursive: true });
const config = {
  workspace: path.join(temp, "projects"),
  projects: [],
  library: "",
};
const first = wb.createProject(config, {
  title: "保存队列工程一",
  platforms: ["X"],
});
const second = wb.createProject(config, {
  title: "保存队列工程二",
  platforms: ["抖音"],
});
fs.writeFileSync(path.join(data, "config.json"), JSON.stringify(config));
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `
const {ipcMain,dialog}=require('electron');
globalThis.draftQA={hold:{},fail:{},pending:{},calls:{},dialogs:[]};
const register=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,fn)=>register(channel,async(...args)=>{
 const q=globalThis.draftQA;q.calls[channel]=(q.calls[channel]||0)+1;
 if(q.hold[channel]){q.hold[channel]--;await new Promise(resolve=>(q.pending[channel]||=[]).push(resolve));}
 if(q.fail[channel]){q.fail[channel]--;throw Error('验收用临时写入失败');}
 return fn(...args);
});
dialog.showMessageBoxSync=(_window,options)=>{globalThis.draftQA.dialogs.push(options);return 0;};
require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});
`,
);
let app, page;
const report = { checks: [], errors: [] };
async function control(channel, mode, count = 1) {
  await app.evaluate(
    (_electron, { channel, mode, count }) => {
      globalThis.draftQA[mode][channel] = count;
    },
    { channel, mode, count },
  );
}
async function waitHeld(channel) {
  const held = await app.evaluate(async (_electron, channel) => {
    for (let n = 0; n < 100; n++) {
      if (globalThis.draftQA.pending[channel]?.length) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }, channel);
  assert.ok(held, `IPC ${channel} reached hold`);
}
async function release(channel) {
  await app.evaluate(
    (_electron, channel) => globalThis.draftQA.pending[channel]?.shift()?.(),
    channel,
  );
}
async function search(name, category = "页面") {
  await page.getByRole("button", { name: "全局搜索工作区" }).click();
  await page.getByRole("combobox", { name: "搜索工作区内容" }).fill(name);
  await page
    .getByRole("option", { name: new RegExp(`${category} ${name}`) })
    .click();
  await page
    .getByRole("dialog", { name: "搜索工作区", exact: true })
    .waitFor({ state: "hidden" });
}
(async () => {
  app = await electron.launch({
    executablePath: require("electron"),
    args: [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
    timeout: 45000,
  });
  page = await app.firstWindow({ timeout: 45000 });
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("今日随手记").waitFor();
  await control("personal:journal", "fail");
  await page.getByLabel("今日随手记").fill("写入失败也不能丢失的随手记");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("button", { name: "重试保存随手记", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("今日随手记").inputValue(),
    "写入失败也不能丢失的随手记",
  );
  assert.equal(
    await page.getByRole("heading", { name: "本机设置", exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "重试保存随手记", exact: true })
    .click();
  await page.getByText("自动保存", { exact: true }).waitFor();
  const personal = await page.evaluate(() => window.cs.personalRead());
  assert.equal(
    personal.journal[personal.date].body,
    "写入失败也不能丢失的随手记",
  );
  report.checks.push(
    "failed journal save blocks navigation, retains text and retries to real local storage",
  );

  await control("content:read", "hold");
  await search("内容总览");
  await waitHeld("content:read");
  assert.equal(await page.getByLabel("写给谁", { exact: true }).count(), 0);
  await release("content:read");
  await page.getByLabel("写给谁", { exact: true }).waitFor();
  // Choose a deterministic project before entering data.
  await page
    .locator(".ops-project")
    .filter({ hasText: "保存队列工程一" })
    .click();
  await control("content:save", "hold");
  await page.getByLabel("写给谁", { exact: true }).fill("第一版受众");
  await page.getByRole("button", { name: "保存内容计划", exact: true }).click();
  await waitHeld("content:save");
  await page
    .getByLabel("写给谁", { exact: true })
    .fill("保存过程中输入的第二版受众");
  await release("content:save");
  await page.getByText("内容计划已保存", { exact: true }).waitFor();
  let plans = await page.evaluate(() => window.cs.contentRead());
  assert.equal(
    plans.plans.find((p) => p.project === first.path).audience,
    "保存过程中输入的第二版受众",
  );
  assert.equal(
    await page.getByLabel("写给谁", { exact: true }).inputValue(),
    "保存过程中输入的第二版受众",
  );
  report.checks.push(
    "content loading cannot overwrite input; edits made while saving are saved in a second ordered write",
  );
  await page
    .getByLabel("开头钩子", { exact: true })
    .fill("快捷键保存当前内容计划");
  await page.getByLabel("开头钩子", { exact: true }).press("ControlOrMeta+s");
  await page.getByText("当前内容已保存", { exact: true }).waitFor();
  plans = await page.evaluate(() => window.cs.contentRead());
  assert.equal(
    plans.plans.find((p) => p.project === first.path).hook,
    "快捷键保存当前内容计划",
  );
  report.checks.push(
    "save shortcut writes the active content module before reporting success",
  );

  await page
    .getByLabel("下一步动作", { exact: true })
    .fill("切换项目前保存这个动作");
  await page
    .locator(".ops-project")
    .filter({ hasText: "保存队列工程二" })
    .click();
  await page
    .getByRole("heading", { name: "保存队列工程二", exact: true })
    .waitFor();
  plans = await page.evaluate(() => window.cs.contentRead());
  assert.equal(
    plans.plans.find((p) => p.project === first.path).nextAction,
    "切换项目前保存这个动作",
  );
  await page
    .getByLabel("写给谁", { exact: true })
    .fill("失败后仍需保留的内容计划");
  await control("content:save", "fail");
  await search("设置");
  await page
    .getByRole("alert")
    .filter({ hasText: "验收用临时写入失败" })
    .waitFor();
  assert.equal(
    await page.getByLabel("写给谁", { exact: true }).inputValue(),
    "失败后仍需保留的内容计划",
  );
  assert.equal(
    await page.getByRole("heading", { name: "本机设置", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "保存内容计划", exact: true }).click();
  await page.getByText("内容计划已保存", { exact: true }).waitFor();
  report.checks.push(
    "project switch saves current content; failed search navigation reveals save error and preserves the active plan",
  );

  await search("保存队列工程一", "项目");
  await search("文章");
  const article = page.getByLabel("文章正文", { exact: true });
  await control("project:save-document", "hold");
  await article.fill("第一版文章");
  await article.press("ControlOrMeta+s");
  await waitHeld("project:save-document");
  await article.fill("保存过程中输入的第二版文章");
  await release("project:save-document");
  await page.getByText("已保存到项目文件", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.readProject(root), first.path))
      .docs.article,
    "保存过程中输入的第二版文章",
  );
  report.checks.push(
    "document save never marks newer input as saved before that input reaches disk",
  );
  await article.fill("点击当前文档标签仍保留最新正文");
  await page.getByRole("button", { name: "文章正文", exact: true }).click();
  assert.equal(await article.inputValue(), "点击当前文档标签仍保留最新正文");
  await control("project:read", "hold");
  await page
    .getByLabel("当前创作项目", { exact: true })
    .selectOption(second.path);
  await waitHeld("project:read");
  await page
    .getByLabel("当前创作项目", { exact: true })
    .selectOption(first.path);
  await release("project:read");
  await page.waitForFunction(
    (root) =>
      document.querySelector('[aria-label="当前创作项目"]').value === root,
    first.path,
  );
  assert.equal(await article.inputValue(), "点击当前文档标签仍保留最新正文");
  report.checks.push(
    "active document tab retains just-saved content; late project reads cannot replace the latest selection",
  );

  await article.fill("取消退出后保留的文章");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await app.evaluate(async () => {
    for (let i = 0; i < 100 && !globalThis.draftQA.dialogs.length; i++)
      await new Promise((r) => setTimeout(r, 20));
  });
  assert.equal(
    (await app.evaluate(() => globalThis.draftQA.dialogs)).at(-1).message,
    "当前内容尚未保存",
  );
  assert.equal(await article.inputValue(), "取消退出后保留的文章");
  await article.press("ControlOrMeta+s");
  await page.getByText("已保存到项目文件", { exact: true }).waitFor();
  await search("我的工作台");
  await page.getByLabel("快速添加任务").fill("取消退出后仍可继续工作");
  await page.getByLabel("快速添加任务").press("Enter");
  await page
    .getByRole("button", {
      name: "完成任务 取消退出后仍可继续工作",
      exact: true,
    })
    .waitFor();
  report.checks.push(
    "unsaved close offers continue editing; cancel retains window, input and working services",
  );
  await page.locator(".skip-to-content").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => location.hash), "");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "workbench-content",
  );
  report.checks.push(
    "skip-to-content focuses main without changing document URL or fullscreen permission identity",
  );
  await search("创作室");
  await page.getByRole("button", { name: "视频节点", exact: true }).waitFor();
  await control("studio:save", "fail", 10);
  await page.getByRole("button", { name: "视频节点", exact: true }).click();
  await page
    .getByRole("button", { name: "重试保存工程", exact: true })
    .waitFor();
  assert.equal(await page.locator(".vg-node").count(), 1);
  assert.equal(
    (await page.evaluate((root) => window.cs.studioRead(root), first.path))
      .canvas?.generators?.length || 0,
    0,
  );
  await control("studio:save", "fail", 1);
  await search("设置");
  assert.equal(await page.locator(".vg-node").count(), 1);
  await page.getByRole("button", { name: "关闭错误", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole("button", { name: "重试保存工程", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({ path: path.join(out, "canvas-save-recovery.png") });
  await page.getByRole("button", { name: "重试保存工程", exact: true }).click();
  await page.getByText("工程已保存到本机", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((root) => window.cs.studioRead(root), first.path))
      .canvas.generators.length,
    1,
  );
  await search("设置");
  assert.equal(await page.locator(".vg-node").count(), 0);
  report.checks.push(
    "failed canvas writes retain nodes and block navigation; dismissing error keeps retry accessible; retry persists and allows leaving",
  );
  assert.deepEqual(report.errors, []);
  await page.screenshot({ path: path.join(out, "completed.png") });
})()
  .catch((e) => {
    report.failure = e.stack;
    process.exitCode = 1;
  })
  .finally(async () => {
    if (page && !page.isClosed() && report.failure)
      await page
        .screenshot({ path: path.join(out, "failure.png"), timeout: 5000 })
        .catch(() => {});
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) {
      await app
        .evaluate(({ dialog }) => {
          dialog.showMessageBoxSync = () => 1;
        })
        .catch(() => {});
      await app.close();
    }
  });
