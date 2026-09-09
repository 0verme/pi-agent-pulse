import { readFileSync } from "node:fs";
export const DEFAULT_CONFIG = {
    channels: {
        webhook: { enabled: false, url: "", timeoutMs: 10_000 },
        feishu: { enabled: false, webhook: "", timeoutMs: 10_000 },
    },
    watchdog: {
        longTaskNoticeMinutes: 45,
        longTaskWarningMinutes: 75,
        longTaskCriticalMinutes: 120,
        longToolMinutes: 20,
        stalledMinutes: 15,
    },
    privacy: {
        includeHost: true,
        includeWorkdir: false,
        includeSummary: true,
    },
};
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function readRecord(parent, key) {
    const value = parent[key];
    return isRecord(value) ? value : {};
}
function readBoolean(parent, key, fallback) {
    return typeof parent[key] === "boolean" ? parent[key] : fallback;
}
function readString(parent, key, fallback) {
    return typeof parent[key] === "string" ? parent[key].trim() : fallback;
}
function readTimeout(parent, key, fallback) {
    const value = parent[key];
    if (typeof value !== "number" || !Number.isFinite(value))
        return fallback;
    return Math.min(120_000, Math.max(100, Math.round(value)));
}
function readMinutes(parent, key, fallback) {
    const value = parent[key];
    if (typeof value !== "number" || !Number.isFinite(value))
        return fallback;
    return Math.min(24 * 60, Math.max(0, value));
}
/** Normalize untrusted JSON into a small, dependency-free configuration model. */
export function normalizeConfig(value) {
    const root = isRecord(value) ? value : {};
    const channels = readRecord(root, "channels");
    const webhook = readRecord(channels, "webhook");
    const feishu = readRecord(channels, "feishu");
    const watchdog = readRecord(root, "watchdog");
    const privacy = readRecord(root, "privacy");
    const hostname = readString(root, "hostname", "");
    return {
        channels: {
            webhook: {
                enabled: readBoolean(webhook, "enabled", DEFAULT_CONFIG.channels.webhook.enabled),
                url: readString(webhook, "url", DEFAULT_CONFIG.channels.webhook.url),
                timeoutMs: readTimeout(webhook, "timeoutMs", DEFAULT_CONFIG.channels.webhook.timeoutMs),
            },
            feishu: {
                enabled: readBoolean(feishu, "enabled", DEFAULT_CONFIG.channels.feishu.enabled),
                webhook: readString(feishu, "webhook", DEFAULT_CONFIG.channels.feishu.webhook),
                timeoutMs: readTimeout(feishu, "timeoutMs", DEFAULT_CONFIG.channels.feishu.timeoutMs),
            },
        },
        watchdog: {
            longTaskNoticeMinutes: readMinutes(watchdog, "longTaskNoticeMinutes", DEFAULT_CONFIG.watchdog.longTaskNoticeMinutes),
            longTaskWarningMinutes: readMinutes(watchdog, "longTaskWarningMinutes", DEFAULT_CONFIG.watchdog.longTaskWarningMinutes),
            longTaskCriticalMinutes: readMinutes(watchdog, "longTaskCriticalMinutes", DEFAULT_CONFIG.watchdog.longTaskCriticalMinutes),
            longToolMinutes: readMinutes(watchdog, "longToolMinutes", DEFAULT_CONFIG.watchdog.longToolMinutes),
            stalledMinutes: readMinutes(watchdog, "stalledMinutes", DEFAULT_CONFIG.watchdog.stalledMinutes),
        },
        privacy: {
            includeHost: readBoolean(privacy, "includeHost", DEFAULT_CONFIG.privacy.includeHost),
            includeWorkdir: readBoolean(privacy, "includeWorkdir", DEFAULT_CONFIG.privacy.includeWorkdir),
            includeSummary: readBoolean(privacy, "includeSummary", DEFAULT_CONFIG.privacy.includeSummary),
        },
        ...(hostname ? { hostname } : {}),
    };
}
/** Read a JSON config file; missing or malformed config safely falls back to defaults. */
export function loadConfigFile(filePath) {
    try {
        return normalizeConfig(JSON.parse(readFileSync(filePath, "utf8")));
    }
    catch {
        return normalizeConfig(DEFAULT_CONFIG);
    }
}
//# sourceMappingURL=schema.js.map