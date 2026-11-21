# 多平台账号交付检查 · 2026-10-18

## 产物与源码

- 已安装：`/Users/chenshuo/Applications/CS 工作台 Pro.app`。
- 源码：`/Users/chenshuo/coding/cs-workbench`（指向内容目录内 CS工作台）。
- 复现：`npm start`；验证命令见 `docs/platform-accounts.md`。
- 已运行的旧进程未强制退出，退出后重新打开才能启用本次版本。
- 原应用备份：`out/app-backups/20261018-before-platform-accounts/CS 工作台 Pro.app`。

## 实际验证

- `npm test`：26/26 通过，包含旧抖音记录兼容、平台隔离、域名边界及原有业务回归。
- TypeScript / Vite 构建、CommonJS 语法、`git diff --check` 通过。
- `node scripts/verify-douyin.cjs`：两个抖音账号隔离、改名、窗口复用、重启后 Cookie 保留、取消与确认移除、390px 布局通过。
- `CS_PACKAGED_EXECUTABLE=... node scripts/verify-platforms.cjs`：真实打包应用中四个平台的添加、打开、窗口复用、Cookie 隔离、完整重启持久化、取消与单账号清理通过。
- 四个官方登录入口均实际加载并显示登录控件。小红书显示短信登录和扫码切换；视频号显示微信快捷登录；公众号显示登录及账号选择。微信官方页面可能识别本机微信提供快捷登录，本检查未选择账号进入正式后台。
- 人工查看添加弹窗、桌面、390px 和三平台官方页面截图，无新增布局溢出。
- 安装副本通过 `codesign --verify --deep --strict`；安装后 app.asar SHA256 与已验收打包产物相同，详见 `out/platforms-qa/install.json`。
- 测试使用临时 Electron 用户目录。未复制个人 Cookie，未编辑个人账号记录。窗口可见不代表登录成功。

## 未完成项

实际账号首次验证及登录后功能验收需要用户在官方页面完成扫码、验证码或账号选择。本次没有宣称真实账号已登录，也未上传或发布内容。

本次代码保留在现有本地工作区，没有提交或推送；已有未提交改动保留。
