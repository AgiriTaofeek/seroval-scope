import { normalizeError, type NormalizedError } from "./errorValue.ts";
import type { CapturedEntry, DecodeResult } from "./types.ts";

export type OutcomeKind = "ok" | "error" | "redirect" | "notFound" | "raw";

export interface ResponseOutcome {
	kind: OutcomeKind;
	/** The value to render in the tree — the `{ result, error, context }`
	 * envelope unwrapped to whichever branch actually matters. */
	display: unknown;
	/** Set for kind "error". */
	error?: NormalizedError;
	/** Set for kind "redirect", when a target could be determined. */
	redirectTo?: string;
	/** One-line summary for the row badge and the detail banner. */
	summary: string;
	/** True when HTTP status was 2xx but the payload still carried a failure /
	 * redirect — the case the native Network tab's status column hides. */
	hiddenInStatus: boolean;
}

type OutcomeInput = Pick<
	CapturedEntry,
	"status" | "isRawPassthrough" | "location"
>;

interface Envelope {
	result: unknown;
	error: unknown;
	context: unknown;
}

// The server always serializes its result as `{ result, error, context }`
// (see @tanstack/start-client-core createServerFn — both the success path,
// `next({ ...ctx, result })`, and the caught-error path,
// `return { ...ctx, error }`, land here). All three keys are present even when
// a value is undefined.
function asEnvelope(value: unknown): Envelope | null {
	if (typeof value !== "object" || value === null) return null;
	const v = value as Record<string, unknown>;
	if ("result" in v && "error" in v && "context" in v) {
		return { result: v.result, error: v.error, context: v.context };
	}
	return null;
}

function redirectTarget(value: unknown, location: string | null): string | undefined {
	if (location) return location;
	if (typeof value === "object" && value !== null) {
		const v = value as Record<string, unknown>;
		// Serialized redirect shape (router-core parseRedirect / redirect()).
		const opts = (v.options ?? v) as Record<string, unknown>;
		for (const key of ["href", "to", "Location"]) {
			if (typeof opts[key] === "string") return opts[key] as string;
		}
	}
	return undefined;
}

function looksLikeRedirect(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		v.isSerializedRedirect === true ||
		v.isRedirect === true ||
		(typeof v.options === "object" &&
			v.options !== null &&
			("href" in v.options || "to" in v.options))
	);
}

function looksLikeNotFound(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Record<string, unknown>).isNotFound === true
	);
}

/**
 * Interprets a decoded server-function response: is it a success, a thrown
 * error, a `notFound()`, a `redirect()`, or a raw pass-through Response? Reads
 * both the HTTP status and the decoded payload, because TanStack Start
 * frequently returns 200 with a failure/redirect encoded in the body.
 */
export function classifyResponse(
	entry: OutcomeInput,
	decoded: DecodeResult,
): ResponseOutcome {
	const statusOk = entry.status >= 200 && entry.status < 300;

	if (entry.isRawPassthrough) {
		return {
			kind: "raw",
			display: decoded.ok ? decoded.value : decoded.rawText,
			summary: "Raw pass-through Response (not seroval)",
			hiddenInStatus: false,
		};
	}

	if (!decoded.ok) {
		return {
			kind: entry.status >= 400 ? "error" : "ok",
			display: decoded.rawText,
			error:
				entry.status >= 400
					? { name: "Decode failed", message: decoded.error, fromErrorInstance: false }
					: undefined,
			summary: `Could not decode response — ${decoded.error}`,
			hiddenInStatus: false,
		};
	}

	const value = decoded.value;
	const envelope = asEnvelope(value);
	const errorBranch = envelope ? envelope.error : undefined;
	const primary = envelope
		? envelope.error !== undefined
			? envelope.error
			: envelope.result
		: value;

	// --- notFound -------------------------------------------------------------
	if (
		entry.status === 404 ||
		looksLikeNotFound(primary) ||
		looksLikeNotFound(value)
	) {
		const nf = looksLikeNotFound(primary) ? primary : value;
		return {
			kind: "notFound",
			display: nf,
			summary: "notFound()",
			hiddenInStatus: statusOk,
		};
	}

	// --- redirect ------------------------------------------------------------
	if (
		(entry.status >= 300 && entry.status < 400) ||
		entry.location !== null ||
		looksLikeRedirect(primary) ||
		looksLikeRedirect(value)
	) {
		const target = redirectTarget(
			looksLikeRedirect(primary) ? primary : value,
			entry.location,
		);
		return {
			kind: "redirect",
			display: looksLikeRedirect(primary) ? primary : value,
			redirectTo: target,
			summary: target ? `redirect() → ${target}` : "redirect()",
			hiddenInStatus: statusOk,
		};
	}

	// --- error -------------------------------------------------------------
	const err =
		errorBranch !== undefined
			? normalizeError(errorBranch)
			: normalizeError(value);
	if (err && (errorBranch !== undefined || value instanceof Error)) {
		return {
			kind: "error",
			display: errorBranch !== undefined ? errorBranch : value,
			error: err,
			summary: `${err.name}: ${err.message}`,
			hiddenInStatus: statusOk,
		};
	}

	if (entry.status >= 400) {
		return {
			kind: "error",
			display: envelope ? primary : value,
			error: err ?? {
				name: `HTTP ${entry.status}`,
				message: "Server function returned an error status",
				fromErrorInstance: false,
			},
			summary: `HTTP ${entry.status}`,
			hiddenInStatus: false,
		};
	}

	// --- ok --------------------------------------------------------------
	return {
		kind: "ok",
		display: envelope ? envelope.result : value,
		summary: "OK",
		hiddenInStatus: false,
	};
}
