export const TASK_STATES = [
	"RUNNING",
	"TOOL_RUNNING",
	"POSSIBLY_STALLED",
	"COMPLETED",
	"FAILED",
	"ABORTED",
	"UNKNOWN",
] as const;

export type TaskState = (typeof TASK_STATES)[number];
export type StateEvidence = "pi-event" | "heuristic" | "unknown";

const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
	RUNNING: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
	TOOL_RUNNING: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
	POSSIBLY_STALLED: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
	COMPLETED: [],
	FAILED: [],
	ABORTED: [],
	UNKNOWN: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
};

export interface TaskStateSnapshot {
	taskId: string;
	sessionId: string;
	state: TaskState;
	stateEvidence: StateEvidence;
	startedAt: number;
	lastActivityAt: number;
	endedAt?: number;
	currentTool?: string;
}

export function canTransition(from: TaskState, to: TaskState): boolean {
	return TRANSITIONS[from].includes(to);
}

export function transitionTaskState(from: TaskState, to: TaskState): TaskState {
	if (!canTransition(from, to)) {
		throw new Error(`Invalid task state transition: ${from} -> ${to}`);
	}
	return to;
}

export function isTerminalState(state: TaskState): boolean {
	return state === "COMPLETED" || state === "FAILED" || state === "ABORTED";
}

export function stateEvidenceFor(state: TaskState): StateEvidence {
	if (state === "POSSIBLY_STALLED") return "heuristic";
	if (state === "UNKNOWN") return "unknown";
	return "pi-event";
}
