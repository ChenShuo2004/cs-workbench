# 创作画布增强与全屏验收 · 2026-10-20

交付版本 **0.3.9**。已安装到 `/Users/chenshuo/Applications/CS 工作台 Pro.app`，Info.plist 版本与本地签名验证通过。已在用户实际工作区打开「纳瓦尔宝典 → 创作室」，确认全屏画布、退出全屏按钮、工程选择与保存状态均正常可见。

本次在现有画布中增加：原生全屏、框选与 Shift 多选、成组移动/顶部对齐/批量移除、空格临时抓手、图片缩放平移与视频预览、镜头拖动排序、小地图定位、视口外卡片卸载、分镜草稿持久化。平移与缩放不占用内容撤销步骤。BeefTV 参考源与使用方式见 [使用说明](video-canvas.md)。

0.3.9 补修：全屏状态变化后同步快捷键监听，避免连续 F 或立即 Esc 使用旧状态；忽略 F 的按键自动重复。先在 0.3.8 安装版复现连续 F 无法退出，再在 0.3.9 安装版通过同一验收（失败证据：`docs/evidence/fullscreen-shortcut-regression-before.json`）。

## 已执行验证

- `npm run build` 和 `npm run package:mac` 成功。
- `npm test`：41/41 通过。
- 安装版 `CS_PACKAGED_EXECUTABLE=... node scripts/verify-canvas.cjs`：15 项通过，`packaged: true`，无页面异常。覆盖全屏按钮进入/退出、无内容修改时连续 F 切换与立即 Esc 退出、跨视图草稿恢复、画布存取、缩放/拖动、镜头排序/复制/移除/撤销重做、图片/视频导入与预览、顺序条拖排、Shift 多选成组移动/对齐、空白区域框选。
- 安装版实际导出场景 + 图片 + 视频混合 MP4，时长 3.3 秒；ffprobe 流与时长核验、FFmpeg 全片解码通过。
- 原精剪回归 `node scripts/verify-studio.cjs`：场景修改与实际 MP4 导出通过；画布与精剪的 390px 宽度检查均无页面横向溢出。
- 已人工查看安装版全屏画布验收截图，并通过桌面操作打开真实用户项目全屏。验收使用隔离临时工作区，未向用户工程写入测试素材。

## 交付位置

- 应用：`/Users/chenshuo/Applications/CS 工作台 Pro.app`
- 源码：`/Users/chenshuo/coding/cs-workbench`（实际目录为 `陈硕 video/CS工作台`）。
- 报告：`docs/evidence/video-canvas-fullscreen-20261020.json`。
- 截图：`out/canvas-qa/fullscreen-canvas.png`、`fullscreen-empty.png`、`mobile.png`。
- 验收视频：`out/canvas-qa/verification.mp4`。
- 0.3.8 备份：`out/installed-backups/CS 工作台 Pro-before-shortcut-fix-20261020-144620.app`。
- 0.3.7 备份：`out/installed-backups/CS 工作台 Pro-before-fullscreen-20261020-144211.app`。

## 未完成项与边界

本次画布优化和全屏范围已完成。云端 AI 生图/生视频后端仍未接入；当前通过镜头提示词 → 即梦 → 导入生成结果衔接，连线表示成片顺序。没有执行 Git 提交、推送或公开发布。自动验收不代替实际视频内容和听感的人工确认。
