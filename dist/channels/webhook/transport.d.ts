import type { TaskEvent } from "../../core/events.js";
import type { OutboundChannel } from "../types.js";
export interface WebhookRequest {
    url: string;
    body: string;
    timeoutMs: number;
    headers: Readonly<Record<string, string>>;
}
export interface WebhookTransport {
    post(request: WebhookRequest): Promise<void>;
}
export declare function validateWebhookUrl(value: string): URL;
export declare function serializeTaskEvent(event: TaskEvent): string;
/** Single-attempt fetch transport. It never logs the destination URL or body. */
export declare class FetchWebhookTransport implements WebhookTransport {
    post(request: WebhookRequest): Promise<void>;
}
export interface GenericWebhookChannelOptions {
    url: string;
    id?: string;
    timeoutMs?: number;
    transport?: WebhookTransport;
}
/** First-class generic JSON webhook adapter. */
export declare class GenericWebhookChannel implements OutboundChannel {
    readonly id: string;
    private readonly url;
    private readonly timeoutMs;
    private readonly transport;
    constructor(options: GenericWebhookChannelOptions);
    send(event: TaskEvent): Promise<void>;
}
//# sourceMappingURL=transport.d.ts.map