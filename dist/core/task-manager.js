import { createTaskEvent, sanitizeText } from "./events.js";
import { canTransition, isTerminalState, stateEvidenceFor, transitionTaskState, } from "./task-state.js";
import { systemClock, Watchdog } from "./watchdog.js";
const DEFAULT_PRIVACY = {
    includeHost: true,
    includeWorkdir: false,
    includeSummary: false,
};
function timestampOrNow(value, now) {
    return typeof value === "number" && Number.isFinite(value) ? value : now;
}
function createTaskId() {
    return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function createEventId() {
    return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function cloneWarnings(warnings) {
    return { ...warnings };
}
/**
 * The single in-memory task state machine for an extension runtime.
 * It emits domain events only; it has no knowledge of notification channels.
 */
export class TaskManager {
    clock;
    privacy;
    onEvent;
    onWarning;
    taskIdFactory;
    eventIdFactory;
    tasks = new Map();
    watchdog;
    constructor(options = {}) {
        this.clock = options.clock ?? systemClock;
        this.privacy = { ...DEFAULT_PRIVACY, ...options.privacy };
        this.onEvent = options.onEvent ?? (() => undefined);
        this.onWarning = options.onWarning ?? (() => undefined);
        this.taskIdFactory = options.taskIdFactory ?? createTaskId;
        this.eventIdFactory = options.eventIdFactory ?? createEventId;
        this.watchdog = new Watchdog({
            clock: this.clock,
            thresholds: options.thresholds,
            callbacks: {
                onLongTask: (task, level, at) => this.handleLongTask(task.taskId, level, at),
                onLongTool: (task, tool, at) => this.handleLongTool(task.taskId, tool, at),
                onStalled: (task, at) => this.handleStalled(task.taskId, at),
                onError: (source) => this.warn(`watchdog_${source}`),
            },
        });
    }
    /** Start one task per session; repeated starts keep the existing lifecycle alive. */
    startTask(input) {
        const existing = this.tasks.get(input.sessionId);
        if (existing && !isTerminalState(existing.state)) {
            this.recordActivity(input.sessionId, input.startedAt);
            return undefined;
        }
        const startedAt = timestampOrNow(input.startedAt, this.clock.now());
        const taskId = input.taskId ?? this.taskIdFactory();
        const task = {
            taskId,
            sessionId: input.sessionId,
            state: "RUNNING",
            stateEvidence: "pi-event",
            startedAt,
            lastActivityAt: startedAt,
            host: input.host,
            repo: input.repo,
            branch: input.branch,
            workdir: input.workdir,
            warnings: { longTask: false, longTool: false, stalled: false },
            currentTools: new Map(),
            summary: this.privacy.includeSummary ? sanitizeText(input.summary, 240) : undefined,
            metadata: { ...(input.metadata ?? {}) },
        };
        this.tasks.set(task.sessionId, task);
        this.watchdog.start({ taskId: task.taskId, startedAt, lastActivityAt: startedAt });
        return this.emitEvent(this.toEvent(task, "TASK_STARTED", startedAt, { useStoredSummary: true }));
    }
    recordActivity(sessionId, at = this.clock.now()) {
        const task = this.tasks.get(sessionId);
        if (!task || isTerminalState(task.state))
            return false;
        task.lastActivityAt = Math.max(task.lastActivityAt, at);
        if (task.currentTools.size > 0) {
            this.setState(task, "TOOL_RUNNING", "pi-event");
        }
        else if (task.state === "POSSIBLY_STALLED") {
            this.setState(task, "RUNNING", "pi-event");
        }
        this.watchdog.recordActivity(task.taskId, at);
        return true;
    }
    updateTaskIdentity(sessionId, identity) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return false;
        if (identity.host !== undefined)
            task.host = identity.host;
        if (identity.repo !== undefined)
            task.repo = identity.repo;
        if (identity.branch !== undefined)
            task.branch = identity.branch;
        if (identity.workdir !== undefined)
            task.workdir = identity.workdir;
        return true;
    }
    startTool(sessionId, input) {
        const task = this.tasks.get(sessionId);
        if (!task || isTerminalState(task.state))
            return false;
        const startedAt = timestampOrNow(input.startedAt, this.clock.now());
        const tool = {
            callId: input.callId,
            name: input.name,
            startedAt,
            lastActivityAt: startedAt,
        };
        task.currentTools.set(input.callId, tool);
        this.setState(task, "TOOL_RUNNING", "pi-event");
        this.recordActivity(sessionId, startedAt);
        this.watchdog.startTool(task.taskId, tool);
        return true;
    }
    updateTool(sessionId, callId, at = this.clock.now()) {
        const task = this.tasks.get(sessionId);
        const tool = task?.currentTools.get(callId);
        if (!task || !tool || isTerminalState(task.state))
            return false;
        tool.lastActivityAt = Math.max(tool.lastActivityAt, at);
        this.watchdog.updateTool(task.taskId, callId, at);
        this.recordActivity(sessionId, at);
        return true;
    }
    endTool(sessionId, callId, at = this.clock.now()) {
        const task = this.tasks.get(sessionId);
        if (!task || isTerminalState(task.state))
            return false;
        task.currentTools.delete(callId);
        this.watchdog.endTool(task.taskId, callId, at);
        this.recordActivity(sessionId, at);
        if (task.currentTools.size > 0)
            this.setState(task, "TOOL_RUNNING", "pi-event");
        return true;
    }
    /** Mark a task completed from an explicit completion signal. */
    completeTask(sessionId, summary, endedAt = this.clock.now()) {
        return this.finishTask(sessionId, "COMPLETED", summary, endedAt);
    }
    /** Mark the Pi lifecycle settled; settlement is not a business-success claim. */
    settleTask(sessionId, summary, endedAt = this.clock.now()) {
        return this.finishTask(sessionId, "COMPLETED", summary, endedAt, {
            outcome: "settled",
            signal: "agent_settled",
        });
    }
    failTask(sessionId, summary, endedAt = this.clock.now()) {
        return this.finishTask(sessionId, "FAILED", summary, endedAt);
    }
    /** Only an explicit adapter signal may call this; watchdog heuristics never do. */
    abortTask(sessionId, summary, endedAt = this.clock.now()) {
        return this.finishTask(sessionId, "ABORTED", summary, endedAt);
    }
    /** Stop timers when Pi replaces or shuts down a session without a reliable outcome signal. */
    endSession(sessionId) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return;
        this.watchdog.stop(task.taskId);
        this.tasks.delete(sessionId);
    }
    stopAll() {
        this.watchdog.stopAll();
        this.tasks.clear();
    }
    getTask(sessionId) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return undefined;
        return {
            taskId: task.taskId,
            sessionId: task.sessionId,
            state: task.state,
            stateEvidence: task.stateEvidence,
            startedAt: task.startedAt,
            lastActivityAt: task.lastActivityAt,
            host: task.host,
            repo: task.repo,
            branch: task.branch,
            workdir: task.workdir,
            warnings: cloneWarnings(task.warnings),
            currentTools: [...task.currentTools.values()].map((tool) => ({ ...tool })),
        };
    }
    activeSessionIds() {
        return [...this.tasks.keys()];
    }
    finishTask(sessionId, state, summary, endedAt, metadata) {
        const task = this.tasks.get(sessionId);
        if (!task || isTerminalState(task.state))
            return undefined;
        this.watchdog.stop(task.taskId);
        task.currentTools.clear();
        this.setState(task, state, "pi-event");
        task.endedAt = endedAt;
        task.lastActivityAt = Math.max(task.lastActivityAt, endedAt);
        const event = this.emitEvent(this.toEvent(task, state === "COMPLETED" ? "TASK_COMPLETED" : state === "FAILED" ? "TASK_FAILED" : "TASK_ABORTED", endedAt, {
            endedAt,
            durationMs: Math.max(0, endedAt - task.startedAt),
            summary: this.privacy.includeSummary ? summary : undefined,
            metadata,
        }));
        this.tasks.delete(sessionId);
        return event;
    }
    handleLongTask(taskId, level, at) {
        const task = this.findTask(taskId);
        if (!task)
            return;
        task.warnings.longTask = true;
        this.emitEvent(this.toEvent(task, "TASK_WARNING", at, {
            summary: `Long-task ${level} threshold reached`,
            metadata: { signal: "LONG_TASK", level },
        }));
    }
    handleLongTool(taskId, tool, at) {
        const task = this.findTask(taskId);
        if (!task)
            return;
        task.warnings.longTool = true;
        this.emitEvent(this.toEvent(task, "TASK_WARNING", at, {
            currentTool: tool.name,
            summary: "A tool execution exceeded the long-tool threshold",
            metadata: { signal: "LONG_TOOL" },
        }));
    }
    handleStalled(taskId, at) {
        const task = this.findTask(taskId);
        if (!task)
            return;
        task.warnings.stalled = true;
        this.setState(task, "POSSIBLY_STALLED", "heuristic");
        this.emitEvent(this.toEvent(task, "TASK_STALLED", at, {
            summary: "No Pi activity was observed for the stalled threshold",
            metadata: { signal: "POSSIBLY_STALLED" },
        }));
    }
    findTask(taskId) {
        for (const task of this.tasks.values()) {
            if (task.taskId === taskId)
                return task;
        }
        return undefined;
    }
    setState(task, next, evidence) {
        if (task.state === next) {
            task.stateEvidence = evidence;
            return;
        }
        if (!canTransition(task.state, next)) {
            this.warn(`invalid_transition_${task.state}_${next}`);
            return;
        }
        task.state = transitionTaskState(task.state, next);
        task.stateEvidence = evidence;
    }
    toEvent(task, type, timestamp, options = {}) {
        const metadata = { ...task.metadata };
        for (const [key, value] of Object.entries(options.metadata ?? {})) {
            if (value !== undefined)
                metadata[key] = value;
        }
        const currentTool = options.currentTool ?? task.currentTools.values().next().value?.name;
        return createTaskEvent({
            type,
            eventId: this.eventIdFactory(),
            timestamp,
            taskId: task.taskId,
            sessionId: task.sessionId,
            state: task.state,
            stateEvidence: task.stateEvidence || stateEvidenceFor(task.state),
            host: this.privacy.includeHost ? task.host : undefined,
            repo: task.repo,
            branch: task.branch,
            workdir: this.privacy.includeWorkdir ? task.workdir : undefined,
            startedAt: task.startedAt,
            lastActivityAt: task.lastActivityAt,
            endedAt: options.endedAt ?? task.endedAt,
            durationMs: options.durationMs,
            currentTool,
            summary: options.useStoredSummary ? task.summary : options.summary,
            warnings: task.warnings,
            metadata,
        });
    }
    emitEvent(event) {
        try {
            this.onEvent(event);
        }
        catch {
            this.warn("event_consumer");
        }
        return event;
    }
    warn(source) {
        try {
            this.onWarning(source);
        }
        catch {
            // Observability is advisory and cannot affect task state.
        }
    }
}
//# sourceMappingURL=task-manager.js.map