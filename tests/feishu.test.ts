import { describe, expect, it, vi } from "vitest";

import {
	createDisplayTimestampFormatter,
	formatDisplayTimestamp,
	renderFeishuPayload,
} from "../src/channels/feishu/renderer.js";
import { FeishuChannel, type FeishuRequest } from "../src/channels/feishu/transport.js";
import { createTaskEvent } from "../src/core/events.js";

const FIXED_TIMESTAMP = "2026-09-11T15:20:00.000Z";

function formatSystemLocal(value: string): string {
	const parts = new Map(
		new Intl.DateTimeFormat("en-CA", {
			calendar: "gregory",
			numberingSystem: "latn",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(new Date(value))
			.map(({ type, value: partValue }) => [type, partValue]),
	);
	return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")} ${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}`;
}

function completedEvent() {
	return createTaskEvent({
		type: "TASK_COMPLETED",
		timestamp: Date.UTC(2026, 8, 11, 15, 20, 0),
		startedAt: Date.UTC(2026, 8, 11, 15, 5, 5),
		endedAt: Date.UTC(2026, 8, 11, 15, 20, 0),
		durationMs: (14 * 60 + 55) * 1_000,
		taskId: "task-1",
		sessionId: "session-1",
		state: "COMPLETED",
		stateEvidence: "pi-event",
	});
}

describe("Feishu adapter boundary", () => {
	it("renders a TaskEvent as a bounded Feishu text payload", () => {
		const event = createTaskEvent({
			type: "TASK_STALLED",
			timestamp: 0,
			taskId: "task-1",
			sessionId: "session-1",
			state: "POSSIBLY_STALLED",
			stateEvidence: "heuristic",
			warnings: { stalled: true },
		});

		const payload = renderFeishuPayload(event, { locale: "en-US" });
		expect(payload.msg_type).toBe("text");
		expect(payload.content.text).toContain("Task possibly stalled");
		expect(payload.content.text).toContain("State: Possibly stalled (Heuristic)");
		expect(payload.content.text).toContain("Duration: unknown");
		expect(payload.content.text).not.toContain("TASK_STALLED");
	});

	it("renders translated Chinese labels while preserving summary text", () => {
		const event = createTaskEvent({
			type: "TASK_STARTED",
			timestamp: 0,
			taskId: "task-中文",
			sessionId: "session-1",
			state: "RUNNING",
			stateEvidence: "pi-event",
			summary: "请帮我修复这个 Issue",
		});

		const text = renderFeishuPayload(event, { locale: "zh-CN" }).content.text;
		const englishText = renderFeishuPayload(event, { locale: "en-US" }).content.text;
		expect(text).toContain("[Pi Pulse] 任务开始");
		expect(text).toContain("任务：task-中文");
		expect(text).toContain("状态：运行中（Pi 事件）");
		expect(text).toContain("分支：未知");
		expect(text).not.toContain("耗时：");
		expect(englishText).toContain("[Pi Pulse] Task started");
		expect(englishText).not.toContain("Duration:");
		expect(text).toContain("摘要：请帮我修复这个 Issue");
		expect(text).not.toContain("TASK_STARTED");
	});

	it("uses the system local timezone by default", () => {
		expect(formatDisplayTimestamp(FIXED_TIMESTAMP)).toBe(formatSystemLocal(FIXED_TIMESTAMP));
	});

	it("formats an explicit Asia/Shanghai timezone", () => {
		expect(formatDisplayTimestamp(FIXED_TIMESTAMP, "Asia/Shanghai")).toBe("2026-09-11 23:20:00");
	});

	it("formats an explicit UTC timezone", () => {
		expect(formatDisplayTimestamp(FIXED_TIMESTAMP, "UTC")).toBe("2026-09-11 15:20:00");
	});

	it("falls back to system local time and warns once for an invalid timezone", () => {
		const onWarning = vi.fn();
		const formatter = createDisplayTimestampFormatter("Not/AReal/Timezone", onWarning);

		expect(formatter(FIXED_TIMESTAMP)).toBe(formatSystemLocal(FIXED_TIMESTAMP));
		expect(formatter(FIXED_TIMESTAMP)).toBe(formatSystemLocal(FIXED_TIMESTAMP));
		expect(onWarning).toHaveBeenCalledTimes(1);
		expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("Invalid displayTimezone"));
	});

	it("renders task lifecycle times in the configured timezone and keeps duration/order", () => {
		const text = renderFeishuPayload(completedEvent(), { locale: "zh-CN", displayTimezone: "UTC" }).content.text;
		const durationIndex = text.indexOf("耗时：14分55秒");
		const startedAtIndex = text.indexOf("开始时间：2026-09-11 15:05:05");
		const endedAtIndex = text.indexOf("结束时间：2026-09-11 15:20:00");

		expect(durationIndex).toBeGreaterThanOrEqual(0);
		expect(startedAtIndex).toBeGreaterThan(durationIndex);
		expect(endedAtIndex).toBeGreaterThan(startedAtIndex);
	});

	it("uses the configured timezone for a Feishu channel payload", async () => {
		let request: FeishuRequest | undefined;
		const channel = new FeishuChannel({
			webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
			displayTimezone: "Asia/Shanghai",
			locale: "zh-CN",
			transport: { post: async (value) => void (request = value) },
		});

		await channel.send(completedEvent());

		expect(request).toBeDefined();
		expect(request?.body).toContain("2026-09-11 23:05:05");
		expect(request?.body).toContain("2026-09-11 23:20:00");
		expect(request?.body).toContain("耗时：14分55秒");
	});

	it("omits a missing startedAt without failing the end notification", () => {
		const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
		try {
			const event = createTaskEvent({
				type: "TASK_COMPLETED",
				timestamp: Date.UTC(2026, 8, 10, 16, 7, 32),
				endedAt: Date.UTC(2026, 8, 10, 16, 7, 32),
				taskId: "task-legacy",
				sessionId: "session-legacy",
				state: "COMPLETED",
				stateEvidence: "unknown",
			});

			const text = renderFeishuPayload(event, { locale: "zh-CN", displayTimezone: "UTC" }).content.text;
			expect(text).not.toContain("开始时间：");
			expect(text).toContain("结束时间：2026-09-10 16:07:32");
			expect(warning).toHaveBeenCalledWith(
				"[pi-pulse] Task end event has no valid startedAt; start time omitted.",
			);
		} finally {
			warning.mockRestore();
		}
	});
});
