# Changelog

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
