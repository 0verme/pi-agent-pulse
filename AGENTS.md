# AGENTS.md

## 项目定位

Pi Pulse 是 Pi Agent 的任务状态观察、Watchdog 与可插拔 outbound notification layer。当前核心部署形态是 Pi Agent Extension；不要把 Optional Control Plane 提前变成运行时依赖。

## 架构规则

- Core 不依赖具体 IM，不得 import `channels/feishu/*` 或 `channels/webhook/*`。
- Core 只产生结构化 `TaskEvent`；消息格式属于 adapter。
- State Machine 只有一份，由 `TaskManager` 按 session 管理。
- Generic Webhook 必须保持一等公民，不能把公共抽象设计成 Feishu-only。
- Outbound 与未来 Inbound 分离；本轮不要实现 inbound bot、remote query 或 control API。
- 本轮禁止提前引入数据库、Web Server、Dashboard、Control Plane、复杂 DI framework 或 plugin marketplace。

## Pi runtime 安全

- Channel failure 必须被捕获并产生可观测 warning，不能影响 Pi runtime 或其他 channel。
- Extension 不得 stop、kill、abort Pi 任务，也不得因为 watchdog 或通知失败调用 Pi control API。
- 修改 `src/extension/pi.ts` 的 lifecycle adapter 前，必须核对当前机器实际 Pi version 和 `@earendil-works/pi-coding-agent` runtime type；不要根据旧文档或印象猜 API。
- 不要在 notification log 中输出 webhook URL、token、cookie、secret、原始 payload、完整 prompt、tool args、源码或环境变量。

## 安全与隐私

- 绝不提交真实 webhook、token、cookie、secret、private key、生产凭据或真实连接串。
- 示例配置只使用 `YOUR_WEBHOOK_URL`。
- 默认保持 payload bounded；不要把完整聊天、tool result 或源码加入事件。
- 任何 URL 出站逻辑都必须有 scheme/host/credentials 安全校验，并使用 timeout、无无限 retry。

## 开发方式

- 优先小改动，先读相关模块和实际类型，再编辑。
- 维持单向依赖；新增 channel 时只实现 adapter contract，不把 channel 概念推入 Core。
- 不为了未来 Control Plane 预留数据库表、HTTP endpoint 或常驻进程。
- 修改前后检查 `git diff`，只提交本任务相关文件。

## 测试风险分级

- **低风险**：优先跑受影响的 domain event、state transition、router 或 transport unit tests。
- **中风险**：公共核心模型、跨模块 contract、Watchdog timer、privacy boundary 变更，需要跑 typecheck、相关 unit tests 和 lint。
- **高风险**：Pi lifecycle adapter、channel router failure isolation、出站安全校验、最终 merge/release 前，执行一次完整验证：typecheck、lint、unit tests、build，并检查 secret scan。
- 开发阶段按风险分级测试，不默认反复跑全量测试。
- 仅在公共核心模型、跨模块 contract、高风险变更、最终 merge/release 时考虑全量验证。

## 提交与 PR

- Commit 使用 Emoji + Conventional Commits。
- PR 用中文说明背景、范围、架构决策、验证结果和未实现边界。
- 不自动 merge，不自动 push 到用户未要求的分支。
