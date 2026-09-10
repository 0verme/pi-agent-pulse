import { describe, expect, it, vi } from "vitest";

import { renderFeishuPayload } from "../src/channels/feishu/renderer.js";
import { createTaskEvent } from "../src/core/events.js";

describe("Feishu adapter boundary", () => {
	it("renders a TaskEvent as a bounded Feishu text payload", () => {
		const event = createTaskEvent({
			type: "TASK_STALLED",
			timestamp: 0,
			taskId: "task-1",
			sessionId: "session-1",
			state: "POSSIBLY_STALLED",
			stateEvidence: "heuristic",
			warnings: { stalled: true },
		});

		const payload = renderFeishuPayload(event);
		expect(payload.msg_type).toBe("text");
		expect(payload.content.text).toContain("TASK_STALLED");
		expect(payload.content.text).toContain("POSSIBLY_STALLED (heuristic)");
	});

	it("renders task lifecycle times in a fixed UTC format and order", () => {
		const event = createTaskEvent({
			type: "TASK_COMPLETED",
			timestamp: Date.UTC(2026, 8, 10, 16, 7, 32),
			startedAt: Date.UTC(2026, 8, 10, 15, 52, 37),
			endedAt: Date.UTC(2026, 8, 10, 16, 7, 32),
			durationMs: (14 * 60 + 55) * 1_000,
			taskId: "task-1",
			sessionId: "session-1",
			state: "COMPLETED",
			stateEvidence: "pi-event",
		});

		const text = renderFeishuPayload(event).content.text;
		const durationIndex = text.indexOf("耗时：14分55秒");
		const startedAtIndex = text.indexOf("开始时间：2026-09-10 15:52:37");
		const endedAtIndex = text.indexOf("结束时间：2026-09-10 16:07:32");

		expect(durationIndex).toBeGreaterThanOrEqual(0);
		expect(startedAtIndex).toBeGreaterThan(durationIndex);
		expect(endedAtIndex).toBeGreaterThan(startedAtIndex);
	});

	it("omits a missing startedAt without failing the end notification", () => {
		const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
		try {
			const event = createTaskEvent({
				type: "TASK_COMPLETED",
				timestamp: Date.UTC(2026, 8, 10, 16, 7, 32),
				endedAt: Date.UTC(2026, 8, 10, 16, 7, 32),
				taskId: "task-legacy",
				sessionId: "session-legacy",
				state: "COMPLETED",
				stateEvidence: "unknown",
			});

			const text = renderFeishuPayload(event).content.text;
			expect(text).not.toContain("开始时间：");
			expect(text).toContain("结束时间：2026-09-10 16:07:32");
			expect(warning).toHaveBeenCalledWith(
				"[pi-pulse] Task end event has no valid startedAt; start time omitted.",
			);
		} finally {
			warning.mockRestore();
		}
	});
});
