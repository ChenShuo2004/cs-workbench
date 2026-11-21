# Kaige-work 第一阶段交付

运行：`npm install`，`npm start`。构建安装包：`npm run package:mac`。

数据目录保持 `~/Library/Application Support/cs-work`，账号 UUID、Chrome profiles、代理密码与端口不迁移。旧版账号 Chrome 若未连接管道，首次使用先关闭那个账号窗口，再重新打开；不会自动杀掉窗口。

发布：导入工程目录或选择视频 → 主文案和各平台覆盖 → 选号 → 自动填表 → 在任务记录查看日志 → 平台窗口人工检查、发布 → 回工作台手动标记并填写链接。失败后先检查平台现有草稿，避免重复上传。公众号需要登录并手动打开图文编辑器，再开始填表。

原麦田服务已从应用移除；`~/maitian` 与后台服务保留。原 Distribution 界面的未提交修改保存在 `docs/legacy/Distribution.tsx.txt`。

自动验证：`npm test`、`npm run build`、`node scripts/verify-publisher.cjs`、`node scripts/verify-kaige-ui.cjs`。

实际验证记录见 `out/qa/`。真实平台尚待逐个平台扫码并用用户指定测试视频验收。该步骤不能由本地仿真测试代替。

当前实现限制：数据采集仍使用既有指标解析器，未完成逐平台字段解析替换；样式入口已合并为 tokens/app，仍保留原有组件样式；拖拽视频导入、平台图标重绘和设置中的并发/路径编辑尚未实现。公众号编辑器入口需用户手动打开。平台上传和字段适配尚未经本次真实平台验证。

## 2026-11-21 自动验证结果

28 项单元测试通过；真实 Chrome 私有管道本地上传页通过，文件和多行正文回读正确，鼠标与脚本发布点击均被拦截；安装版 Electron 隔离测试通过，草稿保存、四页导航与窄屏检查通过。应用签名校验通过。以上不代表真实平台上传验收完成。
