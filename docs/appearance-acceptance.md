# 配色、阅读与收尾检查验收 · 2026-10-18

已更新本机 `/Users/chenshuo/Applications/CS 工作台 Pro.app`。通过原生应用界面确认安装版存在「外观与阅读」「项目收尾」及四种配色入口，并选择暖纸。项目目录、素材库与已有个人数据继续保留。

## 本次实现

- 配色：深林、暖纸、海蓝、暮紫；右上角快捷选择与设置页共用状态，localStorage 持久化。
- 阅读：文章/视频稿可切换编辑与阅读；支持基础块级排版，不执行原稿 HTML。对话收窄阅读宽度、调整行距和用户消息底色。
- 收尾：每次导出自动检查对应分支与公共资料，保留缺项提醒及包内 JSON/Markdown 报告。空发布文案纳入检查，文章包不因缺少视频误报。
- 行为规则：全局 `/Users/chenshuo/.codex/AGENTS.md` 和仓库 AGENTS.md 记录每次项目收尾检查，不创建定时提醒。

## 真实验证

- TypeScript / Vite 构建通过；Node 回归 24/24 通过，含导出缺项报告和分支隔离断言。
- 源码 Electron 与打包 Electron 分别通过四种配色切换、完整重启保留、阅读切换保持原稿、真实文件导出及缺项显示。
- 首页与设置在 390px 视口无横向溢出。窄屏配色入口使用设置页。
- 实际查看桌面、阅读、Agent 与窄屏截图。测试 profile 与个人 profile 隔离。
- Electron Forge arm64 打包完成；源包与安装包 codesign 深度验证通过。
- 安装 SHA 与旧应用备份位置见 `evidence/appearance.json`。测试截图保存在 `out/appearance-qa/`。

## 复现

```sh
npm run verify:appearance
npm test
npm run package:mac
```

## 边界

自动检查只覆盖现有文件、正文长度、来源记录、授权标记与 FFprobe 媒体信息，不能验证事实质量、完整剧情、主观音画质量或平台发布结果。基础阅读预览不支持全部 Markdown 语法；本次未新增 Claude API 能力或复刻完整 Artifacts 编辑器。没有提交、推送或公开发布现有仓库改动。

参考 Anthropic 对 Projects 与 Artifacts 的内容工作区说明：https://www.anthropic.com/news/projects 。本次借鉴内容聚焦、独立阅读与清晰操作层级，未使用 Claude 私人会话内容。
