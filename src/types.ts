export type Section =
  | "desk"
  | "health"
  | "content"
  | "tasks"
  | "inbox"
  | "memory"
  | "folders"
  | "agents"
  | "studio"
  | "reunion"
  | "today"
  | "projects"
  | "article"
  | "video"
  | "library"
  | "references"
  | "publish"
  | "settings"
  | "accounts";
export type DocKey = "brief" | "article" | "script" | "shotlist" | "publish";
export type Branch = "article" | "video" | "publish";
export type Status =
  "准备中" | "草稿" | "待核查" | "可导出" | "已导出" | "已上传" | "已发布";
export interface Config {
  videoReferences?: string;
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
export interface VideoReference {
  id: string;
  style: string;
  title: string;
  author: string;
  sourcePrompt: string;
  prompt: string;
  uses: string;
  visual: string;
  workTitle: string;
  checks: string;
  sourceSkill: string;
  localRoute: string;
  category: string;
  evidenceTime: number;
  clipStart: number;
  clipEnd: number;
  available: Record<"video" | "image" | "evidence", boolean>;
}
export interface VideoReferenceCatalog {
  connected: boolean;
  root: string;
  cases: VideoReference[];
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
export type AccountPlatform = "douyin" | "xiaohongshu" | "channels" | "wechat";
// Legacy API name retained for compatibility with existing integrations.
export interface DouyinAccount {
  lastBrowserOpenedAt?: string;
  platform: AccountPlatform;
  id: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
  isOpen: boolean;
  error: string;
}
export interface StudioMedia {
  id: string;
  name: string;
  path: string;
  kind: "video" | "audio" | "image";
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}
export interface StudioClip {
  generationBatchId?: string;
  generationIndex?: number;
  visual?: "scene" | "media";
  prompt?: string;
  voiceId?: string;
  voiceStart?: number;
  muted?: boolean;
  id: string;
  mediaId?: string;
  start: number;
  end: number;
  text: string;
  enabled: boolean;
}
export interface StudioCanvasData {
  groups?: { id: string; title: string; nodeIds: string[] }[];
  generators?: CanvasGenerator[];
  sources?: { id: string; mediaId: string }[];
  edges?: CanvasEdge[];
  generationDraft?: GenerationInput;
  draft?: string;
  positions: Record<string, { x: number; y: number }>;
  notes: { id: string; text: string; x: number; y: number }[];
  view: { x: number; y: number; zoom: number };
}
export type CanvasInputRole =
  | "prompt_text"
  | "image_reference"
  | "first_frame"
  | "last_frame"
  | "reference_image"
  | "reference_video"
  | "reference_audio";
export type CanvasEdge = {
  alias?: string;
  id: string;
  from: string;
  to: string;
  role: CanvasInputRole;
};
export type CanvasGenerator = {
  id: string;
  kind: "image" | "video";
  title: string;
  prompt: string;
  mode: "frames" | "omni";
  duration: number;
  aspect: string;
  resolution: "720P" | "768P" | "1080P" | "2K";
  model?: string;
  outputMediaId?: string;
};
export type GenerationGraphPlan = {
  nodes: CanvasGenerator[];
  imageCount: number;
  videoCount: number;
  videoSeconds: number;
};
export interface StudioState {
  canvas?: StudioCanvasData;
  version: 1;
  mode: "talk" | "pixel";
  aspect: "16:9" | "9:16" | "1:1" | "4:3";
  resolution: 720 | 1080;
  theme: "mint" | "violet" | "amber";
  sceneStyle?: "pixel" | "illustration";
  captionStyle?: {
    preset?: "clean" | "bold" | "card";
    font?: string;
    color?: string;
    size?: number;
    position?: number;
  };
  audio?: {
    voiceGain?: number;
    musicId?: string;
    musicGain?: number;
    musicOffset?: number;
    fadeIn?: number;
    fadeOut?: number;
    duck?: boolean;
  };
  rhythm?: { bpm?: number; offset?: number };
  framing?: "fit" | "fill";
  captions: boolean;
  normalize: boolean;
  media: StudioMedia[];
  clips: StudioClip[];
  revision: number;
}
export interface EditPlan {
  summary: string;
  fingerprint: string;
  before: number;
  after: number;
  changes: {
    id: string;
    text: string;
    before: StudioClip;
    after: StudioClip;
    reason: string;
  }[];
  clips: StudioClip[];
}
export interface StudioJob {
  id: string;
  root: string;
  title: string;
  status: string;
  progress: number;
  output: string;
  error: string;
  createdAt: string;
}
export interface PersonalTask {
  id: string;
  title: string;
  detail: string;
  date: string;
  priority: "high" | "normal" | "low";
  status: "todo" | "doing" | "done" | "archived";
  repeat: "daily" | "none";
  project: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}
export interface PersonalNote {
  kind?: "memory" | "reference";
  sourceUrl?: string;
  project?: string;
  processed?: boolean;
  id: string;
  title: string;
  body: string;
  tags: string;
  pinned: boolean;
  archived?: boolean;
  updatedAt: string;
}
export interface PersonalFolder {
  id: string;
  name: string;
  path: string;
  connectedAt: string;
}
export interface PersonalFile {
  name: string;
  relative: string;
  directory: boolean;
  symlink: boolean;
  size: number;
  modifiedAt: string;
}
export interface AgentProvider {
  id: string;
  name: string;
  installed: boolean;
  loggedIn: boolean;
  version: string;
  detail: string;
  models: string[];
}
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  noteIds?: string[];
}
export interface Conversation {
  id: string;
  title: string;
  provider: string;
  model: string;
  messages: AgentMessage[];
  status: string;
  error: string;
  createdAt: string;
  updatedAt: string;
}
export interface PersonalData {
  version: 1;
  date: string;
  dataPath: string;
  tasks: PersonalTask[];
  notes: PersonalNote[];
  folders: PersonalFolder[];
  journal: Record<string, { body: string; updatedAt: string }>;
  events: { id: string; at: string; type: string; detail: string }[];
  conversations: Conversation[];
}
export interface HealthRecord {
  id: string;
  metric: string;
  value: number;
  date: string;
  source: "manual" | "chatgpt-snapshot" | "file-import";
  sourceLabel: string;
  recordedAt: string;
}
export interface HealthData {
  version: number;
  records: HealthRecord[];
  dataPath: string;
  connection: "local-only" | "scheduled-browser";
  sync?: {
    method: "browser-observation";
    status?: "ok" | "error";
    automationId?: string;
    scheduleLabel?: string;
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    lastDataDate?: string;
    recordCount?: number;
    changedCount?: number;
    error?: string;
  };
}
export interface ContentPlan {
  project: string;
  priority: "high" | "normal" | "low";
  audience: string;
  promise: string;
  hook: string;
  evidence: string;
  cta: string;
  nextAction: string;
  platform: string;
  plannedDate: string;
  resultUrl: string;
  measuredAt: string;
  views: number | null;
  saves: number | null;
  comments: number | null;
  learning: string;
  updatedAt: string;
}
export interface ReunionJob {
  id: string; name: string; status: string; stage: string; error: string;
  createdAt: string; output: string; relation: string; comment: string;
  facts: string[]; dialogue: string[]; prompt: string; remoteId: string;
}
export interface ReunionSnapshot {
  settings: Record<"host" | "scene" | "television" | "output", string>;
  presets: Record<"host" | "scene" | "television", boolean>;
  analyzerAvailable: boolean;
  jobs: ReunionJob[];
}
export interface ReunionImportResult {
  added: string[]; skipped: string[];
  rejected: { name: string; error: string }[];
  snapshot: ReunionSnapshot;
}
export interface CSBridge {
  reunionRead(): Promise<ReunionSnapshot>;
  reunionImport(files?: File[]): Promise<ReunionImportResult | null>;
  reunionSetting(kind: "host" | "scene" | "television" | "output"): Promise<ReunionSnapshot | null>;
  reunionRetry(id: string): Promise<ReunionSnapshot>;
  reunionPause(id: string): Promise<ReunionSnapshot>;
  reunionRecover(id: string, remoteId: string): Promise<ReunionSnapshot>;
  reunionFolder(id: string): Promise<void>;
  reunionMedia(id: string, role: "screenshot" | "portrait" | "photo"): Promise<string>;
  onReunionChanged(callback: () => void): () => void;
  referencesRead(): Promise<VideoReferenceCatalog>;
  referencesConnect(): Promise<VideoReferenceCatalog | null>;
  referencesMedia(
    id: string,
    kind: "video" | "image" | "evidence",
  ): Promise<string>;
  referencesSource(id: string): Promise<void>;
  referencesFolder(): Promise<void>;
  healthRead(): Promise<HealthData>;
  healthSave(input: Partial<HealthRecord>): Promise<HealthData>;
  healthOpen(): Promise<void>;
  healthExport(): Promise<string | null>;
  contentRead(): Promise<{ version: number; plans: ContentPlan[] }>;
  contentSave(
    input: ContentPlan,
  ): Promise<{ version: number; plans: ContentPlan[] }>;
  contentExport(): Promise<string | null>;
  personalXaiKey(key: string): Promise<AgentProvider[]>;
  personalGrokWeb(): Promise<boolean>;
  personalRead(): Promise<PersonalData>;
  personalTask(input: Partial<PersonalTask>): Promise<PersonalData>;
  personalDaily(date: string): Promise<PersonalData>;
  personalNote(input: Partial<PersonalNote>): Promise<PersonalData>;
  personalArchiveNote(id: string): Promise<PersonalData>;
  personalJournal(date: string, body: string): Promise<PersonalData>;
  personalConnect(): Promise<PersonalData | null>;
  personalDisconnect(id: string): Promise<PersonalData>;
  personalBrowse(id: string, relative: string): Promise<PersonalFile[]>;
  personalFile(
    id: string,
    relative: string,
  ): Promise<{ name: string; body: string; path: string }>;
  personalOpen(id: string, relative: string): Promise<string>;
  personalProviders(force?: boolean): Promise<AgentProvider[]>;
  personalConversation(): Promise<Conversation>;
  personalSend(input: {
    id: string;
    provider: string;
    model: string;
    prompt: string;
    noteIds: string[];
    attachment?: { folderId: string; relative: string } | null;
  }): Promise<string>;
  personalCancel(id: string): Promise<boolean>;
  personalRestore(): Promise<{ data: PersonalData; previous: string } | null>;
  personalExport(): Promise<string | null>;
  onPersonalChanged(callback: () => void): () => void;

  studioTempo(
    root: string,
    id: string,
  ): Promise<{
    bpm: number;
    offset: number;
    confidence: number;
    analyzedSeconds: number;
  }>;
  studioPlan(
    root: string,
    instruction: string,
  ): Promise<{ prompt: string; fingerprint: string }>;
  studioValidatePlan(
    root: string,
    text: string,
    fingerprint: string,
  ): Promise<EditPlan>;
  studioSnap(
    root: string,
    id: string,
  ): Promise<{ clips: StudioClip[]; delta: number; target: number }>;
  studioCaptions(root: string): Promise<string | null>;
  windowFullscreenState(): Promise<boolean>;
  windowFullscreen(enabled: boolean): Promise<boolean>;
  onWindowFullscreen(callback: (enabled: boolean) => void): () => void;
  generationStatus(): Promise<GenerationStatus>;
  generationPreviewGraph(
    root: string,
    ids: string[],
  ): Promise<GenerationGraphPlan>;
  generationEnqueueGraph(root: string, ids: string[]): Promise<GenerationJob[]>;
  generationConfigureVideo(key: string): Promise<GenerationStatus["video"]>;
  generationList(root: string): Promise<GenerationJob[]>;
  generationEnqueue(
    root: string,
    input: GenerationInput,
  ): Promise<GenerationJob>;
  generationPause(id: string): Promise<GenerationJob>;
  generationResume(id: string): Promise<GenerationJob>;
  generationAttach(
    id: string,
  ): Promise<{ job: GenerationJob; media: StudioMedia[] }>;
  generationAcknowledge(id: string): Promise<boolean>;
  onGenerationChanged(callback: () => void): () => void;
  studioOpenJimeng(): Promise<void>;
  studioRead(root: string): Promise<StudioState>;
  studioSave(root: string, state: StudioState): Promise<StudioState>;
  studioImport(root: string): Promise<StudioState | null>;
  studioClipboard(): Promise<{ text: string; image: boolean }>;
  studioImportAt(
    root: string,
    point: { x: number; y: number },
    files?: File[],
    fromClipboard?: boolean,
  ): Promise<StudioState | null>;
  studioSRT(root: string, id: string): Promise<StudioState | null>;
  studioTranscribe(root: string, id: string): Promise<StudioClip[]>;
  studioSilence(
    root: string,
    id: string,
    threshold: number,
    minimum: number,
  ): Promise<{ ranges: number[][]; removed: number }>;
  studioMediaURL(root: string, id: string): Promise<string>;
  studioExport(root: string): Promise<string>;
  studioJobs(): Promise<StudioJob[]>;
  studioCancel(id: string): Promise<boolean>;
  studioOpenExport(id: string): Promise<string>;
  onStudioChanged(callback: () => void): () => void;

  listDouyinAccounts(): Promise<DouyinAccount[]>;
  addDouyinAccount(
    name: string,
    platform?: AccountPlatform,
  ): Promise<DouyinAccount>;
  renameDouyinAccount(id: string, name: string): Promise<DouyinAccount>;
  openDouyinAccount(id: string): Promise<void>;
  openAccountBrowser(id: string): Promise<void>;
  removeDouyinAccount(id: string): Promise<boolean>;
  onDouyinAccountsChanged(callback: () => void): () => void;
  bootstrap(): Promise<Bootstrap>;
  chooseSetting(kind: "workspace" | "library"): Promise<{
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
  ): Promise<{ folder: string; zip: string; qa: QA }>;
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

export type GenerationJob = {
  nodeId?: string;
  nodeTitle?: string;
  batchId?: string;
  batchIndex?: number;
  nativeResolution?: boolean;
  legacy1080Transcode?: boolean;
  resolution?: "720P" | "768P" | "1080P" | "2K";
  id: string;
  root: string;
  kind: "image" | "video";
  prompt: string;
  aspect: string;
  duration: number;
  referenceId: string;
  model: string;
  status:
    | "queued"
    | "submitting"
    | "running"
    | "saving"
    | "completed"
    | "paused"
    | "failed"
    | "interrupted"
    | "cancelled";
  stage: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  remoteId?: string;
  applied: boolean;
};
export type GenerationInput = Pick<
  GenerationJob,
  "kind" | "prompt" | "aspect" | "duration" | "referenceId" | "model"
> & { resolution?: "720P" | "768P" | "1080P" | "2K" };
export type GenerationStatus = {
  imageReady: boolean;
  imageDetail: string;
  video: { ready: boolean; detail: string; models: string[] };
};
