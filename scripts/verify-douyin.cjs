// Legacy embedded-window compatibility test; not Chrome login acceptance.
// Run after npm run build. Requires Playwright on NODE_PATH or installed locally.
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const repo = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cs-douyin-qa-"));
const evidence = path.join(repo, "out", "douyin-qa");
fs.mkdirSync(evidence, { recursive: true });
const entry = path.join(temporary, "entry.cjs");
fs.writeFileSync(
  entry,
  `const {app}=require('electron'); app.setPath('userData',${JSON.stringify(path.join(temporary, "data"))}); require(${JSON.stringify(path.join(repo, "electron/main.cjs"))});`,
);
let app;
const report = {
  checkedAt: new Date().toISOString(),
  checks: [],
  loginVerified: false,
};
async function launch() {
  app = await electron.launch({
    executablePath: require("electron"),
    args: [entry],
    timeout: 30000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.getByRole("button", { name: "展开分发交接", exact: true }).click();
  await page.getByRole("button", { name: "平台账号", exact: true }).click();
  await page
    .getByText("打开窗口不代表登录成功", { exact: false })
    .waitFor();
  return page;
}
async function add(page, name) {
  await page
    .getByRole("button", { name: "添加平台账号", exact: true })
    .first()
    .click();
  await page.getByLabel("账号备注", { exact: true }).fill(name);
  await page.getByRole("button", { name: "保存备注", exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
(async () => {
  let page = await launch();
  await page.screenshot({ path: path.join(evidence, "empty.png") });
  await add(page, "QA主号");
  await add(page, "QA知识分享号");
  let accounts = await page.evaluate(() => window.cs.listDouyinAccounts());
  const [a, b] = accounts;
  const firstWindow = app.waitForEvent("window");
  await page.evaluate(id => window.cs.openDouyinAccount(id), a.id);
  const backendA = await firstWindow;
  const secondWindow = app.waitForEvent("window");
  await page.evaluate(id => window.cs.openDouyinAccount(id), b.id);
  await secondWindow;

  const isolation = await app.evaluate(
    async ({ BrowserWindow, session }, ids) => {
      const first = session.fromPartition(`persist:douyin-${ids[0]}`);
      const second = session.fromPartition(`persist:douyin-${ids[1]}`);
      await first.cookies.set({
        url: "https://creator.douyin.com/",
        name: "cs_qa_cookie",
        value: "account-a",
        expirationDate: Date.now() / 1000 + 3600,
      });
      await second.cookies.set({
        url: "https://creator.douyin.com/",
        name: "cs_qa_cookie",
        value: "account-b",
        expirationDate: Date.now() / 1000 + 3600,
      });
      await first.flushStorageData();
      await second.flushStorageData();
      const windows = BrowserWindow.getAllWindows();
      return {
        distinct: first !== second,
        a: (await first.cookies.get({ name: "cs_qa_cookie" }))[0].value,
        b: (await second.cookies.get({ name: "cs_qa_cookie" }))[0].value,
        remote: windows
          .filter(
            (w) =>
              w.webContents.session === first ||
              w.webContents.session === second,
          )
          .map((w) => {
            const p = w.webContents.getLastWebPreferences();
            return {
              sandbox: p.sandbox,
              contextIsolation: p.contextIsolation,
              nodeIntegration: p.nodeIntegration,
              preload: p.preload || "",
            };
          }),
      };
    },
    [a.id, b.id],
  );
  assert.equal(isolation.distinct, true);
  assert.equal(isolation.a, "account-a");
  assert.equal(isolation.b, "account-b");
  assert.equal(isolation.remote.length, 2);
  for (const prefs of isolation.remote) {
    assert.equal(prefs.sandbox, true);
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.preload, "");
  }
  report.checks.push(
    "two accounts use different real Electron sessions and cookies; remote windows have no preload or Node access",
  );
  const count = app.windows().length;
  await page.evaluate((id) => window.cs.openDouyinAccount(id), a.id);
  assert.equal(app.windows().length, count);
  report.checks.push("reopening an account focuses its existing window");
  await page
    .getByRole("button", { name: `修改${a.name}备注`, exact: true })
    .click();
  await page.getByLabel("账号备注", { exact: true }).fill("QA主号改名");
  await page.getByRole("button", { name: "保存备注", exact: true }).click();
  await page
    .getByRole("heading", { name: "QA主号改名", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(evidence, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(evidence, "mobile.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  report.checks.push("account page fits desktop and 390px widths");
  try {
    await backendA.waitForURL(/creator\.douyin\.com/, { timeout: 10000 });
    await backendA.waitForLoadState("domcontentloaded", { timeout: 20000 });
  } catch {}
  report.creatorPage = { url: backendA.url(), title: await backendA.title() };
  await backendA
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  await backendA.screenshot({
    path: path.join(evidence, "official-backend.png"),
  });
  await app.close();
  app = null;
  page = await launch();
  accounts = await page.evaluate(() => window.cs.listDouyinAccounts());
  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].name, "QA主号改名");
  assert.equal(
    accounts.every((item) => !item.isOpen),
    true,
  );
  const restored = await app.evaluate(
    async ({ session }, ids) =>
      Promise.all(
        ids.map(
          async (id) =>
            (
              await session
                .fromPartition(`persist:douyin-${id}`)
                .cookies.get({ name: "cs_qa_cookie" })
            )[0]?.value,
        ),
      ),
    [a.id, b.id],
  );
  assert.deepEqual(restored, ["account-a", "account-b"]);
  report.checks.push(
    "account metadata and separate persistent cookies survive a full app restart",
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0 });
  });
  assert.equal(
    await page.evaluate((id) => window.cs.removeDouyinAccount(id), a.id),
    false,
  );
  assert.equal(
    (await page.evaluate(() => window.cs.listDouyinAccounts())).length,
    2,
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  assert.equal(
    await page.evaluate((id) => window.cs.removeDouyinAccount(id), a.id),
    true,
  );
  const remaining = await page.evaluate(() => window.cs.listDouyinAccounts());
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, b.id);
  const removedCookies = await app.evaluate(
    async ({ session }, ids) =>
      Promise.all(
        ids.map(async (id) =>
          (
            await session
              .fromPartition(`persist:douyin-${id}`)
              .cookies.get({ name: "cs_qa_cookie" })
          ).map((cookie) => cookie.value),
        ),
      ),
    [a.id, b.id],
  );
  assert.deepEqual(removedCookies, [[], ["account-b"]]);
  report.checks.push(
    "cancel retains the account; confirmed removal clears only that account's cookies",
  );
  fs.writeFileSync(
    path.join(evidence, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  });
