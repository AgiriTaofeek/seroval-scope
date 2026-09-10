import { describe, expect, test } from "vitest";

import {
	decodeDevFunctionId,
	decodeServerFnUrl,
	resolveFromManifest,
	resolveFunctionId,
	serverFnIdSegment,
} from "./functionName.ts";

describe("decodeDevFunctionId", () => {
	// Real id captured from subpilot-web's dev server: `curl
	// localhost:3000/src/lib/api/invoices.ts` returns
	// createClientRpc("eyJmaWxl...") verbatim in the compiled source, and
	// decoding it (confirmed via Buffer.from(id, "base64url")) gives exactly
	// this {file, export} shape.
	const realDevId =
		"eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

	test("decodes a real dev-mode id into the source file and function name", () => {
		const result = decodeDevFunctionId(realDevId);
		expect(result).toEqual({
			file: "/src/lib/api/invoices.ts",
			exportName: "voidInvoice",
		});
	});

	test("strips a deduplication suffix from the handler name", () => {
		const json = JSON.stringify({
			file: "/src/lib/api/foo.ts?tss-serverfn-split",
			export: "createUser_createServerFn_handler_2",
		});
		const id = Buffer.from(json, "utf8").toString("base64url");
		expect(decodeDevFunctionId(id)).toEqual({
			file: "/src/lib/api/foo.ts",
			exportName: "createUser",
		});
	});

	test("returns null (not a throw) for a production sha256 id", () => {
		// A real production id is 64 lowercase hex chars, not valid base64url JSON.
		const shaLikeId = "a".repeat(64);
		expect(decodeDevFunctionId(shaLikeId)).toBeNull();
	});

	test("returns null for garbage input instead of throwing", () => {
		expect(decodeDevFunctionId("not-valid-base64!!!")).toBeNull();
	});

	test("returns null when the decoded JSON is missing the expected shape", () => {
		const id = Buffer.from(JSON.stringify({ unrelated: true }), "utf8").toString(
			"base64url",
		);
		expect(decodeDevFunctionId(id)).toBeNull();
	});
});

describe("decodeServerFnUrl", () => {
	const realDevId =
		"eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

	test("extracts and decodes the id from the last path segment of a real capture URL", () => {
		const result = decodeServerFnUrl(
			`http://localhost:3000/_serverFn/${realDevId}`,
		);
		expect(result).toMatchObject({
			file: "/src/lib/api/invoices.ts",
			exportName: "voidInvoice",
			source: "dev",
		});
	});

	test("still works with a custom (non-default) base path", () => {
		const result = decodeServerFnUrl(
			`http://localhost:3000/api/rpc/${realDevId}`,
		);
		expect(result?.exportName).toBe("voidInvoice");
	});

	test("returns null for an unparseable URL", () => {
		expect(decodeServerFnUrl("not a url")).toBeNull();
	});

	test("returns null for a non-server-fn URL whose last segment isn't a valid id", () => {
		expect(decodeServerFnUrl("http://localhost:3000/api/health")).toBeNull();
	});
});

describe("serverFnIdSegment", () => {
	test("returns the last path segment", () => {
		expect(
			serverFnIdSegment("http://localhost:3000/_serverFn/abc123?payload=x"),
		).toBe("abc123");
	});

	test("returns null for an unparseable URL", () => {
		expect(serverFnIdSegment("nope")).toBeNull();
	});
});

describe("production id resolution via manifest", () => {
	const prodHash = "a".repeat(64);
	const manifest = {
		[prodHash]: { file: "/src/api/billing.ts", exportName: "charge" },
	};

	test("resolveFunctionId falls back to the manifest for a sha256 id", () => {
		expect(resolveFunctionId(prodHash, manifest)).toEqual({
			file: "/src/api/billing.ts",
			exportName: "charge",
			source: "manifest",
		});
	});

	test("resolveFunctionId returns null for an unmapped prod id", () => {
		expect(resolveFunctionId("b".repeat(64), manifest)).toBeNull();
	});

	test("dev ids still resolve without a manifest and are marked source 'dev'", () => {
		const id =
			"eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";
		expect(resolveFunctionId(id)?.source).toBe("dev");
	});

	test("resolveFromManifest matches a unique hash prefix", () => {
		expect(resolveFromManifest("aaaa", manifest)?.exportName).toBe("charge");
	});

	test("resolveFromManifest refuses an ambiguous prefix", () => {
		const ambiguous = {
			abcd1: { file: "a.ts", exportName: "a" },
			abcd2: { file: "b.ts", exportName: "b" },
		};
		expect(resolveFromManifest("abcd", ambiguous)).toBeNull();
	});
});
