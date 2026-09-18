# Changelog

## [0.3.0] - 2026-09-18

### Behavior Change

- `privacy.includeSummary` 默认值由 `false` 改回 `true`，在配置层（`DEFAULT_CONFIG`）与 `TaskManager`（`DEFAULT_PRIVACY`）同时生效。未配置 privacy 时，通知默认包含经过现有安全清洗和长度截断的任务摘要。
- 现有安全边界没有放宽：摘要仍经过 `sanitizeText`（敏感行替换为 `[redacted]`），并在 TaskManager 层限制为 240 字符；tool arguments、完整 tool result、源码、环境变量、token、webhook、secret 等仍不会进入 `TaskEvent`。
- 隐私敏感环境可将 `privacy.includeSummary` 显式设置为 `false`，关闭摘要，恢复为不含用户输入或模型输出摘要的通知。

### Changed

- README 默认值表格、Privacy & Security 说明、ARCHITECTURE 安全边界和 `examples/pi-pulse.json` 已同步新的默认值。
- 补充 config、TaskManager 和 extension 层测试，覆盖默认包含、显式关闭、显式开启以及清洗与截断仍然生效。

## [0.2.0] - 2026-09-12

### Breaking / Behavior Change

- `privacy.includeSummary` 默认值由 `true` 改为 `false`，并在配置层和 `TaskManager` 层同时生效。`TaskEvent` schema 不变，但默认通知不包含用户输入或模型输出衍生的 summary。
- 如需恢复旧行为，请显式设置 `privacy.includeSummary` 为 `true`。开启后，通知可能包含经过截断和清理的用户输入或模型输出原文片段；截断/清理不等于去除敏感性。

### Security / Trust Boundary

- 改进 Generic Webhook 对 IPv4-mapped IPv6 literal 的解析，使其与对应 IPv4 地址使用一致的 localhost/private-range 限制。
- Generic Webhook URL 校验只拒绝显式提供的本地/私网地址，不保证阻止域名解析后指向私网地址的情况，因此不是完整 SSRF 防护。
- 默认关闭 summary，减少用户输入和模型输出进入 outbound notification 的机会。

### Included changes since npm 0.1.0

本版本纳入自 npm `0.1.0` 以来已经进入 `main` 的用户可感知变更：

- Feishu lifecycle timestamp 默认使用 Pi 运行环境的 system local timezone，并支持 `displayTimezone`。
- 增加 `auto`、`zh-CN`、`en-US` 通知语言，以及同一 Task 生命周期内稳定的 locale。
- `TASK_STARTED` 通知不再携带 duration；其他适用的事件继续保留耗时。
- 收紧 privacy 默认值、完善 Generic Webhook 地址校验，并补充发布与安全边界文档。

## [0.1.1]

修复 Feishu renderer 使用 UTC 显示用户可读开始时间和结束时间的问题。

### Fixed

- Feishu lifecycle timestamp 默认使用 Pi 运行环境的 system local timezone
- 支持通过 `displayTimezone` 配置显式 IANA timezone
- 非法 display timezone 回退到 system local，并只产生一次 bounded warning
- 固定 tracked `dist/` 的 line ending，并增加 deterministic build invariant
- Generic Webhook 继续发送不变的 canonical UTC `TaskEvent` JSON

## [0.1.0]

Pi Pulse v0.1.0 是首个公开可安装版本。

### Added

- Pi task lifecycle observation
- Task started notification
- Task completed notification
- Task start/end timestamps
- Long-running task watchdog
- Long tool detection
- Possibly stalled detection
- Feishu adapter
- Generic webhook adapter
- Concurrent session isolation
- Notification deduplication
- Failure isolation

### Non-goals

- Dashboard、Web UI、Control Plane
- Remote query、remote control、inbound bot
- Telegram、Slack、Discord、企业微信等更多 IM
