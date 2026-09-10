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
					JSON.parse(body) as { type: string; metadata?: unknown; startedAt?: string; endedAt?: string },
			);
			expect(events.map((event) => event.type)).toEqual(["TASK_STARTED", "TASK_COMPLETED"]);
			expect(events[0]?.startedAt).toEqual(expect.any(String));
			expect(events[1]?.startedAt).toBe(events[0]?.startedAt);
			expect(events[1]?.endedAt).toEqual(expect.any(String));
			expect(Date.parse(events[0]?.startedAt ?? "NaN")).toBeLessThan(Date.parse(events[1]?.endedAt ?? "NaN"));
			expect(events[1]?.metadata).toEqual({ outcome: "settled", signal: "agent_settled" });
			expect(events.some((event) => event.type === "TASK_FAILED")).toBe(false);
			expect(events.some((event) => event.type === "TASK_ABORTED")).toBe(false);
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});
});
