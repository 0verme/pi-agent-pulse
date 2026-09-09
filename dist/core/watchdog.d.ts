export interface Clock {
    now(): number;
    setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
    clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}
export declare const systemClock: Clock;
export interface WatchdogThresholds {
    longTaskNoticeMs: number;
    longTaskWarningMs: number;
    longTaskCriticalMs: number;
    longToolMs: number;
    stalledMs: number;
}
export declare const DEFAULT_WATCHDOG_THRESHOLDS: WatchdogThresholds;
export type TaskWarningLevel = "notice" | "warning" | "critical";
export interface WatchdogTaskInput {
    taskId: string;
    startedAt: number;
    lastActivityAt: number;
}
export interface WatchdogToolInput {
    callId: string;
    name: string;
    startedAt: number;
    lastActivityAt: number;
}
export interface WatchdogTaskSnapshot extends WatchdogTaskInput {
    currentTools: readonly WatchdogToolInput[];
}
export interface WatchdogCallbacks {
    onLongTask: (task: WatchdogTaskSnapshot, level: TaskWarningLevel, at: number) => void;
    onLongTool: (task: WatchdogTaskSnapshot, tool: WatchdogToolInput, at: number) => void;
    onStalled: (task: WatchdogTaskSnapshot, at: number) => void;
    onError?: (source: string) => void;
}
export interface WatchdogOptions {
    clock?: Clock;
    thresholds?: Partial<WatchdogThresholds>;
    callbacks: WatchdogCallbacks;
}
/**
 * In-memory watchdog scheduler. It owns timers only; it never knows about
 * Pi, channels, network I/O, or process control.
 */
export declare class Watchdog {
    private readonly clock;
    private readonly thresholds;
    private readonly callbacks;
    private readonly registrations;
    constructor(options: WatchdogOptions);
    start(task: WatchdogTaskInput): void;
    recordActivity(taskId: string, at?: number): void;
    startTool(taskId: string, tool: WatchdogToolInput): void;
    updateTool(taskId: string, callId: string, at?: number): void;
    endTool(taskId: string, callId: string, at?: number): void;
    stop(taskId: string): void;
    stopAll(): void;
    isWatching(taskId: string): boolean;
    activeTaskIds(): string[];
    private taskSnapshot;
    private safeCallback;
    private scheduleTaskTimer;
    private scheduleToolTimer;
    private scheduleStalledTimer;
    private clearToolTimer;
    private isCurrent;
}
//# sourceMappingURL=watchdog.d.ts.map