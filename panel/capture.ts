import type { CapturedEntry } from "./types.ts";

// Confirmed via @types/chrome + the underlying har-format spec: response
// headers are an array of { name, value } pairs, not a plain object/map.
const SEROVAL_HEADER = "x-tss-serialized";
const FORM_MIME_TYPES = new Set([
	"multipart/form-data",
	"application/x-www-form-urlencoded",
]);

let nextId = 0;

function headerValue(
	headers: chrome.devtools.network.Request["response"]["headers"],
	name: string,
): string | undefined {
	return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
		?.value;
}

/**
 * Wires chrome.devtools.network.onRequestFinished, filters to requests whose
 * URL contains `pattern`, and calls `onEntry` once per matching request with
 * its raw (not yet decoded) request/response text. Never throws out of the
 * listener — a single malformed request must not stop subsequent ones from
 * being captured. Returns an unsubscribe function.
 */
export function startCapture(
	pattern: string,
	onEntry: (entry: CapturedEntry) => void,
): () => void {
	const listener = (request: chrome.devtools.network.Request) => {
		try {
			if (!pattern || !request.request.url.includes(pattern)) return;

			const isFormData = FORM_MIME_TYPES.has(
				request.request.postData?.mimeType ?? "",
			);

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

			request.getContent((body) => {
				const isSerialized =
					headerValue(request.response.headers, SEROVAL_HEADER) === "true";
				onEntry({
					id: String(nextId++),
					url: request.request.url,
					method: request.request.method,
					status: request.response.status,
					time: Date.parse(request.startedDateTime),
					requestRaw,
					responseRaw: body ?? "",
					isSerialized,
					isFormData,
				});
			});
		} catch {
			// A single malformed captured request must never break the listener
			// for everything after it.
		}
	};

	chrome.devtools.network.onRequestFinished.addListener(listener);
	return () => chrome.devtools.network.onRequestFinished.removeListener(listener);
}
