// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { CapturedEntry } from "../types.ts";
import { CopyAsMenu } from "./CopyAsMenu.tsx";

const devIdUrl =
	"http://localhost:3000/_serverFn/eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

function entry(overrides: Partial<CapturedEntry> = {}): CapturedEntry {
	return {
		id: "0",
		url: devIdUrl,
		method: "POST",
		status: 200,
		time: 0,
		requestRaw: '{"t":0}',
		responseRaw: "{}",
		responseBase64: false,
		isSerialized: false,
		responseContentType: "application/json",
		isFormData: false,
		requestContentType: "application/json",
		isRawPassthrough: false,
		location: null,
		timings: null,
		serverTiming: null,
		upstreamHeader: null,
		...overrides,
	};
}

describe("CopyAsMenu", () => {
	test("copies a server-fn call built from the decoded request", () => {
		const writeText = vi.fn();
		Object.assign(navigator, { clipboard: { writeText } });
		render(
			<CopyAsMenu
				entry={entry()}
				requestValue={{ data: { id: 3 } }}
				responseValue={{ ok: true }}
				manifest={null}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "server-fn call" }));
		expect(writeText).toHaveBeenCalledWith(
			'voidInvoice({\n\tdata: {\n\t\tid: 3\n\t}\n})',
		);
		expect(screen.getByText(/copied to clipboard/)).toBeInTheDocument();
	});

	test("copies a curl command and a response type", () => {
		const writeText = vi.fn();
		Object.assign(navigator, { clipboard: { writeText } });
		render(
			<CopyAsMenu
				entry={entry()}
				requestValue={undefined}
				responseValue={{ id: 1, name: "x" }}
				manifest={null}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "curl" }));
		expect(writeText.mock.calls[0][0]).toContain("curl '");

		fireEvent.click(screen.getByRole("button", { name: "response type" }));
		expect(writeText.mock.calls[1][0]).toContain("type Response = {");
	});
});
