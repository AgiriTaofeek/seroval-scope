import { describe, expect, test } from "vitest";

import {
	ALL_METHODS,
	ALL_STATUSES,
	distinctMethods,
	filterEntries,
} from "./filters.ts";
import type { CapturedEntry } from "./types.ts";

function entry(overrides: Partial<CapturedEntry>): CapturedEntry {
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

describe("filterEntries", () => {
	test("with all filters at their 'no filter' value, returns every entry", () => {
		const entries = [entry({ id: "a" }), entry({ id: "b", method: "GET" })];
		expect(
			filterEntries(entries, {
				search: "",
				method: ALL_METHODS,
				status: ALL_STATUSES,
			}),
		).toHaveLength(2);
	});

	test("filters by exact method", () => {
		const entries = [
			entry({ id: "a", method: "GET" }),
			entry({ id: "b", method: "POST" }),
		];
		const result = filterEntries(entries, {
			search: "",
			method: "GET",
			status: ALL_STATUSES,
		});
		expect(result.map((e) => e.id)).toEqual(["a"]);
	});

	test("filters by status bucket", () => {
		const entries = [
			entry({ id: "ok", status: 200 }),
			entry({ id: "redirect", status: 302 }),
			entry({ id: "notfound", status: 404 }),
			entry({ id: "servererror", status: 500 }),
		];
		expect(
			filterEntries(entries, { search: "", method: ALL_METHODS, status: "4xx" })
				.map((e) => e.id),
		).toEqual(["notfound"]);
	});

	test("combines method, status, and search filters (all must match)", () => {
		const entries = [
			entry({ id: "match", method: "GET", status: 200, responseRaw: '{"x":"needle"}' }),
			entry({ id: "wrong-method", method: "POST", status: 200, responseRaw: '{"x":"needle"}' }),
			entry({ id: "wrong-status", method: "GET", status: 500, responseRaw: '{"x":"needle"}' }),
			entry({ id: "wrong-search", method: "GET", status: 200, responseRaw: '{"x":"other"}' }),
		];
		const result = filterEntries(entries, {
			search: "needle",
			method: "GET",
			status: "2xx",
		});
		expect(result.map((e) => e.id)).toEqual(["match"]);
	});

	test("search matches decoded content, case-insensitively", () => {
		const entries = [entry({ id: "a", responseRaw: '{"hello":"World"}' })];
		const result = filterEntries(entries, {
			search: "world",
			method: ALL_METHODS,
			status: ALL_STATUSES,
		});
		expect(result.map((e) => e.id)).toEqual(["a"]);
	});
});

describe("distinctMethods", () => {
	test("returns unique methods sorted alphabetically", () => {
		const entries = [
			entry({ method: "POST" }),
			entry({ method: "GET" }),
			entry({ method: "GET" }),
		];
		expect(distinctMethods(entries)).toEqual(["GET", "POST"]);
	});

	test("returns an empty array for no entries", () => {
		expect(distinctMethods([])).toEqual([]);
	});
});
