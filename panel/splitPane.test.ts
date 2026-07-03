import { describe, expect, test } from "vitest";

import {
	clampPanePercent,
	MAX_PANE_PERCENT,
	MIN_PANE_PERCENT,
	percentFromPointerX,
} from "./splitPane.ts";

describe("clampPanePercent", () => {
	test("passes values within range through unchanged", () => {
		expect(clampPanePercent(50)).toBe(50);
	});

	test("clamps values below the minimum", () => {
		expect(clampPanePercent(-10)).toBe(MIN_PANE_PERCENT);
		expect(clampPanePercent(0)).toBe(MIN_PANE_PERCENT);
	});

	test("clamps values above the maximum", () => {
		expect(clampPanePercent(110)).toBe(MAX_PANE_PERCENT);
		expect(clampPanePercent(100)).toBe(MAX_PANE_PERCENT);
	});
});

describe("percentFromPointerX", () => {
	test("computes the percentage of the container width to the left of the pointer", () => {
		const container = { left: 0, width: 1000 };
		expect(percentFromPointerX(250, container)).toBe(25);
		expect(percentFromPointerX(750, container)).toBe(75);
	});

	test("accounts for the container's left offset, not just viewport x", () => {
		const container = { left: 200, width: 800 };
		expect(percentFromPointerX(600, container)).toBe(50);
	});

	test("clamps out-of-range pointer positions to the pane bounds", () => {
		const container = { left: 0, width: 1000 };
		expect(percentFromPointerX(-500, container)).toBe(MIN_PANE_PERCENT);
		expect(percentFromPointerX(5000, container)).toBe(MAX_PANE_PERCENT);
	});

	test("returns 50 for a zero-width container instead of dividing by zero", () => {
		expect(percentFromPointerX(100, { left: 0, width: 0 })).toBe(50);
	});
});
