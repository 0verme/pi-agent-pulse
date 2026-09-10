const MAX_FEISHU_TEXT_CHARS = 3_500;
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
function pad(value) {
    return value.toString().padStart(2, "0");
}
/** Format both lifecycle timestamps in the event's canonical UTC timezone. */
function formatTimestamp(value) {
    if (!value)
        return undefined;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp))
        return undefined;
    const date = new Date(timestamp);
    return `${date.getUTCFullYear().toString().padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
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
function lifecycleTimes(event) {
    if (!isTaskEndEvent(event))
        return [];
    const startedAt = formatTimestamp(event.startedAt);
    if (!startedAt)
        warnMissingStartedAt();
    const endedAt = formatTimestamp(event.endedAt);
    return [...(startedAt ? [`开始时间：${startedAt}`] : []), ...(endedAt ? [`结束时间：${endedAt}`] : [])];
}
function truncate(value) {
    const chars = Array.from(value);
    if (chars.length <= MAX_FEISHU_TEXT_CHARS)
        return value;
    return `${chars.slice(0, MAX_FEISHU_TEXT_CHARS - 1).join("")}…`;
}
/** Render a bounded text message without making Feishu part of the core model. */
export function renderFeishuText(event) {
    const lines = [
        `[Pi Pulse] ${event.type}`,
        `Task: ${display(event.taskId)}`,
        `Session: ${display(event.sessionId)}`,
        `State: ${event.state} (${event.stateEvidence})`,
        `Host: ${display(event.host)}`,
        `Repository: ${display(event.repo)}`,
        `Branch: ${display(event.branch)}`,
        `耗时：${duration(event)}`,
        ...lifecycleTimes(event),
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
export function renderFeishuPayload(event) {
    return {
        msg_type: "text",
        content: { text: renderFeishuText(event) },
    };
}
//# sourceMappingURL=renderer.js.map