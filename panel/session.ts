import type { CapturedEntry, SessionFile } from "./types.ts";

// Export / import of a capture session — a plain JSON file you can attach to a
// bug report or hand to a teammate, who loads it back into the panel and sees
// exactly the same rows (decoding happens on their side, from the same raw
// bytes). Versioned so a future breaking change to CapturedEntry can be
// detected rather than silently mis-read.

const CURRENT_VERSION = 1 as const;

export function buildSession(
	pattern: string,
	entries: CapturedEntry[],
): SessionFile {
	return {
		format: "serovalscope-session",
		version: CURRENT_VERSION,
		exportedAt: new Date().toISOString(),
		pattern,
		entries,
	};
}

export function serializeSession(
	pattern: string,
	entries: CapturedEntry[],
): string {
	return JSON.stringify(buildSession(pattern, entries), null, 2);
}

export interface ParsedSession {
	pattern: string;
	entries: CapturedEntry[];
}

const REQUIRED_KEYS: (keyof CapturedEntry)[] = [
	"id",
	"url",
	"method",
	"status",
	"responseRaw",
];

function looksLikeEntry(value: unknown): value is CapturedEntry {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		REQUIRED_KEYS.every((key) => key in v) &&
		typeof v.url === "string" &&
		typeof v.method === "string"
	);
}

/** Fills in fields added after the initial format so an older export still renders. */
function migrateEntry(raw: Record<string, unknown>): CapturedEntry {
	return {
		time: 0,
		requestRaw: null,
		responseBase64: false,
		isSerialized: false,
		responseContentType: null,
		isFormData: false,
		requestContentType: null,
		isRawPassthrough: false,
		location: null,
		timings: null,
		serverTiming: null,
		upstreamHeader: null,
		...raw,
	} as CapturedEntry;
}

/**
 * Parses a previously exported session. Throws a human-readable Error on
 * anything it can't safely load, so the caller can show the message directly.
 */
export function parseSession(text: string): ParsedSession {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("Not valid JSON.");
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Expected a session object.");
	}
	const obj = parsed as Partial<SessionFile>;
	if (obj.format !== "serovalscope-session") {
		throw new Error("Missing the serovalscope-session marker — wrong file?");
	}
	if (obj.version !== CURRENT_VERSION) {
		throw new Error(
			`Session version ${String(obj.version)} isn't supported by this build (expected ${CURRENT_VERSION}).`,
		);
	}
	if (!Array.isArray(obj.entries)) {
		throw new Error("Session has no entries array.");
	}
	const entries = obj.entries
		.filter(looksLikeEntry)
		.map((e) => migrateEntry(e as unknown as Record<string, unknown>));
	if (entries.length !== obj.entries.length) {
		throw new Error("Some entries were malformed and could not be loaded.");
	}
	return {
		pattern: typeof obj.pattern === "string" ? obj.pattern : "_serverFn/",
		entries,
	};
}
