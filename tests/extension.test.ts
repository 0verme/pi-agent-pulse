import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { createPiPulseExtension } from "../src/extension/pi.js";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalFetch = globalThis.fetch;

function restoreGlobals(): void {
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	globalThis.fetch = originalFetch;
}

afterEach(() => {
	restoreGlobals();
	vi.restoreAllMocks();
});

describe("Pi lifecycle adapter", () => {
	it("maps agent_settled to a settled completion and does not guess failure or abort", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-pulse-extension-test-"));
		const requestBodies: string[] = [];
		process.env.PI_CODING_AGENT_DIR = agentDir;
		writeFileSync(
			join(agentDir, "pi-pulse.json"),
			JSON.stringify({
				channels: {
					webhook: { enabled: true, url: "https://hooks.example.test/pi-pulse" },
				},
			}),
		);
		const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const request = input instanceof Request ? input : new Request(input);
			requestBodies.push(await request.text());
			return new Response(null, { status: 200 });
		});
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			const handlers = new Map<string, (...args: unknown[]) => unknown>();
			const pi = {
				on: (event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler),
				exec: async () => ({ code: 1, killed: false, stdout: "", stderr: "" }),
			} as unknown as ExtensionAPI;
			const context = {
				cwd: agentDir,
				sessionManager: { getSessionId: () => "session-1" },
			} as unknown as ExtensionContext;

			createPiPulseExtension(pi);
			await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, context);
			await handlers.get("before_agent_start")?.(
				{ type: "before_agent_start", prompt: "send a bounded smoke test" },
				context,
			);
			await handlers.get("agent_start")?.({ type: "agent_start" }, context);
			await handlers.get("agent_settled")?.({ type: "agent_settled" }, context);
			await new Promise((resolve) => setTimeout(resolve, 0));

			const events = requestBodies.map(
				(body) =>
					JSON.parse(body) as {
						type: string;
						metadata?: unknown;
						startedAt?: string;
						endedAt?: string;
						summary?: string;
					},
			);
			expect(events.map((event) => event.type)).toEqual(["TASK_STARTED", "TASK_COMPLETED"]);
			expect(events[0]?.startedAt).toEqual(expect.any(String));
			expect(events[1]?.startedAt).toBe(events[0]?.startedAt);
			expect(events[1]?.endedAt).toEqual(expect.any(String));
			expect(events[0]?.summary).toBe("send a bounded smoke test");
			expect(events[1]?.summary).toBeUndefined();
			expect(Date.parse(events[0]?.startedAt ?? "NaN")).toBeLessThan(Date.parse(events[1]?.endedAt ?? "NaN"));
			expect(events[1]?.metadata).toEqual({ outcome: "settled", signal: "agent_settled" });
			expect(events.some((event) => event.type === "TASK_FAILED")).toBe(false);
			expect(events.some((event) => event.type === "TASK_ABORTED")).toBe(false);
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});

	it("keeps the detected locale stable across task lifecycle notifications", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-pulse-extension-locale-test-"));
		const requestBodies: string[] = [];
		process.env.PI_CODING_AGENT_DIR = agentDir;
		writeFileSync(
			join(agentDir, "pi-pulse.json"),
			JSON.stringify({
				locale: "auto",
				channels: {
					feishu: {
						enabled: true,
						webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
					},
				},
			}),
		);
		const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const request = input instanceof Request ? input : new Request(input);
			requestBodies.push(await request.text());
			return new Response(null, { status: 200 });
		});
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			const handlers = new Map<string, (...args: unknown[]) => unknown>();
			const pi = {
				on: (event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler),
				exec: async () => ({ code: 1, killed: false, stdout: "", stderr: "" }),
			} as unknown as ExtensionAPI;
			const context = {
				cwd: agentDir,
				sessionManager: { getSessionId: () => "session-locale" },
			} as unknown as ExtensionContext;

			createPiPulseExtension(pi);
			await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, context);
			await handlers.get("before_agent_start")?.(
				{ type: "before_agent_start", prompt: "请帮我修复这个 Issue" },
				context,
			);
			await handlers.get("agent_start")?.({ type: "agent_start" }, context);
			await handlers.get("agent_settled")?.({ type: "agent_settled" }, context);
			await new Promise((resolve) => setTimeout(resolve, 0));

			const notifications = requestBodies.map((body) => JSON.parse(body) as { content: { text: string } });
			expect(notifications).toHaveLength(2);
			const texts = notifications.map((notification) => notification.content.text);
			expect(texts.some((text) => text.startsWith("[Pi Pulse] 任务开始"))).toBe(true);
			expect(texts.some((text) => text.startsWith("[Pi Pulse] 任务完成"))).toBe(true);
			expect(texts.some((text) => text.includes("请帮我修复这个 Issue"))).toBe(true);
			for (const notification of notifications) {
				expect(notification.content.text).not.toContain("Task started");
				expect(notification.content.text).not.toContain("Task completed");
			}
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});

	it("honors an explicit privacy.includeSummary=false opt-out from the config file", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-pulse-extension-opt-out-test-"));
		const requestBodies: string[] = [];
		process.env.PI_CODING_AGENT_DIR = agentDir;
		writeFileSync(
			join(agentDir, "pi-pulse.json"),
			JSON.stringify({
				channels: {
					webhook: { enabled: true, url: "https://hooks.example.test/pi-pulse" },
				},
				privacy: { includeSummary: false },
			}),
		);
		const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const request = input instanceof Request ? input : new Request(input);
			requestBodies.push(await request.text());
			return new Response(null, { status: 200 });
		});
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			const handlers = new Map<string, (...args: unknown[]) => unknown>();
			const pi = {
				on: (event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler),
				exec: async () => ({ code: 1, killed: false, stdout: "", stderr: "" }),
			} as unknown as ExtensionAPI;
			const context = {
				cwd: agentDir,
				sessionManager: { getSessionId: () => "session-opt-out" },
			} as unknown as ExtensionContext;

			createPiPulseExtension(pi);
			await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, context);
			await handlers.get("before_agent_start")?.(
				{ type: "before_agent_start", prompt: "private prompt that must not leave" },
				context,
			);
			await handlers.get("agent_start")?.({ type: "agent_start" }, context);
			await handlers.get("turn_end")?.(
				{
					type: "turn_end",
					message: { role: "assistant", content: [{ type: "text", text: "private output" }] },
				},
				context,
			);
			await handlers.get("agent_settled")?.({ type: "agent_settled" }, context);
			await new Promise((resolve) => setTimeout(resolve, 0));

			const events = requestBodies.map((body) => JSON.parse(body) as { summary?: string });
			expect(events).toHaveLength(2);
			expect(events[0]?.summary).toBeUndefined();
			expect(events[1]?.summary).toBeUndefined();
			for (const body of requestBodies) {
				expect(body).not.toContain("private prompt");
				expect(body).not.toContain("private output");
			}
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});

	it("sanitizes and bounds the default summary before it leaves the adapter", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-pulse-extension-sanitize-test-"));
		const requestBodies: string[] = [];
		process.env.PI_CODING_AGENT_DIR = agentDir;
		writeFileSync(
			join(agentDir, "pi-pulse.json"),
			JSON.stringify({
				channels: {
					webhook: { enabled: true, url: "https://hooks.example.test/pi-pulse" },
				},
			}),
		);
		const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const request = input instanceof Request ? input : new Request(input);
			requestBodies.push(await request.text());
			return new Response(null, { status: 200 });
		});
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			const handlers = new Map<string, (...args: unknown[]) => unknown>();
			const pi = {
				on: (event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler),
				exec: async () => ({ code: 1, killed: false, stdout: "", stderr: "" }),
			} as unknown as ExtensionAPI;
			const context = {
				cwd: agentDir,
				sessionManager: { getSessionId: () => "session-sanitize" },
			} as unknown as ExtensionContext;

			createPiPulseExtension(pi);
			await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, context);
			await handlers.get("before_agent_start")?.(
				{
					type: "before_agent_start",
					prompt: "Authorization: Bearer super-secret-token\n" + "x".repeat(400),
				},
				context,
			);
			await handlers.get("agent_start")?.({ type: "agent_start" }, context);
			await handlers.get("agent_settled")?.({ type: "agent_settled" }, context);
			await new Promise((resolve) => setTimeout(resolve, 0));

			const events = requestBodies.map((body) => JSON.parse(body) as { summary?: string });
			const summary = events[0]?.summary ?? "";
			expect(summary).not.toContain("super-secret-token");
			expect(summary).toContain("[redacted]");
			expect(Array.from(summary)).toHaveLength(240);
			for (const body of requestBodies) {
				expect(body).not.toContain("super-secret-token");
			}
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});
});
