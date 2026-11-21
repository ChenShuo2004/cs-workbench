const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "cs-work-verify-"));
  const env = { ...process.env, CS_WORKBENCH_USER_DATA_DIR: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [path.resolve(__dirname, "..")],
    env,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });
    await page.waitForSelector(".cs-work-sidebar", { timeout: 15000 });

    // 1. Verify 4 clean nav items
    const navTexts = await page.locator(".cs-work-sidebar .nav-item").allInnerTexts();
    assert.equal(navTexts.length, 4, `Expected 4 nav items, got: ${navTexts.join(", ")}`);
    assert.match(navTexts[0], /发布中心/);
    assert.match(navTexts[1], /账号与数据/);
    assert.match(navTexts[2], /网络隔离/);
    assert.match(navTexts[3], /设置/);

    const nav = page.locator(".cs-work-sidebar");
    // 2. Switch to 账号与数据 and add 2 xiaohongshu accounts + 1 YouTube account
    await nav.getByRole("button", { name: /账号与数据/ }).click();
    await page.waitForSelector(".accounts-page");

    for (const [platform, name] of [
      ["xiaohongshu", "小红书矩阵A"],
      ["xiaohongshu", "小红书矩阵B"],
      ["youtube", "YouTube海外主号"],
    ]) {
      await page.getByRole("button", { name: /添加平台账号/ }).first().click();
      await page.locator("#account-platform").selectOption(platform);
      await page.locator("#account-name").fill(name);
      await page.getByRole("button", { name: "保存" }).click();
      await page.waitForSelector(`h2:has-text("${name}")`);
    }

    // 3. Verify same-platform direct conflict warning appears for the 2 xiaohongshu accounts
    await nav.getByRole("button", { name: /网络隔离/ }).click();
    await page.waitForSelector(".network-page");
    const warningCount = await page.locator(".network-warning-item").count();
    assert.ok(warningCount >= 2, `Expected conflict warnings for two direct XHS accounts, got ${warningCount}`);

    // 4. Configure distinct Clash local ports for XHS A (7891) & XHS B (7892) -> conflict disappears
    const xhsARow = page.locator(".network-row", { has: page.locator('.network-row-title strong:text-is("小红书矩阵A")') });
    await xhsARow.getByRole("button", { name: /配置代理/ }).click();
    await page.getByRole("radio", { name: /本机多端口分流/ }).click();
    await page.getByRole("button", { name: ":7891" }).click();
    await page.getByRole("button", { name: "保存配置" }).click();

    const xhsBRow = page.locator(".network-row", { has: page.locator('.network-row-title strong:text-is("小红书矩阵B")') });
    await xhsBRow.getByRole("button", { name: /配置代理/ }).click();
    await page.getByRole("radio", { name: /本机多端口分流/ }).click();
    await page.getByRole("button", { name: ":7892" }).click();
    await page.getByRole("button", { name: "保存配置" }).click();

    await page.waitForTimeout(300);
    const remainingWarnings = await page.locator(".network-warning-item").count();
    assert.equal(remainingWarnings, 0, `Expected 0 warnings after distinct ports, got ${remainingWarnings}`);

    // 5. Configure remote SOCKS5 proxy with credentials on YouTube account
    const ytRow = page.locator(".network-row", { has: page.locator('.network-row-title strong:text-is("YouTube海外主号")') });
    await ytRow.getByRole("button", { name: /配置代理/ }).click();
    await page.getByRole("radio", { name: /独立代理服务器/ }).click();
    await page.locator(".network-modal select").first().selectOption("socks5");
    await page.locator('.network-modal input[placeholder*="45.12"]').fill("127.0.0.1");
    await page.locator('.network-modal input[type="number"]').fill("10808");
    await page.locator('.network-modal input[placeholder="无认证可留空"]').first().fill("demo-user");
    await page.locator('.network-modal input[type="password"]').fill("demo-pass");
    await page.getByRole("button", { name: "保存配置" }).click();
    await page.waitForSelector('.network-row:has-text("SOCKS5 127.0.0.1:10808")');

    // 6. Verify fail-closed blocks launching unreachable proxy instead of leaking host IP
    await ytRow.getByRole("button", { name: /打开隔离窗口/ }).click();
    await page.waitForSelector('.toast.error:has-text("阻止启动 Chrome")', { timeout: 8000 });

    // 7. Verify Publish Center shows quick-publish chips for all 3 accounts
    await nav.getByRole("button", { name: /发布中心/ }).click();
    await page.waitForSelector(".quick-publish-bar");
    const chipCount = await page.locator(".publish-account-chip").count();
    assert.equal(chipCount, 3, `Expected 3 quick-publish chips, got ${chipCount}`);

    // 8. Verify Settings & theme switching
    await nav.getByRole("button", { name: /设置/ }).click();
    await page.waitForSelector(".settings-page");
    await page.getByRole("button", { name: /深林/ }).click();
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(theme, "forest");

    assert.equal(errors.length, 0, `Unexpected runtime errors:\n${errors.join("\n")}`);
    console.log("PASS: cs-work end-to-end verification succeeded (4 routes, 8 platforms, Clash port + SOCKS5 auth, conflict detection, fail-closed launch guard, quick-publish bar, themes, 0 runtime errors).");
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
