// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

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
		isSerialized: false,
		isFormData: false,
		...overrides,
	};
}

describe("RequestDetail", () => {
	test("shows the not-decoded notice for form-data entries instead of Request/Response sections", () => {
		render(
			<RequestDetail
				entry={baseEntry({ isFormData: true, requestRaw: "--boundary..." })}
			/>,
		);

		expect(screen.getByText(/not decoded in v1/)).toBeInTheDocument();
		expect(screen.queryByText("Request")).not.toBeInTheDocument();
	});

	test("renders decoded Request and Response sections for a normal entry", () => {
		render(
			<RequestDetail
				entry={baseEntry({ responseRaw: '{"hello":"world"}' })}
			/>,
		);

		expect(screen.getByText("Request")).toBeInTheDocument();
		expect(screen.getByText("Response")).toBeInTheDocument();
		expect(screen.getByText(/world/)).toBeInTheDocument();
	});

	test("a decode failure auto-selects the Raw view instead of an empty Decoded tree", () => {
		render(
			<RequestDetail
				entry={baseEntry({ responseRaw: "{not valid", isSerialized: true })}
			/>,
		);

		// Only the Response section fails to decode here (requestRaw is null,
		// which decodes cleanly to `undefined`) — so only its Raw button
		// should come up pre-selected/disabled.
		const [, responseRawButton] = screen.getAllByRole("button", { name: "Raw" });
		expect(responseRawButton).toBeDisabled();
		expect(
			screen.getByText(/Could not fully deserialize/),
		).toBeInTheDocument();
	});

	test("switching to Raw shows the wire-format text, switching back to Decoded shows the tree", () => {
		render(
			<RequestDetail
				entry={baseEntry({ responseRaw: '{"hello":"world"}' })}
			/>,
		);

		const [, responseRawButton] = screen.getAllByRole("button", { name: "Raw" });
		fireEvent.click(responseRawButton);
		// Raw view for a non-serialized response is JSON.stringify of the raw
		// wire text itself (a JSON string literal), not a pretty-printed
		// object — hence the escaped quotes rather than `"hello": "world"`.
		expect(screen.getByText(/\\"hello\\":\\"world\\"/)).toBeInTheDocument();

		const [, responseDecodedButton] = screen.getAllByRole("button", {
			name: "Decoded",
		});
		fireEvent.click(responseDecodedButton);
		expect(screen.getByText(/world/)).toBeInTheDocument();
		expect(screen.getByRole("tree")).toBeInTheDocument();
	});

	test("Copy copies the decoded value (not the raw wire text) to the clipboard", () => {
		const writeText = vi.fn();
		Object.assign(navigator, { clipboard: { writeText } });

		render(
			<RequestDetail
				entry={baseEntry({ responseRaw: '{"hello":"world"}' })}
			/>,
		);

		const [, responseCopyButton] = screen.getAllByRole("button", {
			name: "Copy",
		});
		fireEvent.click(responseCopyButton);

		expect(writeText).toHaveBeenCalledWith(JSON.stringify({ hello: "world" }, null, 2));
	});
});
