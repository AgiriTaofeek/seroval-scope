import { describe, expect, test } from "vitest";

import { compileSearch } from "./search.ts";
import type { CapturedEntry } from "./types.ts";

function entry(overrides: Partial<CapturedEntry>): CapturedEntry {
	return {
		id: "0",
		url: "http://localhost:3000/_serverFn/getUser",
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

describe("compileSearch — text mode", () => {
	test("empty query matches everything", () => {
		const s = compileSearch("  ", "text");
		expect(s.empty).toBe(true);
		expect(s.test(entry({}))).toBe(true);
	});

	test("case-insensitive substring over decoded content", () => {
		const s = compileSearch("ADA", "text");
		expect(s.test(entry({ responseRaw: '{"name":"ada lovelace"}' }))).toBe(true);
		expect(s.test(entry({ responseRaw: '{"name":"bob"}' }))).toBe(false);
	});
});

describe("compileSearch — regex mode", () => {
	test("matches decoded content against a JS regex", () => {
		const s = compileSearch("na\\w+e", "regex");
		expect(s.test(entry({ responseRaw: '{"name":"x"}' }))).toBe(true);
	});

	test("reports an invalid regex instead of throwing", () => {
		const s = compileSearch("(unclosed", "regex");
		expect(s.error).toBeTruthy();
		expect(s.test(entry({}))).toBe(false);
	});
});

describe("compileSearch — key path mode", () => {
	const withResponse = (value: unknown) =>
		entry({
			isSerialized: false,
			responseRaw: JSON.stringify(value),
		});

	test("matches a nested key's value by substring", () => {
		const s = compileSearch("user.email=ADA", "path");
		expect(s.test(withResponse({ user: { email: "ada@x.com" } }))).toBe(true);
		expect(s.test(withResponse({ user: { email: "bob@x.com" } }))).toBe(false);
	});

	test("traverses arrays element-wise", () => {
		const s = compileSearch("items.sku=abc", "path");
		expect(
			s.test(withResponse({ items: [{ sku: "xyz" }, { sku: "ABC-1" }] })),
		).toBe(true);
	});

	test("accepts colon as the separator too", () => {
		const s = compileSearch("status:paid", "path");
		expect(s.test(withResponse({ status: "paid" }))).toBe(true);
	});

	test("reports a malformed query", () => {
		expect(compileSearch("noSeparator", "path").error).toBeTruthy();
		expect(compileSearch("=novalue", "path").error).toBeTruthy();
	});

	test("does not match a key that is absent", () => {
		const s = compileSearch("missing.key=x", "path");
		expect(s.test(withResponse({ present: 1 }))).toBe(false);
	});
});
