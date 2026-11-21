> 此文记录原抖音版本；当前入口已扩展为「平台账号」，请使用 [多平台账号说明](platform-accounts.md)。旧抖音会话兼容保留。

# 抖音多账号后台

目标：在 CS 工作台内管理多个抖音创作者中心账号，每个账号单独登录，同时打开并快速切换。

## 使用路径

1. 左侧「抖音账号」→「添加抖音账号」→填写 1–40 字备注并保存。
2. 点对应账号「打开后台 / 登录」，在官方页面扫码、短信验证或密码登录。
3. 再添加下一个账号，各自在对应窗口完成登录。
4. 关闭后台窗口后记录仍保留；再次打开使用原来的登录空间。登录是否有效由抖音决定。
5. 点铅笔修改备注；移除需在原生确认框确认，随后关闭该账号所有窗口并清除该会话数据。

备注是用户自定义标签，不代表平台核实的身份。工作台只展示窗口打开/关闭和页面加载错误，不将窗口打开或 Cookie 存在标成登录成功。

## 模块与数据

- `lib/douyin-accounts.cjs`：本机账号元数据、UUID、名称校验、会话标识和导航地址检查。账号清单独立于原有项目配置，旧配置无需迁移。
- `electron/douyin.cjs`：会话和窗口生命周期。每个 UUID 对应 `persist:douyin-<uuid>`，窗口与安全的新窗口共用该账号会话；其他账号使用不同会话。
- `electron/main.cjs` / `preload.cjs`：仅向工作台主页面提供有限的账号接口，所有 IPC 校验发送窗口和主 frame。
- `src/DouyinAccounts.tsx`：添加、备注编辑、窗口切换、加载失败恢复和移除入口。窗口状态通过主进程事件同步。
- 本机用户数据目录：`douyin-accounts.json` 保存 UUID、备注和创建/打开时间；`Partitions/` 保存 Chromium 管理的会话数据。元数据用临时文件替换保存，包含读取失败时的错误反馈；不静默覆盖损坏文件。

外部后台窗口使用 sandbox、contextIsolation 和 webSecurity，无 Node、无工作台 preload。顶层导航和弹窗限 HTTPS 的 douyin.com 及其子域，不使用系统浏览器承载账号会话。跨其他域的帮助、推广或额外认证入口目前会被阻止；若官方认证流程改变，应先核实具体域名再扩展白名单。

可以在此结构上添加其他平台各自的 URL、安全域和界面文案，保留 UUID 对应独立会话的方式。当前交付只接入抖音创作者中心；上传、发布与数据查看由官方后台提供。

## 验证与复现

```bash
npm test
npm run build
# Playwright 需已安装，或通过 NODE_PATH 提供
node scripts/verify-douyin.cjs
npm run package:mac
```

`verify-douyin.cjs` 启动真实 Electron，使用临时用户数据，不读写已有工作台配置和账号。验证内容：

- UI 新增、改名、同时打开两个账号后台、重复打开聚焦已有窗口。
- 真实 Electron Session 中同名测试 Cookie 不串号，应用重启后分别保留。
- 外部窗口无 preload/Node，启用 sandbox 和 contextIsolation。
- 桌面与 390px 页面无横向溢出并保存截图。
- 取消移除保留账号；确认移除只清除目标账号数据。自动测试替代确认框选择，不进行真实用户账号删除。
- 官方登录页加载情况。真实账号扫码登录、发作品和看数据需用户登录后验收。

macOS 打包后自动更新本地临时签名并校验，防止替换 Electron 资源后签名失效；此步骤不包含 Apple 公证。

结果与截图写入忽略目录 `out/douyin-qa/`。自动验证不持有真实账号，不证明抖音平台实际登录或发布成功。

[Electron 会话文档](https://www.electronjs.org/docs/latest/api/session) · [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)
