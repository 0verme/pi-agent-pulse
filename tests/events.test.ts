import { describe, expect, it } from "vitest";

import { createTaskEvent } from "../src/core/events.js";

describe("TaskEvent", () => {
	it("creates a structured, bounded and redacted event", () => {
		const event = createTaskEvent({
			type: "TASK_COMPLETED",
			timestamp: 1_700_000_000_000,
			taskId: "task-1",
			sessionId: "session-1",
			state: "COMPLETED",
			stateEvidence: "pi-event",
			workdir: "C:\\work\\pi-agent-pulse",
			summary: "Authorization: bearer secret-value",
			warnings: { longTask: true },
			metadata: { outcome: "settled", token: "must-not-leave" },
		});

		expect(event.type).toBe("TASK_COMPLETED");
		expect(event.timestamp).toBe("2023-11-14T22:13:20.000Z");
		expect(event.summary).toBe("[redacted]");
		expect(event.metadata).toEqual({ outcome: "settled" });
		expect(event.warnings).toEqual({ longTask: true, longTool: false, stalled: false });
		expect(JSON.stringify(event)).not.toContain("secret-value");
	});
});
