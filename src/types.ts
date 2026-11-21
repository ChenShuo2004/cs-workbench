export type Section = "publish" | "accounts" | "network" | "settings";

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

export interface MaitianFrame {
  installed: boolean;
  connected: boolean;
  frameUrl: string;
  root: string;
  error: string;
}

export interface AppInfo {
  version: string;
  userDataPath: string;
  maitianRoot: string;
  encryptionAvailable: boolean;
}

export interface CSBridge {
  appInfo(): Promise<AppInfo>;

  maitianRead(): Promise<MaitianFrame>;
  maitianConnect(): Promise<MaitianFrame | null>;
  maitianOpen(): Promise<void>;

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
  readAccountData(
    id: string,
    options?: { navigateToData?: boolean },
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
