import { afterEach, describe, expect, test, vi } from "vitest";

import { startCapture } from "./capture.ts";
import type { CapturedEntry } from "./types.ts";

type Listener = (request: unknown) => void;

// chrome.devtools.network.onRequestFinished is a plain listener-list event —
// this fake reproduces just enough of it (add/removeListener + a way to fire
// a fake request) for capture.ts's own logic to run against.
function installFakeChromeNetwork() {
	const listeners = new Set<Listener>();
	const fakeChrome = {
		devtools: {
			network: {
				onRequestFinished: {
					addListener: (fn: Listener) => listeners.add(fn),
					removeListener: (fn: Listener) => listeners.delete(fn),
				},
			},
		},
	};
	// @ts-expect-error -- test-only global, real type comes from @types/chrome
	globalThis.chrome = fakeChrome;
	return {
		fire: (request: unknown) => {
			for (const fn of [...listeners]) fn(request);
		},
		listenerCount: () => listeners.size,
	};
}

function makeRequest(overrides: {
	url: string;
	method?: string;
	postData?: { mimeType?: string; text?: string };
	requestHeaders?: { name: string; value: string }[];
	responseHeaders?: { name: string; value: string }[];
	status?: number;
	content?: string;
	contentEncoding?: string;
	mimeType?: string;
	startedDateTime?: string;
	time?: number;
	timings?: Record<string, number>;
}) {
	return {
		request: {
			url: overrides.url,
			method: overrides.method ?? "POST",
			postData: overrides.postData,
			headers: overrides.requestHeaders ?? [],
		},
		response: {
			status: overrides.status ?? 200,
			headers: overrides.responseHeaders ?? [],
			content: { mimeType: overrides.mimeType ?? "application/json" },
		},
		startedDateTime: overrides.startedDateTime ?? "2026-07-03T00:00:00.000Z",
		time: overrides.time ?? -1,
		timings: overrides.timings,
		getContent: (cb: (body: string | null, encoding: string) => void) => {
			cb(overrides.content ?? "", overrides.contentEncoding ?? "");
		},
	};
}

describe("startCapture", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("ignores requests whose URL does not include the pattern", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(makeRequest({ url: "http://localhost:3000/api/health" }));

		expect(onEntry).not.toHaveBeenCalled();
	});

	test("captures a matching POST request with a JSON body", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/getInvoiceSummary",
				method: "POST",
				postData: { mimeType: "application/json", text: '{"data":1}' },
				responseHeaders: [{ name: "x-tss-serialized", value: "true" }],
				content: '{"t":0,"s":1}',
				status: 200,
			}),
		);

		expect(onEntry).toHaveBeenCalledTimes(1);
		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.url).toBe("http://localhost:3000/_serverFn/getInvoiceSummary");
		expect(entry.method).toBe("POST");
		expect(entry.status).toBe(200);
		expect(entry.requestRaw).toBe('{"data":1}');
		expect(entry.responseRaw).toBe('{"t":0,"s":1}');
		expect(entry.isSerialized).toBe(true);
		expect(entry.isFormData).toBe(false);
	});

	test("extracts the request payload from ?payload= for GET requests", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/getInvoiceSummary?payload=%7B%22data%22%3A1%7D",
				method: "GET",
			}),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.requestRaw).toBe('{"data":1}');
	});

	test("returns null requestRaw for a GET request with no ?payload= param", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({ url: "http://localhost:3000/_serverFn/ping", method: "GET" }),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.requestRaw).toBeNull();
	});

	test("flags multipart/form-data requests and skips request body extraction", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/uploadFile",
				postData: { mimeType: "multipart/form-data", text: "--boundary..." },
			}),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.isFormData).toBe(true);
		expect(entry.requestRaw).toBeNull();
	});

	test("flags application/x-www-form-urlencoded requests as form data too", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/submitForm",
				postData: {
					mimeType: "application/x-www-form-urlencoded",
					text: "a=1&b=2",
				},
			}),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.isFormData).toBe(true);
	});

	test("header lookup is case-insensitive and requires the literal value 'true'", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/a",
				responseHeaders: [{ name: "X-TSS-Serialized", value: "true" }],
			}),
		);
		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/b",
				responseHeaders: [{ name: "x-tss-serialized", value: "false" }],
			}),
		);

		expect((onEntry.mock.calls[0][0] as CapturedEntry).isSerialized).toBe(true);
		expect((onEntry.mock.calls[1][0] as CapturedEntry).isSerialized).toBe(false);
	});

	test("captures response content-type, raw-passthrough, location, and base64 flag", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/streamy",
				responseHeaders: [
					{ name: "x-tss-serialized", value: "true" },
					{ name: "content-type", value: "application/x-tss-framed; v=1" },
					{ name: "x-tss-raw", value: "true" },
					{ name: "location", value: "/login" },
				],
				mimeType: "application/x-tss-framed",
				content: "AAAA",
				contentEncoding: "base64",
			}),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.responseContentType).toBe("application/x-tss-framed");
		expect(entry.responseBase64).toBe(true);
		expect(entry.isRawPassthrough).toBe(true);
		expect(entry.location).toBe("/login");
	});

	test("captures server-timing and the x-serovalscope-upstream header", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/a",
				responseHeaders: [
					{ name: "server-timing", value: "db;dur=12" },
					{
						name: "x-serovalscope-upstream",
						value: '[{"method":"GET","url":"/api/x"}]',
					},
				],
			}),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.serverTiming).toBe("db;dur=12");
		expect(entry.upstreamHeader).toBe('[{"method":"GET","url":"/api/x"}]');
	});

	test("normalizes HAR timings when present", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/a",
				time: 150,
				timings: { wait: 140, receive: 10, blocked: -1 },
			}),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.timings).toEqual({
			total: 150,
			blocked: 0,
			dns: 0,
			connect: 0,
			ssl: 0,
			send: 0,
			wait: 140,
			receive: 10,
		});
	});

	test("detects form data from the request Content-Type header when postData is absent", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(
			makeRequest({
				url: "http://localhost:3000/_serverFn/upload",
				requestHeaders: [
					{ name: "content-type", value: "multipart/form-data; boundary=xyz" },
				],
			}),
		);

		const entry = onEntry.mock.calls[0][0] as CapturedEntry;
		expect(entry.isFormData).toBe(true);
		expect(entry.requestContentType).toBe("multipart/form-data; boundary=xyz");
	});

	test("assigns increasing ids across multiple captured entries", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		fake.fire(makeRequest({ url: "http://localhost:3000/_serverFn/a" }));
		fake.fire(makeRequest({ url: "http://localhost:3000/_serverFn/b" }));

		const firstId = (onEntry.mock.calls[0][0] as CapturedEntry).id;
		const secondId = (onEntry.mock.calls[1][0] as CapturedEntry).id;
		expect(firstId).not.toBe(secondId);
	});

	test("a malformed request never throws out of the listener and does not block later requests", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("/_serverFn", onEntry);

		const broken = {
			request: null, // accessing request.request.url below will throw
		};

		expect(() => fake.fire(broken)).not.toThrow();
		expect(onEntry).not.toHaveBeenCalled();

		fake.fire(makeRequest({ url: "http://localhost:3000/_serverFn/ok" }));
		expect(onEntry).toHaveBeenCalledTimes(1);
	});

	test("empty pattern matches nothing (falsy pattern short-circuits)", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		startCapture("", onEntry);

		fake.fire(makeRequest({ url: "http://localhost:3000/_serverFn/a" }));

		expect(onEntry).not.toHaveBeenCalled();
	});

	test("the returned unsubscribe function stops further capture", () => {
		const fake = installFakeChromeNetwork();
		const onEntry = vi.fn();
		const stop = startCapture("/_serverFn", onEntry);

		expect(fake.listenerCount()).toBe(1);
		stop();
		expect(fake.listenerCount()).toBe(0);

		fake.fire(makeRequest({ url: "http://localhost:3000/_serverFn/a" }));
		expect(onEntry).not.toHaveBeenCalled();
	});
});
