// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { CapturedEntry } from "../types.ts";
import { RequestDetail } from "./RequestDetail.tsx";

function baseEntry(overrides: Partial<CapturedEntry>): CapturedEntry {
	return {
		id: "0",
		url: "http://localhost:3000/_serverFn/example",
		method: "POST",
		status: 200,
		time: 0,
		requestRaw: null,
		responseRaw: "",
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

function renderDetail(
	entry: CapturedEntry,
	entries: CapturedEntry[] = [entry],
) {
	return render(
		<RequestDetail
			entry={entry}
			entries={entries}
			manifest={null}
			onOpenSource={vi.fn()}
		/>,
	);
}

describe("RequestDetail", () => {
	test("renders decoded Request and Response sections for a normal entry", () => {
		renderDetail(baseEntry({ responseRaw: '{"hello":"world"}' }));
		expect(screen.getByText("Request")).toBeInTheDocument();
		expect(screen.getByText("Response")).toBeInTheDocument();
		expect(screen.getByText(/world/)).toBeInTheDocument();
	});

	test("a decode failure auto-selects the Raw view", () => {
		renderDetail(baseEntry({ responseRaw: "{not valid", isSerialized: true }));
		const [, responseRawButton] = screen.getAllByRole("button", { name: "Raw" });
		expect(responseRawButton).toBeDisabled();
		expect(screen.getByText(/Could not fully deserialize/)).toBeInTheDocument();
	});

	test("Copy copies the outcome-unwrapped decoded value", () => {
		const writeText = vi.fn();
		Object.assign(navigator, { clipboard: { writeText } });
		// Envelope: the Response Copy should give `.result`, not the whole envelope.
		const ENV_OK =
			'{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":10,"i":1,"p":{"k":["id"],"v":[{"t":0,"s":7}]},"o":0},{"t":2,"s":1},{"t":10,"i":2,"p":{"k":[],"v":[]},"o":0}]},"o":0}';
		renderDetail(baseEntry({ responseRaw: ENV_OK, isSerialized: true }));
		const [, responseCopyButton] = screen.getAllByRole("button", { name: "Copy" });
		fireEvent.click(responseCopyButton);
		expect(writeText).toHaveBeenCalledWith(JSON.stringify({ id: 7 }, null, 2));
	});

	test("shows an outcome banner and error message for a caught server error on a 200", () => {
		const ENV_ERR =
			'{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":2,"s":1},{"t":25,"i":1,"s":{"message":{"t":1,"s":"Not authorized"}},"c":"$TSR/Error"},{"t":10,"i":2,"p":{"k":[],"v":[]},"o":0}]},"o":0}';
		renderDetail(baseEntry({ responseRaw: ENV_ERR, isSerialized: true }));
		expect(screen.getByText(/Not authorized/)).toBeInTheDocument();
		expect(screen.getByText("ERROR ⚠")).toBeInTheDocument();
	});

	test("classifies and labels a redirect", () => {
		renderDetail(
			baseEntry({ status: 307, location: "/login", responseRaw: "" }),
		);
		expect(screen.getByText("redirect() → /login")).toBeInTheDocument();
	});

	test("decodes form-data instead of showing a 'not supported' notice", () => {
		renderDetail(
			baseEntry({
				isFormData: true,
				requestContentType: "application/x-www-form-urlencoded",
				requestRaw: "title=Report&draft=true",
			}),
		);
		expect(screen.getByText("Form data")).toBeInTheDocument();
		expect(screen.getByText("Report")).toBeInTheDocument();
		expect(screen.queryByText("Request")).not.toBeInTheDocument();
	});

	test("resolves a streamed response's deferred values in the tree", async () => {
		const framedBase64 =
			"AAAAAAAAAAFteyJ0IjoxMCwiaSI6MCwicCI6eyJrIjpbInJlc3VsdCIsImVycm9yIiwiY29udGV4dCJdLCJ2IjpbeyJ0IjoxMCwiaSI6MSwicCI6eyJrIjpbInJvd3MiLCJwZW5kaW5nIl0sInYiOlt7InQiOjksImkiOjIsImEiOlt7InQiOjEwLCJpIjozLCJwIjp7ImsiOlsiaWQiXSwidiI6W3sidCI6MCwicyI6MX1dfSwibyI6MH0seyJ0IjoxMCwiaSI6NCwicCI6eyJrIjpbImlkIl0sInYiOlt7InQiOjAsInMiOjJ9XX0sIm8iOjB9XSwibyI6MH0seyJ0IjoyMiwiaSI6NSwicyI6NiwiZiI6eyJ0IjoyNiwiaSI6NywicyI6MX19XX0sIm8iOjB9LHsidCI6MiwicyI6MX0seyJ0IjoxMCwiaSI6OCwicCI6eyJrIjpbXSwidiI6W119LCJvIjowfV19LCJvIjowfQoAAAAAAAAAAIN7InQiOjIzLCJpIjo2LCJhIjpbeyJ0IjoyNiwiaSI6MTAsInMiOjJ9LHsidCI6MTAsImkiOjksInAiOnsiayI6WyJ0b3RhbCIsImxhYmVsIl0sInYiOlt7InQiOjAsInMiOjJ9LHsidCI6MSwicyI6ImRvbmUifV19LCJvIjowfV19Cg==";
		renderDetail(
			baseEntry({
				responseRaw: framedBase64,
				responseBase64: true,
				isSerialized: true,
				responseContentType: "application/x-tss-framed",
			}),
		);
		expect(screen.getAllByText(/streamed/).length).toBeGreaterThan(0);
		await waitFor(() =>
			expect(screen.getByText(/"done"/)).toBeInTheDocument(),
		);
	});

	test("shows a hint when no backend calls were reported", () => {
		renderDetail(baseEntry({ responseRaw: "{}" }));
		expect(screen.getByText(/isn't visible to\s+DevTools/)).toBeInTheDocument();
	});

	test("decodes a payload that uses a custom serialization adapter and notes it", () => {
		// { result: { total: <adapter $TSR/t/money> }, error, context }
		const body = JSON.stringify({
			t: 10,
			i: 0,
			p: {
				k: ["result", "error", "context"],
				v: [
					{
						t: 10,
						i: 1,
						p: {
							k: ["total"],
							v: [
								{
									t: 25,
									i: 2,
									s: {
										v: {
											t: 10,
											i: 3,
											p: { k: ["cents"], v: [{ t: 0, s: 1999 }] },
											o: 0,
										},
									},
									c: "$TSR/t/money",
								},
							],
						},
						o: 0,
					},
					{ t: 2, s: 1 },
					{ t: 10, i: 4, p: { k: [], v: [] }, o: 0 },
				],
			},
			o: 0,
		});
		renderDetail(baseEntry({ responseRaw: body, isSerialized: true }));
		expect(
			screen.getByText(/Custom serialization adapter.*money/),
		).toBeInTheDocument();
		// The tree shows the tolerant wrapper rather than failing the whole decode.
		expect(screen.getByText(/__serovalscopeAdapter/)).toBeInTheDocument();
	});

	test("lists reported backend calls from the upstream header", () => {
		renderDetail(
			baseEntry({
				responseRaw: "{}",
				upstreamHeader: '[{"method":"GET","url":"/api/v2/invoices","status":200,"ms":42}]',
			}),
		);
		expect(screen.getByText("/api/v2/invoices")).toBeInTheDocument();
		expect(screen.getByText("42 ms")).toBeInTheDocument();
	});
});
