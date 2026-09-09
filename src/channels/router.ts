import type { TaskEvent } from "../core/events.js";
import type { ChannelRouterOptions, ChannelWarning, OutboundChannel } from "./types.js";

/**
 * Dispatches outbound events without coupling the core to a destination.
 * Every send is fire-and-forget from the caller's perspective and is isolated
 * from sibling channels and from Pi's lifecycle handler.
 */
export class ChannelRouter {
	private readonly channels: readonly OutboundChannel[];
	private readonly onWarning: (warning: ChannelWarning) => void;
	private readonly maxRememberedEventIds: number;
	private readonly rememberedEventIds = new Set<string>();
	private readonly pending = new Set<Promise<void>>();

	public constructor(channels: readonly OutboundChannel[], options: ChannelRouterOptions = {}) {
		this.channels = [...channels];
		this.onWarning = options.onWarning ?? (() => undefined);
		this.maxRememberedEventIds = Math.max(1, options.maxRememberedEventIds ?? 10_000);
	}

	public get channelIds(): readonly string[] {
		return this.channels.map((channel) => channel.id);
	}

	/** Queue one event for every configured channel; this method never awaits I/O. */
	public dispatch(event: TaskEvent): void {
		if (this.rememberedEventIds.has(event.eventId)) return;
		this.rememberEventId(event.eventId);

		for (const channel of this.channels) {
			const operation = Promise.resolve()
				.then(() => channel.send(event))
				.catch(() => {
					this.warn({
						channelId: channel.id,
						eventId: event.eventId,
						eventType: event.type,
						reason: "send_failed",
					});
				});
			this.pending.add(operation);
			void operation.then(() => this.pending.delete(operation));
		}
	}

	/** Test/shutdown helper; normal Pi lifecycle code should not await dispatch. */
	public async flush(): Promise<void> {
		while (this.pending.size > 0) {
			await Promise.all([...this.pending]);
		}
	}

	private rememberEventId(eventId: string): void {
		this.rememberedEventIds.add(eventId);
		if (this.rememberedEventIds.size <= this.maxRememberedEventIds) return;
		const oldest = this.rememberedEventIds.values().next().value;
		if (typeof oldest === "string") this.rememberedEventIds.delete(oldest);
	}

	private warn(warning: ChannelWarning): void {
		try {
			this.onWarning(warning);
		} catch {
			// Diagnostics are advisory and must never escape the router.
		}
	}
}
