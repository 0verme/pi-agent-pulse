import type { Clock } from "../../src/core/watchdog.js";

interface ScheduledTimer {
	dueAt: number;
	callback: () => void;
}

export class FakeClock implements Clock {
	private currentTime = 0;
	private nextTimerId = 1;
	private readonly timers = new Map<number, ScheduledTimer>();

	public now(): number {
		return this.currentTime;
	}

	public setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
		const timerId = this.nextTimerId++;
		this.timers.set(timerId, {
			dueAt: this.currentTime + Math.max(0, delayMs),
			callback,
		});
		return timerId as unknown as ReturnType<typeof setTimeout>;
	}

	public clearTimeout(handle: ReturnType<typeof setTimeout>): void {
		this.timers.delete(handle as unknown as number);
	}

	public advanceBy(milliseconds: number): void {
		const target = this.currentTime + Math.max(0, milliseconds);
		while (true) {
			const due = [...this.timers.entries()]
				.filter(([, timer]) => timer.dueAt <= target)
				.sort(([, left], [, right]) => left.dueAt - right.dueAt)[0];
			if (!due) break;
			this.currentTime = due[1].dueAt;
			this.timers.delete(due[0]);
			due[1].callback();
		}
		this.currentTime = target;
	}

	public pendingTimerCount(): number {
		return this.timers.size;
	}
}
