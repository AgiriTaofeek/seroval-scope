import { describe, expect, test } from "vitest";

import {
	backendCallsFor,
	parseServerTiming,
	parseUpstreamHeader,
} from "./backendCalls.ts";

// Mirrors examples/serovalscope-middleware.ts's `encodeReport` output shape,
// without importing it (that file lives outside panel/ and isn't bundled).
function encodeReportLike(calls: unknown[], truncated = false): string {
	const json = JSON.stringify({ v: 1, calls, truncated });
	const bytes = new TextEncoder().encode(json);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

describe("parseUpstreamHeader", () => {
	test("decodes the base64 report the current middleware sets, bodies and headers included", () => {
		const header = encodeReportLike([
			{
				method: "GET",
				url: "https://api.internal/v2/invoices",
				status: 200,
				durationMs: 42,
				responseBody: '{"id":1}',
				requestHeaders: { authorization: "[redacted]" },
				responseHeaders: { "content-type": "application/json" },
			},
		]);
		expect(parseUpstreamHeader(header)).toEqual({
			calls: [
				{
					method: "GET",
					url: "https://api.internal/v2/invoices",
					status: 200,
					durationMs: 42,
					label: undefined,
					source: "header",
					requestBody: undefined,
					responseBody: '{"id":1}',
					requestHeaders: { authorization: "[redacted]" },
					responseHeaders: { "content-type": "application/json" },
					truncated: false,
				},
			],
			truncated: false,
		});
	});

	test("surfaces the report-level truncated flag", () => {
		const header = encodeReportLike([{ url: "/api/x" }], true);
		expect(parseUpstreamHeader(header).truncated).toBe(true);
	});

	test("falls back to the legacy plain-JSON-array format", () => {
		const header = JSON.stringify([
			{ method: "GET", url: "/api/v2/invoices", status: 200, ms: 42 },
			{ method: "POST", url: "https://pay.internal/charge", status: 201, durationMs: 130 },
		]);
		expect(parseUpstreamHeader(header)).toEqual({
			calls: [
				{
					method: "GET",
					url: "/api/v2/invoices",
					status: 200,
					durationMs: 42,
					label: undefined,
					source: "header",
					requestBody: undefined,
					responseBody: undefined,
					requestHeaders: undefined,
					responseHeaders: undefined,
					truncated: false,
				},
				{
					method: "POST",
					url: "https://pay.internal/charge",
					status: 201,
					durationMs: 130,
					label: undefined,
					source: "header",
					requestBody: undefined,
					responseBody: undefined,
					requestHeaders: undefined,
					responseHeaders: undefined,
					truncated: false,
				},
			],
			truncated: false,
		});
	});

	test("legacy format accepts a single object as well as an array", () => {
		expect(parseUpstreamHeader('{"url":"/api/x"}').calls).toHaveLength(1);
	});

	test("drops entries with no url and returns [] on malformed input", () => {
		expect(parseUpstreamHeader('[{"method":"GET"}]')).toEqual({ calls: [], truncated: false });
		expect(parseUpstreamHeader("not json")).toEqual({ calls: [], truncated: false });
		expect(parseUpstreamHeader(null)).toEqual({ calls: [], truncated: false });
	});
});

describe("parseServerTiming", () => {
	test("extracts dur and desc, surfacing call-like entries", () => {
		const value = 'db;dur=12;desc="GET /users", cache;desc="Hit", total;dur=40';
		const calls = parseServerTiming(value);
		expect(calls).toEqual([
			{ url: "GET /users", label: "GET /users", durationMs: 12, source: "server-timing" },
			{ url: "Hit", label: "Hit", durationMs: undefined, source: "server-timing" },
		]);
	});

	test("keeps a bare metric only when it reads like a route", () => {
		expect(parseServerTiming("upstream;dur=5")).toEqual([]);
		expect(parseServerTiming("api;dur=5;desc=/v1/orders")).toHaveLength(1);
	});

	test("handles quoted values containing commas and semicolons", () => {
		const calls = parseServerTiming('x;desc="GET /a?b=1,2;c"');
		expect(calls[0].label).toBe("GET /a?b=1,2;c");
	});
});

describe("backendCallsFor", () => {
	test("prefers the header source and de-dupes Server-Timing overlap", () => {
		const { calls } = backendCallsFor({
			upstreamHeader: JSON.stringify([{ method: "GET", url: "/api/x" }]),
			serverTiming: 'a;desc="GET /api/x", b;desc="GET /api/y"',
		});
		expect(calls.map((c) => c.url)).toEqual(["/api/x", "GET /api/y"]);
	});

	test("returns [] when neither channel is present", () => {
		expect(
			backendCallsFor({ upstreamHeader: null, serverTiming: null }),
		).toEqual({ calls: [], truncated: false });
	});

	test("carries the header's truncated flag through", () => {
		const header = encodeReportLike([{ url: "/api/x" }], true);
		const { truncated } = backendCallsFor({ upstreamHeader: header, serverTiming: null });
		expect(truncated).toBe(true);
	});
});
