# 画布节点交互与生成流程 · 0.6.0

用户确认范围：先完整对齐画布节点交互、连线和生成流程。参考 [BeefTV](https://github.com/glanderness/BeefTV/tree/bcc277f8e072c6bbc286f0643fee181b85da2ab2)，固定提交 `bcc277f8e072c6bbc286f0643fee181b85da2ab2`。在工作台现有 React / Electron 编辑器中独立实现，沿用本地工程与已接入的生成服务。

## 功能对照

| 用户操作 | 本版行为 | 验证 |
| --- | --- | --- |
| 空白处创建节点 | 双击、右键、左侧 +、Tab 打开搜索菜单，按点击的画布坐标放置 | Electron 界面与落盘坐标 |
| 拖线到空白处 | 只列出兼容的下游节点，创建并连接一次完成 | 文本 → 视频；类型与循环校验 |
| 节点输入输出 | 文本提示词、图片参考、首尾帧、全能图/视频/声音参考 | 图计划与生成节点回归 |
| 文本节点 | 直接编辑，可同时接入多个生成节点，提交时组合提示词并保存快照 | 后端测试与界面持久化 |
| 连线管理 | 点击选中后 Delete，右键删除，输入标签断线，支持撤销 | 界面删除与恢复 |
| 复制与粘贴 | 混合节点、内部连线、完整分组映射新 ID；副本生成节点清除旧输出 | 单元测试与真实界面 |
| 素材添加 | 文件选择、桌面拖入、系统剪贴板图片，直接成为参考节点 | Electron File 路径与 ClipboardItem |
| 节点编辑 | 双击改名，放大编辑提示词，右键上下文操作 | 界面保存与重载 |
| 多选与分组 | 框选、整体移动、重命名、解组、六种对齐、横纵分布、间距展开 | 几何测试、界面分组移动和撤销 |
| 批量连接 | 把选中来源接到兼容输入，限制数量、拒绝自连与循环 | 原子性和循环测试、界面连接 |
| 搜索与视口 | 节点搜索定位、缩放、适应内容、聚焦选中、小地图、全屏 | 桌面与 390px 界面 |
| 生图 → 视频 | 未完成上游先执行，已有结果复用；失败下游不提交 | 模拟服务、真实队列与本地落盘 |
| 视频生成 | H3 / Seedance 2.0，原生 1080P，首尾帧、全能参考、4–15 秒 | 模型协议测试；此前两模型真实原生 1080P 记录 |
| 批量分镜 | 每镜独立秒数和参数、任务预览、并发 2、结果按分镜顺序回填 | 逆序完成、恢复和快照测试 |
| 保存与恢复 | 工程保存节点、连线、分组；撤销重做；重启恢复已有任务编号 | 界面重载、队列回归 |

参考阅读位置包括 `use-canvas-viewport-controller.ts`、`canvas-create-menu.tsx`、`canvas-context-menu.tsx`、`use-canvas-keyboard.ts`、`canvas-project-clipboard.ts`、`selection-toolbar-tools.tsx` 和 `canvas-connection-create-menu.test.ts`。

本次范围不包含独立绘图重绘、3D 多角度、导演台、云端工作流或 BeefTV 的全部模型供应商。节点剪贴板限同一工程；跨工程可导入媒体文件。该交付是上述功能范围的对齐，不是全部产品逐像素复制。

## 可编辑源与复现

- `src/StudioCanvas.tsx`：画布、菜单入口、连线、多选、分组与快捷键。
- `src/CanvasCommandMenu.tsx`：搜索菜单、键盘操作和视口边界。
- `src/CanvasGeneratorNode.tsx`：生成参数、文本输入、提示词放大编辑。
- `shared/canvas-editing.mjs`：复制粘贴、对齐分布、批量连接纯函数。
- `lib/generation-graph.cjs`：输入校验、依赖和不可变任务计划。
- `electron/main.cjs` / `preload.cjs`：真实文件与系统剪贴板导入。

```bash
cd /Users/chenshuo/coding/cs-workbench
npm test
npm run build
node scripts/verify-canvas.cjs
node scripts/verify-generation-nodes.cjs
node scripts/verify-canvas-parity.cjs
npm run package:mac
CS_PACKAGED_EXECUTABLE="$HOME/Applications/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro" node scripts/verify-canvas-parity.cjs
```

验收使用临时隔离工程，不改个人项目。画布交互验收不提交生成；生成节点回归使用模拟供应商，验证真实队列、媒体处理与回填。本轮未重新提交收费生成任务。此前真实服务验收位于 `out/native-1080p-live-qa/`，不能与本轮模拟服务混为一次验收。

最终测试与安装记录保存在 `docs/evidence/canvas-parity-*.json`，截图位于 `out/canvas-parity-qa/`。自动检查覆盖交互和执行行为，生成内容的视觉与听感仍由创作者验收。

## 最终验收结果

2026-10-20：构建通过，66 项自动测试通过，15 项画布与真实 MP4 导出检查通过，6 项生成节点流程回归通过。已安装 0.6.0，并通过安装版全部 12 项新增交互检查，未出现页面运行错误。修正了快速粘贴后快捷键监听更新滞后的问题；验收同时核对画面和本地持久化。

安装位置：`/Users/chenshuo/Applications/CS 工作台 Pro.app`。原有个人工程与加密配置保留；旧版应用备份路径见 `evidence/canvas-parity-install.json`。本次约定范围无待处理实现项；独立高级模块未纳入本版。
