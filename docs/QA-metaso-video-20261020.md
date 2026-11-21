# 秘塔 MiniMax H3 视频接入验收

版本 0.4.1，2026-10-20。本地安装：`/Users/chenshuo/Applications/CS 工作台 Pro.app`。

## 交付

- 创作室 → AI 生成 → AI 视频：MiniMax-H3、2K / 768P、5–15 秒、文生视频、项目图片作为首帧。
- 完成后下载、验证视频流与时长、加入媒体库和画布，自动保存工程。原镜头与期间编辑保留。
- 接入秘塔官方 V2 提交和查询、V1 文件上传；首帧模式比例跟随图片。
- 密钥由系统 `safeStorage` 加密，应用数据中的密钥文件权限 0600。UI 保存后清空输入，不回传已保存密钥；工程、源码、任务记录不保存密钥。下载视频时不把 API Authorization 发给 CDN。
- 查询暂停可继续原任务，提交结果不明确不会自动重试。此前全屏、镜头排序与精剪保留。

## 验证

- `npm test`：49/49 通过。新增覆盖协议请求、首帧上传与引用、参数拒绝、失败状态、敏感字段脱敏和缺失任务编号时不重试。
- `npm run package:mac`：通过，签名校验通过。
- 使用用户示例进行 **一次**真实 5 秒、2K 文生视频请求。实际返回 2560×1440、5.166667 秒 MP4；自动加入画布一次，预览可播放，FFmpeg 全片解码通过。
- 安装版恢复同一个已完成任务，未再次提交付费生成；工程重载没有重复镜头，390px 布局通过。
- 安装版画布回归 15 项通过：F/Esc 全屏、编辑与持久化、多选与拖排、媒体预览、混合 MP4 导出等。
- 首帧模式已按官方协议实现并通过模拟协议测试，本次未额外消费额度生成第二条首帧视频。自动检查不代替用户对画面与声音的创作验收。

## 文件与复现

- 实际视频：`out/video-generation-qa/metaso-generated.mp4`
- 代表帧：`out/video-generation-qa/video-frame.png`
- 画布截图：`out/video-generation-qa/video-completed.png`
- 报告：`docs/evidence/metaso-video-20261020.json`、`docs/evidence/metaso-canvas-regression-20261020.json`
- 源码：`lib/metaso-video.cjs`、`lib/studio-generation.cjs`、`src/StudioGeneration.tsx`，通过 Electron IPC 接入。
- 使用说明与协议来源：`docs/video-canvas.md`
- 更新前应用备份：`out/installed-backups/CS 工作台 Pro-before-metaso-20261020-194112.app`

```bash
cd /Users/chenshuo/coding/cs-workbench
npm test
npm run package:mac
# 复用此次真实任务和隔离测试工程，不提交新生成：
CS_VIDEO_QA_RESUME=1 \
CS_PACKAGED_EXECUTABLE="$HOME/Applications/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro" \
node scripts/verify-video-generation.cjs
```

全新真实验收使用同一脚本、不设置 `CS_VIDEO_QA_RESUME`，从标准输入读取密钥，会提交一次付费任务。避免把密钥写入命令行参数、源码或报告。测试工程与用户现有工程隔离；生产应用仅增加加密密钥文件。未提交 Git、未推送或公开发布。
