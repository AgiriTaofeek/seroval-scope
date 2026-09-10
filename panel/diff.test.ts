import { describe, expect, test } from "vitest";

import { diffValues } from "./diff.ts";

describe("diffValues", () => {
	test("no changes for deep-equal values", () => {
		expect(
			diffValues({ a: 1, b: [1, 2, { c: 3 }] }, { a: 1, b: [1, 2, { c: 3 }] }),
		).toEqual([]);
	});

	test("reports a changed leaf with before/after and a dotted path", () => {
		expect(diffValues({ user: { age: 30 } }, { user: { age: 31 } })).toEqual([
			{ path: "user.age", kind: "changed", before: 30, after: 31 },
		]);
	});

	test("reports added and removed keys", () => {
		const changes = diffValues({ a: 1 }, { b: 2 });
		expect(changes).toContainEqual({ path: "a", kind: "removed", before: 1 });
		expect(changes).toContainEqual({ path: "b", kind: "added", after: 2 });
	});

	test("uses bracket notation for array indices and handles length changes", () => {
		const changes = diffValues([1, 2, 3], [1, 9]);
		expect(changes).toContainEqual({
			path: "[1]",
			kind: "changed",
			before: 2,
			after: 9,
		});
		expect(changes).toContainEqual({ path: "[2]", kind: "removed", before: 3 });
	});

	test("treats a type change (object <-> scalar) as a single change", () => {
		expect(diffValues({ x: { nested: true } }, { x: "now a string" })).toEqual([
			{ path: "x", kind: "changed", before: { nested: true }, after: "now a string" },
		]);
	});

	test("NaN equals NaN; distinct dates compare by time", () => {
		expect(diffValues({ n: Number.NaN }, { n: Number.NaN })).toEqual([]);
		const changes = diffValues(
			{ d: new Date("2026-01-01") },
			{ d: new Date("2026-01-02") },
		);
		expect(changes).toHaveLength(1);
	});
});
