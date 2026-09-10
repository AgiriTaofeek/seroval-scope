import type { CapturedEntry } from "./types.ts";

// "Replay this call" — re-issue a captured server-function request from the
// panel, optionally with an edited wire payload, by evaluating a fetch() in the
// inspected page (so it carries the page's cookies / auth). The payload edited
// is the raw seroval wire text, not the decoded value — no re-serialization,
// so what you send is exactly what you see.

export interface ReplayRequest {
	entry: Pick<CapturedEntry, "url" | "method" | "requestContentType">;
	/** Raw wire payload to send. For GET this replaces `?payload=`; for POST it's the body. */
	rawPayload: string | null;
}

/** The GET URL with its `payload` query param replaced (or added). */
export function replayUrl(rawUrl: string, rawPayload: string | null): string {
	const url = new URL(rawUrl);
	if (rawPayload === null) {
		url.searchParams.delete("payload");
	} else {
		url.searchParams.set("payload", rawPayload);
	}
	return url.toString();
}

/**
 * A self-contained async expression that performs the replay and resolves to
 * `{ status, headers, body }`. Suitable for `chrome.devtools.inspectedWindow.eval`
 * and also for pasting straight into the page console.
 */
export function buildReplayExpression(req: ReplayRequest): string {
	const method = req.entry.method.toUpperCase();
	const headers: Record<string, string> = { "x-tsr-serverFn": "true" };
	let url = req.entry.url;
	let bodyLiteral = "undefined";

	if (method === "GET") {
		url = replayUrl(req.entry.url, req.rawPayload);
	} else if (req.rawPayload !== null) {
		headers["content-type"] = req.entry.requestContentType ?? "application/json";
		bodyLiteral = JSON.stringify(req.rawPayload);
	}

	return [
		"(async () => {",
		`  const res = await fetch(${JSON.stringify(url)}, {`,
		`    method: ${JSON.stringify(method)},`,
		`    headers: ${JSON.stringify(headers)},`,
		`    body: ${bodyLiteral},`,
		"    credentials: 'include',",
		"  });",
		"  return {",
		"    status: res.status,",
		"    headers: Object.fromEntries(res.headers.entries()),",
		"    body: await res.text(),",
		"  };",
		"})()",
	].join("\n");
}

export interface ReplayOutcome {
	ok: boolean;
	status?: number;
	headers?: Record<string, string>;
	body?: string;
	error?: string;
}

type EvalFn = (
	expression: string,
	callback: (result: unknown, exceptionInfo?: { value?: string; description?: string; isException?: boolean }) => void,
) => void;

function evalFn(): EvalFn | null {
	try {
		const fn = (
			globalThis as {
				chrome?: { devtools?: { inspectedWindow?: { eval?: unknown } } };
			}
		).chrome?.devtools?.inspectedWindow?.eval;
		return typeof fn === "function" ? (fn as EvalFn) : null;
	} catch {
		return null;
	}
}

/** Runs a replay expression in the inspected page. Never rejects. */
export function runReplay(req: ReplayRequest): Promise<ReplayOutcome> {
	const run = evalFn();
	if (!run) {
		return Promise.resolve({
			ok: false,
			error: "inspectedWindow.eval is unavailable — copy the expression and run it in the page console.",
		});
	}
	const expression = buildReplayExpression(req);
	return new Promise((resolve) => {
		run(expression, (result, exceptionInfo) => {
			if (exceptionInfo?.isException || exceptionInfo?.value) {
				resolve({
					ok: false,
					error:
						exceptionInfo.value ??
						exceptionInfo.description ??
						"evaluation failed",
				});
				return;
			}
			if (result && typeof result === "object" && "status" in result) {
				const r = result as ReplayOutcome;
				resolve({ ok: true, status: r.status, headers: r.headers, body: r.body });
				return;
			}
			resolve({
				ok: false,
				error:
					"The page returned a Promise that DevTools couldn't await — run the expression in the console instead.",
			});
		});
	});
}
