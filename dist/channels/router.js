/**
 * Dispatches outbound events without coupling the core to a destination.
 * Every send is fire-and-forget from the caller's perspective and is isolated
 * from sibling channels and from Pi's lifecycle handler.
 */
export class ChannelRouter {
    channels;
    onWarning;
    maxRememberedEventIds;
    rememberedEventIds = new Set();
    pending = new Set();
    constructor(channels, options = {}) {
        this.channels = [...channels];
        this.onWarning = options.onWarning ?? (() => undefined);
        this.maxRememberedEventIds = Math.max(1, options.maxRememberedEventIds ?? 10_000);
    }
    get channelIds() {
        return this.channels.map((channel) => channel.id);
    }
    /** Queue one event for every configured channel; this method never awaits I/O. */
    dispatch(event, context) {
        if (this.rememberedEventIds.has(event.eventId))
            return;
        this.rememberEventId(event.eventId);
        for (const channel of this.channels) {
            const operation = Promise.resolve()
                .then(() => channel.send(event, context))
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
    async flush() {
        while (this.pending.size > 0) {
            await Promise.all([...this.pending]);
        }
    }
    rememberEventId(eventId) {
        this.rememberedEventIds.add(eventId);
        if (this.rememberedEventIds.size <= this.maxRememberedEventIds)
            return;
        const oldest = this.rememberedEventIds.values().next().value;
        if (typeof oldest === "string")
            this.rememberedEventIds.delete(oldest);
    }
    warn(warning) {
        try {
            this.onWarning(warning);
        }
        catch {
            // Diagnostics are advisory and must never escape the router.
        }
    }
}
//# sourceMappingURL=router.js.map