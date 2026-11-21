# 多平台 Chrome 登录修复交付 · 2026-10-19

## 问题与处理

用户反馈：手机扫码确认成功，电脑端未进入后台，多个平台都遇到问题。旧实现只验收官方登录入口和人工设置的测试 Cookie，没有覆盖真实认证跳转，不能证明可登录。

只读检查发现原视频号/抖音目录有 Cookie；同域导航最小复现能通过，未取得真实扫码后的完整网络链路，故不能把失败唯一归因为 Cookie 未保存或某个域名被拦截。

用户明确选择改用独立 Chrome 窗口。0.3.6 将界面主入口统一改为「打开 Chrome / 登录」，调用本机 Chrome，每个账号使用 `account-browsers/<platform>-<UUID>`。标准浏览器处理官方认证导航，工作台不再介入主登录流程的跳转或修改 Cookie。旧账号记录和 Electron 分区保留，首次需在新 Chrome 目录完成验证。

## 验证

- `npm test`：40/40 通过。
- TypeScript / Vite 构建、CommonJS 语法、`git diff --check` 通过。
- 真实 Chrome + 本地测试服务：两个账号同域 HttpOnly Cookie 和 Local Storage 互相隔离。
- 正常退出两个 Chrome 进程，重新创建工作台启动器并重开浏览器：不重设 Cookie 即可读回原值；Local Storage 同时恢复。
- 移除选定测试账号：只关闭和删除该专属目录，另一账号数据保留。正常退出通过 macOS 对经过 PID 与完整目录参数双重校验的进程发出退出请求；不对日常 Chrome 发送退出命令。
- 负向检查：无 Chrome、进程启动错误、路径注入、未知平台、其他进程占用锁均有处理；不开放远程调试，不关闭证书验证或浏览器安全机制。
- 测试中发现 SIGTERM 可中断 Cookie 写盘，已替换为 macOS 正常退出请求；修正后完整退出/重开验证通过。
- 已安装应用界面实际显示独立 Chrome 入口。用户后续添加/启动了多个账号，相关卡片启动时间已更新；这不替代真实平台登录完成证据。

结果：`out/browser-login-qa/native-report.json`、`install.json`。

## 交付位置

- 安装：`/Users/chenshuo/Applications/CS 工作台 Pro.app`，0.3.6，已正常退出旧版并启动新版。
- 源码：`/Users/chenshuo/coding/cs-workbench`。
- 使用与复现：`docs/platform-accounts.md`；`node scripts/verify-account-browser.cjs`。
- 旧版备份：`out/app-backups/20261019-before-chrome-login/CS 工作台 Pro.app`。
- 安装阶段账号元数据 SHA256 未改变，安装后资源与打包产物 SHA256 相同，深度严格签名校验通过。
- 本地交付，无 Git 提交或推送；保留其他未提交工作。

## 未完成项

仍需用户完成真实平台扫码/账号选择，确认进入后台，并在关闭、重开对应账号窗口后确认身份仍正确。当前自动测试未持有真实登录凭据，因此 `realPlatformLoginVerified` 保持 false。人工验证结果以本次会话后续用户反馈为准。

## 浏览器资料依据

Chromium 官方用户数据目录文档说明 `--user-data-dir` 可指定独立配置，包含 Cookie 等资料：
https://chromium.googlesource.com/chromium/src/+/main/docs/user_data_dir.md
