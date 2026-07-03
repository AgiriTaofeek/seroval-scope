import { describe, expect, test } from "vitest";

import { decodeRequest, decodeResponse, entrySearchText } from "./deserialize.ts";
import type { CapturedEntry } from "./types.ts";

describe("decodeResponse", () => {
	// Real /_serverFn/* response body, captured from subpilot-web's analytics
	// route. Ground-truth decoded value confirmed by running this exact
	// string through the real seroval package directly (fromCrossJSON) before
	// writing this test, not hand-computed from the type-tag docs.
	const realAnalyticsResponse =
		'{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":10,"i":1,"p":{"k":["points","granularity"],"v":[{"t":9,"i":2,"a":[{"t":10,"i":3,"p":{"k":["bucket","value"],"v":[{"t":1,"s":"2026-07-02"},{"t":0,"s":1}]},"o":0}],"o":0},{"t":1,"s":"daily"}]},"o":0},{"t":2,"s":1},{"t":11,"i":4,"p":{"k":[],"v":[]},"o":0}]},"o":0}';

	test("decodes a real seroval-serialized response", () => {
		const result = decodeResponse(realAnalyticsResponse, true);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// toEqual, not toStrictEqual: seroval faithfully preserves the
		// {}-vs-Object.create(null) distinction (the empty `context` here
		// really does decode with a null prototype, confirmed by running the
		// real package directly), which toStrictEqual treats as a mismatch.
		// That distinction is invisible and irrelevant for a JSON-tree display
		// tool, so value equality is the correct check here, not identity of
		// internal object shape.
		expect(result.value).toEqual({
			result: {
				points: [{ bucket: "2026-07-02", value: 1 }],
				granularity: "daily",
			},
			error: undefined,
			context: {},
		});
	});

	test("does not attempt seroval decoding when isSerialized is false, falls back to plain JSON", () => {
		const result = decodeResponse('{"hello":"world"}', false);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toStrictEqual({ hello: "world" });
	});

	test("falls back to raw text when a non-serialized response is neither seroval nor JSON", () => {
		const result = decodeResponse("not json at all", false);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe("not json at all");
	});

	test("returns a failure result (not a throw) for malformed seroval JSON", () => {
		const result = decodeResponse("{not valid json", true);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.rawText).toBe("{not valid json");
		expect(result.error.length).toBeGreaterThan(0);
	});
});

describe("decodeRequest", () => {
	// Real ?payload= value, generated via seroval's own toJSON() encoder for
	// { data: { rangeDays: 30, granularity: "daily" } } — round-tripped
	// through the real package before writing this test.
	const realRequestPayload =
		'{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["rangeDays","granularity"],"v":[{"t":0,"s":30},{"t":1,"s":"daily"}]},"o":0}]},"o":0},"f":63,"m":[]}';

	test("decodes a real request payload via fromJSON (tree mode, not fromCrossJSON)", () => {
		const result = decodeRequest(realRequestPayload);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toStrictEqual({
			data: { rangeDays: 30, granularity: "daily" },
		});
	});

	test("returns a clean 'no payload' result for GET calls with no ?payload= param", () => {
		const result = decodeRequest(null);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBeUndefined();
	});

	test("returns a failure result (not a throw) for malformed request payload JSON", () => {
		const result = decodeRequest("{not valid json");
		expect(result.ok).toBe(false);
	});
});

describe("entrySearchText", () => {
	function baseEntry(overrides: Partial<CapturedEntry>): CapturedEntry {
		return {
			id: "0",
			url: "http://localhost:3000/_serverFn/example",
			method: "POST",
			status: 200,
			time: 0,
			requestRaw: null,
			responseRaw: "",
			isSerialized: false,
			isFormData: false,
			...overrides,
		};
	}

	test("for form-data entries, only searches the URL (body isn't decoded)", () => {
		const entry = baseEntry({
			url: "http://localhost:3000/_serverFn/upload",
			isFormData: true,
			requestRaw: "--boundary\r\nsecret-field-name",
			responseRaw: '{"hello":"world"}',
		});

		const text = entrySearchText(entry);

		expect(text).toBe(entry.url);
		expect(text).not.toContain("secret-field-name");
	});

	test("includes decoded response content, not just the raw wire text", () => {
		const entry = baseEntry({
			responseRaw: '{"hello":"world"}',
			isSerialized: false,
		});

		expect(entrySearchText(entry).toLowerCase()).toContain("world");
	});

	test("includes decoded request content for POST bodies", () => {
		const entry = baseEntry({
			requestRaw:
				'{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":1,"s":"needle-value"}]},"o":0},"f":63,"m":[]}',
		});

		expect(entrySearchText(entry)).toContain("needle-value");
	});

	test("falls back to raw text without throwing when response is malformed seroval", () => {
		const entry = baseEntry({ responseRaw: "{not valid", isSerialized: true });

		expect(() => entrySearchText(entry)).not.toThrow();
		expect(entrySearchText(entry)).toContain("{not valid");
	});
});
