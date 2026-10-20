# CS 工作台 Pro

**个人任务、随手记、记忆、文件空间、Agent 和视频创作，一处完成。**

当前本地版本为 **0.7.0 Pro**（2026-10-20，Apple Silicon）。安装到 `~/Applications/CS 工作台 Pro.app`，旧版应用保留。现有功能包括五阶段创作分类、多套界面配色、跨页面项目联动、资料收集、本地口播转写与剪辑、字幕和配音/BGM设置、Codex 剪辑建议、个人数据备份恢复，以及本地视频风格案例与提示词。

- [整体体验优化与验收](docs/workbench-experience-review.md)：原地统一搜索、可读窄屏导航、统一键盘弹窗、界面密度与动态效果、失败重试。
- [画布交互对齐与验收](docs/QA-canvas-parity-20261020.md)：双击 / 右键添加、拖线创建下游、文本提示词连线、复制粘贴、分组、对齐分布和批量连接。
- [直接连线与 @ 引用](docs/canvas-mentions.md)：提示词输入 @ 直接选择画布素材，选中后自动连线；图片 / 视频 / 声音自动识别，首尾帧从已选图片中指定。
- [视频创作画布](docs/video-canvas.md)：生图 / 视频生成节点、拖线传递素材、首尾帧与图/视频/声音全能参考、逐镜 4–15 秒、MiniMax H3 / Seedance 2.0 原生 1080P、分镜批量队列与自动回填，保留原生全屏、精剪和 MP4 导出。
- [使用指南](docs/START-HERE.md)：日常操作、连接模型、剪辑、数据位置和备份。
- [架构与维护](docs/ARCHITECTURE.md)：模块、数据合同、渲染链路及适配器。
- [调研与产品边界](docs/RESEARCH-AND-PRODUCT.md)：REA 分析、参考来源、已实现和待完成能力。
- [验收报告](docs/QA-20261018.md)：真实执行、安装包验证和测试限制。
- [15 种视频风格案例](docs/video-references.md)：查看、播放、复制提示词和按主题调用；入口为「处理素材 → 风格案例」。

```bash
npm ci
npm start
# 本机转写环境首次安装
bash scripts/setup-asr.sh
# 单元测试 / 打包
npm test
npm run package:mac
```

这是本机可运行内测版本。Grok 内置会话需要 xAI API Key，Claude Code 需要自己的登录；API 与订阅网页是不同入口。本仓库提供 **0.7.0 Pro 源码**，下方公开下载安装包仍为 v0.1.0，**尚未发布 Pro 安装包 Release**。本次优化前基线及验证范围见 [0.7.0 源码基线](docs/BASELINE-0.7.0.md)。

---

# CS 工作台

**把一个选题的文章、视频、素材和交付记录放进同一个本地项目。** CS 工作台是一款面向个人创作者的 macOS 桌面应用：从选题开始，整理稿件与分镜，选择声音和字体，检查交付文件，再分别记录导出、上传和发布状态。

[下载 Mac 版](https://github.com/ChenShuo2004/cs-workbench/releases/tag/v0.1.0) · [旧公开版上手](#旧公开版-5-分钟上手) · [搭配 CS Skills](#搭配-cs-skills) · [本地开发](#本地开发)

> 下方公开下载仍为 **v0.1.0**，提供 Apple Silicon（arm64）版本。应用可离线使用，不需要账号或新的 AI 订阅。安装包使用临时签名，尚未经过 Apple 公证。

## 旧公开版 5 分钟上手

1. 从 [v0.1.0 Release](https://github.com/ChenShuo2004/cs-workbench/releases/tag/v0.1.0) 下载 `cs-workbench-mac-arm64-v0.1.0.zip`，解压后将 `CS 工作台.app` 放入「应用程序」文件夹并打开。如果 macOS 提示无法验证开发者，可在 Finder 中右键应用并选择「打开」。
2. 进入「设置」确认项目工作区。默认位置是 `~/Documents/CS工作台项目`；首次新建选题时才会创建项目文件夹。
3. 点「新建选题」，填写主题、目标读者和平台。工作台会生成 brief、文章、视频稿、逐镜头表和发布文案。
4. 在「文章」「视频」写稿，按 `⌘ S` 保存；在「素材库」试听声音、预览字体，选定素材后将其复制到当前项目。
5. 在「项目」运行检查、复制给 Codex / Claude 的交接指令；在「发布」分别导出文章或视频 ZIP，再人工记录上传与发布状态。

已有内容工程可通过「导入已有工程」只读查看。应用不会移动或改写导入的原文件。

## 一条选题，两条制作线

```text
新建选题
  ├─ 资料来源 + 选用素材
  ├─ 文章：正文 → 检查 → 文章交付包
  └─ 视频：脚本 → 分镜 → 成片检查 → 视频交付包
                                      ↓
                              按平台记录发布状态
```

| 工作台区域 | 可以完成什么 | 保存在哪里 |
| --- | --- | --- |
| 项目 | 管理选题、受众、平台和下一步；复制 AI 交接指令 | `project.json`、`brief.md` |
| 文章 | 编辑正文并独立维护文章状态 | `writing/article.md` |
| 视频 | 编辑视频稿和逐镜头表；检查已有 MP4 的媒体信息 | `writing/video-script.md`、`video/shotlist.csv`、`qa/latest.json` |
| 素材库 | 接入现有声音与字体库，试听、预览并复制选用文件 | `assets/selection.json`、`assets/files/` |
| 发布 | 导出本地 ZIP，分别记录各平台状态 | `outputs/`、`publish/` |
| 平台账号 | 为抖音、小红书、视频号、公众号分别登录、保留会话、打开与切换后台 | 本机应用数据目录 |

文章与视频共用选题资料，但各自保存状态。「已导出」只表示本地交付包已生成；上传和发布需在实际操作完成后记录。视频包可以包含已有的 `outputs/final.mp4`，**工作台本身不生成或剪辑成片**。

## 多平台账号后台

「分发交接 → 平台账号 → 添加平台账号」，选择抖音、小红书、视频号或公众号并填写备注，再点击「打开 Chrome / 登录」。每个账号使用本机 Google Chrome 的独立会话目录，完成官方扫码或验证后，后续打开继续使用该目录；平台登录过期时需重新验证。

旧账号 UUID、备注及 Electron 数据保留。新 Chrome 窗口首次需重新登录，不导入日常 Chrome 的个人数据。打开窗口不等于登录成功；以官方后台身份为准。

「移除」经确认后关闭并清除此账号在本机的独立 Chrome 和旧内置窗口数据，其他账号不受影响。

使用、源码、存储位置和复现见 [多平台账号说明](docs/platform-accounts.md)。

## 搭配 CS Skills

[CS Skills](https://github.com/ChenShuo2004/cs-skills) 是独立的 Agent 工作流。工作台负责保存真实项目文件和状态；Codex / Claude 读取项目文件后，按选定的 Skill 完成写作或视频制作。两者目前通过**复制交接指令**和本地项目目录衔接，没有内置 Skill 执行器。

| 你要做的事 | 对应 Skill | 在工作台中的落点 |
| --- | --- | --- |
| 还没确定执行路线 | [`cs-run`](https://github.com/ChenShuo2004/cs-skills/tree/main/cs-run) | 选题 brief 和下一步动作 |
| 调研事实与来源 | [`cs-search-skill`](https://github.com/ChenShuo2004/cs-skills/tree/main/cs-search-skill) | `research/sources.json` 与稿件依据 |
| 写文章、改稿 | [`cs-writer`](https://github.com/ChenShuo2004/cs-skills/tree/main/cs-writer) | `writing/article.md` |
| 做代码动画或知识视频 | [`cs-code-video`](https://github.com/ChenShuo2004/cs-skills/tree/main/cs-code-video) | 视频稿、分镜和 `outputs/final.mp4` |

先在「项目」点「复制 AI 交接指令」，然后在已安装相应 Skill 的 Codex 或 Claude 会话中粘贴，并加上一句具体任务。例如：

```text
$cs-writer 根据这个工作台项目的 brief.md 和 research/sources.json，完善 writing/article.md。
保留可核查的来源，不覆盖视频文件；完成后说明改动和仍需人工核实的内容。
```

视频任务可换成 `$cs-code-video`，要求读取 `writing/video-script.md` 与 `video/shotlist.csv`，并把成片写入 `outputs/final.mp4`。Skill 的安装方式和使用边界以 [CS Skills 文档](https://github.com/ChenShuo2004/cs-skills#立即开始)为准。

## 素材、权限与本地数据

- 「设置」可选择现有的声音与字体库根目录；该目录需要 `manifest.json`。没有素材库也可以先写作和管理项目。
- 工作台只读扫描原素材库。加入项目时复制单个选用文件，并记录来源、许可字段与 SHA-256。具体作品能否公开使用仍需按原始授权核实。
- 网易云候选 MP3 可以试听，但授权待核实，不能通过工作台加入公开视频交付包。**格式转换不等于获得发布许可。**
- 应用设置与项目索引保存在 macOS 用户应用数据目录；项目正文保存在你选择的工作区。本仓库和安装包均不包含个人音乐、字体、文章、视频成片或项目数据。
- 当前包没有 Apple 公证；源码的 `package.json` 标记为 `UNLICENSED`，仓库公开不代表授予复制、修改或分发许可。

## 本地开发

需要 macOS、Node.js 20.19+ 和 npm。运行成片媒体信息检查时还需要本机安装 `ffprobe`；未安装时仍可写稿和整理素材。

```bash
git clone https://github.com/ChenShuo2004/cs-workbench.git
cd cs-workbench
npm ci
npm test
npm run build
npm start
```

生成 Apple Silicon 应用：

```bash
npm run package:mac  # 输出 out/CS 工作台-darwin-arm64/CS 工作台.app
npm run make:mac     # 输出 ZIP 到 out/make/zip/darwin/arm64/
```

`node_modules/`、构建产物、用户项目和本地素材不纳入 Git。应用使用 Electron、React、TypeScript 与 Vite；文件读写通过隔离的 preload 接口交给主进程。项目格式和后续方向见 [产品蓝图-v0.1.md](产品蓝图-v0.1.md)。

## 当前边界

v0.1.0 已支持本地项目管理、写稿、素材接入、旧工程只读查看、已有 MP4 的 FFprobe 信息检查和 ZIP 导出。完整视频剪辑、自动成片、平台 API 发布及跨项目搜索尚未集成。视频可交给剪映、HyperFrames 或项目自己的脚本制作，再回到工作台检查与交付。


## 配色、阅读与收尾检查（2026-10-18）

- 右上角配色选择或「设置 → 外观与阅读」：深林、暖纸、海蓝、暮紫，选择自动保存在当前本机 profile，重启保留。工作台配色不改动视频模板和输出画面。
- 文章与视频文稿支持「编辑原稿 / 阅读预览」。阅读视图支持标题、段落、简单列表、引用与代码块，保持源文件不变；并非完整 Markdown 渲染器。
- 导出文章或视频交付包时自动检查该分支与公共资料，页面显示缺项；包内附 `收尾检查.json` 与 `交付说明.md`。文章包不因缺少视频而误报。自动检查只覆盖已实现的文件、字数、来源、授权标记与媒体探测，不代替内容质量和实际发布验收。
- 全局 Codex `AGENTS.md` 与本仓库 `AGENTS.md` 已记录每次收尾检查完整交付、缺项提醒的规则。

验证：`npm run verify:appearance`；使用隔离测试数据，覆盖四种主题、重启保持、阅读切换、导出缺项提醒及 390px 视口。记录见 `docs/appearance-acceptance.md`。

## 0.3.1：健康与内容运营

首页和侧栏新增健康记录；内容总览关联现有项目，支持创作简报、下一步、平台排期与效果复盘。排期为本地计划，不会自动发布。

### 0.3.2：健康定时同步

已接入 Codex 浏览器定时读取 → 本机校验导入 → 工作台自动刷新。每 15 分钟 尝试从已登录的 ChatGPT Health 同步可见指标，页面分别显示成功时间、上游数据日期和失败原因。需要 Mac、Codex、Chrome 与登录状态可用；不是官方实时直连。运行、暂停、故障处理和可复用导入格式见 [HEALTH-SYNC.md](docs/HEALTH-SYNC.md)。

- [对标研究、数据边界与复现](docs/WORKBENCH-OPERATING-MODEL.md)
- [功能验收与未完成项](docs/QA-HEALTH-CONTENT-20261018.md)
- [本机安装与回退记录](docs/evidence/health-content-install.json)

### 纯白与 KAI 头像更新

原「暖纸」主题已调整为「纯白」，新安装默认使用纯白。KAI 男孩统一用于应用图标、侧栏、启动界面、首页和软件封面。可编辑素材位于 `assets/branding/`，执行 `node scripts/build-branding.cjs` 重建图标与封面。详见 `docs/white-kai-acceptance.md`。

### 评论截图批量准备亲人重逢视频

「创作内容 → 亲人重逢」支持多张评论截图自动排队：识别评论和人物、提取原照片、制作大头照、编写约17秒对白与电视转场、输出全能参考上传包。固定男主、老屋与电视只需配置一次；支持去重、单条重试和原生成任务恢复。视频由用户在全能参考工具生成。使用方法与真实链路验证见 [亲人重逢批量流程](docs/reunion-batch.md)。
