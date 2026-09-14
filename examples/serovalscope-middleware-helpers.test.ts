import { describe, expect, test } from "vitest";

import {
	captureRequestBody,
	encodeReport,
	redactHeaders,
	truncateBody,
	type UpstreamCall,
} from "./serovalscope-middleware-helpers.ts";

function decodeReport(encoded: string): { v: number; calls: UpstreamCall[]; truncated: boolean } {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return JSON.parse(new TextDecoder().decode(bytes));
}

describe("truncateBody", () => {
	test("passes short text through untouched", () => {
		expect(truncateBody("hi")).toEqual({ text: "hi", truncated: false });
	});

	test("shortens text past the cap and flags it", () => {
		const long = "x".repeat(3000);
		const { text, truncated } = truncateBody(long);
		expect(truncated).toBe(true);
		expect(text.length).toBeLessThan(long.length);
		expect(text.endsWith("…")).toBe(true);
	});
});

describe("redactHeaders", () => {
	test("redacts well-known secret-shaped headers, case-insensitively", () => {
		const headers = new Headers({
			Authorization: "Bearer secret",
			"X-Api-Key": "abc123",
			"Content-Type": "application/json",
		});
		expect(redactHeaders(headers)).toEqual({
			authorization: "[redacted]",
			"x-api-key": "[redacted]",
			"content-type": "application/json",
		});
	});

	test("redacts set-cookie", () => {
		const headers = new Headers({ "Set-Cookie": "session=abc" });
		expect(redactHeaders(headers)).toEqual({ "set-cookie": "[redacted]" });
	});
});

describe("captureRequestBody", () => {
	test("captures a plain string body", () => {
		expect(captureRequestBody("hello")).toEqual({ body: "hello", truncated: false });
	});

	test("captures a URLSearchParams body as its string form", () => {
		expect(captureRequestBody(new URLSearchParams({ a: "1" }))).toEqual({
			body: "a=1",
			truncated: false,
		});
	});

	test("notes non-text bodies without reading them", () => {
		expect(captureRequestBody(new FormData()).body).toMatch(/FormData/);
		expect(captureRequestBody(new ArrayBuffer(4)).body).toMatch(/binary/);
	});

	test("passes null/undefined through as undefined", () => {
		expect(captureRequestBody(null)).toEqual({ body: undefined, truncated: false });
		expect(captureRequestBody(undefined)).toEqual({ body: undefined, truncated: false });
	});
});

describe("encodeReport", () => {
	function call(i: number, bodyChars = 10): UpstreamCall {
		return {
			method: "GET",
			url: `https://api.internal/v${i}`,
			status: 200,
			durationMs: 1,
			responseBody: "x".repeat(bodyChars),
		};
	}

	test("round-trips small reports untouched", () => {
		const decoded = decodeReport(encodeReport([call(1)]));
		expect(decoded.truncated).toBe(false);
		expect(decoded.calls).toHaveLength(1);
		expect(decoded.calls[0].url).toBe("https://api.internal/v1");
	});

	test("never emits a header past the size budget, however large the input", () => {
		// Each call's body is already capped by truncateBody before it ever
		// reaches encodeReport, but many calls together can still add up —
		// encodeReport's own budget must hold regardless.
		const many = Array.from({ length: 500 }, (_, i) => call(i, 2000));
		const encoded = encodeReport(many);
		expect(encoded.length).toBeLessThanOrEqual(6000);
		const decoded = decodeReport(encoded);
		expect(decoded.truncated).toBe(true);
		expect(decoded.calls.length).toBeLessThan(many.length);
	});

	test("degrades to zero calls (but never throws) if even one is too large", () => {
		const encoded = encodeReport([call(1, 1_000_000)]);
		const decoded = decodeReport(encoded);
		expect(decoded.calls).toEqual([]);
		expect(decoded.truncated).toBe(true);
	});

	test("handles an empty call list", () => {
		const decoded = decodeReport(encodeReport([]));
		expect(decoded).toEqual({ v: 1, calls: [], truncated: false });
	});
});
