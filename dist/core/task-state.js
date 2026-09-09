export const TASK_STATES = [
    "RUNNING",
    "TOOL_RUNNING",
    "POSSIBLY_STALLED",
    "COMPLETED",
    "FAILED",
    "ABORTED",
    "UNKNOWN",
];
const TRANSITIONS = {
    RUNNING: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
    TOOL_RUNNING: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
    POSSIBLY_STALLED: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
    COMPLETED: [],
    FAILED: [],
    ABORTED: [],
    UNKNOWN: ["RUNNING", "TOOL_RUNNING", "POSSIBLY_STALLED", "COMPLETED", "FAILED", "ABORTED", "UNKNOWN"],
};
export function canTransition(from, to) {
    return TRANSITIONS[from].includes(to);
}
export function transitionTaskState(from, to) {
    if (!canTransition(from, to)) {
        throw new Error(`Invalid task state transition: ${from} -> ${to}`);
    }
    return to;
}
export function isTerminalState(state) {
    return state === "COMPLETED" || state === "FAILED" || state === "ABORTED";
}
export function stateEvidenceFor(state) {
    if (state === "POSSIBLY_STALLED")
        return "heuristic";
    if (state === "UNKNOWN")
        return "unknown";
    return "pi-event";
}
//# sourceMappingURL=task-state.js.map