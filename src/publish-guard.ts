import type { AccountPlatform, PlatformAccount } from "./types";

const STORAGE_KEY = "cs-work.lastPublishByPlatform.v1";
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours recommended stagger

type LastPublishRecord = {
  accountId: string;
  accountName: string;
  at: number;
};

function readMap(): Record<string, LastPublishRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function checkAndRecordPublishStagger(
  account: PlatformAccount,
): string {
  const map = readMap();
  const prev = map[account.platform as AccountPlatform];
  let warning = "";
  if (
    prev &&
    prev.accountId !== account.id &&
    Date.now() - prev.at < COOLDOWN_MS
  ) {
    const mins = Math.max(1, Math.round((Date.now() - prev.at) / 60000));
    warning = `防限流提醒：同平台「${prev.accountName}」在 ${mins} 分钟前刚打开发布页，建议错峰 1–2 小时发片`;
  }
  map[account.platform] = {
    accountId: account.id,
    accountName: account.name,
    at: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
  return warning;
}
