const { _electron: electron } = require("playwright"),
  fs = require("fs"),
  os = require("os"),
  path = require("path"),
  assert = require("assert/strict");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaige-ui-"));
  const env = { ...process.env, CS_WORKBENCH_USER_DATA_DIR: dir };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: process.env.KAIGE_TEST_APP ? [] : [path.resolve(__dirname, "..")],
    ...(process.env.KAIGE_TEST_APP ? {executablePath:process.env.KAIGE_TEST_APP} : {}),
    env,
  });
  try {
    const p = await app.firstWindow();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.locator("nav").getByRole("button", { name: /发布中心/ }).click();
    await p.getByRole("heading", { name: "一稿多发", exact: true }).waitFor();
    await p.getByLabel(/标题（/).fill("验收草稿");
    await p.getByLabel(/正文（/).fill("本机草稿持久化测试");
    await p.waitForTimeout(800);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, "posts.json"))).draft.title,
      "验收草稿",
    );
    assert.equal(
      await p.getByRole("button", { name: /开始自动填表/ }).isDisabled(),
      true,
    );
    await p
      .locator("nav")
      .getByRole("button", { name: /账号与数据/ })
      .click();
    await p.getByRole("heading", { name: "账号与数据", exact: true }).waitFor();
    await p
      .locator("nav")
      .getByRole("button", { name: /网络隔离/ })
      .click();
    await p.getByRole("heading", { name: "Clash Verge 运行配置" }).waitFor();
    await p.locator("nav").getByRole("button", { name: "设置" }).click();
    assert.equal(await p.getByText("麦田发布服务").count(), 0);
    const saved=await p.evaluate(()=>window.cs.settingsSave({concurrency:3,clashPath:''}));
    assert.equal(saved.concurrency,3);
    assert.equal(await p.evaluate(async()=>{try{await window.cs.settingsSave({concurrency:5,clashPath:''});return false}catch{return true}}),true);
    await p.setViewportSize({ width: 800, height: 900 });
    await p.getByRole("button", { name: "打开导航" }).click();
    await p
      .locator("nav")
      .getByRole("button", { name: /发布中心/ })
      .click();
    await p.getByRole("heading", { name: "一稿多发", exact: true }).waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    fs.mkdirSync("out/qa", { recursive: true });
    await p.screenshot({ path: "out/qa/publish-narrow.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Electron isolated UI; four pages, draft persistence, empty account disable, narrow navigation, no horizontal overflow, no page errors",
    );
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
