import type { TaskEvent } from "../core/events.js";
import type { ResolvedLocale } from "../i18n/index.js";

export interface ChannelDispatchContext {
	readonly locale: ResolvedLocale;
}

export interface OutboundChannel {
	readonly id: string;
	send(event: TaskEvent, context?: ChannelDispatchContext): Promise<void>;
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
