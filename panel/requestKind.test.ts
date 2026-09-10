import { describe, expect, test } from "vitest";

import { classifyRequest, requestKindLabel } from "./requestKind.ts";

const devId =
	"eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

describe("classifyRequest", () => {
	test("recognises the /_serverFn/ route", () => {
		expect(classifyRequest("http://localhost:3000/_serverFn/anything")).toBe(
			"server-fn",
		);
	});

	test("recognises a decodable dev function id even on a custom base path", () => {
		expect(classifyRequest(`http://localhost:3000/api/rpc/${devId}`)).toBe(
			"server-fn",
		);
	});

	test("flags router data / loader round-trips", () => {
		expect(
			classifyRequest("http://localhost:3000/dashboard?_data=/dashboard"),
		).toBe("route-data");
		expect(classifyRequest("http://localhost:3000/__data/posts")).toBe(
			"route-data",
		);
	});

	test("everything else is 'other'", () => {
		expect(classifyRequest("http://localhost:3000/api/health")).toBe("other");
		expect(classifyRequest("not a url")).toBe("other");
	});
});

describe("requestKindLabel", () => {
	test("short labels for the list column", () => {
		expect(requestKindLabel("server-fn")).toBe("fn");
		expect(requestKindLabel("route-data")).toBe("data");
		expect(requestKindLabel("other")).toBe("—");
	});
});
