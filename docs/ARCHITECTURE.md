# 系统结构与扩展契约

## 产品结构

```
我的工作台
├── 每日任务 → 日期 / 优先级 / 状态 / 重复 / 项目引用
├── 随手记 + 操作足迹 → 本地 JSON
├── 个人记忆 → 标签 / 置顶 / 显式会话引用
├── 文件空间 → 目录连接 / 文本预览 / 显式附件
├── Agent → Codex CLI / Claude Code CLI / xAI API / Grok 独立网页
└── 创作室 → 媒体 → 转写 / SRT → 段落剪辑 → 预览 → 导出队列
    └── 场景模板 → 文案 → SVG → PNG 循环 → FFmpeg
```

## 模块

| 文件 | 职责 |
|---|---|
| `src/Personal.tsx`, `personal.css` | 首页、任务、日志、记忆、文件和 Agent UI |
| `lib/personal.cjs` | 个人数据、只读目录访问、会话进程、xAI 请求与状态 |
| `src/Studio.tsx`, `studio.css` | 文稿/媒体/模板、预览、时间线、参数和导出队列 |
| `lib/studio.cjs` | 时间线验证、媒体探测、SRT、静音区间、渲染任务 |
| `shared/studio-visuals.mjs` | UI 与导出共用的确定性 SVG 场景/字幕 |
| `scripts/transcribe.py` | 本地 Whisper、词边界拆句、简体转换 |
| `electron/main.cjs` | 文件对话框、受限 IPC、媒体协议、窗口生命周期 |
| `electron/preload.cjs` | 白名单 bridge，无任意 shell 或文件 API |
| `lib/workbench.cjs` | 保留的文章、项目、素材库、发布文案和交付包 |
| `electron/douyin.cjs` | 四个平台的独立账号会话窗口（保留旧模块名兼容） |

## 数据与持久化

个人工作区 schema version=1，原子写入临时文件后 rename。每次写入前保存 `.previous`。损坏 JSON 不静默重置。任务 completion、journal、notes、events、conversations 持久化；目录仅保存引用。

剪辑工程 schema version=1，media 由主进程导入；前端保存不能任意替换可信媒体清单。每段保存 source start/end、mediaId、text、enabled。总时长由启用片段计算。保留片段顺序决定成片与 SRT 的连续时间线。

## 渲染

FFmpeg 使用参数数组 spawn，无 shell 拼接。源片段分别转成统一规格 H.264 / AAC / 48 kHz，再 concat；字幕经 Sharp 将共享 SVG 栅格化为透明 PNG。像素模板渲染 2 秒 15 fps 循环并转 30 fps；不是运动插帧或任意角色动画。

队列串行处理，最多 4 个活动任务。取消终止子进程；退出后未完成任务标中断。只有 FFprobe 时长检查和全片 FFmpeg decode 都通过，才原子更新 `outputs/final.mp4`。保留版本输出、工程快照、SRT 与 QA JSON。

## Agent 边界

Codex 走本机 CLI、复用认证，调用 read-only / ephemeral / ignore-user-config，避免把用户全局 hooks/MCP 自动带入只读聊天。Claude 使用 safe-mode / tools empty / strict MCP。主进程选择固定 executable，模型名做格式验证。输入走 stdin，不放进 shell。每次消息附加有限历史及显式选中的记忆/文件。

xAI 密钥存储于 Electron safeStorage 加密文件，配置时先 GET `/v1/models` 验证；聊天使用流式 POST `/v1/chat/completions`。API 不配置时官方网页仍可打开。网页会话与主工作台隔离，无 preload、无 Node。

## 扩展方向

1. 独立 `ProviderAdapter`：统一 health / models / send / cancel，再接更多模型；不要把网页登录自动当成 API 鉴权。
2. 任务 schema v2：截止时间、提醒服务、日历同步与依赖；提醒需要真实持久调度。
3. Timeline v2：多轨 B-roll、背景音乐、过渡、代理媒体、波形与鼠标拖动；维护输入/输出时码映射。
4. Rendering adapters：FFmpeg 与 HyperFrames 渲染协议分离，输出一致的 job/verification 结构。
5. 数据量增长后使用 SQLite/WAL，并提供迁移、导入备份和全文索引。
6. 商业发布阶段加签名公证、更新服务、崩溃上报选择、许可清单与数据迁移演练。

不要把未实现的功能放在已可用 UI 上。未登录、无 Key、运行中、中断、失败、完成各有独立状态。


## 0.3 workflow / editing assistance

- `src/design-system.css` defines shared semantic colors for all routes. `STAGES` in `src/main.tsx` groups destinations into five creative stages, personal arrangements and persistent tools.
- App owns active project; `Studio` reports project changes through `onProjectChange` and responds to `projectPath`. Article drafts flush before switching. Project selectors capture the selected value before asynchronous save work.
- References reuse version-1 personal notes with optional `kind`, `sourceUrl`, `project`, `processed`. Existing records remain memories. URLs accept HTTP/S only; no remote crawler is implied.
- `lib/editor-assist.cjs` validates caption/mix settings, estimates tempo from PCM, generates transcript-only Agent prompts and validates bounded editing plans using a project fingerprint. Applying a plan is undoable.
- Captions share deterministic SVG rendering between preview/export. FFmpeg concatenates kept ranges then mixes a looped music bed with fades, sidechain ducking and limiter. Subtitle-free intervals remain explicit clips.
- Backup restore validates before write, preserves current workspace and never imports API keys. Search resolves actual local records; it does not index arbitrary files.
- `scripts/verify-creator.cjs` tests the connected UI flow in an isolated profile, including a real Codex response and FFmpeg mixed export. Fixtures use synthetic audio/video; this is technical acceptance, not a claim of finished artistic quality.
