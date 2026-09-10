// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// wxt/utils/storage needs a real extension environment; back it with a plain
// in-memory map for the panel test.
vi.mock("wxt/utils/storage", () => {
	const store = new Map<string, unknown>();
	return {
		storage: {
			defineItem<T>(key: string, opts: { fallback: T }) {
				return {
					getValue: () =>
						Promise.resolve(store.has(key) ? (store.get(key) as T) : opts.fallback),
					setValue: (v: T) => {
						store.set(key, v);
						return Promise.resolve();
					},
				};
			},
		},
	};
});

import App from "./App.tsx";

type CaptureListener = (request: unknown) => void;
let listeners: Set<CaptureListener>;

function installChrome() {
	listeners = new Set();
	(globalThis as { chrome?: unknown }).chrome = {
		devtools: {
			panels: { themeName: "default" },
			network: {
				onRequestFinished: {
					addListener: (fn: CaptureListener) => listeners.add(fn),
					removeListener: (fn: CaptureListener) => listeners.delete(fn),
				},
				onNavigated: { addListener: () => {}, removeListener: () => {} },
			},
			inspectedWindow: {},
		},
	};
}

const devId =
	"eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

function fireRequest(overrides: {
	url?: string;
	content?: string;
	responseHeaders?: { name: string; value: string }[];
	status?: number;
}) {
	const request = {
		request: {
			url: overrides.url ?? `http://localhost:3000/_serverFn/${devId}`,
			method: "POST",
			postData: { mimeType: "application/json", text: '{"t":0,"s":1}' },
			headers: [],
		},
		response: {
			status: overrides.status ?? 200,
			headers: overrides.responseHeaders ?? [
				{ name: "x-tss-serialized", value: "true" },
			],
			content: { mimeType: "application/json" },
		},
		startedDateTime: "2026-07-03T00:00:00.000Z",
		time: 30,
		timings: { wait: 25, receive: 5 },
		getContent: (cb: (body: string, enc: string) => void) =>
			cb(overrides.content ?? '{"t":0,"s":1}', ""),
	};
	for (const fn of [...listeners]) fn(request);
}

describe("App panel", () => {
	beforeEach(() => {
		installChrome();
	});

	test("captures a request and shows it with an outcome badge and duration", async () => {
		render(<App />);
		await waitFor(() => expect(listeners.size).toBe(1));
		fireRequest({ content: '{"t":1,"s":"hello"}' });

		const row = await screen.findByText("voidInvoice");
		const tr = row.closest("tr")!;
		expect(within(tr).getByText("OK")).toBeInTheDocument();
		expect(within(tr).getByText("30 ms")).toBeInTheDocument();
	});

	test("surfaces a regex search error on the search input", async () => {
		render(<App />);
		await waitFor(() => expect(listeners.size).toBe(1));

		const modeSelect = screen.getAllByRole("combobox")[0];
		fireEvent.change(modeSelect, { target: { value: "regex" } });
		const input = screen.getByPlaceholderText(/Search decoded/);
		fireEvent.change(input, { target: { value: "(unclosed" } });

		await waitFor(() =>
			expect(input.getAttribute("title") ?? "").not.toBe(""),
		);
	});

	test("virtualizes a long list — off-screen rows are not in the DOM", async () => {
		render(<App />);
		await waitFor(() => expect(listeners.size).toBe(1));
		for (let i = 0; i < 300; i++) {
			fireRequest({ url: `http://localhost:3000/_serverFn/${devId}?n=${i}` });
		}
		await waitFor(() =>
			expect(screen.getAllByText("voidInvoice").length).toBeGreaterThan(0),
		);
		// 300 captured, but the virtual window renders far fewer than all of them.
		expect(screen.getAllByText("voidInvoice").length).toBeLessThan(300);
	});

	test("labels a non-server-fn capture with its request kind", async () => {
		render(<App />);
		await waitFor(() => expect(listeners.size).toBe(1));
		fireEvent.change(screen.getByPlaceholderText("URL pattern"), {
			target: { value: "localhost" },
		});
		await waitFor(() => expect(listeners.size).toBe(1));
		fireRequest({ url: "http://localhost:3000/dashboard?_data=/dashboard" });
		const row = await screen.findByText(/dashboard/);
		expect(row.closest("tr")!.textContent).toContain("data");
	});

	test("grouping collapses repeated calls to one function into a group row", async () => {
		render(<App />);
		await waitFor(() => expect(listeners.size).toBe(1));
		fireRequest({});
		fireRequest({});
		await screen.findAllByText("voidInvoice");

		fireEvent.click(screen.getByLabelText("Group"));
		expect(await screen.findByText(/×2/)).toBeInTheDocument();
	});
});
