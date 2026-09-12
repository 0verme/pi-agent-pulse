import type { TaskEvent } from "../../core/events.js";
import type { PulseLocale } from "../../i18n/index.js";
import type { ChannelDispatchContext, OutboundChannel } from "../types.js";
export interface FeishuRequest {
    url: string;
    body: string;
    timeoutMs: number;
    headers: Readonly<Record<string, string>>;
}
export interface FeishuTransport {
    post(request: FeishuRequest): Promise<void>;
}
export declare class FetchFeishuTransport implements FeishuTransport {
    post(request: FeishuRequest): Promise<void>;
}
export interface FeishuChannelOptions {
    webhook: string;
    timeoutMs?: number;
    locale?: PulseLocale;
    displayTimezone?: string;
    transport?: FeishuTransport;
}
/** Minimal outbound Feishu adapter; no inbound bot or query behavior is included. */
export declare class FeishuChannel implements OutboundChannel {
    readonly id = "feishu";
    private readonly webhook;
    private readonly timeoutMs;
    private readonly locale;
    private readonly timestampFormatter;
    private readonly transport;
    constructor(options: FeishuChannelOptions);
    send(event: TaskEvent, context?: ChannelDispatchContext): Promise<void>;
}
//# sourceMappingURL=transport.d.ts.map