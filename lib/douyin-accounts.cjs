const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PLATFORMS = require("../shared/account-platforms.json");
const CREATOR_URL = PLATFORMS.douyin.url;
function platformFor(value = "douyin") {
  if (typeof value !== "string" || !Object.hasOwn(PLATFORMS, value))
    throw new Error("不支持的平台，请重新选择");
  return PLATFORMS[value];
}
function accountName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 40)
    throw new Error("请填写 1–40 字的账号备注");
  return value.trim();
}
function partitionFor(id, platform = "douyin") {
  platformFor(platform);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new Error("无效账号标识");
  return `persist:${platform}-${id}`;
}
function isPlatformURL(value, platform = "douyin") {
  try {
    const config = platformFor(platform);
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      config.hosts.some((host) => url.hostname === host ||
        (config.subdomains && url.hostname.endsWith(`.${host}`)))
    );
  } catch {
    return false;
  }
}
const isDouyinURL = (value) => isPlatformURL(value, "douyin");
function createAccountStore(userData) {
  // Keep the existing file and Douyin partition names to preserve local sessions.
  const file = path.join(userData, "douyin-accounts.json");
  let accounts = [];
  if (fs.existsSync(file)) {
    accounts = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(accounts)) throw new Error("平台账号配置格式错误");
    const ids = new Set();
    for (const account of accounts) {
      account.platform ??= "douyin";
      partitionFor(account.id, account.platform);
      accountName(account.name);
      if (ids.has(account.id)) throw new Error("平台账号标识重复");
      ids.add(account.id);
    }
  }
  function save(next) {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(`${file}.tmp`, file);
    accounts = next;
  }
  function get(id) {
    const account = accounts.find((item) => item.id === id);
    if (!account) throw new Error("账号不存在，请刷新账号列表");
    return { ...account };
  }
  return {
    list: () => accounts.map((item) => ({ ...item })),
    get,
    add(name, platform = "douyin") {
      platformFor(platform);
      const account = {
        id: crypto.randomUUID(),
        platform,
        name: accountName(name),
        createdAt: new Date().toISOString(),
        lastOpenedAt: "",
      };
      save([...accounts, account]);
      return { ...account };
    },
    rename(id, name) {
      const account = { ...get(id), name: accountName(name) };
      save(accounts.map((item) => (item.id === id ? account : item)));
      return { ...account };
    },
    opened(id, browser) {
      const account = { ...get(id), lastOpenedAt: new Date().toISOString() };
      if (browser === "chrome") account.lastBrowserOpenedAt = account.lastOpenedAt;
      save(accounts.map((item) => (item.id === id ? account : item)));
    },
    remove(id) {
      get(id);
      save(accounts.filter((item) => item.id !== id));
    },
  };
}
module.exports = { PLATFORMS, platformFor, CREATOR_URL, partitionFor, isPlatformURL, isDouyinURL, createAccountStore };
