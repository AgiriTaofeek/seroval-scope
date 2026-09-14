import type { BackendCall, CapturedEntry } from "./types.ts";

// The server-side request a TanStack Start server function makes to a backend
// API never reaches the browser, so DevTools can't observe it. The one way to
// surface it is for the server to *report* it — this module reads two such
// channels off the response headers:
//
//  1. `x-serovalscope-upstream`: base64-encoded JSON this project's own server
//     middleware sets (see examples/serovalscope-middleware.ts) — method,
//     absolute URL, status, duration, and (always on, by design — see that
//     file's header comment) the backend call's own request/response bodies
//     and headers. Richest form. A legacy plain-JSON-array shape (from an
//     older version of the middleware, metadata-only) is still accepted.
//  2. `Server-Timing`: the standard header. Anything whose `desc` (or name)
//     looks like an HTTP call is surfaced too, so a project already using
//     Server-Timing gets something for free — metadata-only, never a body.

interface RawUpstream {
	method?: unknown;
	url?: unknown;
	status?: unknown;
	durationMs?: unknown;
	ms?: unknown;
	label?: unknown;
	requestBody?: unknown;
	responseBody?: unknown;
	requestHeaders?: unknown;
	responseHeaders?: unknown;
	truncated?: unknown;
}

function coerceHeaders(raw: unknown): Record<string, string> | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof v === "string") out[k] = v;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

function coerceCall(raw: RawUpstream): BackendCall | null {
	const url =
		typeof raw.url === "string"
			? raw.url
			: typeof raw.label === "string"
				? raw.label
				: undefined;
	if (!url) return null;
	const durationMs =
		typeof raw.durationMs === "number"
			? raw.durationMs
			: typeof raw.ms === "number"
				? raw.ms
				: undefined;
	return {
		url,
		method: typeof raw.method === "string" ? raw.method : undefined,
		status: typeof raw.status === "number" ? raw.status : undefined,
		durationMs,
		label: typeof raw.label === "string" ? raw.label : undefined,
		source: "header",
		requestBody: typeof raw.requestBody === "string" ? raw.requestBody : undefined,
		responseBody: typeof raw.responseBody === "string" ? raw.responseBody : undefined,
		requestHeaders: coerceHeaders(raw.requestHeaders),
		responseHeaders: coerceHeaders(raw.responseHeaders),
		truncated: raw.truncated === true,
	};
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// `atob` decodes a base64 string to a *binary* (Latin-1) string; the report
// is UTF-8 JSON, so the bytes need re-decoding as UTF-8, not read char-by-char.
function tryDecodeBase64Utf8(value: string): string | undefined {
	try {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return new TextDecoder().decode(bytes);
	} catch {
		return undefined;
	}
}

function coerceCallList(list: unknown[]): BackendCall[] {
	return list
		.filter((x): x is RawUpstream => typeof x === "object" && x !== null)
		.map(coerceCall)
		.filter((c): c is BackendCall => c !== null);
}

/**
 * Decodes the `x-serovalscope-upstream` header. Current format is base64-
 * encoded JSON `{ v: 1, calls: RawUpstream[], truncated?: boolean }`; a bare
 * JSON array/object (the pre-body/header-capture format) is still accepted
 * for a project that hasn't updated its middleware yet.
 */
export function parseUpstreamHeader(value: string | null): {
	calls: BackendCall[];
	truncated: boolean;
} {
	if (!value) return { calls: [], truncated: false };

	const decoded = tryDecodeBase64Utf8(value);
	if (decoded) {
		const parsed = tryParseJson(decoded);
		if (
			parsed &&
			typeof parsed === "object" &&
			Array.isArray((parsed as { calls?: unknown }).calls)
		) {
			const obj = parsed as { calls: unknown[]; truncated?: unknown };
			return { calls: coerceCallList(obj.calls), truncated: obj.truncated === true };
		}
	}

	// Legacy: plain JSON array (or single object), metadata-only, not base64.
	const legacy = tryParseJson(value);
	if (legacy !== undefined) {
		const list = Array.isArray(legacy) ? legacy : [legacy];
		return { calls: coerceCallList(list), truncated: false };
	}

	return { calls: [], truncated: false };
}

// Server-Timing grammar (RFC / w3c): `name;dur=1.23;desc="text", name2;dur=4`.
// Values may be quoted. We only pull `dur` and `desc`.
export function parseServerTiming(value: string | null): BackendCall[] {
	if (!value) return [];
	const out: BackendCall[] = [];
	for (const metric of splitTopLevel(value, ",")) {
		const parts = splitTopLevel(metric, ";").map((p) => p.trim());
		const name = parts.shift();
		if (!name) continue;
		let dur: number | undefined;
		let desc: string | undefined;
		for (const param of parts) {
			const eq = param.indexOf("=");
			if (eq === -1) continue;
			const key = param.slice(0, eq).trim().toLowerCase();
			let val = param.slice(eq + 1).trim();
			if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
			if (key === "dur") dur = Number(val);
			else if (key === "desc") desc = val;
		}
		const label = desc ?? name;
		// Heuristic: only surface entries that read like a call to something,
		// not framework phases like `cache;desc="Hit"` or `total;dur=42`.
		if (!/[/:]| GET | POST | PUT | PATCH | DELETE /i.test(` ${label} `) && !desc) {
			continue;
		}
		out.push({
			url: label,
			label,
			durationMs: Number.isFinite(dur) ? dur : undefined,
			source: "server-timing",
		});
	}
	return out;
}

// Splits on `sep` but not when it's inside double quotes.
function splitTopLevel(input: string, sep: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;
	for (const ch of input) {
		if (ch === '"') inQuotes = !inQuotes;
		if (ch === sep && !inQuotes) {
			result.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	if (current) result.push(current);
	return result;
}

/**
 * All backend calls reported for one captured entry, header source preferred
 * over Server-Timing, de-duplicated by method+url. `truncated` is true when
 * the header source had to drop calls or shorten bodies/headers to stay
 * under its size budget (see examples/serovalscope-middleware.ts).
 */
export function backendCallsFor(
	entry: Pick<CapturedEntry, "upstreamHeader" | "serverTiming">,
): { calls: BackendCall[]; truncated: boolean } {
	const fromHeader = parseUpstreamHeader(entry.upstreamHeader);
	const fromTiming = parseServerTiming(entry.serverTiming);
	return {
		calls: [
			...fromHeader.calls,
			...fromTiming.filter(
				(c) =>
					!fromHeader.calls.some(
						(h) => c.url.includes(h.url) || h.url.includes(c.url),
					),
			),
		],
		truncated: fromHeader.truncated,
	};
}
