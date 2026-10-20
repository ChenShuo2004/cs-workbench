const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { partitionFor, platformFor } = require('./douyin-accounts.cjs');

function browserProfile(userData, account) {
  const key = partitionFor(account.id, account.platform).replace('persist:', '');
  return path.join(userData, 'account-browsers', key);
}
function chromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  ];
  const found = candidates.find(file => fs.existsSync(file));
  if (!found) throw new Error('未找到 Google Chrome，请先安装 Chrome 后再打开平台后台。原有账号数据未改变。');
  return found;
}
function launchArguments(userData, account) {
  return [
    `--user-data-dir=${browserProfile(userData, account)}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--app=${platformFor(account.platform).url}`,
  ];
}
function createAccountBrowser(userData, { findChrome = chromePath, spawnBrowser = spawn } = {}) {
  const opening = new Map();
  // Only signal a process whose actual command line includes this exact profile.
  // Chromium's singleton lock survives workbench restarts; never trust a PID alone.
  async function processFor(account) {
    const profile = browserProfile(userData, account);
    let lock;
    try { lock = await fs.promises.readlink(path.join(profile, 'SingletonLock')); }
    catch (e) { if (['ENOENT','EINVAL'].includes(e.code)) return null; throw e; }
    const pid = Number(lock.match(/-(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('浏览器会话锁无法识别，请先退出该账号的 Chrome 窗口。');
    let command;
    try { command = (await run('/bin/ps', ['-p', String(pid), '-o', 'stat=', '-o', 'command='])).stdout.trim(); }
    catch { return null; }
    if (/^Z/.test(command)) return null;
    const marker = `--user-data-dir=${profile}`;
    if (!command.includes('/Google Chrome.app/Contents/MacOS/Google Chrome ') ||
        !(command.endsWith(marker) || command.includes(`${marker} --`)))
      throw new Error('浏览器会话正在使用中，请先退出该账号的 Chrome 窗口。');
    return pid;
  }
  async function close(account) {
      if (opening.has(account.id)) await opening.get(account.id);
      const pid = await processFor(account);
      if (pid) {
        // Ask only this verified macOS application process to quit normally.
        // SIGTERM can interrupt Chromium before Cookie/Local Storage writes finish.
        await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
          `ObjC.import('AppKit'); var target = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}); if (!target || !target.terminate) throw new Error('无法退出账号浏览器');`,
        ]);
        const deadline = Date.now() + 8000;
        while (await processFor(account)) {
          if (Date.now() >= deadline) throw new Error('该账号 Chrome 窗口尚未退出，登录数据未清除。请退出后重新移除。');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
  }
  return {
    async open(account) {
      if (opening.has(account.id)) return opening.get(account.id);
      const task = (async () => {
        const executable = findChrome();
        const profile = browserProfile(userData, account);
        await fs.promises.mkdir(profile, { recursive: true, mode: 0o700 });
        await new Promise((resolve, reject) => {
          const child = spawnBrowser(executable, launchArguments(userData, account), {
            detached: true, stdio: 'ignore', shell: false,
          });
          let timer;
          child.once('error', error => { clearTimeout(timer); reject(new Error(`Chrome 启动失败：${error.message}`)); });
          child.once('exit', code => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(`Chrome 未能打开账号窗口（${code}），请关闭该账号窗口后重试。`));
          });
          child.once('spawn', () => {
            timer = setTimeout(resolve, 1000);
            child.unref();
          });
        });
      })();
      opening.set(account.id, task);
      try { await task; } finally { opening.delete(account.id); }
    },
    close,
    async remove(account) {
      // Caller must have obtained the existing account-removal confirmation.
      await close(account);
      await fs.promises.rm(browserProfile(userData, account), { recursive: true, force: true });
    },
  };
}
module.exports = { browserProfile, launchArguments, createAccountBrowser };
