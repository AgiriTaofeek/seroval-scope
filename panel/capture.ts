import { normalizeTimings } from "./timing.ts";
import type { CapturedEntry } from "./types.ts";

// Confirmed via @types/chrome + the underlying har-format spec: response
// headers are an array of { name, value } pairs, not a plain object/map.
const SEROVAL_HEADER = "x-tss-serialized";
// X_TSS_RAW_RESPONSE in @tanstack/start-client-core's constants.ts — set on a
// server function that returned a bare `Response` for the framework to pass
// through untouched. Its body is whatever the function sent, not seroval.
const RAW_RESPONSE_HEADER = "x-tss-raw";
// Opt-in header a project's own server middleware can set to report the
// backend/API calls a server function made — see examples/serovalscope-middleware.ts.
const UPSTREAM_HEADER = "x-serovalscope-upstream";
const FORM_MIME_TYPES = new Set([
	"multipart/form-data",
	"application/x-www-form-urlencoded",
]);

let nextId = 0;

type HarHeaders = { name: string; value: string }[];

function headerValue(headers: HarHeaders, name: string): string | undefined {
	return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function firstFormMime(contentType: string | undefined): boolean {
	if (!contentType) return false;
	// A multipart Content-Type carries a `; boundary=...` parameter, so match
	// on prefix rather than exact equality.
	const base = contentType.split(";", 1)[0].trim().toLowerCase();
	return FORM_MIME_TYPES.has(base);
}

/**
 * Wires chrome.devtools.network.onRequestFinished, filters to requests whose
 * URL contains `pattern`, and calls `onEntry` once per matching request with
 * its raw (not yet decoded) request/response text plus the metadata the panel
 * needs (timings, content types, TanStack Start marker headers). Never throws
 * out of the listener — a single malformed request must not stop subsequent
 * ones from being captured. Returns an unsubscribe function.
 */
export function startCapture(
	pattern: string,
	onEntry: (entry: CapturedEntry) => void,
): () => void {
	const listener = (request: chrome.devtools.network.Request) => {
		try {
			if (!pattern || !request.request.url.includes(pattern)) return;

			const requestContentType =
				headerValue(request.request.headers ?? [], "content-type") ?? null;
			const reqMime =
				request.request.postData?.mimeType ?? requestContentType ?? undefined;
			const isFormData = firstFormMime(reqMime);

			let requestRaw: string | null = null;
			if (!isFormData) {
				if (request.request.method === "GET") {
					try {
						requestRaw = new URL(request.request.url).searchParams.get(
							"payload",
						);
					} catch {
						requestRaw = null;
					}
				} else {
					requestRaw = request.request.postData?.text ?? null;
				}
			}

			// getContent's second arg is "" for text and "base64" for anything
			// Chrome treats as binary — the framed/multiplexed response protocol
			// lands here as base64, and decoding it as text would corrupt it.
			request.getContent((body, encoding) => {
				const headers = request.response.headers ?? [];
				const rawContentType =
					request.response.content?.mimeType ??
					headerValue(headers, "content-type") ??
					null;
				onEntry({
					id: String(nextId++),
					url: request.request.url,
					method: request.request.method,
					status: request.response.status,
					time: Date.parse(request.startedDateTime),
					requestRaw,
					responseRaw: body ?? "",
					responseBase64: encoding === "base64",
					isSerialized: headerValue(headers, SEROVAL_HEADER) === "true",
					responseContentType: rawContentType
						? rawContentType.split(";", 1)[0].trim().toLowerCase()
						: null,
					isFormData,
					requestContentType,
					isRawPassthrough: headerValue(headers, RAW_RESPONSE_HEADER) === "true",
					location: headerValue(headers, "location") ?? null,
					timings: normalizeTimings(request.time, request.timings),
					serverTiming: headerValue(headers, "server-timing") ?? null,
					upstreamHeader: headerValue(headers, UPSTREAM_HEADER) ?? null,
				});
			});
		} catch {
			// A single malformed captured request must never break the listener
			// for everything after it.
		}
	};

	chrome.devtools.network.onRequestFinished.addListener(listener);
	return () =>
		chrome.devtools.network.onRequestFinished.removeListener(listener);
}
