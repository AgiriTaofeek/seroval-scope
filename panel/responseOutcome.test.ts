import { describe, expect, test } from "vitest";

import { decodeResponse } from "./deserialize.ts";
import { classifyResponse } from "./responseOutcome.ts";
import type { CapturedEntry, DecodeResult } from "./types.ts";

function entry(overrides: Partial<CapturedEntry>): CapturedEntry {
	return {
		id: "0",
		url: "http://localhost:3000/_serverFn/x",
		method: "POST",
		status: 200,
		time: 0,
		requestRaw: null,
		responseRaw: "",
		responseBase64: false,
		isSerialized: true,
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

// Real seroval Cross bodies from @tanstack/start-client-core's serializer.
const ENV_OK =
	'{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":10,"i":1,"p":{"k":["id","name"],"v":[{"t":0,"s":7},{"t":1,"s":"Ada"}]},"o":0},{"t":2,"s":1},{"t":10,"i":2,"p":{"k":[],"v":[]},"o":0}]},"o":0}';
const ENV_ERR =
	'{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":2,"s":1},{"t":25,"i":1,"s":{"message":{"t":1,"s":"Not authorized"}},"c":"$TSR/Error"},{"t":10,"i":2,"p":{"k":[],"v":[]},"o":0}]},"o":0}';
const ERR_ALONE =
	'{"t":25,"i":0,"s":{"message":{"t":1,"s":"Payment declined"}},"c":"$TSR/Error"}';

function decodeFor(e: CapturedEntry): DecodeResult {
	return decodeResponse(e);
}

describe("classifyResponse", () => {
	test("unwraps a successful envelope to its .result", () => {
		const e = entry({ responseRaw: ENV_OK });
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("ok");
		expect(outcome.display).toEqual({ id: 7, name: "Ada" });
		expect(outcome.hiddenInStatus).toBe(false);
	});

	test("detects an error carried in the envelope's .error branch on a 200", () => {
		const e = entry({ responseRaw: ENV_ERR });
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("error");
		expect(outcome.error).toMatchObject({ message: "Not authorized" });
		// 200 OK but the body says otherwise — this is the case the Network tab hides.
		expect(outcome.hiddenInStatus).toBe(true);
		expect(outcome.summary).toContain("Not authorized");
	});

	test("detects a bare serialized Error (server outer catch), default 500", () => {
		const e = entry({ responseRaw: ERR_ALONE, status: 500 });
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("error");
		expect(outcome.error?.message).toBe("Payment declined");
		expect(outcome.hiddenInStatus).toBe(false);
	});

	test("classifies a 404 with a notFound() body", () => {
		const e = entry({
			status: 404,
			isSerialized: false,
			responseRaw: '{"isNotFound":true,"data":{"route":"/x"}}',
		});
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("notFound");
		expect(outcome.hiddenInStatus).toBe(false);
	});

	test("classifies a 3xx with a Location header as a redirect and extracts the target", () => {
		const e = entry({
			status: 307,
			isSerialized: false,
			responseRaw: "",
			location: "/login",
		});
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("redirect");
		expect(outcome.redirectTo).toBe("/login");
		expect(outcome.summary).toBe("redirect() → /login");
	});

	test("detects a serialized redirect body returned with a 200", () => {
		const e = entry({
			isSerialized: false,
			responseRaw: '{"isSerializedRedirect":true,"options":{"href":"/dashboard"}}',
		});
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("redirect");
		expect(outcome.redirectTo).toBe("/dashboard");
		expect(outcome.hiddenInStatus).toBe(true);
	});

	test("flags a raw pass-through response", () => {
		const e = entry({
			isRawPassthrough: true,
			isSerialized: false,
			responseContentType: "text/csv",
			responseRaw: "a,b\n1,2\n",
		});
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("raw");
		expect(outcome.display).toBe("a,b\n1,2\n");
	});

	test("treats a 500 with an undecodable body as an error", () => {
		const e = entry({ status: 500, responseRaw: "{broken" });
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("error");
		expect(outcome.error?.name).toBe("Decode failed");
	});

	test("a plain non-envelope success value passes through untouched", () => {
		const e = entry({
			isSerialized: false,
			responseRaw: '{"anything":[1,2,3]}',
		});
		const outcome = classifyResponse(e, decodeFor(e));
		expect(outcome.kind).toBe("ok");
		expect(outcome.display).toEqual({ anything: [1, 2, 3] });
	});
});
