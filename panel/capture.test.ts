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
	responseHeaders?: { name: string; value: string }[];
	status?: number;
	content?: string;
	startedDateTime?: string;
}) {
	return {
		request: {
			url: overrides.url,
			method: overrides.method ?? "POST",
			postData: overrides.postData,
		},
		response: {
			status: overrides.status ?? 200,
			headers: overrides.responseHeaders ?? [],
		},
		startedDateTime: overrides.startedDateTime ?? "2026-07-03T00:00:00.000Z",
		getContent: (cb: (body: string | null) => void) => {
			cb(overrides.content ?? "");
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
