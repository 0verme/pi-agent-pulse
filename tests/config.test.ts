import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, normalizeConfig } from "../src/config/schema.js";

describe("configuration", () => {
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
});
