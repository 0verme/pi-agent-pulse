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

	it("confirms Node normalizes mapped IPv4 hostnames to hexadecimal IPv6", () => {
		expect(new URL("https://[::ffff:127.0.0.1]/hook").hostname).toBe("[::ffff:7f00:1]");
	});

	it("rejects private and local IPv4 destinations", () => {
		for (const hostname of [
			"127.0.0.1",
			"10.0.0.1",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"169.254.1.1",
			"0.0.0.0",
		]) {
			expect(() => validateWebhookUrl(`https://${hostname}/hook`)).toThrow("Invalid or unsafe");
		}
	});

	it("rejects private IPv6 destinations", () => {
		for (const hostname of ["::1", "::", "fc00::1", "fdff::1", "fe80::1", "febf::1"]) {
			expect(() => validateWebhookUrl(`https://[${hostname}]/hook`)).toThrow("Invalid or unsafe");
		}
	});

	it("applies IPv4 restrictions to IPv4-mapped IPv6 destinations", () => {
		for (const hostname of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1"]) {
			expect(() => validateWebhookUrl(`https://[::ffff:${hostname}]/hook`)).toThrow("Invalid or unsafe");
		}
	});

	it("allows public IPv4 and IPv4-mapped IPv6 destinations", () => {
		expect(validateWebhookUrl("https://203.0.113.10/hook")).toBeInstanceOf(URL);
		expect(validateWebhookUrl("https://[::ffff:8.8.8.8]/hook")).toBeInstanceOf(URL);
	});

	it("rejects unsupported schemes and embedded credentials", () => {
		expect(() => validateWebhookUrl("file:///etc/passwd")).toThrow("Invalid or unsafe");
		expect(() => validateWebhookUrl("http://localhost:8080/hook")).toThrow("Invalid or unsafe");
		expect(() => validateWebhookUrl("https://user:password@example.test/hook")).toThrow("Invalid or unsafe");
	});
});
