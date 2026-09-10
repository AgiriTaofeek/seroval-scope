import { afterEach, describe, expect, test, vi } from "vitest";

import { openFunctionSource, sourceUrlCandidates } from "./openSource.ts";

describe("sourceUrlCandidates", () => {
	test("builds origin-prefixed variants and strips a query cache-buster", () => {
		expect(
			sourceUrlCandidates(
				{ file: "/src/api/invoices.ts?tss-serverfn-split" },
				"http://localhost:3000",
			),
		).toEqual([
			"http://localhost:3000/src/api/invoices.ts",
			"/src/api/invoices.ts",
		]);
	});
});

describe("openFunctionSource", () => {
	afterEach(() => {
		delete (globalThis as { chrome?: unknown }).chrome;
		vi.restoreAllMocks();
	});

	test("returns a reason (not a throw) when there is no decoded id", async () => {
		expect(await openFunctionSource(null)).toEqual({
			ok: false,
			reason: expect.stringContaining("unknown"),
		});
	});

	test("returns a reason when the DevTools API is unavailable", async () => {
		expect(await openFunctionSource({ file: "/src/x.ts" })).toEqual({
			ok: false,
			reason: expect.stringContaining("unavailable"),
		});
	});

	test("opens the matching resource when one is loaded", async () => {
		const openResource = vi.fn(
			(_url: string, _line: number, cb?: () => void) => cb?.(),
		);
		(globalThis as { chrome?: unknown }).chrome = {
			devtools: {
				panels: { openResource },
				inspectedWindow: {
					eval: (_e: string, cb: (r: unknown) => void) =>
						cb("http://localhost:3000"),
					getResources: (cb: (r: { url: string }[]) => void) =>
						cb([{ url: "http://localhost:3000/src/api/invoices.ts" }]),
				},
			},
		};

		const result = await openFunctionSource({
			file: "/src/api/invoices.ts?tss-serverfn-split",
		});
		expect(result.ok).toBe(true);
		expect(openResource).toHaveBeenCalledWith(
			"http://localhost:3000/src/api/invoices.ts",
			0,
			expect.any(Function),
		);
	});

	test("reports when the source isn't among the loaded resources", async () => {
		(globalThis as { chrome?: unknown }).chrome = {
			devtools: {
				panels: { openResource: vi.fn() },
				inspectedWindow: {
					eval: (_e: string, cb: (r: unknown) => void) => cb("http://localhost:3000"),
					getResources: (cb: (r: { url: string }[]) => void) => cb([]),
				},
			},
		};
		const result = await openFunctionSource({ file: "/src/missing.ts" });
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("/src/missing.ts");
	});
});
