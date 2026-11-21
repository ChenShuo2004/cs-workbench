// Legacy embedded-window compatibility test; not Chrome login acceptance.
// npm run build && node scripts/verify-platforms.cjs
// Temporary profile only: never opens or modifies personal login sessions.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PLATFORMS } = require('../lib/douyin-accounts.cjs');
const repo = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-platforms-qa-'));
fs.writeFileSync(path.join(temporary, 'config.json'), JSON.stringify({workspace: path.join(temporary, 'projects'), library: '', projects: []}));
const evidence = path.join(repo, 'out/platforms-qa');
fs.mkdirSync(evidence, { recursive: true });
const report = { checkedAt: new Date().toISOString(), checks: [], pages: [], loginVerified: false };
let app;
async function launch() {
  app = await electron.launch({ executablePath: process.env.CS_PACKAGED_EXECUTABLE || require('electron'), args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [repo], env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: temporary }, timeout: 30000 });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: '展开分发交接', exact: true }).click();
  await page.getByRole('button', { name: '平台账号', exact: true }).click();
  await page.getByText('打开窗口不代表登录成功', { exact: false }).waitFor();
  return page;
}
(async () => {
  let page = await launch();
  for (const [id, config] of Object.entries(PLATFORMS)) {
    await page.getByRole('button', { name: '添加平台账号', exact: true }).first().click();
    await page.getByLabel('平台', { exact: true }).selectOption(id);
    await page.getByLabel('账号备注', { exact: true }).fill(`QA${config.name}`);
    if (id === 'xiaohongshu') await page.screenshot({ path: path.join(evidence, 'platform-picker.png') });
    await page.getByRole('button', { name: '保存备注', exact: true }).click();
    await page.getByRole('heading', { name: `QA${config.name}`, exact: true }).waitFor();
  }
  const accounts = await page.evaluate(() => window.cs.listDouyinAccounts());
  assert.deepEqual(accounts.map(a => a.platform), Object.keys(PLATFORMS));
  report.checks.push('All four platforms can be selected and saved through the UI');
  for (const a of accounts) {
    const next = app.waitForEvent('window');
    await page.evaluate(id => window.cs.openDouyinAccount(id), a.id);
    const backend = await next;
    const config = PLATFORMS[a.platform];
    try {
      await backend.waitForURL(url => url.hostname === new URL(config.url).hostname, { timeout: 20000 });
      await backend.waitForLoadState('domcontentloaded', { timeout: 20000 });
      // A visible official login affordance is stronger evidence than a load event.
      await backend.getByText(/登录|登入|扫码/).filter({ visible: true }).first().waitFor({ timeout: 20000 });
      if (a.platform === 'wechat') {
        const scan = backend.getByText('扫码登录', { exact: true }).filter({ visible: true });
        if (await scan.count()) await scan.first().click();
      }
      await backend.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
      report.pages.push({ platform: a.platform, url: backend.url(), loginPageVisible: true });
    } catch (e) {
      report.pages.push({ platform: a.platform, url: backend.url(), loginPageVisible: false, error: e.message.slice(0, 250) });
    }
    await backend.screenshot({ path: path.join(evidence, `${a.platform}-official.png`) });
  }
  const isolation = await app.evaluate(async ({ session, BrowserWindow }, accounts) => {
    const values = [];
    for (const a of accounts) {
      const ses = session.fromPartition(`persist:${a.platform}-${a.id}`);
      await ses.cookies.set({ url: 'https://example.com/', name: 'cs_qa_cookie', value: a.platform, expirationDate: Date.now() / 1000 + 3600 });
      await ses.cookies.flushStore();
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.session === ses);
      const prefs = win.webContents.getLastWebPreferences();
      values.push({ cookie: (await ses.cookies.get({name: 'cs_qa_cookie'}))[0].value, sandbox: prefs.sandbox, node: prefs.nodeIntegration, preload: prefs.preload || '' });
    }
    return values;
  }, accounts);
  assert.deepEqual(isolation.map(v => v.cookie), accounts.map(a => a.platform));
  isolation.forEach(v => { assert.equal(v.sandbox, true); assert.equal(v.node, false); assert.equal(v.preload, ''); });
  const count = app.windows().length;
  await page.evaluate(id => window.cs.openDouyinAccount(id), accounts[1].id);
  assert.equal(app.windows().length, count);

  await page.screenshot({ path: path.join(evidence, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(evidence, 'mobile.png') });
  report.checks.push('Isolated secure windows, focus reuse, four distinct cookies, desktop and 390px layouts');
  await app.close(); app = null;
  page = await launch();
  assert.deepEqual((await page.evaluate(() => window.cs.listDouyinAccounts())).map(a => a.platform), accounts.map(a => a.platform));
  const cookies = async () => app.evaluate(async ({ session }, accounts) => Promise.all(accounts.map(async a => (await session.fromPartition(`persist:${a.platform}-${a.id}`).cookies.get({name: 'cs_qa_cookie'})).map(c => c.value))), accounts);
  assert.deepEqual(await cookies(), accounts.map(a => [a.platform]));
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({response: 0}); });
  assert.equal(await page.evaluate(id => window.cs.removeDouyinAccount(id), accounts[2].id), false);
  assert.equal((await page.evaluate(() => window.cs.listDouyinAccounts())).length, 4);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({response: 1}); });
  assert.equal(await page.evaluate(id => window.cs.removeDouyinAccount(id), accounts[2].id), true);
  assert.deepEqual(await cookies(), [['douyin'], ['xiaohongshu'], [], ['wechat']]);
  report.checks.push('Full restart retains platform metadata and cookies; cancel retains account; removing Channels clears only its session');
  fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  fs.rmSync(temporary, { recursive: true, force: true });
});
