import { describe, expect, test } from "vitest";

import { groupEntries } from "./grouping.ts";
import type { CapturedEntry, EntryTimings } from "./types.ts";

// A real dev id decodes to /src/lib/api/invoices.ts#voidInvoice.
const devId =
	"eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

function timings(total: number): EntryTimings {
	return { total, blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: total, receive: 0 };
}

function entry(overrides: Partial<CapturedEntry>): CapturedEntry {
	return {
		id: "0",
		url: `http://localhost:3000/_serverFn/${devId}`,
		method: "POST",
		status: 200,
		time: 0,
		requestRaw: null,
		responseRaw: "hello world",
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

describe("groupEntries", () => {
	test("collapses repeated calls to one server function and aggregates", () => {
		const groups = groupEntries([
			entry({ id: "0", timings: timings(100) }),
			entry({ id: "1", timings: timings(50), status: 500 }),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			label: "voidInvoice",
			file: "/src/lib/api/invoices.ts",
			count: 2,
			totalMs: 150,
			errorCount: 1,
		});
		expect(groups[0].totalBytes).toBeGreaterThan(0);
	});

	test("keeps distinct functions in separate groups, first-seen order", () => {
		const groups = groupEntries([
			entry({ id: "0", url: "http://localhost:3000/_serverFn/aaaa" }),
			entry({ id: "1", url: `http://localhost:3000/_serverFn/${devId}` }),
			entry({ id: "2", url: "http://localhost:3000/_serverFn/aaaa" }),
		]);
		expect(groups.map((g) => g.key)).toEqual([
			"aaaa",
			"/src/lib/api/invoices.ts#voidInvoice",
		]);
		expect(groups[0].count).toBe(2);
	});
});
