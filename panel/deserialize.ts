import { fromCrossJSON, fromJSON, type SerovalJSON, type SerovalNode } from "seroval";

import { serovalPlugins } from "./serovalPlugins.ts";
import type { CapturedEntry, DecodeResult } from "./types.ts";

// Request payloads (the ?payload= query param on GET calls, or the POST
// body) are seroval's "tree/JSON" mode — confirmed via the exact import in
// @tanstack/start-server-core's server-functions-handler.js:
//   import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from "seroval"
// fromJSON expects the { t, f, m } SerovalJSON envelope, not a bare
// SerovalNode — mixing these up (e.g. passing a request payload to
// fromCrossJSON) will misbehave, since the outer .t there is a whole nested
// node object, not the numeric type tag fromCrossJSON expects at that spot.
export function decodeRequest(raw: string | null): DecodeResult {
	if (raw === null) {
		return { ok: true, value: undefined, rawParsed: undefined };
	}
	try {
		const parsed = JSON.parse(raw) as SerovalJSON;
		return { ok: true, value: fromJSON(parsed, { plugins: serovalPlugins }), rawParsed: parsed };
	} catch (error) {
		return { ok: false, error: describeError(error), rawText: raw };
	}
}

// Response bodies use seroval's "Cross" mode (toCrossJSONStream /
// toCrossJSONAsync server-side) — a real SerovalNode, the {t,i,p,k,v,a,s,o}
// shape. fromCrossJSON needs a fresh refs Map per call: it's how seroval
// resolves i-indexed shared/circular references within one payload, and
// reusing a Map across calls would incorrectly link unrelated payloads.
//
// isSerialized should come from whether the response carried the real
// x-tss-serialized: true header (lowercase — confirmed in
// @tanstack/start-client-core's constants.js). A notFound() response or a
// raw pass-through Response from a server function does not set it and is
// plain JSON (or plain text) — attempting fromCrossJSON on those will fail,
// so callers should check the header first rather than always assuming
// Cross mode.
export function decodeResponse(raw: string, isSerialized: boolean): DecodeResult {
	if (!isSerialized) {
		try {
			return { ok: true, value: JSON.parse(raw), rawParsed: raw };
		} catch {
			// Not JSON either — show the raw text as-is rather than treating
			// this as a decode failure; plenty of legitimate responses (redirects,
			// raw file bodies) are neither seroval nor JSON.
			return { ok: true, value: raw, rawParsed: raw };
		}
	}
	try {
		const node = JSON.parse(raw) as SerovalNode;
		return {
			ok: true,
			value: fromCrossJSON(node, { refs: new Map(), plugins: serovalPlugins }),
			rawParsed: node,
		};
	} catch (error) {
		return { ok: false, error: describeError(error), rawText: raw };
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function resultText(result: DecodeResult): string {
	return result.ok ? JSON.stringify(result.value) : result.rawText;
}

// Decoded content is what you're actually looking for while debugging, not
// the wire-format text — searching the URL alone (what the real Network tab
// offers) wouldn't find, say, a specific customer email inside a response
// body. Genuinely higher-value than what DevTools' own search gives you here.
export function entrySearchText(entry: CapturedEntry): string {
	if (entry.isFormData) return entry.url;
	return [
		entry.url,
		resultText(decodeRequest(entry.requestRaw)),
		resultText(decodeResponse(entry.responseRaw, entry.isSerialized)),
	].join(" ");
}
