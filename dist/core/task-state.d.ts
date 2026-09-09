export declare const TASK_STATES: readonly ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"];
export type TaskState = (typeof TASK_STATES)[number];
export type StateEvidence = "pi-event" | "heuristic" | "unknown";
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
export declare function canTransition(from: TaskState, to: TaskState): boolean;
export declare function transitionTaskState(from: TaskState, to: TaskState): TaskState;
export declare function isTerminalState(state: TaskState): boolean;
export declare function stateEvidenceFor(state: TaskState): StateEvidence;
//# sourceMappingURL=task-state.d.ts.map