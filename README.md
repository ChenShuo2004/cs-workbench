# CS 工作台

给个人自媒体创作使用的本地 Mac 工作台。一个选题串起文章、视频文案、镜头表、声音和字体、交付检查与发布记录。

**下载 Mac Apple Silicon 版：**[v0.1.0 安装包](https://github.com/ChenShuo2004/cs-workbench/releases/download/v0.1.0/cs-workbench-mac-arm64-v0.1.0.zip)。当前这台 Mac 已安装在 `~/Applications/CS 工作台.app`。安装包为个人使用的临时签名版本，尚未经过 Apple 公证。

## 直接使用

Mac arm64 版打包后，双击 `CS 工作台.app`。首次打开检查「设置」中的项目工作区和声音与字体库路径。默认项目工作区是 `~/Documents/CS工作台项目`；如果本机已有 `~/Documents/ChatGPT/陈硕 video/音效与配乐库`，会自动识别，也可以手动选择。

1. 点「新建选题」，填写主题、目标读者和平台。
2. 在「文章」写正文，在「视频」写视频稿和逐镜头表。`⌘ S` 保存到项目文件夹。
3. 在「素材库」试听声音、预览字体并加入当前项目。程序只复制选择的已记录授权素材；网易云候选 MP3 可试听但不能加入公开视频交付包。
4. 在「项目」运行检查、复制给 Codex / Claude 的交接指令；在「发布」导出文章或视频 ZIP，人工记录上传与发布状态。

已有工程可以通过「导入已有工程」只读查看文章、文案、分镜和现有成片；不会移动或修改原文件。

## 本机开发与打包

需要 Node.js 20.19+、npm 和 macOS。FFmpeg/FFprobe 用于成片检查；未安装时仍可进行写作和素材整理。

```bash
npm install
npm test
npm run build
npm run package:mac
```

桌面程序位于 `out/CS 工作台-darwin-arm64/CS 工作台.app`。需要 ZIP 分发包可运行 `npm run make:mac`，输出在 `out/make/zip/darwin/arm64/`。可执行 `npm start` 在开发机上打开应用。打包产物、用户项目与素材均不进入 Git 仓库。

## 文件与权限边界

- 项目文件夹是主数据：`project.json`、`brief.md`、`research/`、`writing/`、`video/`、`assets/`、`outputs/`、`qa/`、`publish/`。
- 应用设置与项目索引保存在 macOS 用户应用数据目录；项目原件不放进 `.app`。
- 前端通过隔离的 preload 调用受限的本地方法；不向前端开放 Node 文件系统。
- 素材权利由原素材库清单记录；本软件不能替代具体作品的发布授权核查。GitHub 仓库不包含音乐、字体、网易云下载或视频成片。
- 「导出」仅表示本地交付包生成，不代表已经上传或公开发布。

## 当前范围

第一版可用来组织项目、写稿、选素材、预览旧工程、检查已有 MP4、生成交付包。复杂剪辑与成片渲染继续交给剪映、HyperFrames 或项目自己的脚本；工作台提供文件与指令交接。完整产品路线见 [产品蓝图-v0.1.md](产品蓝图-v0.1.md)。
