import { type TaskEvent, type TaskWarnings } from "./events.js";
import { type TaskStateSnapshot } from "./task-state.js";
import { type Clock, type WatchdogThresholds, type WatchdogToolInput } from "./watchdog.js";
export interface TaskIdentityInput {
    sessionId: string;
    taskId?: string;
    host?: string;
    repo?: string;
    branch?: string;
    workdir?: string;
}
export interface StartTaskInput extends TaskIdentityInput {
    startedAt?: number;
    summary?: string;
    metadata?: Record<string, unknown>;
}
export interface ToolStartInput {
    callId: string;
    name: string;
    startedAt?: number;
}
export interface TaskManagerPrivacy {
    includeHost: boolean;
    includeWorkdir: boolean;
    includeSummary: boolean;
}
export interface TaskManagerOptions {
    clock?: Clock;
    thresholds?: Partial<WatchdogThresholds>;
    privacy?: Partial<TaskManagerPrivacy>;
    onEvent?: (event: TaskEvent) => void;
    onWarning?: (source: string) => void;
    taskIdFactory?: () => string;
    eventIdFactory?: () => string;
}
export interface ManagedTaskSnapshot extends TaskStateSnapshot {
    host?: string;
    repo?: string;
    branch?: string;
    workdir?: string;
    warnings: TaskWarnings;
    currentTools: readonly WatchdogToolInput[];
}
/**
 * The single in-memory task state machine for an extension runtime.
 * It emits domain events only; it has no knowledge of notification channels.
 */
export declare class TaskManager {
    private readonly clock;
    private readonly privacy;
    private readonly onEvent;
    private readonly onWarning;
    private readonly taskIdFactory;
    private readonly eventIdFactory;
    private readonly tasks;
    private readonly watchdog;
    constructor(options?: TaskManagerOptions);
    /** Start one task per session; repeated starts keep the existing lifecycle alive. */
    startTask(input: StartTaskInput): TaskEvent | undefined;
    recordActivity(sessionId: string, at?: number): boolean;
    updateTaskIdentity(sessionId: string, identity: Partial<Pick<TaskIdentityInput, "host" | "repo" | "branch" | "workdir">>): boolean;
    startTool(sessionId: string, input: ToolStartInput): boolean;
    updateTool(sessionId: string, callId: string, at?: number): boolean;
    endTool(sessionId: string, callId: string, at?: number): boolean;
    /** Mark a task completed from an explicit completion signal. */
    completeTask(sessionId: string, summary?: string, endedAt?: number): TaskEvent | undefined;
    /** Mark the Pi lifecycle settled; settlement is not a business-success claim. */
    settleTask(sessionId: string, summary?: string, endedAt?: number): TaskEvent | undefined;
    failTask(sessionId: string, summary?: string, endedAt?: number): TaskEvent | undefined;
    /** Only an explicit adapter signal may call this; watchdog heuristics never do. */
    abortTask(sessionId: string, summary?: string, endedAt?: number): TaskEvent | undefined;
    /** Stop timers when Pi replaces or shuts down a session without a reliable outcome signal. */
    endSession(sessionId: string): void;
    stopAll(): void;
    getTask(sessionId: string): ManagedTaskSnapshot | undefined;
    activeSessionIds(): string[];
    private finishTask;
    private handleLongTask;
    private handleLongTool;
    private handleStalled;
    private findTask;
    private setState;
    private toEvent;
    /**
     * TASK_STARTED has no meaningful elapsed time, so it stays without duration.
     * Every other event reports the accumulated time from the task start, while an
     * explicit terminal duration keeps priority over the computed fallback.
     */
    private resolveDurationMs;
    private emitEvent;
    private warn;
}
//# sourceMappingURL=task-manager.d.ts.map