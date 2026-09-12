import { type PulseLocale } from "../i18n/index.js";
export type { PulseLocale };
export interface ChannelConfig {
    enabled: boolean;
    timeoutMs: number;
}
export interface GenericWebhookConfig extends ChannelConfig {
    url: string;
}
export interface FeishuConfig extends ChannelConfig {
    webhook: string;
}
export interface WatchdogConfig {
    longTaskNoticeMinutes: number;
    longTaskWarningMinutes: number;
    longTaskCriticalMinutes: number;
    longToolMinutes: number;
    stalledMinutes: number;
}
export interface PrivacyConfig {
    includeHost: boolean;
    includeWorkdir: boolean;
    includeSummary: boolean;
}
export interface PulseConfig {
    locale: PulseLocale;
    channels: {
        webhook: GenericWebhookConfig;
        feishu: FeishuConfig;
    };
    watchdog: WatchdogConfig;
    privacy: PrivacyConfig;
    displayTimezone?: string;
    hostname?: string;
}
export declare const DEFAULT_CONFIG: PulseConfig;
/** Normalize untrusted JSON into a small, dependency-free configuration model. */
export declare function normalizeConfig(value: unknown): PulseConfig;
/** Read a JSON config file; missing or malformed config safely falls back to defaults. */
export declare function loadConfigFile(filePath: string): PulseConfig;
//# sourceMappingURL=schema.d.ts.map