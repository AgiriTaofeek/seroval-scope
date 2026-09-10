import { describe, expect, test } from "vitest";

import {
	decodeRequest,
	decodeResponse,
	entrySearchText,
	resolveStreamed,
} from "./deserialize.ts";
import type { CapturedEntry } from "./types.ts";

function baseEntry(overrides: Partial<CapturedEntry>): CapturedEntry {
	return {
		id: "0",
		url: "http://localhost:3000/_serverFn/example",
		method: "POST",
		status: 200,
		time: 0,
		requestRaw: null,
		responseRaw: "",
		responseBase64: false,
		isSerialized: false,
		responseContentType: "application/json",
		isFormData: false,
		requestContentType: null,
		isRawPassthrough: false,
		location: null,
		timings: null,
		serverTiming: null,
		upstreamHeader: null,
		...overrides,
	};
}

describe("decodeResponse (single-shot)", () => {
	// Real /_serverFn/* response body, captured from subpilot-web's analytics
	// route — ground truth confirmed by running it through seroval directly.
	const realAnalyticsResponse =
		'{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":10,"i":1,"p":{"k":["points","granularity"],"v":[{"t":9,"i":2,"a":[{"t":10,"i":3,"p":{"k":["bucket","value"],"v":[{"t":1,"s":"2026-07-02"},{"t":0,"s":1}]},"o":0}],"o":0},{"t":1,"s":"daily"}]},"o":0},{"t":2,"s":1},{"t":11,"i":4,"p":{"k":[],"v":[]},"o":0}]},"o":0}';

	test("decodes a real seroval-serialized response", () => {
		const result = decodeResponse(
			baseEntry({ responseRaw: realAnalyticsResponse, isSerialized: true }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			result: {
				points: [{ bucket: "2026-07-02", value: 1 }],
				granularity: "daily",
			},
			error: undefined,
			context: {},
		});
		expect(result.streamed).toBeUndefined();
	});

	test("falls back to plain JSON when not seroval-serialized", () => {
		const result = decodeResponse(
			baseEntry({ responseRaw: '{"hello":"world"}', isSerialized: false }),
		);
		expect(result.ok && result.value).toStrictEqual({ hello: "world" });
	});

	test("falls back to raw text when a non-serialized response is neither seroval nor JSON", () => {
		const result = decodeResponse(
			baseEntry({ responseRaw: "not json at all", isSerialized: false }),
		);
		expect(result.ok && result.value).toBe("not json at all");
	});

	test("returns a failure result (not a throw) for malformed seroval JSON", () => {
		const result = decodeResponse(
			baseEntry({ responseRaw: "{not valid json", isSerialized: true }),
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.rawText).toBe("{not valid json");
	});
});

describe("decodeResponse (framed / streamed)", () => {
	// Real frame-protocol body, produced by feeding
	//   { result: { rows: [{id:1},{id:2}], pending: Promise.resolve({total:2,label:"done"}) },
	//     error: undefined, context: {} }
	// through the exact encoder in @tanstack/start-server-core (toCrossJSONStream
	// + encodeFrame), base64 as Chrome's getContent would hand it to the panel.
	const framedBase64 =
		"AAAAAAAAAAFteyJ0IjoxMCwiaSI6MCwicCI6eyJrIjpbInJlc3VsdCIsImVycm9yIiwiY29udGV4dCJdLCJ2IjpbeyJ0IjoxMCwiaSI6MSwicCI6eyJrIjpbInJvd3MiLCJwZW5kaW5nIl0sInYiOlt7InQiOjksImkiOjIsImEiOlt7InQiOjEwLCJpIjozLCJwIjp7ImsiOlsiaWQiXSwidiI6W3sidCI6MCwicyI6MX1dfSwibyI6MH0seyJ0IjoxMCwiaSI6NCwicCI6eyJrIjpbImlkIl0sInYiOlt7InQiOjAsInMiOjJ9XX0sIm8iOjB9XSwibyI6MH0seyJ0IjoyMiwiaSI6NSwicyI6NiwiZiI6eyJ0IjoyNiwiaSI6NywicyI6MX19XX0sIm8iOjB9LHsidCI6MiwicyI6MX0seyJ0IjoxMCwiaSI6OCwicCI6eyJrIjpbXSwidiI6W119LCJvIjowfV19LCJvIjowfQoAAAAAAAAAAIN7InQiOjIzLCJpIjo2LCJhIjpbeyJ0IjoyNiwiaSI6MTAsInMiOjJ9LHsidCI6MTAsImkiOjksInAiOnsiayI6WyJ0b3RhbCIsImxhYmVsIl0sInYiOlt7InQiOjAsInMiOjJ9LHsidCI6MSwicyI6ImRvbmUifV19LCJvIjowfV19Cg==";

	const framedEntry = baseEntry({
		responseRaw: framedBase64,
		responseBase64: true,
		isSerialized: true,
		responseContentType: "application/x-tss-framed",
	});

	test("decodes the root frame synchronously and flags the result as streamed", () => {
		const result = decodeResponse(framedEntry);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.streamed).toBe(true);
		const value = result.value as {
			result: { rows: unknown[]; pending: unknown };
		};
		expect(value.result.rows).toEqual([{ id: 1 }, { id: 2 }]);
		// The deferred value is a real Promise until resolveStreamed awaits it.
		expect(value.result.pending).toBeInstanceOf(Promise);
	});

	test("resolveStreamed settles the deferred parts to their final values", async () => {
		const result = decodeResponse(framedEntry);
		if (!result.ok) throw new Error("expected ok");
		const resolved = (await resolveStreamed(result.value)) as {
			result: { rows: unknown[]; pending: unknown };
		};
		expect(resolved).toEqual({
			result: {
				rows: [{ id: 1 }, { id: 2 }],
				pending: { total: 2, label: "done" },
			},
			error: undefined,
			context: {},
		});
	});

	test("also accepts a framed body that arrived as text rather than base64", () => {
		const bytes = Buffer.from(framedBase64, "base64");
		const asLatin1 = bytes.toString("latin1");
		const result = decodeResponse(
			baseEntry({
				responseRaw: asLatin1,
				responseBase64: false,
				isSerialized: true,
				responseContentType: "application/x-tss-framed",
			}),
		);
		// latin1 round-tripping mangles multi-byte data, but this fixture is
		// ASCII-only, so the frame walk still succeeds.
		expect(result.ok).toBe(true);
	});

	test("reports a framed body with no JSON frames as a failure", () => {
		const result = decodeResponse(
			baseEntry({
				responseRaw: Buffer.from(new Uint8Array(9)).toString("base64"),
				responseBase64: true,
				isSerialized: true,
				responseContentType: "application/x-tss-framed",
			}),
		);
		expect(result.ok).toBe(false);
	});
});

describe("resolveStreamed", () => {
	test("marks a rejected deferred value instead of throwing", async () => {
		const value = { boom: Promise.reject(new Error("nope")) };
		const resolved = (await resolveStreamed(value)) as {
			boom: { __serovalscopeRejected: string };
		};
		expect(resolved.boom.__serovalscopeRejected).toBe("nope");
	});

	test("does not infinitely recurse on a cyclic object", async () => {
		const a: Record<string, unknown> = {};
		a.self = a;
		const resolved = (await resolveStreamed(a)) as Record<string, unknown>;
		expect(resolved.self).toBe(resolved);
	});

	test("replaces a ReadableStream with a marker", async () => {
		const value = { body: new ReadableStream() };
		const resolved = (await resolveStreamed(value)) as {
			body: { __serovalscopeReadableStream: boolean };
		};
		expect(resolved.body.__serovalscopeReadableStream).toBe(true);
	});
});

describe("decodeRequest", () => {
	const realRequestPayload =
		'{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["rangeDays","granularity"],"v":[{"t":0,"s":30},{"t":1,"s":"daily"}]},"o":0}]},"o":0},"f":63,"m":[]}';

	test("decodes a real request payload via fromJSON (tree mode)", () => {
		const result = decodeRequest(realRequestPayload);
		expect(result.ok && result.value).toStrictEqual({
			data: { rangeDays: 30, granularity: "daily" },
		});
	});

	test("returns a clean 'no payload' result for GET calls with no ?payload=", () => {
		const result = decodeRequest(null);
		expect(result.ok && result.value).toBeUndefined();
	});

	test("returns a failure result (not a throw) for malformed JSON", () => {
		expect(decodeRequest("{not valid json").ok).toBe(false);
	});
});

describe("entrySearchText", () => {
	test("for form-data entries, only searches the URL", () => {
		const entry = baseEntry({
			url: "http://localhost:3000/_serverFn/upload",
			isFormData: true,
			requestRaw: "--boundary\r\nsecret-field-name",
			responseRaw: '{"hello":"world"}',
		});
		expect(entrySearchText(entry)).toBe(entry.url);
		expect(entrySearchText(entry)).not.toContain("secret-field-name");
	});

	test("includes decoded response content, not just the raw wire text", () => {
		const entry = baseEntry({
			responseRaw: '{"hello":"world"}',
			isSerialized: false,
		});
		expect(entrySearchText(entry).toLowerCase()).toContain("world");
	});

	test("falls back to raw text without throwing when response is malformed seroval", () => {
		const entry = baseEntry({ responseRaw: "{not valid", isSerialized: true });
		expect(() => entrySearchText(entry)).not.toThrow();
		expect(entrySearchText(entry)).toContain("{not valid");
	});

	test("searches the non-deferred parts of a streamed response", () => {
		const entry = baseEntry({
			responseRaw:
				"AAAAAAAAAAFteyJ0IjoxMCwiaSI6MCwicCI6eyJrIjpbInJlc3VsdCIsImVycm9yIiwiY29udGV4dCJdLCJ2IjpbeyJ0IjoxMCwiaSI6MSwicCI6eyJrIjpbInJvd3MiLCJwZW5kaW5nIl0sInYiOlt7InQiOjksImkiOjIsImEiOlt7InQiOjEwLCJpIjozLCJwIjp7ImsiOlsiaWQiXSwidiI6W3sidCI6MCwicyI6MX1dfSwibyI6MH0seyJ0IjoxMCwiaSI6NCwicCI6eyJrIjpbImlkIl0sInYiOlt7InQiOjAsInMiOjJ9XX0sIm8iOjB9XSwibyI6MH0seyJ0IjoyMiwiaSI6NSwicyI6NiwiZiI6eyJ0IjoyNiwiaSI6NywicyI6MX19XX0sIm8iOjB9LHsidCI6MiwicyI6MX0seyJ0IjoxMCwiaSI6OCwicCI6eyJrIjpbXSwidiI6W119LCJvIjowfV19LCJvIjowfQoAAAAAAAAAAIN7InQiOjIzLCJpIjo2LCJhIjpbeyJ0IjoyNiwiaSI6MTAsInMiOjJ9LHsidCI6MTAsImkiOjksInAiOnsiayI6WyJ0b3RhbCIsImxhYmVsIl0sInYiOlt7InQiOjAsInMiOjJ9LHsidCI6MSwicyI6ImRvbmUifV19LCJvIjowfV19Cg==",
			responseBase64: true,
			isSerialized: true,
			responseContentType: "application/x-tss-framed",
		});
		const text = entrySearchText(entry);
		expect(text).toContain("rows");
	});
});
