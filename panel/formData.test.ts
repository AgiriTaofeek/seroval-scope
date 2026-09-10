import { describe, expect, test } from "vitest";

import { decodeFormData } from "./formData.ts";

describe("decodeFormData — urlencoded", () => {
	test("parses fields", () => {
		const result = decodeFormData(
			"name=Ada&role=admin",
			"application/x-www-form-urlencoded",
		);
		expect(result?.fields).toEqual([
			{ name: "name", value: "Ada", isContext: false },
			{ name: "role", value: "admin", isContext: false },
		]);
	});

	test("decodes the reserved __TSS_CONTEXT field as a seroval payload", () => {
		// { role: "admin" } in seroval tree mode.
		const ctx =
			'{"t":{"t":10,"i":0,"p":{"k":["role"],"v":[{"t":1,"s":"admin"}]},"o":0},"f":63,"m":[]}';
		const body = `name=Ada&${encodeURIComponent("__TSS_CONTEXT")}=${encodeURIComponent(ctx)}`;
		const result = decodeFormData(body, "application/x-www-form-urlencoded");
		expect(result?.context).toEqual({ role: "admin" });
		expect(result?.fields.find((f) => f.isContext)?.name).toBe("__TSS_CONTEXT");
	});
});

describe("decodeFormData — multipart", () => {
	const boundary = "----WebKitFormBoundaryABC";
	const ct = `multipart/form-data; boundary=${boundary}`;

	test("parses text fields and file parts", () => {
		const body = [
			`--${boundary}`,
			'Content-Disposition: form-data; name="title"',
			"",
			"Quarterly report",
			`--${boundary}`,
			'Content-Disposition: form-data; name="file"; filename="q3.pdf"',
			"Content-Type: application/pdf",
			"",
			"%PDF-1.4 fake bytes",
			`--${boundary}--`,
			"",
		].join("\r\n");

		const result = decodeFormData(body, ct);
		expect(result?.fields).toEqual([
			{ name: "title", value: "Quarterly report", isContext: false },
			{
				name: "file",
				value: "(file: q3.pdf)",
				filename: "q3.pdf",
				contentType: "application/pdf",
				size: "%PDF-1.4 fake bytes".length,
			},
		]);
	});

	test("returns null when the boundary is missing from the content type", () => {
		expect(decodeFormData("whatever", "multipart/form-data")).toBeNull();
	});
});

describe("decodeFormData — guards", () => {
	test("null body and non-form content types yield null", () => {
		expect(decodeFormData(null, "application/x-www-form-urlencoded")).toBeNull();
		expect(decodeFormData("a=1", "application/json")).toBeNull();
	});
});
