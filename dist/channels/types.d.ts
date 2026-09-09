import type { TaskEvent } from "../core/events.js";
export interface OutboundChannel {
    readonly id: string;
    send(event: TaskEvent): Promise<void>;
}
export type ChannelWarningReason = "send_failed";
export interface ChannelWarning {
    channelId: string;
    eventId: string;
    eventType: TaskEvent["type"];
    reason: ChannelWarningReason;
}
export interface ChannelRouterOptions {
    onWarning?: (warning: ChannelWarning) => void;
    maxRememberedEventIds?: number;
}
//# sourceMappingURL=types.d.ts.map