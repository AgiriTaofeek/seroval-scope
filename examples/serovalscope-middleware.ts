/**
 * SerovalScope backend-call reporter — TanStack Start global middleware.
 *
 * The request a server function makes to your backend API happens on the
 * server and never reaches the browser, so DevTools (and therefore
 * SerovalScope) can't see it. This middleware makes the server *report*
 * those calls — method, absolute URL, status, duration, and (always on, see
 * below) the call's own request/response bodies and headers — on a response
 * header the panel reads:
 *
 *   x-serovalscope-upstream: <base64 JSON: { v: 1, calls: [...], truncated? }>
 *
 * It works by swapping `globalThis.fetch` for the duration of each server
 * function call and recording every request made through it, body and all.
 * If your backend client doesn't use `fetch` (a database driver, a gRPC
 * client, an SDK with its own transport), call `recordUpstreamCall()`
 * yourself from wherever you do that I/O.
 *
 * ── This is ALWAYS ON, including in production. Read this before wiring it up ──
 *
 * `x-serovalscope-upstream` is a normal HTTP response header. It is not
 * private to this extension: anyone who can see a response from your
 * deployed app at all — the browser's own Network tab, `curl -v`, a
 * corporate proxy log, a CDN's request log — sees it too, on every request,
 * for as long as this middleware is registered. That's the deliberate
 * trade-off of making this always-on rather than dev-only: it's what makes
 * "capture a backend call from a deployed app" possible at all, but it means
 * your backend's request/response bodies are effectively public wherever
 * this app is reachable.
 *
 * Two mitigations are built in, on by default:
 *
 *  - Well-known secret-shaped headers (`authorization`, `cookie`,
 *    `set-cookie`, `proxy-authorization`, `x-api-key`) are replaced with
 *    `"[redacted]"` before they're ever written to the report — see
 *    `SENSITIVE_HEADER_NAMES` in `serovalscope-middleware-helpers.ts`. Add
 *    to that set if your backend uses a differently-named auth/session
 *    header; remove from it (not recommended) if you'd rather see raw
 *    values.
 *  - Bodies and headers are size-capped (`MAX_BODY_CHARS`,
 *    `MAX_ENCODED_HEADER_CHARS`, same file) so this can never make the
 *    *real* response grow large enough to trip a proxy's header-size limit
 *    (nginx defaults to 8KB; other platforms vary but aren't unlimited
 *    either). When the budget is exceeded, calls are dropped and/or
 *    bodies/headers are shortened — never held onto at the cost of breaking
 *    the actual response — and a `truncated` flag says so.
 *
 * If you want this dev-only instead, wrap `installInstrumentedFetch()` and
 * the `.server()` handler body below in your own
 * `process.env.NODE_ENV !== "production"` check.
 *
 * Usage (src/start.ts or wherever you call createStart):
 *
 *   import { createMiddleware, registerGlobalMiddleware } from '@tanstack/react-start'
 *   import { serovalScopeMiddleware } from './examples/serovalscope-middleware'
 *   registerGlobalMiddleware({ middleware: [serovalScopeMiddleware] })
 *
 * or per function:  createServerFn().middleware([serovalScopeMiddleware])
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import {
	captureRequestBody,
	captureResponseBody,
	encodeReport,
	redactHeaders,
	type UpstreamCall,
} from "./serovalscope-middleware-helpers.ts";

export type { UpstreamCall };

const store = new AsyncLocalStorage<{ calls: UpstreamCall[] }>();

/** Call this from a non-fetch backend client to include it in the report. */
export function recordUpstreamCall(call: UpstreamCall): void {
	store.getStore()?.calls.push(call);
}

const REPORT_HEADER = "x-serovalscope-upstream";

// A fetch wrapper that records into whatever ALS context is active. Installed
// once; a no-op when there's no active server-function context.
const realFetch = globalThis.fetch;
function installInstrumentedFetch() {
	if ((globalThis.fetch as { __serovalscope?: boolean }).__serovalscope) return;
	const wrapped = async (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	): Promise<Response> => {
		const ctx = store.getStore();
		if (!ctx) return realFetch(input, init);
		const started = performance.now();
		const method = (
			init?.method ??
			(typeof input === "object" && "method" in input ? input.method : "GET") ??
			"GET"
		).toUpperCase();
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		const requestHeaders = redactHeaders(new Headers(init?.headers));
		const { body: requestBody } = captureRequestBody(init?.body ?? null);
		try {
			const res = await realFetch(input, init);
			const { body: responseBody } = await captureResponseBody(res);
			ctx.calls.push({
				method,
				url,
				status: res.status,
				durationMs: Math.round(performance.now() - started),
				requestBody,
				responseBody,
				requestHeaders,
				responseHeaders: redactHeaders(res.headers),
			});
			return res;
		} catch (err) {
			ctx.calls.push({
				method,
				url,
				durationMs: Math.round(performance.now() - started),
				requestBody,
				requestHeaders,
			});
			throw err;
		}
	};
	(wrapped as { __serovalscope?: boolean }).__serovalscope = true;
	globalThis.fetch = wrapped as typeof fetch;
}

export const serovalScopeMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		installInstrumentedFetch();

		const calls: UpstreamCall[] = [];
		const result = await store.run({ calls }, () => next());

		if (calls.length > 0) {
			try {
				// The plural `setResponseHeaders`/`setResponseStatus` are known not
				// to take effect from *global* middleware specifically —
				// TanStack/router#5407 — so this uses the singular
				// `setResponseHeader`, confirmed to work from the same context.
				setResponseHeader(REPORT_HEADER, encodeReport(calls));
			} catch {
				// best-effort — never let reporting break the actual response
			}
		}
		return result;
	},
);
