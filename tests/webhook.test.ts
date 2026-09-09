import { describe, expect, it } from "vitest";

import { GenericWebhookChannel, type WebhookRequest, validateWebhookUrl } from "../src/channels/webhook/transport.js";
import { createTaskEvent } from "../src/core/events.js";

describe("Generic Webhook", () => {
	it("serializes one structured event as a single JSON POST", async () => {
		const requests: WebhookRequest[] = [];
		const channel = new GenericWebhookChannel({
			url: "https://hooks.example.test/pi-pulse",
			timeoutMs: 1_234,
			transport: {
				post: async (request) => {
					requests.push(request);
				},
			},
		});
		const taskEvent = createTaskEvent({
			type: "TASK_WARNING",
			timestamp: 0,
			taskId: "task-1",
			sessionId: "session-1",
			state: "RUNNING",
			stateEvidence: "pi-event",
			warnings: { longTask: true },
		});

		await channel.send(taskEvent);

		expect(requests).toHaveLength(1);
		expect(requests[0]?.timeoutMs).toBe(1_234);
		expect(requests[0]?.headers["content-type"]).toContain("application/json");
		expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual(taskEvent);
	});

	it("rejects unsafe destinations before any network transport is used", () => {
		expect(() => validateWebhookUrl("file:///etc/passwd")).toThrow("Invalid or unsafe");
		expect(() => validateWebhookUrl("http://localhost:8080/hook")).toThrow("Invalid or unsafe");
		expect(() => validateWebhookUrl("https://user:password@example.test/hook")).toThrow("Invalid or unsafe");
	});
});
