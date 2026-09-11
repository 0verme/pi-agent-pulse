const MAX_FEISHU_TEXT_CHARS = 3_500;
const INVALID_DISPLAY_TIMEZONE_WARNING = "[pi-pulse] Invalid displayTimezone; using system local timezone.";
function display(value, fallback = "unknown") {
    return value?.trim() || fallback;
}
function duration(event) {
    if (event.durationMs === undefined)
        return "unknown";
    const seconds = Math.floor(event.durationMs / 1_000);
    if (seconds < 60)
        return `${seconds}秒`;
    return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}
function createIntlFormatter(timezone) {
    const options = {
        calendar: "gregory",
        numberingSystem: "latn",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    };
    const normalizedTimezone = timezone?.trim();
    if (normalizedTimezone)
        options.timeZone = normalizedTimezone;
    return new Intl.DateTimeFormat("en-CA", options);
}
function toDate(value) {
    if (value instanceof Date)
        return Number.isFinite(value.getTime()) ? value : undefined;
    if (typeof value === "number")
        return Number.isFinite(value) ? new Date(value) : undefined;
    if (typeof value !== "string")
        return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}
function formatWithIntl(formatter, date) {
    const parts = new Map(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
    const year = parts.get("year");
    const month = parts.get("month");
    const day = parts.get("day");
    const hour = parts.get("hour");
    const minute = parts.get("minute");
    const second = parts.get("second");
    if (!year || !month || !day || !hour || !minute || !second)
        return undefined;
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
}
function warnInvalidDisplayTimezone(onWarning) {
    try {
        onWarning(INVALID_DISPLAY_TIMEZONE_WARNING);
    }
    catch {
        // Configuration diagnostics are best effort and must not affect notification delivery.
    }
}
/** Create a safe display formatter; timestamps remain canonical UTC strings in TaskEvent. */
export function createDisplayTimestampFormatter(timezone, onWarning = (message) => process.emitWarning(message)) {
    const normalizedTimezone = timezone?.trim() || undefined;
    let formatter;
    try {
        formatter = createIntlFormatter(normalizedTimezone);
    }
    catch {
        if (normalizedTimezone)
            warnInvalidDisplayTimezone(onWarning);
        formatter = createIntlFormatter();
    }
    return (value) => {
        const date = toDate(value);
        return date ? formatWithIntl(formatter, date) : undefined;
    };
}
/** Format one timestamp as YYYY-MM-DD HH:mm:ss in system local or an IANA timezone. */
export function formatDisplayTimestamp(value, timezone) {
    return createDisplayTimestampFormatter(timezone)(value);
}
function isTaskEndEvent(event) {
    return event.type === "TASK_COMPLETED" || event.type === "TASK_FAILED" || event.type === "TASK_ABORTED";
}
function warnMissingStartedAt() {
    try {
        process.emitWarning("[pi-pulse] Task end event has no valid startedAt; start time omitted.");
    }
    catch {
        // Logging is best effort and must not affect notification delivery.
    }
}
function lifecycleTimes(event, timestampFormatter) {
    if (!isTaskEndEvent(event))
        return [];
    const startedAt = timestampFormatter(event.startedAt);
    if (!startedAt)
        warnMissingStartedAt();
    const endedAt = timestampFormatter(event.endedAt);
    return [...(startedAt ? [`开始时间：${startedAt}`] : []), ...(endedAt ? [`结束时间：${endedAt}`] : [])];
}
function truncate(value) {
    const chars = Array.from(value);
    if (chars.length <= MAX_FEISHU_TEXT_CHARS)
        return value;
    return `${chars.slice(0, MAX_FEISHU_TEXT_CHARS - 1).join("")}…`;
}
/** Render a bounded text message without making Feishu part of the core model. */
export function renderFeishuText(event, options = {}) {
    const timestampFormatter = options.timestampFormatter ?? createDisplayTimestampFormatter(options.displayTimezone);
    const lines = [
        `[Pi Pulse] ${event.type}`,
        `Task: ${display(event.taskId)}`,
        `Session: ${display(event.sessionId)}`,
        `State: ${event.state} (${event.stateEvidence})`,
        `Host: ${display(event.host)}`,
        `Repository: ${display(event.repo)}`,
        `Branch: ${display(event.branch)}`,
        `耗时：${duration(event)}`,
        ...lifecycleTimes(event, timestampFormatter),
    ];
    if (event.currentTool)
        lines.push(`Tool: ${event.currentTool}`);
    if (event.summary)
        lines.push(`Summary: ${event.summary}`);
    if (event.warnings.longTask || event.warnings.longTool || event.warnings.stalled) {
        lines.push(`Warnings: longTask=${event.warnings.longTask}, longTool=${event.warnings.longTool}, stalled=${event.warnings.stalled}`);
    }
    return truncate(lines.join("\n"));
}
export function renderFeishuPayload(event, options = {}) {
    return {
        msg_type: "text",
        content: { text: renderFeishuText(event, options) },
    };
}
//# sourceMappingURL=renderer.js.map