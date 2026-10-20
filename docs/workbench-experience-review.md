# 工作台体验优化验收

范围：整个工作台的视觉层次、导航与查找、动态反馈、键盘操作和恢复状态。沿用 KAI、纯白默认主题和现有四套语义配色；不改变视频模板、媒体色彩或生成模型参数。

## 审查发现与修改目标

| 问题 | 影响 | 实现与验收目标 |
| --- | --- | --- |
| 小窗口的流程导航仅剩数字，缺少可读名称 | 难以找到创作室及其他目的地 | 可展开的完整导航；选中页可辨识，窄屏可关回内容 |
| 全局搜索先切到首页，打断当前编辑上下文 | 只是查找也会离开创作页面 | 原地打开统一搜索，页面、项目、任务、记忆和会话可直达；取消保持页面和输入 |
| 多个弹窗只有遮罩，没有焦点约束与恢复 | Tab 可进入背景，Escape 行为不一 | 复用原生模态层，键盘焦点留在弹窗内，关闭回到触发按钮 |
| 动效与密度散落，缺少用户偏好 | 不同页面节奏不一致 | 统一短时过渡，提供舒适/紧凑、跟随系统/轻柔/减少动态效果，重启保持 |
| 初始化失败仍显示无限加载，提示定时器可提前清除新提示 | 错误不能恢复，反馈丢失 | 明确失败、重试；提示计时与当前消息一致 |
| 卡片、导航、标题与边界缺少层次 | 首屏扫描与点击反馈弱 | 统一间距、层次、焦点、悬停；保持真实数据和页面用途 |

## 验收机制

1. 修改前检查真实组件、既有界面与数据边界，记录可复现缺陷。
2. 修改后构建、类型检查和适用单元测试。
3. 在隔离用户目录的 Electron 中操作：全局查找与返回、导航、弹窗焦点、主题/密度/动态偏好与重启、失败重试、桌面与窄屏溢出。
4. 回归个人工作区、创作室与画布 `@` 自动连线；使用测试数据与模拟生成服务，不消耗真实生成额度。
5. 打包后在真实安装包复验，保留旧安装包及用户数据。通过情况写入 evidence；未完成检查明确列出，不用源码推断替代 UI 验收。

## 0.7.0 的实现

- `WorkspaceSearch.tsx`：统一搜索页面、项目、任务、资料、记忆、会话和目录；查询留在当前编辑上下文，确认跳转后才保存并离开。支持方向键、回车、Esc、输入法组合输入及读取失败重试。
- `Dialog.tsx`：新建选题、剪辑项目、任务、记忆、数据备份、xAI 配置、导出队列与账号表单共用原生模态层；背景不可获得焦点，退出恢复焦点；失败原因显示在弹窗内部。
- `Appearance.tsx`、`experience.css`：语义化表面、标题、间距、边界、焦点和悬停；舒适/紧凑密度；跟随系统/轻柔/减少动态效果，偏好持久化。页面短淡入、弹窗短过渡，不对画布位置和尺寸做过渡。
- `main.tsx`：窄窗口完整导航抽屉、当前页标识、跳到主内容、启动失败重试、新建防重复提交、当前通知独立计时及可关闭提示。
- `Personal.tsx`：搜索结果直接打开具体记录；初始化异常可重试；聊天滚动尊重减少动态效果。
- `ui-error.ts`：保留实际错误原因，去掉 Electron 的传输层技术前缀。

## 复现

```sh
npm test
npm run verify:experience
npm run verify:appearance
node scripts/verify-canvas-parity.cjs
node scripts/verify-generation-nodes.cjs
npm run package:mac

CS_PACKAGED_EXECUTABLE="$HOME/Applications/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro" \
  node scripts/verify-experience.cjs
CS_PACKAGED_EXECUTABLE="$HOME/Applications/CS 工作台 Pro.app/Contents/MacOS/CS 工作台 Pro" \
  node scripts/verify-canvas-parity.cjs
```

测试自动建立临时数据目录。生成流程脚本使用模拟服务，真实执行队列、媒体落盘、项目持久化和界面操作；不读取用户密钥或提交收费任务。

## 交付记录

安装位置：`/Users/chenshuo/Applications/CS 工作台 Pro.app`。源代码：`/Users/chenshuo/coding/cs-workbench`。旧应用副本、安装包 SHA-256 与最终检查结果见 [安装记录](evidence/workbench-experience-install.json)。使用方式见 [START-HERE](START-HERE.md)。

验收证据：

- [整体体验安装版](evidence/workbench-experience-ui.json)：原地搜索、记录直达、键盘焦点、四套配色、密度、动效、重启恢复、窄屏导航、13 个页面及失败重试。
- [画布安装版](evidence/workbench-experience-canvas.json)：13 项真实操作，包括 `@` 自动连线、复制粘贴、分组、撤销、全屏、重启与窄屏菜单。
- [生成流程](evidence/workbench-experience-generation.json)：6 项模拟服务集成，包含上游生图、混合素材、首尾帧、逐镜时长、批量顺序及重启。
- [外观与文章交付](evidence/workbench-experience-appearance.json)：5 项，包含配色切换、读写切换、真实文件导出、缺项提醒及窄屏。

本轮实际运行单元测试 76 项全部通过，构建和签名验证通过。截图保存在 `out/experience-qa/`，使用隔离测试数据；已目检首页、搜索、设置、创作室、内容总览、健康、资料、文件、Agent、发布和错误恢复界面。

一次安装版测试启动无响应，已停止其隔离测试进程；测试驱动增加有界启动超时、避免在失败清理时再次等待窗口，重新启动后完成安装版画布验收。

未完成项：没有遗留的本轮已定位功能缺陷。验证边界：未重新消费真实生成 API 额度，未执行平台登录或公开发布；用户对视觉偏好的最终确认仍以实际使用为准。
