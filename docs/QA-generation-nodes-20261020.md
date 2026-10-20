# 0.5.0 生成节点交付验收 · 2026-10-20

已安装：`/Users/chenshuo/Applications/CS 工作台 Pro.app`。源代码：`/Users/chenshuo/coding/cs-workbench`。保留旧应用备份，见 `evidence/generation-nodes-install-20261020.json`。系统加密密钥文件的安装前后散列一致，未写入源码或报告。个人工程未加入测试素材；所有验收使用隔离工作区。

## 实际结果

- 56 项 Node 测试全部通过；类型检查与 Vite 构建通过。图依赖、类型与循环校验、首尾帧互斥、全能参考三种媒体载荷、时长总和限制、重复排队、快照、失败级联取消、重启不重复提交均有验证。
- 6 组真实界面流程通过，使用合成服务返回值，不产生付费请求：鼠标拖线和键盘连接、生图到视频依赖、首尾帧切换全能参考、图/视频/声音参考、5 秒和 8 秒批量、反序完成但按分镜回填、重载持久化、全屏和 390px 无页面横向溢出。运行 `node scripts/verify-generation-nodes.cjs`。
- **真实服务验收：** 视频节点连接同一张此前真实生成的图片作为首帧与尾帧，提交 MiniMax H3 768P、4 秒请求。唯一任务 `2112516195754758144` 返回 1344×768、4.458333 秒 MP4。完整 FFmpeg 解码通过；节点回填和播放器预览通过；源码打包版与最终安装版均恢复同一结果，不重复提交。
- 安装版 15 项原有画布回归检查全部通过，包括 macOS 全屏反复切换、草稿保存、位置与缩放、排序/复制/删除/撤销/重做、多选成组拖动、图片视频预览、混合视频真实导出、全片解码与窄屏。运行 `CS_PACKAGED_EXECUTABLE="$HOME/Applications/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro" node scripts/verify-canvas.cjs`。
- 最后打包时一次 macOS 扩展属性导致签名失败；清理包内扩展属性后重新签名并通过深度验证，再复制安装。安装包签名验证通过。

## 产物与复现

- 用户操作说明：`docs/video-canvas.md`。
- 核心前端：`src/StudioCanvas.tsx`、`src/CanvasGeneratorNode.tsx`、`src/canvas-generation.css`；集成：`src/Studio.tsx`。
- 核心后端：`lib/generation-graph.cjs`、`lib/studio-generation.cjs`、`lib/metaso-video.cjs`，Electron IPC / preload 和 TypeScript 类型同步。
- 实测视频：`out/generation-nodes-live-qa/first-last-generated.mp4`，实测截图：同目录 `completed.png`、`preview.png`、`frame.png`。
- 模拟界面证据：`out/generation-nodes-qa/`；可追踪 JSON 已复制到 `docs/evidence/generation-nodes-*.json`。
- `npm test`、`npm run build`、`npm run package:mac` 可复现构建。真实视频脚本 `scripts/verify-generation-nodes-live.cjs` 默认复用记录；新付费任务需显式环境变量且没有既有记录，防止误重跑扣费。

## 验收边界

首尾帧已通过真实服务。全能参考三种素材与多任务批量本次经过真实界面、队列、文件落盘和模拟 HTTP 载荷验证，未额外批量调用付费服务；实际生成质量、服务端额度及不同素材的语义遵循程度不由自动测试保证。默认同批结果保持分镜顺序，旧的重新生成结果保留，可在成片序列里自行移除。未新增音频生成或任意代码节点。项目功能和本地安装已交付；未提交或推送 Git。
