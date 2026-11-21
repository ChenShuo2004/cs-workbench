# 内容工作台对标与本次实现

研究与实现日期：2026-10-18。目标：让个人内容创作者明确下一步、改善内容质量、保存真实结果，并看到自己的身体记录。

## 结论

没有可验证的“世界上最好工作台”统一排名。对陈硕更合适的是：Linear 的优先事项 + Notion 的内容与项目关联 + Buffer 的渠道排期 + Airtable 的目标到结果追踪。保留本地文件、现有剪辑、Agent 和配色，不增加一个与真实项目脱离的展示面板。

本次研究是公开产品行为与官方资料分析，独立实现；未获取闭源源码或声称复刻其全部能力。

## 对标证据与转化

| 产品 | 官方材料支持的行为 | 对 CS 工作台的设计判断 | 本次落地 |
| --- | --- | --- | --- |
| Linear | My Issues 按紧急、阻塞、周期等分组，并结合优先级展示 | 打开页面应先看到需要推进的内容 | 到期计划、重要选题优先，已发布内容排后；下一步动作直接显示 |
| Notion | 内容数据库关联简报、素材、文稿与排期，多视图追踪同一条内容 | 不重复建立脱离项目的内容卡片 | 以现有项目路径关联简报、计划、复盘，直接进入原项目 |
| Buffer | 创意库、按渠道组织草稿、日历和发布队列 | 内容想法与渠道发布不是同一阶段 | 平台、计划日期独立保存；本地计划不被标成平台定时或发布 |
| Airtable | 内容运营从受众、内容目标到结果衡量，数据关联在同一流程 | 每条内容应沉淀下次可复用的判断 | 受众、观点、开头、证据、行动与效果复盘 |

来源（2026-10-18 已打开原文）：

- Linear, My issues：https://linear.app/docs/my-issues
- Notion, How to create a content calendar for your marketing team：https://www.notion.com/help/guides/this-content-calendar-drives-high-performance-marketing-teamwork 。原文明确提示部分界面操作基于较早版本，本次仅借鉴数据关系和流程设计。
- Buffer, Publish：https://buffer.com/publish
- Buffer, Ideas API guide：https://developers.buffer.com/guides/ideas.html
- Airtable, Using Airtable for content operations：https://www.airtable.com/guides/marketing/how-to-use-airtable-for-content-operations

## 一条内容的可复用流程

输入：真实观众问题、项目事实、来源、已有选题。

1. 明确受众与唯一观点：本条内容解决什么具体问题。
2. 写开头、证据、结尾行动：缺证据就显示缺口，不能用夸张表达替代事实。
3. 记录下一步与优先级：将大目标缩小成可执行动作。
4. 进入已有文章或视频项目制作，沿用原有来源、QA、导出与发布记录。
5. 记录目标平台和计划日期。此处排期不连接平台，也不会自动发布。
6. 发布后录入结果链接、统计日期、阅读/播放、收藏、评论、经验。数字允许真实的 0，缺失值保持空白。
7. 把验证后的经验带到下一条创作简报。复制简报可交给 Agent，但不自动发送。

简报 0–5 是五个字段的填写完整度，不是事实核查、作品质量或爆款预测。人工判断仍需看原文、画面和真实反馈。

## 健康为什么之前不显示

CS 工作台原来没有健康页面、记录模型或同步通道。ChatGPT Health 的 Apple 健康连接属于 ChatGPT，并不会自动授予本地 Electron 应用同样的访问能力。

当前实现：

- 首页健康概览与侧栏「健康」。
- 本地记录步数、步行跑步距离、体重、睡眠、静息心率与主观精力。
- 支持单日或只有月份精度的历史记录；不虚构具体日期。
- 记录保留来源、测量日期与录入时间。月度记录不进入每日趋势。
- 趋势只展示有记录的日期，不补缺失值；少于两个日期时不造趋势。
- 手动录入并持久保存；同指标、同日期、同来源重复保存会更新。
- 打开 ChatGPT Health；独立导出健康 JSON。
- 本次已核实的网页数据作为一次性本地快照写入用户数据目录，未写入源码、测试样例、安装包或仓库文档。

OpenAI 官方来源：https://help.openai.com/en/articles/20001036-health-in-chatgpt 。连接 Apple Health 需要在 iPhone 上进行。该文档说明的是 ChatGPT 内的功能，不是本工作台的数据接口。

0.3.2 已补充 Codex 定时浏览器读取与本机导入，详见 [HEALTH-SYNC.md](HEALTH-SYNC.md)。页面显示同步时间、原始记录日期和错误；定时读取成功也不代表上游有新数据，不是实时监测。

## 数据、边界与后续扩展

- 健康：用户数据目录 `health/records.json`，目录 0700、记录文件 0600，保存前保留上一版本。它不进入个人记忆、Agent 上下文或内容导出包。这是本机文件权限保护，不是应用层加密。
- 内容运营：用户数据目录 `content-ops/plans.json`，保存前保留上一版本；不改项目原稿或发布状态。
- 两者独立导出；现有「个人数据备份」不包含这两个新增目录。完整备份需另行导出，或在应用退出时备份用户数据目录。
- 下阶段健康自动化需要明确的数据来源、授权与可维护的接入机制。优先评估用户控制的 Apple 健康导出/快捷指令，再考虑原生 HealthKit 配套应用；不能虚构公开 ChatGPT Health API。
- 下阶段内容优化：平台独立数据导入、对同一平台同一观察时长的内容比较、可验证的选题实验、来源与成片质量检查。没有平台授权或数据时不生成虚假成效。

## 本地复现

```sh
npm install
npm test
npm run build
npm run start
npm run package:mac
```

主模块：`src/Health.tsx`、`src/ContentOps.tsx`、`src/operations.css`、`lib/health.cjs`、`lib/content-ops.cjs`。IPC 沿用现有主窗口来源校验。未推送 GitHub或公开发布。
