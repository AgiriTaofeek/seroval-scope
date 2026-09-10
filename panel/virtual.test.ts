import { describe, expect, test } from "vitest";

import { computeWindow } from "./virtual.ts";

describe("computeWindow", () => {
	const base = { rowHeight: 40, viewportHeight: 400, count: 1000, overscan: 5 };

	test("at the top: starts at 0, pads only the bottom", () => {
		const w = computeWindow({ ...base, scrollTop: 0 });
		expect(w.startIndex).toBe(0);
		expect(w.padTop).toBe(0);
		// 10 visible + 5 overscan
		expect(w.endIndex).toBe(15);
		expect(w.padBottom).toBe((1000 - 15) * 40);
	});

	test("scrolled into the middle: window tracks scrollTop with overscan both sides", () => {
		const w = computeWindow({ ...base, scrollTop: 4000 }); // row 100
		expect(w.startIndex).toBe(95);
		expect(w.endIndex).toBe(115);
		expect(w.padTop).toBe(95 * 40);
		expect(w.padBottom).toBe((1000 - 115) * 40);
	});

	test("clamps at the end", () => {
		const w = computeWindow({ ...base, scrollTop: 40 * 1000 });
		expect(w.endIndex).toBe(1000);
		expect(w.padBottom).toBe(0);
	});

	test("padTop + rendered + padBottom always equals the full scroll height", () => {
		for (const scrollTop of [0, 1234, 20000, 39999, 999999]) {
			const w = computeWindow({ ...base, scrollTop });
			const rendered = (w.endIndex - w.startIndex) * 40;
			expect(w.padTop + rendered + w.padBottom).toBe(1000 * 40);
		}
	});

	test("degenerate inputs render everything without spacers", () => {
		expect(computeWindow({ rowHeight: 0, viewportHeight: 400, count: 10, scrollTop: 0 })).toEqual({
			startIndex: 0,
			endIndex: 10,
			padTop: 0,
			padBottom: 0,
		});
		expect(computeWindow({ ...base, count: 0, scrollTop: 0 }).endIndex).toBe(0);
	});
});
