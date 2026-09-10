import { describe, expect, test } from "vitest";

import { toCurl, toServerFnCall, toTypeScript } from "./copyAs.ts";

const devIdUrl =
	"http://localhost:3000/_serverFn/eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

describe("toServerFnCall", () => {
	test("uses the decoded export name and pretty-prints the payload", () => {
		const call = toServerFnCall(
			{ url: devIdUrl },
			{ data: { id: 5, note: "void it" } },
		);
		expect(call).toBe(
			'voidInvoice({\n\tdata: {\n\t\tid: 5,\n\t\tnote: "void it"\n\t}\n})',
		);
	});

	test("no-arg call when there is no payload", () => {
		expect(toServerFnCall({ url: devIdUrl }, undefined)).toBe("voidInvoice()");
	});

	test("falls back to a generic name for an unknown id", () => {
		expect(toServerFnCall({ url: "http://x/_serverFn/abc" }, undefined)).toBe(
			"serverFn()",
		);
	});

	test("quotes keys that aren't valid identifiers", () => {
		expect(toServerFnCall({ url: devIdUrl }, { "weird-key": 1 })).toContain(
			'"weird-key": 1',
		);
	});
});

describe("toCurl", () => {
	test("GET call keeps the payload in the URL, no body", () => {
		const curl = toCurl({
			url: "http://localhost:3000/_serverFn/x?payload=%7B%7D",
			method: "GET",
			requestRaw: "{}",
			requestContentType: null,
		});
		expect(curl).toContain("curl 'http://localhost:3000/_serverFn/x?payload=%7B%7D'");
		expect(curl).toContain("-H 'x-tsr-serverFn: true'");
		expect(curl).not.toContain("--data-raw");
	});

	test("POST call sends the raw wire body and content type", () => {
		const curl = toCurl({
			url: "http://localhost:3000/_serverFn/x",
			method: "POST",
			requestRaw: '{"t":0,"s":1}',
			requestContentType: "application/json",
		});
		expect(curl).toContain("-X POST");
		expect(curl).toContain("--data-raw '{\"t\":0,\"s\":1}'");
		expect(curl).toContain("-H 'content-type: application/json'");
	});

	test("escapes single quotes in the body the POSIX way", () => {
		const curl = toCurl({
			url: "http://x/_serverFn/y",
			method: "POST",
			requestRaw: `{"s":"O'Brien"}`,
			requestContentType: "application/json",
		});
		expect(curl).toContain(`'{"s":"O'\\''Brien"}'`);
	});
});

describe("toTypeScript", () => {
	test("infers object and array structure", () => {
		const ts = toTypeScript({
			id: 1,
			name: "Ada",
			tags: ["a", "b"],
			meta: { active: true },
		});
		expect(ts).toBe(
			[
				"type Result = {",
				"\tid: number;",
				"\tname: string;",
				"\ttags: string[];",
				"\tmeta: {",
				"\t\tactive: boolean;",
				"\t};",
				"};",
			].join("\n"),
		);
	});

	test("unions mixed array member types and handles empty arrays", () => {
		expect(toTypeScript({ xs: [1, "two"] })).toContain("xs: (number | string)[]");
		expect(toTypeScript({ xs: [] })).toContain("xs: unknown[]");
	});

	test("names Date and Error, and guards against cycles", () => {
		const cyclic: Record<string, unknown> = { when: new Date() };
		cyclic.self = cyclic;
		const ts = toTypeScript(cyclic);
		expect(ts).toContain("when: Date;");
		expect(ts).toContain("self: unknown;");
	});
});
