import type { BackendCall, CapturedEntry } from "./types.ts";

// The server-side request a TanStack Start server function makes to a backend
// API never reaches the browser, so DevTools can't observe it. The one way to
// surface it is for the server to *report* it — this module reads two such
// channels off the response headers:
//
//  1. `x-serovalscope-upstream`: a JSON array this project's own server
//     middleware sets (see examples/serovalscope-middleware.ts). Richest form.
//  2. `Server-Timing`: the standard header. Anything whose `desc` (or name)
//     looks like an HTTP call is surfaced too, so a project already using
//     Server-Timing gets something for free.

interface RawUpstream {
	method?: unknown;
	url?: unknown;
	status?: unknown;
	durationMs?: unknown;
	ms?: unknown;
	label?: unknown;
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
	};
}

export function parseUpstreamHeader(value: string | null): BackendCall[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		const list = Array.isArray(parsed) ? parsed : [parsed];
		return list
			.filter((x): x is RawUpstream => typeof x === "object" && x !== null)
			.map(coerceCall)
			.filter((c): c is BackendCall => c !== null);
	} catch {
		return [];
	}
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
 * over Server-Timing, de-duplicated by method+url.
 */
export function backendCallsFor(
	entry: Pick<CapturedEntry, "upstreamHeader" | "serverTiming">,
): BackendCall[] {
	const fromHeader = parseUpstreamHeader(entry.upstreamHeader);
	const fromTiming = parseServerTiming(entry.serverTiming);
	return [
		...fromHeader,
		...fromTiming.filter(
			(c) =>
				!fromHeader.some(
					(h) => c.url.includes(h.url) || h.url.includes(c.url),
				),
		),
	];
}
