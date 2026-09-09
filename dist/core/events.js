import { randomUUID } from "node:crypto";
export const TASK_EVENT_TYPES = [
    "TASK_STARTED",
    "TASK_WARNING",
    "TASK_STALLED",
    "TASK_COMPLETED",
    "TASK_FAILED",
    "TASK_ABORTED",
];
const DEFAULT_TEXT_LIMIT = 512;
const SENSITIVE_LINE = /\b(?:authorization|auth|token|password|secret|credential|api[_ -]?key|access[_ -]?key|private[_ -]?key|cookie|webhook)\b|环境变量|令牌|密码|密钥|凭据|授权/i;
const ENVIRONMENT_REFERENCE = /\b(?:process\.env|import\.meta\.env|env)\.[A-Z][A-Z0-9_]*\b|%[A-Z][A-Z0-9_]+%|\$[A-Z][A-Z0-9_]+|\bPI_[A-Z0-9_]+\b/;
const URL_SECRET = /([?&](?:token|key|secret|password|sign|api[_ -]?key)=)[^&\s]+/gi;
const BEARER_TOKEN = /\bBearer\s+\S+/gi;
function truncate(value, maxChars) {
    const chars = Array.from(value);
    if (chars.length <= maxChars)
        return value;
    if (maxChars <= 1)
        return chars.slice(0, maxChars).join("");
    return `${chars.slice(0, maxChars - 1).join("")}…`;
}
/**
 * Normalize and redact a short human-readable value before it can enter an event.
 */
export function sanitizeText(value, maxChars = DEFAULT_TEXT_LIMIT) {
    if (typeof value !== "string")
        return undefined;
    const redacted = value
        .split(/\r?\n/)
        .map((line) => {
        if (SENSITIVE_LINE.test(line) || ENVIRONMENT_REFERENCE.test(line)) {
            return "[redacted]";
        }
        return line.replace(BEARER_TOKEN, "Bearer [redacted]").replace(URL_SECRET, "$1[redacted]");
    })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    if (!redacted)
        return undefined;
    return truncate(redacted, Math.max(1, maxChars));
}
function safeTimestamp(value) {
    return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}
function safeMetadata(metadata) {
    if (!metadata)
        return undefined;
    const result = {};
    for (const [rawKey, value] of Object.entries(metadata)) {
        if (SENSITIVE_LINE.test(rawKey) || ENVIRONMENT_REFERENCE.test(rawKey))
            continue;
        const key = sanitizeText(rawKey, 64);
        if (!key || key === "[redacted]")
            continue;
        if (value === null || typeof value === "boolean") {
            result[key] = value;
            continue;
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            result[key] = value;
            continue;
        }
        const safeValue = sanitizeText(value, 256);
        if (safeValue !== undefined)
            result[key] = safeValue;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
function createEventId() {
    try {
        return randomUUID();
    }
    catch {
        return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    }
}
/** Build a JSON-safe domain event from bounded, already classified task data. */
export function createTaskEvent(input) {
    const event = {
        type: input.type,
        eventId: input.eventId ?? createEventId(),
        timestamp: new Date(Number.isFinite(input.timestamp) ? input.timestamp : Date.now()).toISOString(),
        taskId: sanitizeText(input.taskId, 128) ?? "unknown-task",
        sessionId: sanitizeText(input.sessionId, 256) ?? "unknown-session",
        state: input.state,
        stateEvidence: input.stateEvidence,
        warnings: {
            longTask: input.warnings?.longTask === true,
            longTool: input.warnings?.longTool === true,
            stalled: input.warnings?.stalled === true,
        },
    };
    const host = sanitizeText(input.host, 128);
    if (host)
        event.host = host;
    const repo = sanitizeText(input.repo, 256);
    if (repo)
        event.repo = repo;
    const branch = sanitizeText(input.branch, 256);
    if (branch)
        event.branch = branch;
    const workdir = sanitizeText(input.workdir, 512);
    if (workdir)
        event.workdir = workdir;
    const currentTool = sanitizeText(input.currentTool, 120);
    if (currentTool)
        event.currentTool = currentTool;
    const summary = sanitizeText(input.summary, 2_000);
    if (summary)
        event.summary = summary;
    const startedAt = safeTimestamp(input.startedAt);
    if (startedAt)
        event.startedAt = startedAt;
    const lastActivityAt = safeTimestamp(input.lastActivityAt);
    if (lastActivityAt)
        event.lastActivityAt = lastActivityAt;
    const endedAt = safeTimestamp(input.endedAt);
    if (endedAt)
        event.endedAt = endedAt;
    if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) {
        event.durationMs = Math.max(0, Math.round(input.durationMs));
    }
    const metadata = safeMetadata(input.metadata);
    if (metadata)
        event.metadata = metadata;
    return event;
}
//# sourceMappingURL=events.js.map