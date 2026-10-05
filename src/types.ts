export type Section =
  | "today"
  | "projects"
  | "article"
  | "video"
  | "library"
  | "publish"
  | "settings";
export type DocKey = "brief" | "article" | "script" | "shotlist" | "publish";
export type Branch = "article" | "video" | "publish";
export type Status =
  "准备中" | "草稿" | "待核查" | "可导出" | "已导出" | "已上传" | "已发布";
export interface Config {
  workspace: string;
  library: string;
  projects: string[];
}
export interface ProjectSummary {
  path: string;
  title: string;
  audience: string;
  platforms: string[];
  platformStatus: Record<string, Status>;
  status: Record<Branch, Status>;
  updatedAt: string;
  managed: boolean;
}
export interface SelectedAsset {
  id: string;
  kind: string;
  title: string;
  path: string;
  license: string;
  sha256: string;
}
export interface Project extends ProjectSummary {
  docs: Record<DocKey, string>;
  sources: unknown;
  selection: SelectedAsset[];
  video: string;
}
export interface Asset {
  id: string;
  title: string;
  kind: "audio" | "font" | "netease";
  category: string;
  rights: string;
  use: string;
  tags: string[];
  duration?: number;
  recommended?: boolean;
  style?: string;
  family?: string;
}
export interface Preset {
  id: string;
  name: string;
  scene: string;
  description: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  font_ids: Record<string, string>;
  colors: Record<string, string>;
  note: string;
}
export interface Catalog {
  connected: boolean;
  audio: Asset[];
  fonts: Asset[];
  presets: Preset[];
  netease: Asset[];
}
export interface QA {
  checkedAt: string;
  issues: { branch: string; level: string; message: string }[];
  video: null | {
    duration: number;
    streams: { codec: string; type: string; width?: number; height?: number }[];
  };
}
export interface Bootstrap {
  config: Config;
  projects: ProjectSummary[];
  catalog: Catalog;
  tools: Record<string, string>;
}
export interface CSBridge {
  bootstrap(): Promise<Bootstrap>;
  chooseSetting(
    kind: "workspace" | "library",
  ): Promise<{
    config: Config;
    catalog: Catalog;
    projects: ProjectSummary[];
  } | null>;
  createProject(input: {
    title: string;
    audience: string;
    platforms: string[];
  }): Promise<ProjectSummary>;
  importProject(): Promise<ProjectSummary | null>;
  listProjects(): Promise<ProjectSummary[]>;
  readProject(root: string): Promise<Project>;
  saveDocument(
    root: string,
    key: DocKey,
    content: string,
  ): Promise<ProjectSummary>;
  updateStatus(
    root: string,
    branch: Branch,
    status: Status,
  ): Promise<ProjectSummary>;
  updatePlatformStatus(
    root: string,
    platform: string,
    status: Status,
  ): Promise<ProjectSummary>;
  runQA(root: string): Promise<QA>;
  exportProject(
    root: string,
    type: "article" | "video",
  ): Promise<{ folder: string; zip: string }>;
  handoff(root: string): Promise<string>;
  catalog(): Promise<Catalog>;
  previewAsset(
    id: string,
  ): Promise<{ dataUrl: string; title: string; kind: string }>;
  addAsset(root: string, id: string): Promise<SelectedAsset[]>;
  copy(text: string): Promise<boolean>;
  openTarget(
    root: string,
    target: "project" | "article" | "script" | "video" | "outputs",
  ): Promise<boolean>;
  openLibrary(): Promise<boolean>;
}
declare global {
  interface Window {
    cs: CSBridge;
  }
}
