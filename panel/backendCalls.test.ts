import { describe, expect, test } from "vitest";

import {
	backendCallsFor,
	parseServerTiming,
	parseUpstreamHeader,
} from "./backendCalls.ts";

describe("parseUpstreamHeader", () => {
	test("parses the JSON array a project's middleware sets", () => {
		const header = JSON.stringify([
			{ method: "GET", url: "/api/v2/invoices", status: 200, ms: 42 },
			{ method: "POST", url: "https://pay.internal/charge", status: 201, durationMs: 130 },
		]);
		expect(parseUpstreamHeader(header)).toEqual([
			{
				method: "GET",
				url: "/api/v2/invoices",
				status: 200,
				durationMs: 42,
				label: undefined,
				source: "header",
			},
			{
				method: "POST",
				url: "https://pay.internal/charge",
				status: 201,
				durationMs: 130,
				label: undefined,
				source: "header",
			},
		]);
	});

	test("accepts a single object as well as an array", () => {
		expect(parseUpstreamHeader('{"url":"/api/x"}')).toHaveLength(1);
	});

	test("drops entries with no url and returns [] on malformed JSON", () => {
		expect(parseUpstreamHeader('[{"method":"GET"}]')).toEqual([]);
		expect(parseUpstreamHeader("not json")).toEqual([]);
		expect(parseUpstreamHeader(null)).toEqual([]);
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
		const calls = backendCallsFor({
			upstreamHeader: JSON.stringify([{ method: "GET", url: "/api/x" }]),
			serverTiming: 'a;desc="GET /api/x", b;desc="GET /api/y"',
		});
		expect(calls.map((c) => c.url)).toEqual(["/api/x", "GET /api/y"]);
	});

	test("returns [] when neither channel is present", () => {
		expect(
			backendCallsFor({ upstreamHeader: null, serverTiming: null }),
		).toEqual([]);
	});
});
