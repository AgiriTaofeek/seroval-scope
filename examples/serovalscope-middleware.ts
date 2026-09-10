/**
 * SerovalScope backend-call reporter — TanStack Start global middleware.
 *
 * The request a server function makes to your backend API happens on the
 * server and never reaches the browser, so DevTools (and therefore
 * SerovalScope) can't see it. This middleware makes the server *report* those
 * calls on a response header the panel reads:
 *
 *   x-serovalscope-upstream: [{"method":"GET","url":"/api/v2/invoices","status":200,"ms":42}]
 *
 * It works by swapping `globalThis.fetch` for the duration of each server
 * function call and recording every request made through it. If your backend
 * client doesn't use `fetch` (a database driver, a gRPC client, an SDK with
 * its own transport), call `recordUpstreamCall()` yourself from wherever you
 * do that I/O.
 *
 * DEV ONLY by default — it puts internal URLs on a response header, which you
 * don't want in production. Guard it, and/or redact `url` below.
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

export interface UpstreamCall {
	method: string;
	url: string;
	status?: number;
	durationMs: number;
}

const store = new AsyncLocalStorage<{ calls: UpstreamCall[] }>();

/** Call this from a non-fetch backend client to include it in the report. */
export function recordUpstreamCall(call: UpstreamCall): void {
	store.getStore()?.calls.push(call);
}

const REPORT_HEADER = "x-serovalscope-upstream";
const enabled = process.env.NODE_ENV !== "production";

// A fetch wrapper that records into whatever ALS context is active. Installed
// once; a no-op when there's no active server-function context.
const realFetch = globalThis.fetch;
function installInstrumentedFetch() {
	if (!enabled || (globalThis.fetch as { __serovalscope?: boolean }).__serovalscope) {
		return;
	}
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
		try {
			const res = await realFetch(input, init);
			ctx.calls.push({
				method,
				url,
				status: res.status,
				durationMs: Math.round(performance.now() - started),
			});
			return res;
		} catch (err) {
			ctx.calls.push({
				method,
				url,
				durationMs: Math.round(performance.now() - started),
			});
			throw err;
		}
	};
	(wrapped as { __serovalscope?: boolean }).__serovalscope = true;
	globalThis.fetch = wrapped as typeof fetch;
}

export const serovalScopeMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		if (!enabled) return next();
		installInstrumentedFetch();

		const calls: UpstreamCall[] = [];
		const result = await store.run({ calls }, () => next());

		if (calls.length > 0) {
			try {
				// `result.context` is where server middleware can influence the
				// response; if your TanStack Start version exposes response headers
				// differently, set the header there instead.
				const headers =
					(result as { response?: { headers?: Headers } }).response?.headers ??
					undefined;
				headers?.set(REPORT_HEADER, JSON.stringify(calls));
			} catch {
				// best-effort — never let reporting break the actual response
			}
		}
		return result;
	},
);
