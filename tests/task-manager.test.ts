import { describe, expect, it } from "vitest";

import { TaskManager } from "../src/core/task-manager.js";
import { FakeClock } from "./helpers/fake-clock.js";

function createManager(
	clock: FakeClock,
	events: Array<{ type: string; taskId: string; state: string; metadata?: unknown }>,
): TaskManager {
	let eventNumber = 0;
	return new TaskManager({
		clock,
		thresholds: {
			longTaskNoticeMs: 100,
			longTaskWarningMs: 200,
			longTaskCriticalMs: 300,
			longToolMs: 50,
			stalledMs: 150,
		},
		taskIdFactory: () => `task-${eventNumber + 1}`,
		eventIdFactory: () => `event-${++eventNumber}`,
		onEvent: (event) => events.push(event),
	});
}

describe("TaskManager and Watchdog", () => {
	it("emits each long-task threshold once and cleans timers on completion", () => {
		const clock = new FakeClock();
		const events: Array<{ type: string; taskId: string; state: string; metadata?: unknown }> = [];
		const manager = createManager(clock, events);

		manager.startTask({ sessionId: "session-1", taskId: "task-1" });
		clock.advanceBy(100);
		clock.advanceBy(100);
		clock.advanceBy(100);

		expect(events.filter((event) => event.type === "TASK_WARNING")).toHaveLength(3);
		const warningCount = events.length;
		clock.advanceBy(1_000);
		expect(events).toHaveLength(warningCount);

		manager.completeTask("session-1", "done");
		expect(events.at(-1)?.type).toBe("TASK_COMPLETED");
		expect(clock.pendingTimerCount()).toBe(0);
		expect(manager.getTask("session-1")).toBeUndefined();
	});

	it("isolates multiple sessions and deduplicates long-tool warnings", () => {
		const clock = new FakeClock();
		const events: Array<{ type: string; taskId: string; state: string; metadata?: unknown }> = [];
		const manager = createManager(clock, events);

		manager.startTask({ sessionId: "session-a", taskId: "task-a" });
		manager.startTask({ sessionId: "session-b", taskId: "task-b" });
		manager.startTool("session-a", { callId: "call-a", name: "bash" });
		clock.advanceBy(50);
		manager.updateTool("session-a", "call-a");
		clock.advanceBy(50);

		const longToolWarnings = events.filter(
			(event) => event.type === "TASK_WARNING" && JSON.stringify(event.metadata ?? {}).includes("LONG_TOOL"),
		);
		expect(longToolWarnings).toHaveLength(1);
		expect(longToolWarnings[0]?.taskId).toBe("task-a");
		expect(manager.getTask("session-b")?.state).toBe("RUNNING");

		manager.endSession("session-a");
		manager.endSession("session-b");
		expect(clock.pendingTimerCount()).toBe(0);
	});

	it("labels stalled state as heuristic and gives an equal long-tool deadline priority", () => {
		const clock = new FakeClock();
		const events: Array<{ type: string; state: string; metadata?: unknown }> = [];
		const manager = new TaskManager({
			clock,
			thresholds: {
				longTaskNoticeMs: 10_000,
				longTaskWarningMs: 20_000,
				longTaskCriticalMs: 30_000,
				longToolMs: 50,
				stalledMs: 50,
			},
			taskIdFactory: () => "task-tie",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		manager.startTask({ sessionId: "session-tie", taskId: "task-tie" });
		manager.startTool("session-tie", { callId: "call-tie", name: "build" });
		clock.advanceBy(50);
		expect(events.filter((event) => JSON.stringify(event.metadata ?? {}).includes("LONG_TOOL"))).toHaveLength(1);
		expect(events.some((event) => event.type === "TASK_STALLED")).toBe(false);

		manager.endTool("session-tie", "call-tie");
		clock.advanceBy(50);
		const stalled = events.find((event) => event.type === "TASK_STALLED");
		expect(stalled?.state).toBe("POSSIBLY_STALLED");
		expect(manager.getTask("session-tie")?.stateEvidence).toBe("heuristic");
		manager.recordActivity("session-tie");
		expect(manager.getTask("session-tie")?.state).toBe("RUNNING");
		manager.endSession("session-tie");
	});
});
