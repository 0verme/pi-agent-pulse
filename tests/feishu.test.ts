import { describe, expect, it } from "vitest";

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
});
