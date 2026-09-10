import {
	fromCrossJSON,
	fromJSON,
	type SerovalJSON,
	type SerovalNode,
} from "seroval";

import {
	buildAdapterPlugins,
	discoverAdapterTags,
} from "./customAdapters.ts";
import { base64ToBytes, isFramedContentType, parseFrames } from "./framed.ts";
import { serovalPlugins } from "./serovalPlugins.ts";
import type { CapturedEntry, DecodeResult } from "./types.ts";

/** Map of adapter tag (or short name) -> display label, from the user's settings. */
export type AdapterLabels = Record<string, string>;

// Process-wide default, set once from settings by the panel shell. Kept as a
// module value (rather than threaded through every call site) because it's a
// small, rarely-changing cosmetic map and `decodeResponse` is called from the
// list filter, the search index, and the detail pane alike.
let defaultAdapterLabels: AdapterLabels = {};

export function setAdapterLabels(labels: AdapterLabels): void {
	defaultAdapterLabels = labels ?? {};
}

// Deserialization plugin list for a payload: the built-ins, plus a tolerant
// plugin for every custom adapter tag the payload actually contains.
function pluginsFor(nodes: unknown, labels: AdapterLabels) {
	const tags = [...discoverAdapterTags(nodes)];
	const plugins = tags.length
		? [...buildAdapterPlugins(tags, labels), ...serovalPlugins]
		: serovalPlugins;
	return { plugins, tags };
}

// Request payloads (the ?payload= query param on GET calls, or the POST
// body) are seroval's "tree/JSON" mode — confirmed via the exact import in
// @tanstack/start-server-core's server-functions-handler.ts:
//   import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from "seroval"
// fromJSON expects the { t, f, m } SerovalJSON envelope, not a bare
// SerovalNode — mixing these up (e.g. passing a request payload to
// fromCrossJSON) will misbehave, since the outer .t there is a whole nested
// node object, not the numeric type tag fromCrossJSON expects at that spot.
export function decodeRequest(
	raw: string | null,
	adapterLabels: AdapterLabels = defaultAdapterLabels,
): DecodeResult {
	if (raw === null) {
		return { ok: true, value: undefined, rawParsed: undefined };
	}
	try {
		const parsed = JSON.parse(raw) as SerovalJSON;
		const { plugins, tags } = pluginsFor(parsed, adapterLabels);
		return {
			ok: true,
			value: fromJSON(parsed, { plugins }),
			rawParsed: parsed,
			adapterTags: tags.length ? tags : undefined,
		};
	} catch (error) {
		return { ok: false, error: describeError(error), rawText: raw };
	}
}

type ResponseInput = Pick<
	CapturedEntry,
	"responseRaw" | "responseBase64" | "isSerialized" | "responseContentType"
>;

/**
 * Decodes a captured server-function response body.
 *
 *  - Plain serialized JSON (`x-tss-serialized: true`, `application/json`):
 *    seroval Cross mode, one node — `fromCrossJSON`.
 *  - Framed / multiplexed (`application/x-tss-framed`): TanStack Start's binary
 *    frame protocol wrapping NDJSON seroval Cross chunks. Every chunk is fed
 *    through `fromCrossJSON` with a shared refs Map, exactly as
 *    @tanstack/start-client-core does. Deferred values come back as real
 *    Promises that settle on the next microtask (all chunks are already
 *    present) — call `resolveStreamed` to await them for display.
 *  - Anything else (notFound(), a raw pass-through Response, a redirect body):
 *    plain JSON, or verbatim text when it isn't even that.
 *
 * Stays synchronous so the request list can filter/search over decoded content
 * without an async layer; the streamed path's Promise leaves get resolved
 * lazily in the detail pane.
 */
export function decodeResponse(
	entry: ResponseInput,
	adapterLabels: AdapterLabels = defaultAdapterLabels,
): DecodeResult {
	const { responseRaw, responseBase64, isSerialized, responseContentType } =
		entry;

	if (isSerialized && isFramedContentType(responseContentType)) {
		return decodeFramed(responseRaw, responseBase64, adapterLabels);
	}

	if (!isSerialized) {
		try {
			return { ok: true, value: JSON.parse(responseRaw), rawParsed: responseRaw };
		} catch {
			// Not JSON either — show the raw text as-is rather than treating
			// this as a decode failure; plenty of legitimate responses (redirects,
			// raw file bodies) are neither seroval nor JSON.
			return { ok: true, value: responseRaw, rawParsed: responseRaw };
		}
	}

	try {
		const node = JSON.parse(responseRaw) as SerovalNode;
		const { plugins, tags } = pluginsFor(node, adapterLabels);
		return {
			ok: true,
			value: fromCrossJSON(node, { refs: new Map(), plugins }),
			rawParsed: node,
			adapterTags: tags.length ? tags : undefined,
		};
	} catch (error) {
		return { ok: false, error: describeError(error), rawText: responseRaw };
	}
}

function decodeFramed(
	body: string,
	isBase64: boolean,
	adapterLabels: AdapterLabels,
): DecodeResult {
	let bytes: Uint8Array;
	try {
		bytes = isBase64 ? base64ToBytes(body) : new TextEncoder().encode(body);
	} catch (error) {
		return { ok: false, error: describeError(error), rawText: body };
	}

	const { jsonLines, rawStreams } = parseFrames(bytes);
	if (jsonLines.length === 0) {
		return {
			ok: false,
			error: "framed response contained no JSON frames",
			rawText: body,
		};
	}

	const notes: string[] = [];
	for (const s of rawStreams) {
		if (s.error) {
			notes.push(`Raw stream #${s.streamId} errored: ${s.error}`);
		} else {
			notes.push(
				`Raw stream #${s.streamId}: ${s.bytes} bytes${s.ended ? "" : " (unterminated)"} — not shown inline`,
			);
		}
	}

	const refs = new Map();
	const parsedNodes: unknown[] = [];
	let root: unknown;
	let rootDecoded = false;

	const { plugins, tags } = pluginsFor(
		jsonLines.map((line) => tryParse(line)).filter((n) => n !== undefined),
		adapterLabels,
	);

	for (const line of jsonLines) {
		let node: SerovalNode;
		try {
			node = JSON.parse(line) as SerovalNode;
		} catch (error) {
			notes.push(`Skipped an unparseable frame: ${describeError(error)}`);
			continue;
		}
		parsedNodes.push(node);
		try {
			const value = fromCrossJSON(node, { refs, plugins });
			if (!rootDecoded) {
				root = value;
				rootDecoded = true;
			}
		} catch (error) {
			if (!rootDecoded) {
				return {
					ok: false,
					error: `framed root frame: ${describeError(error)}`,
					rawText: line,
				};
			}
			notes.push(`A streamed patch frame failed to apply: ${describeError(error)}`);
		}
	}

	if (!rootDecoded) {
		return {
			ok: false,
			error: "framed response had no decodable root frame",
			rawText: body,
		};
	}

	return {
		ok: true,
		value: root,
		rawParsed: { frames: parsedNodes, rawStreams },
		streamed: true,
		adapterTags: tags.length ? tags : undefined,
		notes: notes.length ? notes : undefined,
	};
}

/**
 * Deep-resolves any Promises left in a streamed decode's value (they settle
 * once every captured chunk has been fed to `fromCrossJSON`). Object identity —
 * and therefore any cycles — is preserved via `seen`; ReadableStreams become a
 * marker; a rejected deferred value becomes `{ __serovalscopeRejected }`.
 */
export async function resolveStreamed(
	value: unknown,
	seen: Map<object, unknown> = new Map(),
): Promise<unknown> {
	const settled = await Promise.resolve(value).catch((e: unknown) => ({
		__serovalscopeRejected: describeError(e),
	}));

	if (settled === null || typeof settled !== "object") return settled;
	const existing = seen.get(settled);
	if (existing !== undefined) return existing;

	if (typeof (settled as { getReader?: unknown }).getReader === "function") {
		return { __serovalscopeReadableStream: true };
	}
	if (settled instanceof Error) {
		seen.set(settled, settled);
		return settled;
	}

	if (Array.isArray(settled)) {
		const out: unknown[] = [];
		seen.set(settled, out);
		for (const item of settled) out.push(await resolveStreamed(item, seen));
		return out;
	}

	const out: Record<string, unknown> = {};
	seen.set(settled, out);
	for (const key of Object.keys(settled)) {
		out[key] = await resolveStreamed(
			(settled as Record<string, unknown>)[key],
			seen,
		);
	}
	return out;
}

function tryParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function resultText(result: DecodeResult): string {
	if (!result.ok) return result.rawText;
	try {
		return JSON.stringify(result.value) ?? String(result.value);
	} catch {
		// Circular / BigInt / other non-JSON-serializable decoded value.
		return String(result.value);
	}
}

// Decoded content is what you're actually looking for while debugging, not
// the wire-format text — searching the URL alone (what the real Network tab
// offers) wouldn't find, say, a specific customer email inside a response
// body. For streamed responses this covers everything except values still
// behind an unresolved Promise, which is an acceptable gap for a filter.
export function entrySearchText(entry: CapturedEntry): string {
	if (entry.isFormData) return entry.url;
	return [
		entry.url,
		resultText(decodeRequest(entry.requestRaw)),
		resultText(decodeResponse(entry)),
	].join(" ");
}
