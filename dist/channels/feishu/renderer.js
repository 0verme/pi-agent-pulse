const MAX_FEISHU_TEXT_CHARS = 3_500;
function display(value, fallback = "unknown") {
    return value?.trim() || fallback;
}
function duration(event) {
    if (event.durationMs === undefined)
        return "unknown";
    const seconds = Math.floor(event.durationMs / 1_000);
    if (seconds < 60)
        return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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
        `Duration: ${duration(event)}`,
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