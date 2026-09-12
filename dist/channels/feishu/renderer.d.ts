import type { TaskEvent } from "../../core/events.js";
import { type PulseLocale } from "../../i18n/index.js";
export interface FeishuTextPayload {
    msg_type: "text";
    content: {
        text: string;
    };
}
export type DisplayTimestampInput = string | number | Date | undefined;
export type DisplayTimestampFormatter = (value: DisplayTimestampInput) => string | undefined;
export interface FeishuRenderOptions {
    locale?: PulseLocale;
    displayTimezone?: string;
    timestampFormatter?: DisplayTimestampFormatter;
}
/** Create a safe display formatter; timestamps remain canonical UTC strings in TaskEvent. */
export declare function createDisplayTimestampFormatter(timezone?: string, onWarning?: (message: string) => void): DisplayTimestampFormatter;
/** Format one timestamp as YYYY-MM-DD HH:mm:ss in system local or an IANA timezone. */
export declare function formatDisplayTimestamp(value: DisplayTimestampInput, timezone?: string): string | undefined;
/** Render a bounded text message without making Feishu part of the core model. */
export declare function renderFeishuText(event: TaskEvent, options?: FeishuRenderOptions): string;
export declare function renderFeishuPayload(event: TaskEvent, options?: FeishuRenderOptions): FeishuTextPayload;
//# sourceMappingURL=renderer.d.ts.map