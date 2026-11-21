# cs-work 架构说明

`cs-work` 是面向多平台内容矩阵的轻量 macOS 桌面工作台（Electron 44 + React 19 + TypeScript + Vite），聚焦三个核心模块：

1. **发布中心**（`src/Distribution.tsx` + `lib/maitian.cjs`）
   - 内嵌本机麦田原网页（`127.0.0.1:<port>`），主进程拦截 `onBeforeSendHeaders` 仅向已配置的本机源注入 `mt_key` Cookie，渲染层与外部站点均无法读取口令。
   - 顶部提供矩阵账号一键隔离发布条，按账号直接拉起绑定专属代理的 Chrome 进入该平台发布页。

2. **8 平台账号与数据看板**（`src/DouyinAccounts.tsx` + `shared/account-platforms.json` + `lib/account-data.cjs` + `lib/chrome-cdp-pipe.cjs`）
   - 覆盖抖音、小红书、视频号、公众号、B站、YouTube、X、Instagram。
   - 通过私有 stdio DevTools 管道（`--remote-debugging-pipe`，不暴露任何 TCP 调试端口）只读抓取页面可见昵称、ID、头像与中英文指标文本，解析结构化 KPI 并保存最多 60 次历史快照以计算增减变化。

3. **网络与环境隔离引擎**（`lib/network-isolation.cjs` + `lib/account-browser.cjs` + `electron/douyin.cjs` + `src/NetworkIsolation.tsx`）
   - **会话隔离**：每个账号固定独立 Chrome 目录 `~/Library/Application Support/cs-work/account-browsers/<platform>-<uuid>/`。
   - **网络隔离**：支持本机 Clash Verge Rev 多端口分流与独立远程代理（HTTP/HTTPS/SOCKS5，含账密认证）；远程代理密码通过 macOS 钥匙串（`safeStorage`）加密存储，带认证代理自动在主进程启动单账号 `127.0.0.1` 回环转发桥。
   - **防泄露与风控保护**：默认 Fail-Closed（启动前探测代理连通性，不通阻断打开 Chrome）、`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`、SOCKS5 防本地 DNS 泄露、独立 `TZ` 时区与 `--lang` 语言，以及同平台同直连/同代理/同出口 IP 冲突预警。
