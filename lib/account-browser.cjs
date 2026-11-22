const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const { partitionFor, platformFor } = require("./douyin-accounts.cjs");
const { createChromeCdpPipe } = require("./chrome-cdp-pipe.cjs");
const { chromeIsolationOptions } = require("./network-isolation.cjs");

function browserProfile(userData, account) {
  const key = partitionFor(account.id, account.platform).replace(
    "persist:",
    "",
  );
  return path.join(userData, "account-browsers", key);
}

function chromePath() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    path.join(
      os.homedir(),
      "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ),
  ];
  const found = candidates.find((file) => fs.existsSync(file));
  if (!found)
    throw new Error(
      "未找到 Google Chrome，请先安装 Chrome 后再打开平台后台。原有账号数据未改变。",
    );
  return found;
}

function targetUrlFor(account, target = "home") {
  const cfg = platformFor(account.platform);
  if (target === "publish" && cfg.publishUrl) return cfg.publishUrl;
  if (target === "data" && cfg.dataUrl) return cfg.dataUrl;
  return cfg.url;
}

function launchArguments(
  userData,
  account,
  { target = "home", proxyUrlOverride = "", withPipe = false } = {},
) {
  const isolation = chromeIsolationOptions(account.network, proxyUrlOverride);
  const args = [
    `--user-data-dir=${browserProfile(userData, account)}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...isolation.args,
  ];
  if (withPipe) args.push("--remote-debugging-pipe");
  args.push(`--app=${targetUrlFor(account, target)}`);
  return args;
}

function createAccountBrowser(
  userData,
  { findChrome = chromePath, spawnBrowser = spawn } = {},
) {
  const opening = new Map();
  const dataSessions = new Map();
  const activeFingerprints = new Map();

  // Only signal a process whose actual command line includes this exact profile.
  // Chromium's singleton lock survives workbench restarts; never trust a PID alone.
  async function processFor(account) {
    const profile = browserProfile(userData, account);
    let lock;
    try {
      lock = await fs.promises.readlink(path.join(profile, "SingletonLock"));
    } catch (e) {
      if (["ENOENT", "EINVAL"].includes(e.code)) return null;
      throw e;
    }
    const pid = Number(lock.match(/-(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(pid) || pid <= 1) {
      throw new Error("浏览器会话锁无法识别，请先退出该账号的 Chrome 窗口。");
    }
    let command;
    try {
      command = (
        await run("/bin/ps", [
          "-p",
          String(pid),
          "-o",
          "stat=",
          "-o",
          "command=",
        ])
      ).stdout.trim();
    } catch {
      return null;
    }
    if (/^Z/.test(command)) return null;
    const marker = `--user-data-dir=${profile}`;
    if (
      !command.includes("/Google Chrome.app/Contents/MacOS/Google Chrome ") ||
      !(command.endsWith(marker) || command.includes(`${marker} --`))
    ) {
      throw new Error("浏览器会话正在使用中，请先退出该账号的 Chrome 窗口。");
    }
    return pid;
  }

  async function close(account) {
    if (opening.has(account.id)) await opening.get(account.id);
    const attached = dataSessions.get(account.id);
    if (attached) {
      attached.pipe.dispose();
      dataSessions.delete(account.id);
    }
    const pid = await processFor(account);
    if (pid) {
      // Ask only this verified macOS application process to quit normally.
      // SIGTERM can interrupt Chromium before Cookie/Local Storage writes finish.
      await run("/usr/bin/osascript", [
        "-l",
        "JavaScript",
        "-e",
        `ObjC.import('AppKit'); var target = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}); if (!target || !target.terminate) throw new Error('无法退出账号浏览器');`,
      ]);
      const deadline = Date.now() + 8000;
      while (await processFor(account)) {
        if (Date.now() >= deadline) {
          throw new Error(
            "该账号 Chrome 窗口尚未退出，登录数据未清除。请退出后重试。",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    activeFingerprints.delete(account.id);
  }

  async function migrateLegacyProfileIfNeeded(account) {
    const profile = browserProfile(userData, account);
    if (fs.existsSync(profile)) return;
    const key = path.basename(profile);
    const legacy = path.join(
      path.dirname(userData),
      "CS 工作台 Pro",
      "account-browsers",
      key,
    );
    if (legacy === profile || !fs.existsSync(legacy)) return;
    try {
      const lock = await fs.promises.readlink(
        path.join(legacy, "SingletonLock"),
      );
      const pid = Number(lock.match(/-(\d+)$/)?.[1]);
      if (Number.isSafeInteger(pid) && pid > 1) {
        try {
          const cmd = (
            await run("/bin/ps", [
              "-p",
              String(pid),
              "-o",
              "stat=",
              "-o",
              "command=",
            ])
          ).stdout.trim();
          if (
            cmd &&
            !/^Z/.test(cmd) &&
            cmd.includes(`--user-data-dir=${legacy}`)
          ) {
            throw new Error(
              "该账号的旧版 Chrome 窗口仍在运行，请先关闭该窗口后再从 cs-work 打开以完成会话迁移。",
            );
          }
        } catch (err) {
          if (err?.message?.includes("旧版 Chrome")) throw err;
        }
      }
    } catch (e) {
      if (e?.message?.includes("旧版 Chrome")) throw e;
      if (!["ENOENT", "EINVAL"].includes(e?.code)) throw e;
    }
    const staging = `${profile}.migrating-${process.pid}`;
    await fs.promises.rm(staging, { recursive: true, force: true });
    await fs.promises.mkdir(path.dirname(profile), {
      recursive: true,
      mode: 0o700,
    });
    await fs.promises.cp(legacy, staging, {
      recursive: true,
      filter: (src) =>
        ![
          "SingletonLock",
          "SingletonSocket",
          "SingletonCookie",
          "RunningChromeVersion",
        ].includes(path.basename(src)),
    });
    await fs.promises.rename(staging, profile);
  }

  return {
    isDataConnected(id) {
      return dataSessions.get(id)?.child.exitCode === null;
    },
    async open(account, { target = "home", proxyUrlOverride = "" } = {}) {
      if (opening.has(account.id)) return opening.get(account.id);
      const isolation = chromeIsolationOptions(
        account.network,
        proxyUrlOverride,
      );
      const desiredUrl = targetUrlFor(account, target);

      // If network settings changed since this account's Chrome was launched, restart it cleanly
      // so the new proxy / WebRTC / timezone isolation actually takes effect.
      const prevFingerprint = activeFingerprints.get(account.id);
      if (prevFingerprint && prevFingerprint !== isolation.fingerprint) {
        await close(account);
        const old = dataSessions.get(account.id);
        if (old) {
          old.pipe.dispose();
          dataSessions.delete(account.id);
        }
      }

      const attached = dataSessions.get(account.id);
      if (attached && attached.child.exitCode === null) {
        if (
          target === "home" &&
          (await attached.pipe.activatePlatformPage(
            platformFor(account.platform).hosts,
          ))
        )
          return;
        if (
          target !== "home" &&
          (await attached.pipe.navigatePlatformPage(
            platformFor(account.platform).hosts,
            desiredUrl,
          ))
        )
          return;
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
        if (await processFor(account))
          throw new Error(
            "该账号仍有旧版窗口，请先关闭此账号窗口，再重新打开以连接自动化管道。",
          );
        const args = launchArguments(userData, account, {
          target,
          proxyUrlOverride,
          withPipe: true,
        });
        args.unshift(
          `--window-name=Kaige · ${account.platform} · ${account.name}`,
        );
        const child = spawnBrowser(executable, args, {
          detached: false,
          stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
          shell: false,
          env: { ...process.env, ...isolation.env },
        });
        const pipe = createChromeCdpPipe(child);
        await new Promise((resolve, reject) => {
          child.once("error", (e) =>
            reject(new Error(`Chrome 启动失败：${e.message}`)),
          );
          child.once("spawn", resolve);
        });
        dataSessions.set(account.id, { child, pipe });
        activeFingerprints.set(account.id, isolation.fingerprint);
      })();
      opening.set(account.id, task);
      try {
        await task;
      } finally {
        opening.delete(account.id);
      }
    },

    async readData(
      account,
      { proxyUrlOverride = "", navigateToData = false, autoClose = true } = {},
    ) {
      const wasOpen = this.isDataConnected(account.id);
      let openedForRead = false;
      try {
        await this.open(account, {
          target: navigateToData ? "data" : "home",
          proxyUrlOverride,
        });
        openedForRead = !wasOpen;
        const attached = dataSessions.get(account.id);
        if (navigateToData)
          await new Promise((resolve) => setTimeout(resolve, 1500));
        let result;
        let lastError;
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            result = await attached.pipe.readPage(
              platformFor(account.platform).hosts,
            );
            break;
          } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        if (!result) throw lastError || new Error("尚未读取到官方后台数据");
        return result;
      } finally {
        if (autoClose && openedForRead) {
          try {
            await close(account);
          } catch {}
        }
      }
    },

    async connection(account) {
      const attached = dataSessions.get(account.id);
      if (!attached || attached.child.exitCode !== null)
        throw new Error("账号窗口尚未连接");
      const hosts = platformFor(account.platform).hosts;
      let target;
      for (let i = 0; i < 30; i++) {
        target = await attached.pipe.findPlatformTarget(hosts);
        if (target) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!target) throw new Error("未找到平台页面，请完成登录");
      const sessionId = await attached.pipe.attachSession(target.targetId);
      return {
        send: (method, params) => attached.pipe.send(method, params, sessionId),
      };
    },
    close,
    async remove(account) {
      await close(account);
      const attached = dataSessions.get(account.id);
      if (attached) {
        attached.pipe.dispose();
        dataSessions.delete(account.id);
      }
      await fs.promises.rm(browserProfile(userData, account), {
        recursive: true,
        force: true,
      });
    },
  };
}

module.exports = {
  browserProfile,
  targetUrlFor,
  launchArguments,
  createAccountBrowser,
};
