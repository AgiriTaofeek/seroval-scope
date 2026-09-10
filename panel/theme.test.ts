import { describe, expect, test } from "vitest";

import { DARK, LIGHT, resolveThemeName, tokensFor } from "./theme.ts";

describe("resolveThemeName", () => {
	test("honours the DevTools panel theme name", () => {
		expect(resolveThemeName("dark")).toBe("dark");
		expect(resolveThemeName("default")).toBe("light");
		expect(resolveThemeName("light")).toBe("light");
	});

	test("falls back to the OS preference when the panel theme is unknown", () => {
		expect(resolveThemeName(undefined, true)).toBe("dark");
		expect(resolveThemeName(undefined, false)).toBe("light");
		expect(resolveThemeName("weird-future-value", true)).toBe("dark");
	});
});

describe("token sets", () => {
	test("light and dark expose the same keys", () => {
		expect(Object.keys(LIGHT).sort()).toEqual(Object.keys(DARK).sort());
	});

	test("tokensFor selects the matching set", () => {
		expect(tokensFor("dark")).toBe(DARK);
		expect(tokensFor("light")).toBe(LIGHT);
	});
});
