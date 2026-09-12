import { describe, expect, it, vi } from "vitest";

import { ChannelRouter } from "../src/channels/router.js";
import type { ChannelDispatchContext, OutboundChannel } from "../src/channels/types.js";
import { createTaskEvent, type TaskEvent } from "../src/core/events.js";

function event(eventId = "event-1"): TaskEvent {
	return createTaskEvent({
		eventId,
		type: "TASK_STARTED",
		timestamp: 0,
		taskId: "task-1",
		sessionId: "session-1",
		state: "RUNNING",
		stateEvidence: "pi-event",
	});
}

describe("ChannelRouter", () => {
	it("isolates channel failures and deduplicates event ids", async () => {
		const warnings: string[] = [];
		const healthy: OutboundChannel = { id: "healthy", send: vi.fn(async () => undefined) };
		const failing: OutboundChannel = {
			id: "failing",
			send: vi.fn(async () => Promise.reject(new Error("secret-looking failure"))),
		};
		const router = new ChannelRouter([healthy, failing], {
			onWarning: (warning) => warnings.push(`${warning.channelId}:${warning.eventType}`),
		});

		router.dispatch(event());
		await router.flush();
		router.dispatch(event());
		await router.flush();

		expect(healthy.send).toHaveBeenCalledTimes(1);
		expect(failing.send).toHaveBeenCalledTimes(1);
		expect(warnings).toEqual(["failing:TASK_STARTED"]);
	});

	it("passes presentation context without changing the canonical event", async () => {
		const contexts: ChannelDispatchContext[] = [];
		const receivedEvents: TaskEvent[] = [];
		const channel: OutboundChannel = {
			id: "presentation",
			send: async (receivedEvent, context) => {
				receivedEvents.push(receivedEvent);
				if (context) contexts.push(context);
			},
		};
		const router = new ChannelRouter([channel]);
		const taskEvent = event("presentation-event");

		router.dispatch(taskEvent, { locale: "zh-CN" });
		await router.flush();

		expect(receivedEvents[0]?.type).toBe("TASK_STARTED");
		expect(contexts).toEqual([{ locale: "zh-CN" }]);
	});

	it("supports zero configured channels", async () => {
		const router = new ChannelRouter([]);
		router.dispatch(event("empty-event"));
		await expect(router.flush()).resolves.toBeUndefined();
		expect(router.channelIds).toEqual([]);
	});
});
