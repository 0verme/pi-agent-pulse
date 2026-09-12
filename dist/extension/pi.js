import { hostname } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { TaskManager } from "../core/task-manager.js";
import { ChannelRouter } from "../channels/router.js";
import { FeishuChannel } from "../channels/feishu/transport.js";
import { GenericWebhookChannel } from "../channels/webhook/transport.js";
import { loadConfigFile } from "../config/schema.js";
import { detectTextLocale, resolveLocale } from "../i18n/index.js";
const CONFIG_FILE_NAME = "pi-pulse.json";
const GIT_BRANCH_TIMEOUT_MS = 2_000;
const MAX_SUMMARY_CHARS = 240;
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function contentText(content) {
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return "";
    return content
        .map((part) => {
        if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string")
            return "";
        return part.text;
    })
        .join("");
}
function assistantText(message) {
    return isRecord(message) && message.role === "assistant" ? contentText(message.content) : "";
}
function lastAssistantText(messages) {
    if (!Array.isArray(messages))
        return "";
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const text = assistantText(messages[index]);
        if (text.trim())
            return text;
    }
    return "";
}
function boundedSummary(value) {
    if (!value)
        return undefined;
    const normalized = value
        .split(/\r?\n/)
        .map((line) => /\b(?:token|password|secret|credential|authorization|webhook)\b|环境变量|令牌|密码|密钥|凭据|授权/i.test(line)
        ? "[redacted]"
        : line)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized)
        return undefined;
    const chars = Array.from(normalized);
    return chars.length <= MAX_SUMMARY_CHARS ? normalized : `${chars.slice(0, MAX_SUMMARY_CHARS - 1).join("")}…`;
}
function readSessionId(ctx) {
    try {
        const sessionId = ctx.sessionManager.getSessionId();
        if (sessionId.trim())
            return sessionId;
    }
    catch {
        // Keep the adapter alive if session metadata is unavailable.
    }
    return "unknown-session";
}
function repositoryName(cwd) {
    const normalized = cwd.trim().replace(/[\\/]+$/, "");
    if (!normalized)
        return undefined;
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return segments.at(-1);
}
async function readGitBranch(pi, cwd) {
    if (!cwd.trim())
        return undefined;
    try {
        const result = await pi.exec("git", ["branch", "--show-current"], {
            cwd,
            timeout: GIT_BRANCH_TIMEOUT_MS,
        });
        if (result.code !== 0 || result.killed)
            return undefined;
        const branch = result.stdout.replace(/\s+/g, " ").trim();
        return branch ? branch.slice(0, 256) : undefined;
    }
    catch {
        return undefined;
    }
}
function milliseconds(minutes) {
    return Math.round(minutes * 60_000);
}
function createChannels(config) {
    const channels = [];
    if (config.channels.webhook.enabled && config.channels.webhook.url) {
        try {
            channels.push(new GenericWebhookChannel({
                url: config.channels.webhook.url,
                timeoutMs: config.channels.webhook.timeoutMs,
            }));
        }
        catch {
            console.warn("[pi-pulse] Generic Webhook configuration is invalid; channel disabled.");
        }
    }
    if (config.channels.feishu.enabled && config.channels.feishu.webhook) {
        try {
            channels.push(new FeishuChannel({
                webhook: config.channels.feishu.webhook,
                timeoutMs: config.channels.feishu.timeoutMs,
                locale: config.locale,
                displayTimezone: config.displayTimezone,
            }));
        }
        catch {
            console.warn("[pi-pulse] Feishu configuration is invalid; channel disabled.");
        }
    }
    return channels;
}
function safeObserve(label, operation) {
    try {
        operation();
    }
    catch {
        console.warn(`[pi-pulse] ${label} observation was ignored.`);
    }
}
/** Pi lifecycle adapter. It is the only module that knows the Pi extension API. */
export default function createPiPulseExtension(pi) {
    const config = loadConfigFile(join(getAgentDir(), CONFIG_FILE_NAME));
    const taskLocales = new Map();
    const fallbackLocale = resolveLocale(config.locale);
    const router = new ChannelRouter(createChannels(config), {
        onWarning: (warning) => {
            console.warn(`[pi-pulse] ${warning.channelId} could not deliver ${warning.eventType}; ignored.`);
        },
    });
    const manager = new TaskManager({
        thresholds: {
            longTaskNoticeMs: milliseconds(config.watchdog.longTaskNoticeMinutes),
            longTaskWarningMs: milliseconds(config.watchdog.longTaskWarningMinutes),
            longTaskCriticalMs: milliseconds(config.watchdog.longTaskCriticalMinutes),
            longToolMs: milliseconds(config.watchdog.longToolMinutes),
            stalledMs: milliseconds(config.watchdog.stalledMinutes),
        },
        privacy: config.privacy,
        onEvent: (event) => router.dispatch(event, { locale: taskLocales.get(event.sessionId) ?? fallbackLocale }),
        onWarning: (source) => console.warn(`[pi-pulse] ${source} was ignored.`),
    });
    let pendingTaskSummary;
    let pendingTaskLocale;
    let latestOutput;
    let notificationSent = false;
    const touch = (ctx) => {
        safeObserve("activity", () => manager.recordActivity(readSessionId(ctx)));
    };
    pi.on("session_start", () => {
        pendingTaskSummary = undefined;
        pendingTaskLocale = undefined;
        latestOutput = undefined;
        notificationSent = false;
    });
    pi.on("input", (event) => {
        if (event.streamingBehavior !== undefined)
            return;
        pendingTaskSummary = boundedSummary(event.text);
        pendingTaskLocale = config.locale === "auto" ? detectTextLocale(event.text) : resolveLocale(config.locale);
    });
    pi.on("before_agent_start", (event) => {
        pendingTaskSummary = boundedSummary(event.prompt);
        pendingTaskLocale = config.locale === "auto" ? detectTextLocale(event.prompt) : resolveLocale(config.locale);
    });
    pi.on("agent_start", (_event, ctx) => {
        safeObserve("agent_start", () => {
            const sessionId = readSessionId(ctx);
            if (manager.getTask(sessionId)) {
                manager.recordActivity(sessionId);
                pendingTaskSummary = undefined;
                pendingTaskLocale = undefined;
                return;
            }
            taskLocales.set(sessionId, pendingTaskLocale ?? resolveLocale(config.locale));
            const startedEvent = manager.startTask({
                sessionId,
                host: config.privacy.includeHost ? (config.hostname ?? hostname()) : undefined,
                repo: repositoryName(ctx.cwd),
                workdir: config.privacy.includeWorkdir ? ctx.cwd : undefined,
                summary: config.privacy.includeSummary ? pendingTaskSummary : undefined,
            });
            if (startedEvent)
                notificationSent = false;
            pendingTaskSummary = undefined;
            pendingTaskLocale = undefined;
            void readGitBranch(pi, ctx.cwd).then((branch) => {
                if (branch)
                    manager.updateTaskIdentity(sessionId, { branch });
            }, () => undefined);
        });
    });
    pi.on("turn_start", (_event, ctx) => touch(ctx));
    pi.on("turn_end", (event, ctx) => {
        const text = assistantText(event.message);
        if (text.trim())
            latestOutput = boundedSummary(text);
        touch(ctx);
    });
    pi.on("message_start", (_event, ctx) => touch(ctx));
    pi.on("message_update", (_event, ctx) => touch(ctx));
    pi.on("message_end", (_event, ctx) => touch(ctx));
    pi.on("tool_execution_start", (event, ctx) => {
        safeObserve("tool_execution_start", () => {
            manager.startTool(readSessionId(ctx), { callId: event.toolCallId, name: event.toolName });
        });
    });
    pi.on("tool_execution_update", (event, ctx) => {
        safeObserve("tool_execution_update", () => {
            manager.updateTool(readSessionId(ctx), event.toolCallId);
        });
    });
    pi.on("tool_execution_end", (event, ctx) => {
        safeObserve("tool_execution_end", () => {
            manager.endTool(readSessionId(ctx), event.toolCallId);
        });
    });
    pi.on("agent_end", (event, ctx) => {
        const text = lastAssistantText(event.messages);
        if (text.trim())
            latestOutput = boundedSummary(text);
        touch(ctx);
    });
    // agent_settled is a verified no-more-retry/no-more-follow-up boundary.
    // Pi 0.84.x/0.85.x does not provide a success, failure, or abort reason here.
    pi.on("agent_settled", (_event, ctx) => {
        safeObserve("agent_settled", () => {
            if (notificationSent)
                return;
            notificationSent = true;
            const sessionId = readSessionId(ctx);
            const completedEvent = manager.settleTask(sessionId, config.privacy.includeSummary ? latestOutput : undefined);
            if (completedEvent)
                taskLocales.delete(sessionId);
        });
    });
    pi.on("session_shutdown", (_event, ctx) => {
        safeObserve("session_shutdown", () => {
            const sessionId = readSessionId(ctx);
            manager.endSession(sessionId);
            taskLocales.delete(sessionId);
            pendingTaskSummary = undefined;
            pendingTaskLocale = undefined;
            latestOutput = undefined;
            notificationSent = false;
        });
    });
}
export { createPiPulseExtension };
//# sourceMappingURL=pi.js.map