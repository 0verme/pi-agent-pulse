import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, loadConfigFile, normalizeConfig } from "../src/config/schema.js";

describe("configuration", () => {
	it("defaults locale to auto and normalizes supported and invalid values", () => {
		expect(normalizeConfig({}).locale).toBe("auto");
		expect(normalizeConfig({ locale: "zh-CN" }).locale).toBe("zh-CN");
		expect(normalizeConfig({ locale: "en-US" }).locale).toBe("en-US");
		expect(normalizeConfig({ locale: "fr-FR" }).locale).toBe("auto");
		expect(DEFAULT_CONFIG.locale).toBe("auto");
	});

	it("defaults summary inclusion to off and preserves explicit opt-in through file loading", () => {
		expect(normalizeConfig({}).privacy.includeSummary).toBe(false);
		expect(DEFAULT_CONFIG.privacy.includeSummary).toBe(false);
		expect(normalizeConfig({ privacy: { includeSummary: true } }).privacy.includeSummary).toBe(true);

		const directory = mkdtempSync(join(tmpdir(), "pi-agent-pulse-config-test-"));
		const filePath = join(directory, "pi-pulse.json");
		try {
			writeFileSync(filePath, JSON.stringify({}));
			expect(loadConfigFile(filePath).privacy.includeSummary).toBe(false);
			writeFileSync(filePath, JSON.stringify({ privacy: { includeSummary: true } }));
			expect(loadConfigFile(filePath).privacy.includeSummary).toBe(true);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps channels independent and clamps unsafe timeout values", () => {
		const config = normalizeConfig({
			channels: {
				webhook: { enabled: true, url: "https://hooks.example.test", timeoutMs: 999_999 },
				feishu: { enabled: false, webhook: "YOUR_WEBHOOK_URL" },
			},
			watchdog: { stalledMinutes: -1 },
			privacy: { includeWorkdir: true },
		});

		expect(config.channels.webhook.enabled).toBe(true);
		expect(config.channels.webhook.timeoutMs).toBe(120_000);
		expect(config.channels.feishu.enabled).toBe(false);
		expect(config.watchdog.stalledMinutes).toBe(0);
		expect(config.privacy.includeWorkdir).toBe(true);
		expect(DEFAULT_CONFIG.channels.feishu.webhook).toBe("");
	});

	it("normalizes the optional display timezone without changing channel defaults", () => {
		const config = normalizeConfig({ displayTimezone: " Asia/Shanghai " });

		expect(config.displayTimezone).toBe("Asia/Shanghai");
		expect(config.channels).toEqual(DEFAULT_CONFIG.channels);
	});

	it("accepts the minimal Feishu config and fills every omitted section from defaults", () => {
		const config = normalizeConfig({
			channels: {
				feishu: { enabled: true, webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/example" },
			},
		});

		expect(config.channels.feishu).toEqual({
			enabled: true,
			webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
			timeoutMs: DEFAULT_CONFIG.channels.feishu.timeoutMs,
		});
		expect(config.channels.webhook).toEqual(DEFAULT_CONFIG.channels.webhook);
		expect(config.watchdog).toEqual(DEFAULT_CONFIG.watchdog);
		expect(config.privacy).toEqual(DEFAULT_CONFIG.privacy);
		expect(config.displayTimezone).toBeUndefined();
		expect(config.hostname).toBeUndefined();
	});
});
