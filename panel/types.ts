export interface DecodeSuccess {
	ok: true;
	value: unknown;
	/** The parsed-but-not-fromJSON/fromCrossJSON'd structure, for the Raw view. */
	rawParsed: unknown;
	/**
	 * True when the payload was a multi-frame streamed response and `value`
	 * reflects every chunk that was captured (deferred promises / streams
	 * resolved to their final values). Undefined for ordinary single-shot
	 * payloads.
	 */
	streamed?: boolean;
	/**
	 * Human-readable notes about parts that couldn't be represented losslessly
	 * in a JSON tree — e.g. a RawStream whose bytes aren't shown inline.
	 */
	notes?: string[];
	/**
	 * Custom TanStack Start serialization-adapter tags found in the payload and
	 * decoded tolerantly (to their serializable form). Empty/undefined when the
	 * payload used only built-in types.
	 */
	adapterTags?: string[];
}

export interface DecodeFailure {
	ok: false;
	error: string;
	/** The raw string that failed to decode, shown verbatim in the Raw view. */
	rawText: string;
}

export type DecodeResult = DecodeSuccess | DecodeFailure;

/** Normalized HAR request timing breakdown, milliseconds. -1 means "not applicable". */
export interface EntryTimings {
	/** Total wall time for the request, ms. */
	total: number;
	blocked: number;
	dns: number;
	connect: number;
	ssl: number;
	send: number;
	/** Time spent waiting for the first response byte (TTFB) — the closest
	 * proxy for "how long the server function itself took". */
	wait: number;
	receive: number;
}

/** One upstream/backend call a server function made, as reported by the server. */
export interface BackendCall {
	method?: string;
	url: string;
	status?: number;
	durationMs?: number;
	/** Free-form label, used when a Server-Timing entry carries only a description. */
	label?: string;
	source: "header" | "server-timing";
}

export interface CapturedEntry {
	id: string;
	url: string;
	method: string;
	status: number;
	time: number;
	/** Raw ?payload= (GET) or POST body text, before any decoding. Null if absent. */
	requestRaw: string | null;
	/** Raw response body text, before any decoding. Base64 when `responseBase64` is true. */
	responseRaw: string;
	/** True when `responseRaw` is base64-encoded binary (framed/multiplexed responses). */
	responseBase64: boolean;
	/** Whether the response carried the x-tss-serialized: true header. */
	isSerialized: boolean;
	/** Response Content-Type, lowercased, sans parameters we don't need. Null if absent. */
	responseContentType: string | null;
	/** True for multipart/form-data or x-www-form-urlencoded requests. */
	isFormData: boolean;
	/** Request Content-Type verbatim (needed to parse a multipart boundary). Null if absent. */
	requestContentType: string | null;
	/** True when the server returned a raw pass-through Response (x-tss-raw: true). */
	isRawPassthrough: boolean;
	/** Location response header, when present (redirects). */
	location: string | null;
	/** Normalized HAR timings, or null when the capture didn't include them. */
	timings: EntryTimings | null;
	/** Raw Server-Timing response header, if any. */
	serverTiming: string | null;
	/** Raw x-serovalscope-upstream response header (JSON array), if any. */
	upstreamHeader: string | null;
}

/** The shape persisted by the export/import feature. Bump `version` on any breaking change. */
export interface SessionFile {
	format: "serovalscope-session";
	version: 1;
	exportedAt: string;
	pattern: string;
	entries: CapturedEntry[];
}
