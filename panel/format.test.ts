import { describe, expect, test } from "vitest";

import { entryByteSize, formatBytes } from "./format.ts";

describe("formatBytes", () => {
	test("formats zero and small byte counts without decimals", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
	});

	test("formats kilobytes with one decimal below 10, none at or above 10", () => {
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(20 * 1024)).toBe("20 KB");
	});

	test("formats megabytes and gigabytes", () => {
		expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
		expect(formatBytes(20 * 1024 * 1024 * 1024)).toBe("20 GB");
	});

	test("clamps negative byte counts to '0 B' rather than showing a negative size", () => {
		expect(formatBytes(-10)).toBe("0 B");
	});
});

describe("entryByteSize", () => {
	test("counts UTF-8 bytes, not UTF-16 character count", () => {
		// "café" is 4 JS characters but 5 UTF-8 bytes (é is 2 bytes).
		const size = entryByteSize({ requestRaw: null, responseRaw: "café" });
		expect(size.responseBytes).toBe(5);
		expect(size.requestBytes).toBe(0);
		expect(size.totalBytes).toBe(5);
	});

	test("sums request and response bytes into totalBytes", () => {
		const size = entryByteSize({ requestRaw: "abc", responseRaw: "de" });
		expect(size.requestBytes).toBe(3);
		expect(size.responseBytes).toBe(2);
		expect(size.totalBytes).toBe(5);
	});

	test("a null requestRaw (GET with no payload) contributes zero bytes", () => {
		const size = entryByteSize({ requestRaw: null, responseRaw: "abcd" });
		expect(size.requestBytes).toBe(0);
		expect(size.totalBytes).toBe(4);
	});
});
