import { describe, expect, test } from "vitest";

import { formatDuration, normalizeTimings, timingBreakdown } from "./timing.ts";

describe("normalizeTimings", () => {
	test("returns null when there is neither a total nor a timings object", () => {
		expect(normalizeTimings(undefined, undefined)).toBeNull();
		expect(normalizeTimings(undefined, null)).toBeNull();
	});

	test("uses HAR `time` as the total and keeps the known phases", () => {
		const t = normalizeTimings(153, {
			blocked: 1,
			dns: -1,
			connect: -1,
			ssl: -1,
			send: 0.2,
			wait: 140,
			receive: 11,
		});
		expect(t).toEqual({
			total: 153,
			blocked: 1,
			dns: 0,
			connect: 0,
			ssl: 0,
			send: 0.2,
			wait: 140,
			receive: 11,
		});
	});

	test("collapses the HAR -1 'not applicable' sentinel to 0", () => {
		const t = normalizeTimings(10, { wait: -1, receive: -1, blocked: -1 });
		expect(t?.wait).toBe(0);
		expect(t?.receive).toBe(0);
		expect(t?.blocked).toBe(0);
	});

	test("falls back to the sum of phases when `time` is missing", () => {
		const t = normalizeTimings(undefined, { wait: 100, receive: 20, send: 5 });
		expect(t?.total).toBe(125);
	});

	test("does not double-count ssl inside connect", () => {
		const t = normalizeTimings(undefined, {
			connect: 30,
			ssl: 20,
			wait: 10,
		});
		// 30 (connect, ssl already inside it) + 10 (wait) — ssl not added again.
		expect(t?.total).toBe(40);
		expect(t?.ssl).toBe(20);
	});
});

describe("formatDuration", () => {
	test.each([
		[0.4, "<1 ms"],
		[12, "12 ms"],
		[12.6, "13 ms"],
		[840, "840 ms"],
		[1234, "1.23 s"],
		[12345, "12.3 s"],
	])("formats %d ms as %s", (ms, expected) => {
		expect(formatDuration(ms)).toBe(expected);
	});

	test("renders a dash for nonsense input", () => {
		expect(formatDuration(-5)).toBe("—");
		expect(formatDuration(Number.NaN)).toBe("—");
	});
});

describe("timingBreakdown", () => {
	test("drops zero-length phases and leads with waiting then download", () => {
		const rows = timingBreakdown({
			total: 100,
			blocked: 0,
			dns: 0,
			connect: 0,
			ssl: 0,
			send: 0,
			wait: 80,
			receive: 20,
		});
		expect(rows).toEqual([
			{ label: "Waiting (TTFB)", ms: 80 },
			{ label: "Content download", ms: 20 },
		]);
	});
});
