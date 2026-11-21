# 账号数据入口安装记录 · 2026-10-29

## 安装

- 新版源码已打包并安装到 `/Users/chenshuo/Applications/CS 工作台 Pro.app`，版本号仍为 0.7.2。
- 安装前旧应用备份：`out/installed-backups/CS 工作台 Pro-before-account-data-20261029-113646.app`；另保留可直接回退的副本 `/Users/chenshuo/Applications/CS 工作台 Pro-before-account-data.app`。
- 新安装 `app.asar` 与打包产物 SHA-256 一致：`7860d15b61c0a950c44c7c1e71714674007adbcf65d4101ca0b46a7a4e3faba7`；`codesign --verify --deep --strict` 通过。
- 用户数据仍位于原路径 `/Users/chenshuo/Library/Application Support/CS 工作台 Pro`，未搬迁。
- 安装证据：[account-data-install-20261029.json](evidence/account-data-install-20261029.json)。

## 安装版界面

- 已重启实际安装版并打开「平台账号」页。
- 9 个已有账号仍显示；账号卡片上可见「读取账号资料与作品数据」或「刷新数据」入口。
- 当前已有一个账号数据快照，但平台昵称和作品指标未识别到。

## 未完成项

真实平台资料与作品指标尚未完成端到端验收。读取需要在对应账号专属 Chrome 窗口中进入平台数据中心，再从工作台刷新；各平台页面字段不同，需要用实际页面确认解析结果。
