import { describe, expect, it } from "vitest";

import { canTransition, isTerminalState, stateEvidenceFor, transitionTaskState } from "../src/core/task-state.js";

describe("task state transitions", () => {
	it("allows observed progress and heuristic recovery", () => {
		expect(canTransition("RUNNING", "TOOL_RUNNING")).toBe(true);
		expect(transitionTaskState("TOOL_RUNNING", "POSSIBLY_STALLED")).toBe("POSSIBLY_STALLED");
		expect(transitionTaskState("POSSIBLY_STALLED", "RUNNING")).toBe("RUNNING");
		expect(stateEvidenceFor("POSSIBLY_STALLED")).toBe("heuristic");
	});

	it("keeps terminal states terminal", () => {
		expect(isTerminalState("COMPLETED")).toBe(true);
		expect(canTransition("COMPLETED", "RUNNING")).toBe(false);
		expect(() => transitionTaskState("FAILED", "RUNNING")).toThrow("Invalid task state transition");
	});
});
