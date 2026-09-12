import type { TaskEvent } from "../../core/events.js";
import type { PulseLocale } from "../../i18n/index.js";
import type { ChannelDispatchContext, OutboundChannel } from "../types.js";
import { createDisplayTimestampFormatter, renderFeishuPayload, type DisplayTimestampFormatter } from "./renderer.js";

export interface FeishuRequest {
	url: string;
	body: string;
	timeoutMs: number;
	headers: Readonly<Record<string, string>>;
}

export interface FeishuTransport {
	post(request: FeishuRequest): Promise<void>;
}

const ALLOWED_HOSTS = new Set(["open.feishu.cn", "open.larksuite.com"]);

function validateFeishuWebhookUrl(value: string): URL {
	try {
		const url = new URL(value.trim());
		if (
			url.protocol !== "https:" ||
			!url.hostname ||
			url.username ||
			url.password ||
			!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
			!url.pathname.startsWith("/open-apis/")
		) {
			throw new Error("unsafe destination");
		}
		return url;
	} catch {
		throw new Error("Invalid Feishu webhook URL");
	}
}

export class FetchFeishuTransport implements FeishuTransport {
	public async post(request: FeishuRequest): Promise<void> {
		const target = validateFeishuWebhookUrl(request.url);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
		try {
			const outboundRequest = new Request(target, {
				method: "POST",
				headers: request.headers,
				body: request.body,
				signal: controller.signal,
				redirect: "error",
			});
			const response = await fetch(outboundRequest);
			if (!response.ok) throw new Error("Feishu webhook returned a non-success status");

			const text = await response.text();
			if (!text) return;
			try {
				const result: unknown = JSON.parse(text);
				if (
					typeof result === "object" &&
					result !== null &&
					"code" in result &&
					typeof result.code === "number" &&
					result.code !== 0
				) {
					throw new Error("Feishu webhook rejected the event");
				}
			} catch (error) {
				if (error instanceof Error && error.message === "Feishu webhook rejected the event") throw error;
				// A non-JSON success body is accepted for compatibility with gateways.
			}
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message === "Feishu webhook returned a non-success status" ||
					error.message === "Feishu webhook rejected the event")
			) {
				throw error;
			}
			throw new Error("Feishu webhook request failed");
		} finally {
			clearTimeout(timeout);
		}
	}
}

export interface FeishuChannelOptions {
	webhook: string;
	timeoutMs?: number;
	locale?: PulseLocale;
	displayTimezone?: string;
	transport?: FeishuTransport;
}

/** Minimal outbound Feishu adapter; no inbound bot or query behavior is included. */
export class FeishuChannel implements OutboundChannel {
	public readonly id = "feishu";
	private readonly webhook: string;
	private readonly timeoutMs: number;
	private readonly locale: PulseLocale | undefined;
	private readonly timestampFormatter: DisplayTimestampFormatter;
	private readonly transport: FeishuTransport;

	public constructor(options: FeishuChannelOptions) {
		this.webhook = validateFeishuWebhookUrl(options.webhook).toString();
		this.timeoutMs = Math.min(120_000, Math.max(100, options.timeoutMs ?? 10_000));
		this.locale = options.locale;
		this.timestampFormatter = createDisplayTimestampFormatter(options.displayTimezone);
		this.transport = options.transport ?? new FetchFeishuTransport();
	}

	public send(event: TaskEvent, context?: ChannelDispatchContext): Promise<void> {
		return this.transport.post({
			url: this.webhook,
			body: JSON.stringify(
				renderFeishuPayload(event, {
					locale: context?.locale ?? this.locale,
					timestampFormatter: this.timestampFormatter,
				}),
			),
			timeoutMs: this.timeoutMs,
			headers: { "content-type": "application/json; charset=utf-8" },
		});
	}
}
