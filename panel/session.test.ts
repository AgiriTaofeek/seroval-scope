import { describe, expect, test } from "vitest";

import { parseSession, serializeSession } from "./session.ts";
import type { CapturedEntry } from "./types.ts";

function entry(overrides: Partial<CapturedEntry>): CapturedEntry {
	return {
		id: "0",
		url: "http://localhost:3000/_serverFn/x",
		method: "POST",
		status: 200,
		time: 123,
		requestRaw: null,
		responseRaw: '{"t":0,"s":1}',
		responseBase64: false,
		isSerialized: true,
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

describe("session round-trip", () => {
	test("serialize then parse preserves entries and pattern", () => {
		const entries = [entry({ id: "0" }), entry({ id: "1", method: "GET" })];
		const text = serializeSession("_serverFn/", entries);
		const parsed = parseSession(text);
		expect(parsed.pattern).toBe("_serverFn/");
		expect(parsed.entries).toEqual(entries);
	});

	test("the file carries a format marker and version", () => {
		const obj = JSON.parse(serializeSession("p", []));
		expect(obj.format).toBe("serovalscope-session");
		expect(obj.version).toBe(1);
		expect(typeof obj.exportedAt).toBe("string");
	});
});

describe("parseSession errors", () => {
	test("rejects non-JSON", () => {
		expect(() => parseSession("<<<")).toThrow(/valid JSON/);
	});

	test("rejects a file without the marker", () => {
		expect(() => parseSession(JSON.stringify({ entries: [] }))).toThrow(
			/marker/,
		);
	});

	test("rejects an unsupported version", () => {
		expect(() =>
			parseSession(
				JSON.stringify({ format: "serovalscope-session", version: 99, entries: [] }),
			),
		).toThrow(/version 99/);
	});

	test("rejects a file whose entries are malformed", () => {
		expect(() =>
			parseSession(
				JSON.stringify({
					format: "serovalscope-session",
					version: 1,
					entries: [{ nope: true }],
				}),
			),
		).toThrow(/malformed/);
	});
});

describe("parseSession migration", () => {
	test("fills in fields absent from an older minimal entry", () => {
		const minimal = {
			format: "serovalscope-session",
			version: 1,
			pattern: "_serverFn/",
			entries: [
				{ id: "0", url: "http://x/_serverFn/a", method: "POST", status: 200, responseRaw: "" },
			],
		};
		const parsed = parseSession(JSON.stringify(minimal));
		expect(parsed.entries[0]).toMatchObject({
			responseBase64: false,
			isSerialized: false,
			location: null,
			timings: null,
		});
	});
});
