# 多平台独立 Chrome 登录

支持抖音、小红书、视频号和公众号，每个平台可以添加多个账号。

## 使用

1. 工作台「分发交接 → 平台账号 → 添加平台账号」，选择平台并填写备注。
2. 点击「打开 Chrome / 登录」。工作台调用本机 Google Chrome，为这个账号打开独立窗口。
3. 在官方页面完成扫码、手机确认、验证码或账号选择，直到真正进入后台。微信账号需有对应平台权限。
4. 以后仍从同一张账号卡片打开，Chrome 继续使用同一会话目录；平台自身的登录有效期、风控和退出登录规则仍适用。
5. 备注可修改，账号平台创建后固定。移除需确认，会关闭该账号的独立 Chrome 进程并清除此账号的浏览器数据；其他账号及日常 Chrome 不受影响。如果无法安全确认浏览器进程，移除报错并保留其目录。

窗口打开和 Cookie 存在都不等于真实登录成功，界面不显示未经验证的「已登录」。重复打开可能新开同一账号的窗口，窗口共用该账号的 Chrome 会话。

## 从旧内置窗口升级

账号备注、UUID 和旧 Electron 会话保留。Chrome 与 Electron 使用不同的浏览器数据格式；不复制 Cookie 或读取日常 Chrome 的个人资料。首次在新 Chrome 窗口中需要重新登录。退出工作台不会退出独立 Chrome。

本机 Chrome 安装在 `/Applications/Google Chrome.app` 或 `~/Applications/Google Chrome.app`。未安装时会显示错误，不悄悄退回旧登录方式。

## 源码与存储

- `lib/account-browser.cjs`：通过参数数组启动系统 Chrome，无 shell 拼接、自动化标志或远程调试端口。每个 UUID 绑定一个专属目录。
- `shared/account-platforms.json`：四个平台的官方入口。
- `electron/douyin.cjs`：兼容原账号管理，新增 Chrome 打开入口，统一管理移除。
- `src/DouyinAccounts.tsx`：选择平台、备注、Chrome 登录及错误反馈。
- 应用用户目录下 `douyin-accounts.json` 保留历史名称，保存平台、UUID、备注和启动时间。
- `account-browsers/<platform>-<UUID>/` 由 Chrome 管理 Cookie、Local Storage 等数据。
- `Partitions/` 中的原 Electron 会话保留，移除对应账号时一起清除。

新登录流程直接使用标准浏览器处理官方跳转。工作台不拦截 Chrome 的认证导航，不修改平台 Cookie 的有效期，也不关闭浏览器安全检查。

## 运行与验证

```sh
npm start
npm test
npm run build
node scripts/verify-account-browser.cjs
npm run package:mac
```

`verify-account-browser.cjs` 使用临时独立 Chrome 目录和本地测试服务，验证同域两个账号的 Cookie / Local Storage 隔离、完全退出 Chrome 后重开恢复、关闭并移除单个账号。结果写入 `out/browser-login-qa/native-report.json`。自检不证明真实平台登录成功，需要用户扫码进入后台再验收。

`scripts/verify-douyin.cjs` 与 `scripts/verify-platforms.cjs` 保留为旧内置方式的兼容测试，不作为当前 Chrome 登录通过的证据。
