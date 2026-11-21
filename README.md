# cs-work

**多平台发布中心、矩阵账号数据看板与独立网络隔离工作台（macOS / Apple Silicon）。**

`cs-work` 由原 CS 工作台 Pro 精简重构而来（v1.0.0），移除了与分发无关的个人任务、视频剪辑画布、AI 生图/生视频与文章库等重型模块，聚焦三大核心能力：

1. **发布中心**：无缝内嵌本机「麦田」发布与大屏服务（主号 7 平台自动化分发、日历与复盘），同时顶部提供**矩阵账号一键隔离发布条**，点击账号即可拉起其专属 Chrome Profile 与代理直达平台发布页。
2. **账号与数据**：覆盖全部 **8 大平台**（抖音、小红书、视频号、公众号、B站、YouTube、X、Instagram）。支持汇总指标看板、单账号结构化 KPI（粉丝、播放/阅读、点赞、评论、收藏）、历史快照与增减对比，以及一键拉起后台/发布页/读取实时数据。
3. **网络隔离中心**：每个账号独立 Chrome Profile + 独立网络出口配置，**同时支持**：
   - **本机多端口分流**（如 Clash Verge Rev / Surge 的 `127.0.0.1:7890 / 7891 / 7892`）
   - **独立远程代理服务器**（HTTP / HTTPS / SOCKS5，支持用户名密码认证；密码经 macOS 钥匙串加密保存，并由主进程按账号自动建立本地回环认证桥接）
   - **安全防漏**：默认开启 **Fail-Closed**（启动前检测代理，不通则阻断启动 Chrome，防止泄露本机真实 IP）、**WebRTC 防 IP 泄露**、SOCKS5 防 DNS 泄露、独立时区/语言、一键检测出口 IP 与延迟，以及**同平台同代理 / 同出口 IP 冲突预警**。

---

## 目录结构

```text
cs-work/
├─ electron/
│  ├─ main.cjs                 Electron 主进程、安全 IPC、麦田同源 Cookie 注入、首次数据自动迁移
│  ├─ preload.cjs              受限只读白名单 window.cs bridge
│  └─ douyin.cjs               多平台矩阵账号、代理认证桥接、启动前检查与数据读取管理器
├─ lib/
│  ├─ network-isolation.cjs    代理校验、钥匙串密文存储、回环认证桥、出口 IP 探测与同平台冲突分析
│  ├─ account-browser.cjs      独立 Chrome Profile 管理、隔离参数构建与旧版会话安全迁移
│  ├─ chrome-cdp-pipe.cjs      私有 stdio CDP 管道读取 8 平台可见资料与指标（不开放 TCP 调试口）
│  ├─ account-data.cjs         结构化 KPI 解析、历史快照与增减对比存储
│  ├─ douyin-accounts.cjs      账号元数据存储（完全兼容原 douyin-accounts.json）
│  └─ maitian.cjs              本机麦田服务状态检查与同源认证头注入
├─ shared/
│  └─ account-platforms.json   8 大平台入口（后台 / 发布页 / 数据中心 / 允许域名）
├─ src/
│  ├─ main.tsx                 4 视图清爽主壳（发布中心 / 账号与数据 / 网络隔离 / 设置）
│  ├─ Distribution.tsx         发布中心（矩阵一键隔离发布条 + 麦田内嵌）
│  ├─ DouyinAccounts.tsx       账号与数据看板
│  ├─ NetworkIsolation.tsx     网络隔离中心与冲突监控
│  ├─ NetworkEditorModal.tsx   单账号代理 / Clash 端口 / WebRTC / 时区配置弹窗
│  └─ Appearance.tsx           4 套语义配色（纯白 / 深林 / 海蓝 / 暮紫）
├─ tests/                      单元测试（网络隔离、数据解析、浏览器隔离、账号存储、麦田安全边界）
├─ extras/                     迁入的历史附加资料（音效与配乐库、codex-image-mcp、Antigravity 修复；不入 Git/安装包）
└─ workspace-projects/         迁入的历史工作台内容项目备份（不入 Git/安装包）
```

## 旧数据无缝兼容

首次启动 `cs-work` 时，若 `~/Library/Application Support/cs-work/` 尚无配置或账号列表，会自动从 `~/Library/Application Support/CS 工作台 Pro/` 复制 `config.json`、`douyin-accounts.json` 和 `account-data.json`；打开任一已有账号时，如其旧版 Chrome Profile 未被占用，会自动迁移其独立登录会话，原有 `CS 工作台 Pro` 数据与旧版应用均完整保留不删除。

## 开发、验证与打包

```bash
npm test                     # 运行全部单元测试
npm run build                # TypeScript 检查 + Vite 构建
node scripts/verify-cs-work.cjs  # 启动隔离实例进行真实 Electron UI 验收
npm start                    # 启动本地开发版 cs-work
npm run package:mac          # 打包 Apple Silicon 应用 (out/cs-work-darwin-arm64/cs-work.app)
```
