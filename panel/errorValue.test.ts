import { describe, expect, test } from "vitest";

import { normalizeError } from "./errorValue.ts";

describe("normalizeError", () => {
	test("reads name and message off a real Error instance", () => {
		const e = new TypeError("bad input");
		expect(normalizeError(e)).toEqual({
			name: "TypeError",
			message: "bad input",
			fromErrorInstance: true,
		});
	});

	test("treats a bare string as the message", () => {
		expect(normalizeError("something broke")).toEqual({
			name: "Error",
			message: "something broke",
			fromErrorInstance: false,
		});
	});

	test("keeps extra fields from an error-shaped plain object and drops stack", () => {
		const result = normalizeError({
			name: "ZodError",
			message: "validation failed",
			stack: "…noise…",
			code: "E_VALIDATION",
			issues: [{ path: ["email"] }],
		});
		expect(result).toEqual({
			name: "ZodError",
			message: "validation failed",
			fromErrorInstance: false,
			extra: { code: "E_VALIDATION", issues: [{ path: ["email"] }] },
		});
	});

	test("defaults the name to Error when the object has no usable name", () => {
		expect(normalizeError({ message: "x" })?.name).toBe("Error");
	});

	test("returns null for values that aren't plausibly errors", () => {
		expect(normalizeError({ id: 1 })).toBeNull();
		expect(normalizeError(42)).toBeNull();
		expect(normalizeError(null)).toBeNull();
		expect(normalizeError(undefined)).toBeNull();
	});
});
