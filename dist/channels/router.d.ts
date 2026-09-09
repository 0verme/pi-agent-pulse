import type { TaskEvent } from "../core/events.js";
import type { ChannelRouterOptions, OutboundChannel } from "./types.js";
/**
 * Dispatches outbound events without coupling the core to a destination.
 * Every send is fire-and-forget from the caller's perspective and is isolated
 * from sibling channels and from Pi's lifecycle handler.
 */
export declare class ChannelRouter {
    private readonly channels;
    private readonly onWarning;
    private readonly maxRememberedEventIds;
    private readonly rememberedEventIds;
    private readonly pending;
    constructor(channels: readonly OutboundChannel[], options?: ChannelRouterOptions);
    get channelIds(): readonly string[];
    /** Queue one event for every configured channel; this method never awaits I/O. */
    dispatch(event: TaskEvent): void;
    /** Test/shutdown helper; normal Pi lifecycle code should not await dispatch. */
    flush(): Promise<void>;
    private rememberEventId;
    private warn;
}
//# sourceMappingURL=router.d.ts.map