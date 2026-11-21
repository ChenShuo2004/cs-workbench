const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { partitionFor, platformFor } = require('./douyin-accounts.cjs');
const { createChromeCdpPipe } = require('./chrome-cdp-pipe.cjs');

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
  const dataSessions = new Map();
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
  async function migrateLegacyProfileIfNeeded(account) {
    const profile = browserProfile(userData, account);
    if (fs.existsSync(profile)) return;
    const key = path.basename(profile);
    const legacy = path.join(path.dirname(userData), 'CS 工作台 Pro', 'account-browsers', key);
    if (legacy === profile || !fs.existsSync(legacy)) return;
    // Check whether an older CS 工作台 Pro Chrome window still holds this profile lock.
    try {
      const lock = await fs.promises.readlink(path.join(legacy, 'SingletonLock'));
      const pid = Number(lock.match(/-(\d+)$/)?.[1]);
      if (Number.isSafeInteger(pid) && pid > 1) {
        try {
          const cmd = (await run('/bin/ps', ['-p', String(pid), '-o', 'stat=', '-o', 'command='])).stdout.trim();
          if (cmd && !/^Z/.test(cmd) && cmd.includes(`--user-data-dir=${legacy}`)) {
            throw new Error('该账号的旧版 Chrome 窗口仍在运行，请先关闭该窗口后再从 cs-work 打开以完成会话迁移。');
          }
        } catch (err) {
          if (err?.message?.includes('旧版 Chrome')) throw err;
        }
      }
    } catch (e) {
      if (e?.message?.includes('旧版 Chrome')) throw e;
      if (!['ENOENT', 'EINVAL'].includes(e?.code)) throw e;
    }
    const staging = `${profile}.migrating-${process.pid}`;
    await fs.promises.rm(staging, { recursive: true, force: true });
    await fs.promises.mkdir(path.dirname(profile), { recursive: true, mode: 0o700 });
    await fs.promises.cp(legacy, staging, {
      recursive: true,
      filter: (src) => !['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'RunningChromeVersion'].includes(path.basename(src)),
    });
    await fs.promises.rename(staging, profile);
  }
  return {
    isDataConnected(id) {
      return dataSessions.get(id)?.child.exitCode === null;
    },
    async open(account) {
      if (opening.has(account.id)) return opening.get(account.id);
      const attached = dataSessions.get(account.id);
      if (attached && attached.child.exitCode === null) {
        if (await attached.pipe.activatePlatformPage(platformFor(account.platform).hosts)) return;
        await close(account);
        attached.pipe.dispose();
        dataSessions.delete(account.id);
      }
      if (attached) {
        attached.pipe.dispose();
        dataSessions.delete(account.id);
      }
      const task = (async () => {
        const executable = findChrome();
        await migrateLegacyProfileIfNeeded(account);
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
    async readData(account) {
      let attached = dataSessions.get(account.id);
      if (!attached || attached.child.exitCode !== null) {
        if (attached) {
          attached.pipe.dispose();
          dataSessions.delete(account.id);
        }
        // The standard login window has no automation endpoint. Close only this
        // account's verified Chrome process, then reopen its same isolated profile
        // with a private stdio pipe for read-only DOM inspection.
        await close(account);
        const executable = findChrome();
        await migrateLegacyProfileIfNeeded(account);
        const profile = browserProfile(userData, account);
        await fs.promises.mkdir(profile, { recursive: true, mode: 0o700 });
        const child = spawnBrowser(executable, [
          `--user-data-dir=${profile}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--remote-debugging-pipe',
          `--app=${platformFor(account.platform).url}`,
        ], {
          detached: true,
          stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
          shell: false,
        });
        const started = new Promise((resolve, reject) => {
          let timer;
          child.once('error', (error) => { clearTimeout(timer); reject(new Error(`Chrome 数据窗口启动失败：${error.message}`)); });
          child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome 数据窗口未能启动（${code}），账号登录数据仍保留。`)); });
          child.once('spawn', () => { timer = setTimeout(resolve, 800); });
        });
        try {
          await started;
          child.stdio[2]?.resume();
          child.unref();
          const pipe = createChromeCdpPipe(child);
          attached = { child, pipe };
          dataSessions.set(account.id, attached);
        } catch (error) {
          try { child.kill(); } catch {}
          throw error;
        }
      }

      let result;
      let lastError;
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          result = await attached.pipe.readPage(platformFor(account.platform).hosts);
          break;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!result) throw lastError || new Error('尚未读取到官方后台数据');
      return result;
    },
    close,
    async remove(account) {
      // Caller must have obtained the existing account-removal confirmation.
      await close(account);
      const attached = dataSessions.get(account.id);
      if (attached) {
        attached.pipe.dispose();
        dataSessions.delete(account.id);
      }
      await fs.promises.rm(browserProfile(userData, account), { recursive: true, force: true });
    },
  };
}
module.exports = { browserProfile, launchArguments, createAccountBrowser };
