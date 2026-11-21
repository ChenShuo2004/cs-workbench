# 调研与产品决策

## REA 已实际使用

用户所述三字母工具对应候选 **REA / Reverse Engineer Anything**，官方仓库：https://github.com/morluto/rea 。本轮实际运行 `rea-agents 6.5.0`，对旧 CS Workbench 和 LosslessCut 的指定模块完成静态分析。

证据索引：`docs/evidence/research.json`。原始完整证据在 `out/rea-baseline-evidence.json` 与 `out/rea-losslesscut-evidence.json`，体积较大，保留本机，不打入应用。

REA 输出明确标记 confidence=derived；动态 IPC、未选择的源码及运行时行为未证实。它用于帮助理解结构，实际功能以应用交互与媒体验收为准。

## 借鉴与重新实现

- [Descript](https://www.descript.com/video-editing)：文字与视频时间范围对应，形成按句剪辑工作流。没有获取或复制它的闭源实现。
- [LosslessCut](https://github.com/mifi/lossless-cut)，本次快照 `2610158c7861e0b96e2020cebcdd3c539ff33830`：研究媒体探测、片段边界、进程取消、进度与 concat 的职责划分。GPL 项目仅作为行为/架构研究；本工作台渲染代码独立编写，未复制其源码。
- [OpenCut](https://github.com/OpenCut-app/OpenCut)，本次快照 `e668010778568641babef2cc40be4703ae6916d6`：网页 editor.tsx 显示 Coming soon，desktop timeline.rs 为占位。没有把它当作成熟实现基础。
- [Codex 官方非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)：通过 CLI 发起有明确输出的请求。
- [xAI 官方 API](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions)：独立 API Key、账户模型与流式文本回复。

未绕过付费授权、提取第三方凭据或把他人商标/素材做成本产品内容。研究工具不是「一键得到成熟产品」的替代物。

## 视觉系统

应用界面采用炭黑背景、低对比面板、有限鼠尾草绿强调；左侧导航固定，主要工作流在第一屏可达。任务首页强调今日行动，编辑器强调文稿、画布和时间线，Agent 强调显式上下文。

视频美术独立于软件 UI。场景模板采用用户已确认 P01 / P06 / P04 的颜色分工、光源方向与层次，通用人物为本次原创，不声明为 KAI。预览/导出共享 renderer，参考图片不直接进入产品。

## 本版验收口径

1. 本机可安装、可启动，并保留旧版回退。
2. 任务/记录/记忆/目录/会话重启不丢失。
3. GPT 使用既有登录得到真实回复；Claude、Grok 缺少认证如实显示。
4. 导入媒体 → 本地转写 → 按句剪辑 → 静音检测 → 横竖屏导出可跑通。
5. 场景文案可编辑，导出有真实 MP4 和 QA 记录。
6. 主要页面键盘可操作，390px 不横向溢出。

## 商业化边界

0.2.0 是用户本机可用的产品内测版本，不冒称已通过商业分发验收。尚未完成：Apple Developer 正式签名/公证、跨设备安装矩阵、自动更新、计费与授权、崩溃恢复压力测试、大素材性能基准、多轨精编、自动人脸重构图。

价格和套餐应在用户用真实任务跑通并采集耗时后确定。产品价值先验证三件事：每天是否愿意打开；一条口播是否减少来回切工具；项目和经验是否能在下一条内容复用。
