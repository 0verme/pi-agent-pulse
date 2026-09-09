import type { StateEvidence, TaskState } from "./task-state.js";
export declare const TASK_EVENT_TYPES: readonly ["TASK_STARTED", "TASK_WARNING", "TASK_STALLED", "TASK_COMPLETED", "TASK_FAILED", "TASK_ABORTED"];
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];
export interface TaskWarnings {
    longTask: boolean;
    longTool: boolean;
    stalled: boolean;
}
export type TaskMetadataValue = string | number | boolean | null;
export type TaskMetadata = Readonly<Record<string, TaskMetadataValue>>;
/**
 * Stable, channel-neutral notification contract emitted by the core.
 *
 * The current Pi adapter emits `TASK_COMPLETED` with `metadata.outcome=settled`
 * when Pi reports `agent_settled`; this means the lifecycle has no queued retry,
 * compaction, or follow-up left, not that the task business operation succeeded.
 * `TASK_FAILED` and `TASK_ABORTED` require an explicit runtime signal and are not
 * inferred from assistant text, summaries, tool names, or session shutdown.
 *
 * The event deliberately contains summaries rather than prompts, tool arguments,
 * source code, environment variables, or full conversation contents.
 */
export interface TaskEvent {
    type: TaskEventType;
    eventId: string;
    timestamp: string;
    taskId: string;
    sessionId: string;
    state: TaskState;
    stateEvidence: StateEvidence;
    host?: string;
    repo?: string;
    branch?: string;
    workdir?: string;
    startedAt?: string;
    lastActivityAt?: string;
    endedAt?: string;
    durationMs?: number;
    currentTool?: string;
    summary?: string;
    warnings: TaskWarnings;
    metadata?: TaskMetadata;
}
export interface CreateTaskEventInput {
    type: TaskEventType;
    timestamp: number;
    taskId: string;
    sessionId: string;
    state: TaskState;
    stateEvidence: StateEvidence;
    eventId?: string;
    host?: string;
    repo?: string;
    branch?: string;
    workdir?: string;
    startedAt?: number;
    lastActivityAt?: number;
    endedAt?: number;
    durationMs?: number;
    currentTool?: string;
    summary?: string;
    warnings?: Partial<TaskWarnings>;
    metadata?: Record<string, unknown>;
}
/**
 * Normalize and redact a short human-readable value before it can enter an event.
 */
export declare function sanitizeText(value: unknown, maxChars?: number): string | undefined;
/** Build a JSON-safe domain event from bounded, already classified task data. */
export declare function createTaskEvent(input: CreateTaskEventInput): TaskEvent;
//# sourceMappingURL=events.d.ts.map