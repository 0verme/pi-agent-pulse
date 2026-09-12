import type { TaskEvent } from "../../core/events.js";
import {
	booleanLabel,
	eventLabel,
	evidenceLabel,
	fieldLabel,
	formatDuration,
	formatSummary,
	resolveLocale,
	stateLabel,
	t,
	type PulseLocale,
	type ResolvedLocale,
	warningLabel,
} from "../../i18n/index.js";

export interface FeishuTextPayload {
	msg_type: "text";
	content: {
		text: string;
	};
}

export type DisplayTimestampInput = string | number | Date | undefined;
export type DisplayTimestampFormatter = (value: DisplayTimestampInput) => string | undefined;

export interface FeishuRenderOptions {
	locale?: PulseLocale;
	displayTimezone?: string;
	timestampFormatter?: DisplayTimestampFormatter;
}

const MAX_FEISHU_TEXT_CHARS = 3_500;
const INVALID_DISPLAY_TIMEZONE_WARNING = "[pi-pulse] Invalid displayTimezone; using system local timezone.";

function display(value: string | undefined, locale: ResolvedLocale): string {
	return value?.trim() || t("unknown", locale);
}

function field(label: string, value: string, locale: ResolvedLocale): string {
	return locale === "zh-CN" ? `${label}：${value}` : `${label}: ${value}`;
}

function state(value: TaskEvent["state"], evidence: TaskEvent["stateEvidence"], locale: ResolvedLocale): string {
	const stateText = stateLabel(value, locale);
	const evidenceText = evidenceLabel(evidence, locale);
	return locale === "zh-CN" ? `${stateText}（${evidenceText}）` : `${stateText} (${evidenceText})`;
}

function createIntlFormatter(timezone?: string): Intl.DateTimeFormat {
	const options: Intl.DateTimeFormatOptions = {
		calendar: "gregory",
		numberingSystem: "latn",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	};
	const normalizedTimezone = timezone?.trim();
	if (normalizedTimezone) options.timeZone = normalizedTimezone;
	return new Intl.DateTimeFormat("en-CA", options);
}

function toDate(value: DisplayTimestampInput): Date | undefined {
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;
	if (typeof value === "number") return Number.isFinite(value) ? new Date(value) : undefined;
	if (typeof value !== "string") return undefined;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

function formatWithIntl(formatter: Intl.DateTimeFormat, date: Date): string | undefined {
	const parts = new Map(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
	const year = parts.get("year");
	const month = parts.get("month");
	const day = parts.get("day");
	const hour = parts.get("hour");
	const minute = parts.get("minute");
	const second = parts.get("second");
	if (!year || !month || !day || !hour || !minute || !second) return undefined;
	return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
}

function warnInvalidDisplayTimezone(onWarning: (message: string) => void): void {
	try {
		onWarning(INVALID_DISPLAY_TIMEZONE_WARNING);
	} catch {
		// Configuration diagnostics are best effort and must not affect notification delivery.
	}
}

/** Create a safe display formatter; timestamps remain canonical UTC strings in TaskEvent. */
export function createDisplayTimestampFormatter(
	timezone?: string,
	onWarning: (message: string) => void = (message) => process.emitWarning(message),
): DisplayTimestampFormatter {
	const normalizedTimezone = timezone?.trim() || undefined;
	let formatter: Intl.DateTimeFormat;
	try {
		formatter = createIntlFormatter(normalizedTimezone);
	} catch {
		if (normalizedTimezone) warnInvalidDisplayTimezone(onWarning);
		formatter = createIntlFormatter();
	}

	return (value) => {
		const date = toDate(value);
		return date ? formatWithIntl(formatter, date) : undefined;
	};
}

/** Format one timestamp as YYYY-MM-DD HH:mm:ss in system local or an IANA timezone. */
export function formatDisplayTimestamp(value: DisplayTimestampInput, timezone?: string): string | undefined {
	return createDisplayTimestampFormatter(timezone)(value);
}

function isTaskEndEvent(event: TaskEvent): boolean {
	return event.type === "TASK_COMPLETED" || event.type === "TASK_FAILED" || event.type === "TASK_ABORTED";
}

function warnMissingStartedAt(): void {
	try {
		process.emitWarning("[pi-pulse] Task end event has no valid startedAt; start time omitted.");
	} catch {
		// Logging is best effort and must not affect notification delivery.
	}
}

function lifecycleTimes(
	event: TaskEvent,
	timestampFormatter: DisplayTimestampFormatter,
	locale: ResolvedLocale,
): string[] {
	if (!isTaskEndEvent(event)) return [];

	const startedAt = timestampFormatter(event.startedAt);
	if (!startedAt) warnMissingStartedAt();

	const endedAt = timestampFormatter(event.endedAt);
	return [
		...(startedAt ? [field(fieldLabel("Start Time", locale), startedAt, locale)] : []),
		...(endedAt ? [field(fieldLabel("End Time", locale), endedAt, locale)] : []),
	];
}

function truncate(value: string): string {
	const chars = Array.from(value);
	if (chars.length <= MAX_FEISHU_TEXT_CHARS) return value;
	return `${chars.slice(0, MAX_FEISHU_TEXT_CHARS - 1).join("")}…`;
}

/** Render a bounded text message without making Feishu part of the core model. */
export function renderFeishuText(event: TaskEvent, options: FeishuRenderOptions = {}): string {
	const locale = resolveLocale(options.locale);
	const timestampFormatter = options.timestampFormatter ?? createDisplayTimestampFormatter(options.displayTimezone);
	const lines = [
		`[Pi Pulse] ${eventLabel(event.type, locale)}`,
		field(fieldLabel("Task", locale), display(event.taskId, locale), locale),
		field(fieldLabel("Session", locale), display(event.sessionId, locale), locale),
		field(fieldLabel("State", locale), state(event.state, event.stateEvidence, locale), locale),
		field(fieldLabel("Host", locale), display(event.host, locale), locale),
		field(fieldLabel("Repository", locale), display(event.repo, locale), locale),
		field(fieldLabel("Branch", locale), display(event.branch, locale), locale),
		field(fieldLabel("Duration", locale), formatDuration(event.durationMs, locale), locale),
		...lifecycleTimes(event, timestampFormatter, locale),
	];
	if (event.currentTool) lines.push(field(fieldLabel("Tool", locale), event.currentTool, locale));
	const summary = formatSummary(event.summary, event.metadata, locale);
	if (summary) lines.push(field(fieldLabel("Summary", locale), summary, locale));
	if (event.warnings.longTask || event.warnings.longTool || event.warnings.stalled) {
		const warnings = [
			`${warningLabel("longTask", locale)}=${booleanLabel(event.warnings.longTask, locale)}`,
			`${warningLabel("longTool", locale)}=${booleanLabel(event.warnings.longTool, locale)}`,
			`${warningLabel("stalled", locale)}=${booleanLabel(event.warnings.stalled, locale)}`,
		].join(", ");
		lines.push(field(fieldLabel("Warnings", locale), warnings, locale));
	}
	return truncate(lines.join("\n"));
}

export function renderFeishuPayload(event: TaskEvent, options: FeishuRenderOptions = {}): FeishuTextPayload {
	return {
		msg_type: "text",
		content: { text: renderFeishuText(event, options) },
	};
}
