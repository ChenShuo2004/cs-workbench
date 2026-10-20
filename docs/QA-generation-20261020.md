# 创作室内 AI 生成接入 · 2026-10-20

版本：0.4.0。用户需求包含 AI 生图与自有 API 视频生成；**生图已接通，视频服务待用户提供名称与脱敏接口资料，整体需求尚未全部完成**。

## 已交付

- 创作室顶部「AI 生成」打开侧面板；已有镜头可复用提示词，选择项目图片作为生成参考。
- 通过本机 `cs-codex-image` MCP 的 `generate_image` / `get_image_job`，复用 Codex/ChatGPT 登录，不索取图片 API Key。
- 真实任务状态、排队、继续查询、生成记录与工程草稿保存；生成期间可以继续编辑。
- 结果自动校验并加入项目媒体库，创建新镜头，不覆盖原镜头，不把提示词烧录成字幕。
- 查询失败时暂停并保留原任务编号。应用重启恢复查询，不自动重新提交不确定的请求，避免重复消耗额度。
- 导入合并到最新工程，解决异步复制素材可能覆盖期间编辑的问题；重复导入不会创建重复媒体。

## 实际验证

- `npm test`：45/45 通过，包括生成结果幂等导入、并发编辑保留、查询失败后恢复原任务、重启不重新提交不明确请求、非法参数/外部参考拒绝。
- 真实生成：从开发版 Electron 创作室按钮提交一次 Codex 生图，得到 1672×941 PNG；镜头自动加入，保留生成期间新增的场景，生成记录标为已加入。
- 真实 PNG 已查看像素：陶杯里的绿芽与柔和窗光，未用程序图或占位图冒充生成结果。
- 将生成图片与场景混合导出为实际 MP4，FFmpeg 全片解码通过。
- 初次端到端检查发现新增按钮使 390px 页面溢出；修复工具栏换行后，再次验证页面与侧面板均无横向溢出。
- 安装版 `verify-generation-restored.cjs`（`packaged: true`）通过：MCP 真实连接、已有真实生成任务恢复、原图解码预览、无重复镜头和 390px 布局。没有为了重复检查而再次消耗生图额度。
- 安装版画布回归 15 项全部通过：全屏与 F/Esc、工程恢复、多选拖动、预览、顺序撤销和混合素材 MP4 导出。报告存于 `docs/evidence/ai-canvas-regression-20261020.json`。

## 交付与复现

应用：`/Users/chenshuo/Applications/CS 工作台 Pro.app`。

源码：`lib/image-bridge.cjs`、`lib/studio-generation.cjs`、`src/StudioGeneration.tsx`、`src/studio-generation.css`，集成于 Electron IPC 与 `Studio.tsx`。

数据：应用用户数据目录下 `studio-generation/jobs.json` 和每任务结果目录；导入后素材在项目 `assets/media/`，提示词草稿在项目 `video/studio.json`。生成任务不保存 API 密钥。

测试产物：`out/generation-qa/actual-generated.png`、`generated-image-film.mp4`、`generation-completed.png`、`generation-mobile.png`、`report.json`、`restored-report.json`。报告保留首轮布局失败记录，安装版恢复报告记录修复后通过。

```bash
cd /Users/chenshuo/coding/cs-workbench
npm run build
npm test
# 以下命令会实际生成一张图片，使用现有 Codex 额度：
node scripts/verify-generation.cjs
# 复用上一个命令的真实任务，不重复生成：
CS_PACKAGED_EXECUTABLE="$HOME/Applications/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro" node scripts/verify-generation-restored.cjs
```

旧版备份：`out/installed-backups/CS 工作台 Pro-before-ai-20261020-151928.app`。测试使用独立临时工作区，未往用户现有视频工程加入测试素材。没有提交 Git 或公开发布。

## 未完成项

用户选择「我有其他视频 API 服务」。尚缺服务名称、文档链接或脱敏请求示例，无法确认提交、轮询、鉴权与下载协议。已保留共享任务队列和视频入口，但未配置实际视频适配器，按钮不可提交。下一步按用户提供的文档接入该服务，并在应用中安全配置密钥，再验证真实视频生成、自动落盘与画布回填。
