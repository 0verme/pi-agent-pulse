function normalizeHostname(hostname) {
    return hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, "")
        .replace(/\.$/, "");
}
function isLocalHostname(hostname) {
    return (hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname === "0.0.0.0" ||
        hostname === "::" ||
        hostname === "::1");
}
function isPrivateIpv4(hostname) {
    const octets = hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255))
        return false;
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return (first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168));
}
function isPrivateIpv6(hostname) {
    if (!hostname.includes(":"))
        return false;
    const mappedIpv4 = hostname.startsWith("::ffff:") ? hostname.slice("::ffff:".length) : undefined;
    return ((mappedIpv4 !== undefined && isPrivateIpv4(mappedIpv4)) ||
        hostname.startsWith("fc") ||
        hostname.startsWith("fd") ||
        hostname.startsWith("fe8") ||
        hostname.startsWith("fe9") ||
        hostname.startsWith("fea") ||
        hostname.startsWith("feb"));
}
function isPrivateOrLocalHost(hostname) {
    const normalized = normalizeHostname(hostname);
    return isLocalHostname(normalized) || isPrivateIpv4(normalized) || isPrivateIpv6(normalized);
}
export function validateWebhookUrl(value) {
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:" && url.protocol !== "http:")
            throw new Error("unsupported scheme");
        if (!url.hostname || url.username || url.password || isPrivateOrLocalHost(url.hostname)) {
            throw new Error("unsafe destination");
        }
        return url;
    }
    catch {
        throw new Error("Invalid or unsafe generic webhook URL");
    }
}
export function serializeTaskEvent(event) {
    const serialized = JSON.stringify(event);
    if (typeof serialized !== "string")
        throw new Error("Task event could not be serialized");
    return serialized;
}
/** Single-attempt fetch transport. It never logs the destination URL or body. */
export class FetchWebhookTransport {
    async post(request) {
        const target = validateWebhookUrl(request.url);
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
            if (!response.ok)
                throw new Error("Webhook returned a non-success status");
        }
        catch (error) {
            if (error instanceof Error && error.message === "Webhook returned a non-success status")
                throw error;
            throw new Error("Webhook request failed");
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
/** First-class generic JSON webhook adapter. */
export class GenericWebhookChannel {
    id;
    url;
    timeoutMs;
    transport;
    constructor(options) {
        this.url = validateWebhookUrl(options.url).toString();
        this.id = options.id ?? "webhook";
        this.timeoutMs = Math.min(120_000, Math.max(100, options.timeoutMs ?? 10_000));
        this.transport = options.transport ?? new FetchWebhookTransport();
    }
    send(event) {
        return this.transport.post({
            url: this.url,
            body: serializeTaskEvent(event),
            timeoutMs: this.timeoutMs,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    }
}
//# sourceMappingURL=transport.js.map