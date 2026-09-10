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

const baseFilters = {
	search: "",
	searchMode: "text" as const,
	method: ALL_METHODS,
	status: ALL_STATUSES,
};

describe("filterEntries", () => {
	test("with all filters at their 'no filter' value, returns every entry", () => {
		const entries = [entry({ id: "a" }), entry({ id: "b", method: "GET" })];
		expect(filterEntries(entries, baseFilters).entries).toHaveLength(2);
	});

	test("filters by exact method", () => {
		const entries = [
			entry({ id: "a", method: "GET" }),
			entry({ id: "b", method: "POST" }),
		];
		expect(
			filterEntries(entries, { ...baseFilters, method: "GET" }).entries.map(
				(e) => e.id,
			),
		).toEqual(["a"]);
	});

	test("filters by status bucket", () => {
		const entries = [
			entry({ id: "ok", status: 200 }),
			entry({ id: "redirect", status: 302 }),
			entry({ id: "notfound", status: 404 }),
			entry({ id: "servererror", status: 500 }),
		];
		expect(
			filterEntries(entries, { ...baseFilters, status: "4xx" }).entries.map(
				(e) => e.id,
			),
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
			...baseFilters,
			search: "needle",
			method: "GET",
			status: "2xx",
		});
		expect(result.entries.map((e) => e.id)).toEqual(["match"]);
	});

	test("surfaces a search-syntax error and matches nothing", () => {
		const result = filterEntries([entry({})], {
			...baseFilters,
			search: "(bad",
			searchMode: "regex",
		});
		expect(result.searchError).toBeTruthy();
		expect(result.entries).toEqual([]);
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
