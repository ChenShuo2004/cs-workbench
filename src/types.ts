export type Section = "dashboard" | "publish" | "accounts" | "network" | "settings";

export type AccountPlatform =
  | "douyin"
  | "xiaohongshu"
  | "channels"
  | "wechat"
  | "bilibili"
  | "youtube"
  | "x"
  | "instagram";

export type BrowserTarget = "home" | "publish" | "data";

export type NetworkMode = "direct" | "local_port" | "proxy";
export type ProxyProtocol = "http" | "https" | "socks5";

export interface AccountNetworkConfig {
  mode: NetworkMode;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  failClosed: boolean;
  blockWebRtc: boolean;
  timezone: string;
  lang: string;
  label: string;
}

export interface AccountNetworkInput extends Partial<AccountNetworkConfig> {
  password?: string;
  clearPassword?: boolean;
}

export interface NetworkCheckResult {
  ok: boolean;
  ip: string;
  country: string;
  region: string;
  city: string;
  isp: string;
  latencyMs: number;
  checkedAt: string;
  error: string;
}

export interface AccountKpis {
  followers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
}

export interface AccountDataSnapshot {
  capturedAt: string;
  profileName: string;
  accountId: string;
  avatarDataUrl: string;
  pageHeading: string;
  pageTitle: string;
  metrics: string[];
  kpis: AccountKpis;
  deltas?: Partial<AccountKpis> | null;
  history?: { capturedAt: string; kpis: AccountKpis }[];
}

export interface PlatformAccount {
  id: string;
  platform: AccountPlatform;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
  lastBrowserOpenedAt?: string;
  network: AccountNetworkConfig;
  lastNetworkCheck?: NetworkCheckResult | null;
  networkWarnings: string[];
  error: string;
  dataConnected: boolean;
  dataSnapshot?: AccountDataSnapshot | null;
  dataError?: string;
}

export interface PostDraft {
  title: string;
  body: string;
  topics: string;
  video: string;
  covers: Record<string, string>;
  overrides: Record<string, Partial<PostDraft>>;
}
export interface PostDraftItem {
  id: string;
  name: string;
  updatedAt: string;
  draft: PostDraft;
}
export interface PostRecord {
  id: string;
  accountId: string;
  name: string;
  platform: AccountPlatform;
  status: string;
  logs: string[];
  createdAt: string;
  url?: string;
}
export interface PostState {
  draft: PostDraft;
  activeDraftId?: string;
  drafts?: PostDraftItem[];
  records: PostRecord[];
}
export interface MediaFileInfo {
  exists: boolean;
  name: string;
  sizeBytes: number;
  ext: string;
  previewDataUrl: string;
}
export interface ClashReadResult {
  file: string;
  error: string;
  socketAvailable?: boolean;
  listeners: { name: string; port: number; proxy: string }[];
}
export interface AppInfo {
  version: string;
  userDataPath: string;
  encryptionAvailable: boolean;
}

export interface CSBridge {
  appInfo(): Promise<AppInfo>;

  postsImport(): Promise<PostState | null>;
  pathForFile(file: File): string;
  settingsRead(): Promise<{ concurrency: number; clashPath: string }>;
  settingsSave(value: {
    concurrency: number;
    clashPath: string;
  }): Promise<{ concurrency: number; clashPath: string }>;
  postsRead(): Promise<PostState>;
  postsDraft(d: PostDraft): Promise<PostState>;
  postsDraftCreate(initial?: Partial<PostDraft>): Promise<PostState>;
  postsDraftDuplicate(id?: string): Promise<PostState>;
  postsDraftSelect(id: string): Promise<PostState>;
  postsDraftDelete(id: string): Promise<PostState>;
  postsMediaInfo(filePath: string): Promise<MediaFileInfo>;
  postsStart(d: PostDraft, ids: string[]): Promise<PostState>;
  postsRetry(id: string): Promise<PostState>;
  postsMark(id: string, url: string): Promise<PostState>;
  postsChoose(kind: string): Promise<string>;
  syncAll(): Promise<unknown>;
  closeAll(): Promise<void>;
  clashRead(): Promise<ClashReadResult>;
  clashReload(): Promise<{ ok: boolean; file: string; error: string }>;
  listAccounts(): Promise<PlatformAccount[]>;
  addAccount(
    name: string,
    platform: AccountPlatform,
    network?: AccountNetworkInput | null,
  ): Promise<PlatformAccount>;
  renameAccount(id: string, name: string): Promise<PlatformAccount>;
  updateAccountNetwork(
    id: string,
    network: AccountNetworkInput,
  ): Promise<PlatformAccount>;
  checkAccountNetwork(id: string): Promise<NetworkCheckResult>;
  checkAllAccountNetworks(): Promise<Record<string, NetworkCheckResult>>;
  detectLocalProxyPorts(): Promise<number[]>;
  openAccountBrowser(id: string, target?: BrowserTarget): Promise<void>;
  closeAccountBrowser(id: string): Promise<void>;
  readAccountData(
    id: string,
    options?: { navigateToData?: boolean; autoClose?: boolean },
  ): Promise<AccountDataSnapshot>;
  removeAccount(id: string): Promise<boolean>;
  onAccountsChanged(callback: () => void): () => void;

  copy(text: string): Promise<boolean>;
  openUserData(): Promise<boolean>;
}

declare global {
  interface Window {
    cs: CSBridge;
  }
}
