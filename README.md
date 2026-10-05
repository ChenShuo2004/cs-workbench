# CS 工作台

**把一个选题的文章、视频、素材和交付记录放进同一个本地项目。** CS 工作台是一款面向个人创作者的 macOS 桌面应用：从选题开始，整理稿件与分镜，选择声音和字体，检查交付文件，再分别记录导出、上传和发布状态。

[下载 Mac 版](https://github.com/ChenShuo2004/cs-workbench/releases/tag/v0.1.0) · [5 分钟上手](#5-分钟上手) · [搭配 CS Skills](#搭配-cs-skills) · [本地开发](#本地开发)

> 当前为 **v0.1.0**，提供 Apple Silicon（arm64）版本。应用可离线使用，不需要账号或新的 AI 订阅。安装包使用临时签名，尚未经过 Apple 公证。

## 5 分钟上手

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

文章与视频共用选题资料，但各自保存状态。「已导出」只表示本地交付包已生成；上传和发布需在实际操作完成后记录。视频包可以包含已有的 `outputs/final.mp4`，**工作台本身不生成或剪辑成片**。

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
