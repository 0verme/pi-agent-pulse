export interface Clock {
	now(): number;
	setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export const systemClock: Clock = {
	now: () => Date.now(),
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle),
};

export interface WatchdogThresholds {
	longTaskNoticeMs: number;
	longTaskWarningMs: number;
	longTaskCriticalMs: number;
	longToolMs: number;
	stalledMs: number;
}

export const DEFAULT_WATCHDOG_THRESHOLDS: WatchdogThresholds = {
	longTaskNoticeMs: 45 * 60_000,
	longTaskWarningMs: 75 * 60_000,
	longTaskCriticalMs: 120 * 60_000,
	longToolMs: 20 * 60_000,
	stalledMs: 15 * 60_000,
};

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

interface ToolRegistration extends WatchdogToolInput {
	longToolSent: boolean;
}

interface Registration {
	task: WatchdogTaskInput;
	taskTimers: Partial<Record<TaskWarningLevel, ReturnType<typeof setTimeout>>>;
	toolTimers: Map<string, ReturnType<typeof setTimeout>>;
	tools: Map<string, ToolRegistration>;
	sentTaskLevels: Set<TaskWarningLevel>;
	stalledTimer?: ReturnType<typeof setTimeout>;
	stalledSent: boolean;
}

function elapsedMs(startAt: number, endAt: number): number {
	return Math.max(0, endAt - startAt);
}

function positiveDelay(value: number): number {
	return Math.max(0, Number.isFinite(value) ? value : 0);
}

/**
 * In-memory watchdog scheduler. It owns timers only; it never knows about
 * Pi, channels, network I/O, or process control.
 */
export class Watchdog {
	private readonly clock: Clock;
	private readonly thresholds: WatchdogThresholds;
	private readonly callbacks: WatchdogCallbacks;
	private readonly registrations = new Map<string, Registration>();

	public constructor(options: WatchdogOptions) {
		this.clock = options.clock ?? systemClock;
		this.thresholds = { ...DEFAULT_WATCHDOG_THRESHOLDS, ...options.thresholds };
		this.callbacks = options.callbacks;
	}

	public start(task: WatchdogTaskInput): void {
		this.stop(task.taskId);
		const registration: Registration = {
			task: { ...task },
			taskTimers: {},
			toolTimers: new Map(),
			tools: new Map(),
			sentTaskLevels: new Set(),
			stalledSent: false,
		};
		this.registrations.set(task.taskId, registration);

		this.scheduleTaskTimer(registration, "notice", this.thresholds.longTaskNoticeMs);
		this.scheduleTaskTimer(registration, "warning", this.thresholds.longTaskWarningMs);
		this.scheduleTaskTimer(registration, "critical", this.thresholds.longTaskCriticalMs);
		this.scheduleStalledTimer(registration);
	}

	public recordActivity(taskId: string, at = this.clock.now()): void {
		const registration = this.registrations.get(taskId);
		if (!registration) return;
		registration.task.lastActivityAt = Math.max(registration.task.lastActivityAt, at);
		this.scheduleStalledTimer(registration);
	}

	public startTool(taskId: string, tool: WatchdogToolInput): void {
		const registration = this.registrations.get(taskId);
		if (!registration) return;
		this.clearToolTimer(registration, tool.callId);
		registration.tools.delete(tool.callId);
		registration.tools.set(tool.callId, { ...tool, longToolSent: false });
		registration.task.lastActivityAt = Math.max(registration.task.lastActivityAt, tool.lastActivityAt);
		// Register the tool deadline first so an equal deadline gives LONG_TOOL priority.
		this.scheduleToolTimer(registration, tool.callId);
		this.scheduleStalledTimer(registration);
	}

	public updateTool(taskId: string, callId: string, at = this.clock.now()): void {
		const registration = this.registrations.get(taskId);
		const tool = registration?.tools.get(callId);
		if (!registration || !tool) return;
		tool.lastActivityAt = Math.max(tool.lastActivityAt, at);
		this.recordActivity(taskId, at);
	}

	public endTool(taskId: string, callId: string, at = this.clock.now()): void {
		const registration = this.registrations.get(taskId);
		if (!registration) return;
		this.clearToolTimer(registration, callId);
		registration.tools.delete(callId);
		this.recordActivity(taskId, at);
	}

	public stop(taskId: string): void {
		const registration = this.registrations.get(taskId);
		if (!registration) return;
		for (const handle of Object.values(registration.taskTimers)) {
			if (handle !== undefined) this.clock.clearTimeout(handle);
		}
		for (const handle of registration.toolTimers.values()) this.clock.clearTimeout(handle);
		if (registration.stalledTimer !== undefined) this.clock.clearTimeout(registration.stalledTimer);
		registration.toolTimers.clear();
		registration.tools.clear();
		registration.taskTimers = {};
		registration.stalledTimer = undefined;
		this.registrations.delete(taskId);
	}

	public stopAll(): void {
		for (const taskId of [...this.registrations.keys()]) this.stop(taskId);
	}

	public isWatching(taskId: string): boolean {
		return this.registrations.has(taskId);
	}

	public activeTaskIds(): string[] {
		return [...this.registrations.keys()];
	}

	private taskSnapshot(registration: Registration): WatchdogTaskSnapshot {
		return {
			...registration.task,
			currentTools: [...registration.tools.values()].map(({ longToolSent: _longToolSent, ...tool }) => tool),
		};
	}

	private safeCallback(source: string, callback: () => void): void {
		try {
			callback();
		} catch {
			try {
				this.callbacks.onError?.(source);
			} catch {
				// A diagnostic callback must never break watchdog cleanup.
			}
		}
	}

	private scheduleTaskTimer(registration: Registration, level: TaskWarningLevel, thresholdMs: number): void {
		const previous = registration.taskTimers[level];
		if (previous !== undefined) this.clock.clearTimeout(previous);
		const delayMs = positiveDelay(thresholdMs - elapsedMs(registration.task.startedAt, this.clock.now()));
		registration.taskTimers[level] = this.clock.setTimeout(() => {
			delete registration.taskTimers[level];
			if (!this.isCurrent(registration)) return;

			const now = this.clock.now();
			const remainingMs = thresholdMs - elapsedMs(registration.task.startedAt, now);
			if (remainingMs > 0) {
				this.scheduleTaskTimer(registration, level, thresholdMs);
				return;
			}
			if (registration.sentTaskLevels.has(level)) return;
			registration.sentTaskLevels.add(level);
			this.safeCallback(`task_${level}`, () =>
				this.callbacks.onLongTask(this.taskSnapshot(registration), level, now),
			);
		}, delayMs);
	}

	private scheduleToolTimer(registration: Registration, callId: string): void {
		this.clearToolTimer(registration, callId);
		const tool = registration.tools.get(callId);
		if (!tool) return;
		const delayMs = positiveDelay(this.thresholds.longToolMs - elapsedMs(tool.startedAt, this.clock.now()));
		registration.toolTimers.set(
			callId,
			this.clock.setTimeout(() => {
				registration.toolTimers.delete(callId);
				if (!this.isCurrent(registration)) return;
				const currentTool = registration.tools.get(callId);
				if (!currentTool || currentTool.longToolSent) return;

				const now = this.clock.now();
				const remainingMs = this.thresholds.longToolMs - elapsedMs(currentTool.startedAt, now);
				if (remainingMs > 0) {
					this.scheduleToolTimer(registration, callId);
					return;
				}
				currentTool.longToolSent = true;
				this.safeCallback("long_tool", () =>
					this.callbacks.onLongTool(this.taskSnapshot(registration), { ...currentTool }, now),
				);
			}, delayMs),
		);
	}

	private scheduleStalledTimer(registration: Registration): void {
		if (registration.stalledSent) return;
		if (registration.stalledTimer !== undefined) this.clock.clearTimeout(registration.stalledTimer);
		const delayMs = positiveDelay(
			this.thresholds.stalledMs - elapsedMs(registration.task.lastActivityAt, this.clock.now()),
		);
		registration.stalledTimer = this.clock.setTimeout(() => {
			registration.stalledTimer = undefined;
			if (!this.isCurrent(registration) || registration.stalledSent) return;

			const now = this.clock.now();
			const remainingMs = this.thresholds.stalledMs - elapsedMs(registration.task.lastActivityAt, now);
			if (remainingMs > 0) {
				this.scheduleStalledTimer(registration);
				return;
			}
			if ([...registration.tools.values()].some((tool) => tool.longToolSent)) return;
			registration.stalledSent = true;
			this.safeCallback("stalled", () => this.callbacks.onStalled(this.taskSnapshot(registration), now));
		}, delayMs);
	}

	private clearToolTimer(registration: Registration, callId: string): void {
		const handle = registration.toolTimers.get(callId);
		if (handle !== undefined) this.clock.clearTimeout(handle);
		registration.toolTimers.delete(callId);
	}

	private isCurrent(registration: Registration): boolean {
		return this.registrations.get(registration.task.taskId) === registration;
	}
}
