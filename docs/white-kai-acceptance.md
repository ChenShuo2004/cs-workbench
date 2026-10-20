# 纯白主题与 KAI 品牌交付 · 2026-10-18

## 本次交付

- 纯白主题：原暖纸主题沿用 `paper` 存储键，迁移为纯白背景、中性灰边框、深灰文字。首页去除暖色和装饰渐变，新安装默认纯白；已有其他主题选择保留。
- 用户明确选定 KAI 男孩头像。基于已确认 3D 母版生成头像，保留蓝色反戴帽、黑发、半睁眼、白色卫衣与 KAI 标识。
- 同一头像用于 macOS 应用图标、侧栏标记、启动界面、首页和软件封面。封面 1600 × 900，可编辑 HTML 与原始头像同时保留。

## 文件与复现

- 原始头像：`assets/branding/kai-avatar.png`
- 应用图标：`assets/icon.icns`、`assets/branding/icon-1024.png`
- 软件封面：`assets/branding/CS工作台-KAI封面.png`
- 封面排版源文件：`assets/branding/cover.html`
- 来源与生成记录：`assets/branding/manifest.json`
- 图标和封面重建：`node scripts/build-branding.cjs`（使用本机 Chrome 渲染 HTML）
- 界面验收：`npm run verify:appearance`

## 验证

TypeScript/Vite 构建通过，32 项现有测试通过。源码 Electron 与 arm64 打包版均通过四种主题切换、重启保存、原稿/预览切换、交付检查及 390px 窄屏测试。实际查看纯白桌面、窄屏、封面和 64px 图标，KAI 头像可辨认。安装版的 `CFBundleIconFile` 为 electron.icns，其 SHA256 与生成的 KAI 图标一致。macOS codesign 深度验证通过。

应用已更新到 `/Users/chenshuo/Applications/CS 工作台 Pro.app`，旧版本保留备份。安装哈希和备份位置见 `out/white-ip-qa/install.json`，界面证据见 `out/white-ip-qa/ui/`。本次没有更改项目数据、视频场景配色或健康记录。

本次提供的是母版衍生头像，不改变原始角色母版。技术检查与实际图片查看已完成，不代表用户已经确认主观视觉效果。

## 安装后实机复核

首次从原生应用入口打开曾停在启动画面；正常退出后，使用实际用户 profile 重新启动和刷新，主界面加载通过，头像 naturalWidth=1254，配色键为 paper。随后再次从原生入口打开，确认主界面显示「纯白」及两处 KAI 男孩头像。未发现可复现错误，未改动用户数据或清除缓存。
