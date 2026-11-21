function createChromeCdpPipe(child) {
  const input = child.stdio[3];
  const output = child.stdio[4];
  if (!input || !output) throw new Error("Chrome 数据通道未建立");

  let nextId = 0;
  let buffer = "";
  let closed = false;
  const pending = new Map();
  const sessions = new Map();

  function finish(error) {
    if (closed) return;
    closed = true;
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }

  output.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let end;
    while ((end = buffer.indexOf("\0")) !== -1) {
      const message = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch {
        continue;
      }
      if (parsed.id) {
        const item = pending.get(parsed.id);
        if (!item) continue;
        pending.delete(parsed.id);
        clearTimeout(item.timer);
        if (parsed.error) item.reject(new Error(parsed.error.message || "Chrome 数据读取失败"));
        else item.resolve(parsed.result || {});
      } else if (parsed.method === "Target.attachedToTarget" && parsed.params?.sessionId) {
        sessions.set(parsed.params.targetInfo.targetId, parsed.params.sessionId);
      }
    }
  });
  output.on("error", (error) => finish(error));
  output.on("close", () => finish(new Error("Chrome 数据通道已关闭")));
  child.once("exit", (code) => finish(new Error(`Chrome 已退出${code == null ? "" : `（${code}）`}`)));

  function send(method, params = {}, sessionId) {
    if (closed) return Promise.reject(new Error("Chrome 数据通道已关闭"));
    const id = ++nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("读取官方后台超时，请确认账号窗口已打开并完成登录"));
      }, 12000);
      pending.set(id, { resolve, reject, timer });
      input.write(`${JSON.stringify(message)}\0`, (error) => {
        if (!error) return;
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async function findPlatformTarget(hosts) {
    const result = await send("Target.getTargets");
    const page = (result.targetInfos || []).find((target) => {
      if (target.type !== "page") return false;
      try {
        const url = new URL(target.url);
        return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
      } catch {
        return false;
      }
    });
    return page || null;
  }

  async function attachSession(targetId) {
    let sessionId = sessions.get(targetId);
    if (!sessionId) {
      const attached = await send("Target.attachToTarget", { targetId, flatten: true });
      sessionId = attached.sessionId;
      sessions.set(targetId, sessionId);
    }
    return sessionId;
  }

  async function navigatePlatformPage(hosts, url) {
    const target = await findPlatformTarget(hosts);
    if (!target) {
      await send("Target.createTarget", { url });
      return true;
    }
    await send("Target.activateTarget", { targetId: target.targetId });
    if (url && target.url !== url) {
      const sessionId = await attachSession(target.targetId);
      await send("Page.navigate", { url }, sessionId);
    }
    return true;
  }

  async function readPage(hosts) {
    const target = await findPlatformTarget(hosts);
    if (!target) throw new Error("未找到该账号的官方后台页面，请先在账号窗口中打开并登录平台后台");
    const sessionId = await attachSession(target.targetId);
    const expression = `(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const lines = (document.body?.innerText || '').split(/\\n+/).map(x => x.trim()).filter(Boolean);
      const wanted = /粉丝|关注者|订阅|获赞|播放|阅读|评论|点赞|收藏|分享|转发|曝光|互动|总浏览|播放量|阅读量|完播|点击率|平均播放|followers|subscribers|views|impressions|likes|comments|bookmarks|saves|shares|engagement/i;
      const numeric = /(?:\\d[\\d,.]*(?:亿|万|k|w|m)?\\+?%?|--|暂无)/i;
      const metricLines = [];
      for (let i = 0; i < lines.length; i++) {
        if (!wanted.test(lines[i])) continue;
        if (lines[i].length > 80) continue;
        if (numeric.test(lines[i])) {
          metricLines.push(lines[i].slice(0, 120));
        } else if (i + 1 < lines.length && lines[i + 1].length <= 28 && numeric.test(lines[i + 1])) {
          metricLines.push((lines[i] + ' ' + lines[++i]).slice(0, 120));
        } else if (i > 0 && lines[i - 1].length <= 28 && numeric.test(lines[i - 1])) {
          metricLines.push((lines[i] + ' ' + lines[i - 1]).slice(0, 120));
        }
        if (metricLines.length >= 40) break;
      }
      const heading = [...document.querySelectorAll('h1,[role=heading]')].find(visible)?.innerText?.trim() || '';
      let accountName = '';
      let accountId = '';
      for (let i = 0; i < lines.length; i++) {
        const nameMatch = lines[i].match(/^(?:账号名称|昵称|视频号名称|公众号名称|UP主|频道名称|Channel)[:：]\\s*(.*)$/i);
        const idMatch = lines[i].match(/^(?:账号ID|抖音号|小红书号|视频号ID|微信号|UID|Handle)[:：]\\s*(.*)$/i);
        if (!accountName && nameMatch) accountName = (nameMatch[1] || lines[i + 1] || '').slice(0, 80);
        if (!accountId && idMatch) accountId = (idMatch[1] || lines[i + 1] || '').slice(0, 80);
      }
      if (!accountName) {
        const nameEl = [...document.querySelectorAll('[class*="nickname"],[class*="user-name"],[class*="username"],[class*="account-name"],[data-testid="SideNav_AccountSwitcher_Button"] span')].find(visible);
        if (nameEl?.innerText?.trim()) accountName = nameEl.innerText.trim().split(/\\n/)[0].slice(0, 80);
      }
      const avatar = [...document.querySelectorAll('img[alt*="头像"],img[alt*="avatar" i],[aria-label*="头像"] img,[class*="avatar"] img')].find(visible);
      const rect = avatar?.getBoundingClientRect();
      const avatarRect = rect && rect.width >= 24 && rect.height >= 24 && rect.width <= 256 && rect.height <= 256
        ? { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height }
        : null;
      return {
        title: document.title || '',
        heading,
        accountName,
        accountId,
        avatarRect,
        metrics: [...new Set(metricLines)],
        url: location.href,
      };
    })()`;
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error("官方后台暂时无法读取，请刷新后台后重试");
    const page = result.result?.value || {};
    if (page.avatarRect) {
      try {
        const avatar = await send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { ...page.avatarRect, scale: 1 },
        }, sessionId);
        if (avatar.data && avatar.data.length < 300000) page.avatarDataUrl = `data:image/png;base64,${avatar.data}`;
      } catch {}
    }
    delete page.avatarRect;
    delete page.url;
    return page;
  }

  async function activatePlatformPage(hosts) {
    const target = await findPlatformTarget(hosts);
    if (!target) return false;
    await send("Target.activateTarget", { targetId: target.targetId });
    return true;
  }

  function dispose() {
    finish(new Error("Chrome 数据通道已关闭"));
    try { input.end(); } catch {}
  }

  return { send, findPlatformTarget, attachSession, readPage, activatePlatformPage, navigatePlatformPage, dispose };
}

module.exports = { createChromeCdpPipe };
