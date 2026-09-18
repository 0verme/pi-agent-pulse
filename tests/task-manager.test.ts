import { describe, expect, it } from "vitest";

import type { TaskEvent } from "../src/core/events.js";
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
	it("includes bounded user summaries by default while retaining system warning context", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			thresholds: {
				longTaskNoticeMs: 10_000,
				longTaskWarningMs: 20_000,
				longTaskCriticalMs: 30_000,
				longToolMs: 10_000,
				stalledMs: 50,
			},
			taskIdFactory: () => "task-privacy-default",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		const started = manager.startTask({
			sessionId: "session-privacy-default",
			taskId: "task-privacy-default",
			summary: "user chat input",
		});
		clock.advanceBy(50);
		const completed = manager.completeTask("session-privacy-default", "model output", 50);

		expect(started?.summary).toBe("user chat input");
		expect(completed?.summary).toBe("model output");
		expect(events.find((event) => event.type === "TASK_STALLED")?.summary).toBe(
			"No Pi activity was observed for the stalled threshold",
		);
	});

	it("omits summaries from every event when privacy explicitly disables them", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			privacy: { includeSummary: false },
			thresholds: {
				longTaskNoticeMs: 10_000,
				longTaskWarningMs: 20_000,
				longTaskCriticalMs: 30_000,
				longToolMs: 10_000,
				stalledMs: 50,
			},
			taskIdFactory: () => "task-privacy-opt-out",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		const started = manager.startTask({
			sessionId: "session-privacy-opt-out",
			taskId: "task-privacy-opt-out",
			summary: "user chat input that must stay private",
		});
		clock.advanceBy(50);
		const completed = manager.completeTask("session-privacy-opt-out", "model output that must stay private", 50);

		expect(started?.summary).toBeUndefined();
		expect(completed?.summary).toBeUndefined();
		for (const event of events) {
			expect(event.summary ?? "").not.toContain("user chat input");
			expect(event.summary ?? "").not.toContain("model output");
		}
	});

	it("keeps summary sanitization and truncation active when summaries are enabled", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			privacy: { includeSummary: true },
			taskIdFactory: () => "task-privacy-sanitize",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		const started = manager.startTask({
			sessionId: "session-privacy-sanitize",
			taskId: "task-privacy-sanitize",
			summary: "deploy with token=super-secret-value\nprocess.env.API_KEY\n" + "x".repeat(400),
		});
		const completed = manager.completeTask(
			"session-privacy-sanitize",
			"webhook https://hooks.example.test/pi?token=super-secret-value",
			1,
		);

		const startedSummary = started?.summary ?? "";
		expect(startedSummary).not.toContain("super-secret-value");
		expect(startedSummary).not.toContain("process.env.API_KEY");
		expect(startedSummary.length).toBeLessThanOrEqual(240);
		expect(Array.from(startedSummary)).toHaveLength(240);
		expect(completed?.summary).toBe("[redacted]");
	});

	it("preserves summaries when explicitly enabled", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			privacy: { includeSummary: true },
			taskIdFactory: () => "task-privacy-opt-in",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		const started = manager.startTask({
			sessionId: "session-privacy-opt-in",
			taskId: "task-privacy-opt-in",
			summary: "user chat input",
		});
		const completed = manager.completeTask("session-privacy-opt-in", "model output", 1);

		expect(started?.summary).toBe("user chat input");
		expect(completed?.summary).toBe("model output");
	});

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

	it("includes accumulated durationMs on long-task warnings and omits it from TASK_STARTED", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			thresholds: {
				longTaskNoticeMs: 100,
				longTaskWarningMs: 200,
				longTaskCriticalMs: 300,
				longToolMs: 10_000,
				stalledMs: 10_000,
			},
			taskIdFactory: () => "task-warning-duration",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		const started = manager.startTask({
			sessionId: "session-warning-duration",
			taskId: "task-warning-duration",
		});
		expect(started?.durationMs).toBeUndefined();

		clock.advanceBy(100);
		clock.advanceBy(100);
		clock.advanceBy(100);

		const warnings = events.filter((event) => event.type === "TASK_WARNING");
		expect(warnings).toHaveLength(3);
		expect(warnings.map((event) => event.durationMs)).toEqual([100, 200, 300]);
		manager.endSession("session-warning-duration");
	});

	it("includes accumulated durationMs on long-tool warnings", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			thresholds: {
				longTaskNoticeMs: 10_000,
				longTaskWarningMs: 20_000,
				longTaskCriticalMs: 30_000,
				longToolMs: 50,
				stalledMs: 10_000,
			},
			taskIdFactory: () => "task-long-tool-duration",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		manager.startTask({ sessionId: "session-long-tool-duration", taskId: "task-long-tool-duration" });
		manager.startTool("session-long-tool-duration", { callId: "call-1", name: "bash" });
		clock.advanceBy(50);

		const longToolWarning = events.find(
			(event) => event.type === "TASK_WARNING" && event.metadata?.signal === "LONG_TOOL",
		);
		expect(longToolWarning?.durationMs).toBe(50);
		manager.endSession("session-long-tool-duration");
	});

	it("includes accumulated durationMs on stalled events", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			thresholds: {
				longTaskNoticeMs: 10_000,
				longTaskWarningMs: 20_000,
				longTaskCriticalMs: 30_000,
				longToolMs: 10_000,
				stalledMs: 150,
			},
			taskIdFactory: () => "task-stalled-duration",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		manager.startTask({ sessionId: "session-stalled-duration", taskId: "task-stalled-duration" });
		clock.advanceBy(150);

		const stalled = events.find((event) => event.type === "TASK_STALLED");
		expect(stalled?.durationMs).toBe(150);
		manager.endSession("session-stalled-duration");
	});

	it("keeps the explicit terminal durationMs after intermediate warnings", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			thresholds: {
				longTaskNoticeMs: 50,
				longTaskWarningMs: 100,
				longTaskCriticalMs: 150,
				longToolMs: 10_000,
				stalledMs: 10_000,
			},
			taskIdFactory: () => "task-terminal-duration",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		manager.startTask({ sessionId: "session-terminal-duration", taskId: "task-terminal-duration" });
		clock.advanceBy(50);
		const completed = manager.completeTask("session-terminal-duration");

		expect(events.some((event) => event.type === "TASK_WARNING" && event.durationMs === 50)).toBe(true);
		expect(completed?.durationMs).toBe(50);
		expect(completed?.endedAt).toBe(new Date(50).toISOString());
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

	it("marks agent_settled as lifecycle settlement without guessing an outcome", () => {
		const clock = new FakeClock();
		const events: Array<{ type: string; taskId: string; state: string; metadata?: unknown }> = [];
		const manager = createManager(clock, events);

		manager.startTask({ sessionId: "session-settled", taskId: "task-settled" });
		const settled = manager.settleTask("session-settled", "final output", 100);

		expect(settled?.type).toBe("TASK_COMPLETED");
		expect(settled?.state).toBe("COMPLETED");
		expect(settled?.metadata).toEqual({ outcome: "settled", signal: "agent_settled" });
		expect(events.some((event) => event.type === "TASK_FAILED")).toBe(false);
		expect(events.some((event) => event.type === "TASK_ABORTED")).toBe(false);
		expect(manager.getTask("session-settled")).toBeUndefined();
	});

	it("keeps task startedAt stable across activity and tool events", () => {
		const clock = new FakeClock();
		const events: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			taskIdFactory: () => "task-lifecycle",
			eventIdFactory: () => `event-${events.length + 1}`,
			onEvent: (event) => events.push(event),
		});

		manager.startTask({ sessionId: "session-lifecycle", taskId: "task-lifecycle", startedAt: 1_000 });
		manager.startTask({ sessionId: "session-lifecycle", taskId: "task-retry", startedAt: 2_000 });
		manager.recordActivity("session-lifecycle", 2_000);
		manager.startTool("session-lifecycle", { callId: "call-1", name: "bash", startedAt: 3_000 });
		manager.updateTool("session-lifecycle", "call-1", 4_000);
		manager.endTool("session-lifecycle", "call-1", 5_000);

		expect(manager.getTask("session-lifecycle")?.startedAt).toBe(1_000);
		expect(manager.getTask("session-lifecycle")?.lastActivityAt).toBe(5_000);

		const completed = manager.completeTask("session-lifecycle", undefined, 6_000);
		expect(completed?.startedAt).toBe("1970-01-01T00:00:01.000Z");
		expect(completed?.endedAt).toBe("1970-01-01T00:00:06.000Z");
		expect(completed?.durationMs).toBe(5_000);
		expect(Date.parse(completed?.startedAt ?? "NaN")).toBeLessThan(Date.parse(completed?.endedAt ?? "NaN"));
	});

	it("isolates startedAt for concurrent sessions", () => {
		const clock = new FakeClock();
		const completedEvents: TaskEvent[] = [];
		const manager = new TaskManager({
			clock,
			taskIdFactory: () => "generated-task",
			eventIdFactory: () => `event-${completedEvents.length + 1}`,
			onEvent: (event) => completedEvents.push(event),
		});

		manager.startTask({ sessionId: "session-a", taskId: "task-a", startedAt: 1_000 });
		manager.startTask({ sessionId: "session-b", taskId: "task-b", startedAt: 2_000 });
		const completedA = manager.completeTask("session-a", undefined, 3_000);
		const completedB = manager.completeTask("session-b", undefined, 4_000);

		expect(completedA?.sessionId).toBe("session-a");
		expect(completedA?.startedAt).toBe("1970-01-01T00:00:01.000Z");
		expect(completedB?.sessionId).toBe("session-b");
		expect(completedB?.startedAt).toBe("1970-01-01T00:00:02.000Z");
	});
});
