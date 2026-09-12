import { describe, expect, it } from "vitest";

import {
	detectSystemLocale,
	detectTextLocale,
	eventLabel,
	formatDuration,
	formatSummary,
	resolveLocale,
} from "../src/i18n/index.js";

describe("presentation i18n", () => {
	it("detects clear Chinese, English and mixed prompts", () => {
		expect(detectTextLocale("请帮我修复这个 issue")).toBe("zh-CN");
		expect(detectTextLocale("Please fix this issue")).toBe("en-US");
		expect(detectTextLocale("请修复这个 bug 并运行测试")).toBe("zh-CN");
	});

	it("ignores weak signals, punctuation and URLs", () => {
		expect(detectTextLocale("中")).toBeUndefined();
		expect(detectTextLocale("!!! 1234 ???")).toBeUndefined();
		expect(detectTextLocale("https://example.com/path?q=pi-pulse")).toBeUndefined();
		expect(detectTextLocale("alice@example.com")).toBeUndefined();
		expect(detectTextLocale("")).toBeUndefined();
	});

	it("resolves explicit locale before prompt and system fallbacks", () => {
		expect(resolveLocale("zh-CN", "Please fix this issue", "en-US")).toBe("zh-CN");
		expect(resolveLocale("en-US", "请修复这个问题", "zh-CN")).toBe("en-US");
		expect(resolveLocale("auto", "请修复这个问题", "en-US")).toBe("zh-CN");
		expect(resolveLocale("auto", "", "zh-TW")).toBe("zh-CN");
		expect(resolveLocale("auto", "", "fr-FR")).toBe("en-US");
		expect(detectSystemLocale("zh-Hans-CN")).toBe("zh-CN");
		expect(detectSystemLocale("en-GB")).toBe("en-US");
	});

	it("keeps machine values separate from translated labels and formats durations", () => {
		expect(eventLabel("TASK_STARTED", "zh-CN")).toBe("任务开始");
		expect(eventLabel("TASK_STARTED", "en-US")).toBe("Task started");
		expect(formatDuration(undefined, "zh-CN")).toBe("未知");
		expect(formatDuration(12_000, "zh-CN")).toBe("12秒");
		expect(formatDuration(133_000, "zh-CN")).toBe("2分13秒");
		expect(formatDuration(12_000, "en-US")).toBe("12s");
		expect(formatDuration(120_000, "en-US")).toBe("2m 0s");
		expect(formatDuration(133_000, "en-US")).toBe("2m 13s");
		expect(
			formatSummary("Long-task warning threshold reached", { signal: "LONG_TASK", level: "warning" }, "zh-CN"),
		).toBe("已达到长任务警告阈值");
		expect(formatSummary("请修复这个 Issue", undefined, "zh-CN")).toBe("请修复这个 Issue");
	});
});
