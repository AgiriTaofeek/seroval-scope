/**
 * Pure logic for serovalscope-middleware.ts, split out so it can be unit
 * tested without pulling in `@tanstack/react-start` (which this repo — the
 * extension itself, not a TanStack Start app — doesn't and shouldn't depend
 * on; see the note on `examples/` in tsconfig.json). No framework imports
 * here, only web platform globals (Headers, Response, TextEncoder, …).
 */

export interface UpstreamCall {
	method: string;
	url: string;
	status?: number;
	durationMs: number;
	requestBody?: string;
	responseBody?: string;
	requestHeaders?: Record<string, string>;
	responseHeaders?: Record<string, string>;
}

// Header names (lowercase) whose value is replaced with "[redacted]" before
// it's written to the report, since the report itself rides on a header any
// client of the app can read. Add your own auth/session header names here.
export const SENSITIVE_HEADER_NAMES = new Set([
	"authorization",
	"cookie",
	"set-cookie",
	"proxy-authorization",
	"x-api-key",
]);

// Per-body cap. Text/JSON only — binary bodies are never read.
export const MAX_BODY_CHARS = 2000;
// Hard budget for the final base64-encoded header value, comfortably under
// the smallest common proxy default (nginx: 8KB) with room for other
// headers on the same response.
export const MAX_ENCODED_HEADER_CHARS = 6000;

export function truncateBody(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_BODY_CHARS) return { text, truncated: false };
	return { text: `${text.slice(0, MAX_BODY_CHARS)}…`, truncated: true };
}

export function redactHeaders(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		out[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? "[redacted]" : value;
	});
	return out;
}

export function isTextualContentType(contentType: string): boolean {
	if (!contentType) return true; // unknown — try, rather than assume binary
	const base = contentType.split(";", 1)[0].trim().toLowerCase();
	return (
		base.startsWith("text/") ||
		base === "application/json" ||
		base.endsWith("+json") ||
		base === "application/xml" ||
		base.endsWith("+xml") ||
		base === "application/x-www-form-urlencoded"
	);
}

export async function captureResponseBody(
	res: Response,
): Promise<{ body: string | undefined; truncated: boolean }> {
	const contentType = res.headers.get("content-type") ?? "";
	if (!isTextualContentType(contentType)) {
		return { body: `[binary body omitted: ${contentType}]`, truncated: false };
	}
	try {
		const text = await res.clone().text();
		const { text: body, truncated } = truncateBody(text);
		return { body, truncated };
	} catch {
		return { body: "[unreadable body]", truncated: false };
	}
}

export function captureRequestBody(
	body: BodyInit | null | undefined,
): { body: string | undefined; truncated: boolean } {
	if (body == null) return { body: undefined, truncated: false };
	if (typeof body === "string") {
		const { text, truncated } = truncateBody(body);
		return { body: text, truncated };
	}
	if (body instanceof URLSearchParams) {
		const { text, truncated } = truncateBody(body.toString());
		return { body: text, truncated };
	}
	if (typeof FormData !== "undefined" && body instanceof FormData) {
		return { body: "[FormData body not captured]", truncated: false };
	}
	if (typeof Blob !== "undefined" && body instanceof Blob) {
		return { body: `[Blob body not captured: ${body.type || "unknown type"}]`, truncated: false };
	}
	if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
		return { body: "[binary body not captured]", truncated: false };
	}
	return { body: "[stream body not captured]", truncated: false };
}

// UTF-8-safe base64 encode. Avoids relying on Node's `Buffer`, which isn't
// guaranteed global on every runtime TanStack Start deploys to (some edge
// runtimes only have `btoa`), while still producing a header-safe
// (ByteString) value — `Headers.set()` throws on raw non-Latin1 text, which
// a captured body could easily contain.
export function toBase64Utf8(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

function encodeCalls(calls: UpstreamCall[], truncated: boolean): string {
	return toBase64Utf8(JSON.stringify({ v: 1, calls, truncated }));
}

/**
 * Encodes the calls captured for one server-function invocation into the
 * report header's value, dropping calls from the end (oldest kept) until the
 * result fits `MAX_ENCODED_HEADER_CHARS` — this must never emit a header
 * large enough to risk the real response getting rejected by a proxy.
 *
 * Binary-searches the cutoff rather than shrinking one call at a time: this
 * runs on every server-function response, so it must stay cheap even when a
 * call carries a body near `MAX_BODY_CHARS` and there are many of them.
 */
export function encodeReport(calls: UpstreamCall[]): string {
	const full = encodeCalls(calls, false);
	if (full.length <= MAX_ENCODED_HEADER_CHARS) return full;

	// Invariant: `fits(lo)` holds throughout (lo starts at 0, which always
	// fits — an empty call list encodes to a few dozen bytes). Encoded length
	// only grows with more calls, so this converges on the largest prefix
	// that still fits under the budget.
	const fits = (n: number) => encodeCalls(calls.slice(0, n), true).length <= MAX_ENCODED_HEADER_CHARS;
	let lo = 0;
	let hi = calls.length;
	while (lo < hi) {
		const mid = lo + Math.ceil((hi - lo) / 2);
		if (fits(mid)) lo = mid;
		else hi = mid - 1;
	}
	return encodeCalls(calls.slice(0, lo), true);
}
