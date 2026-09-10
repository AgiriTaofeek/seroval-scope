// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { CapturedEntry } from "../types.ts";
import { ReplaySection } from "./ReplaySection.tsx";

function entry(overrides: Partial<CapturedEntry> = {}): CapturedEntry {
	return {
		id: "0",
		url: "http://localhost:3000/_serverFn/x",
		method: "POST",
		status: 200,
		time: 0,
		requestRaw: '{"t":10,"s":1}',
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

describe("ReplaySection", () => {
	test("is hidden for form-data entries", () => {
		const { container } = render(
			<ReplaySection entry={entry({ isFormData: true })} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("pre-fills the editor with the captured wire payload and can copy the expression", () => {
		const writeText = vi.fn();
		Object.assign(navigator, { clipboard: { writeText } });
		render(<ReplaySection entry={entry()} />);
		fireEvent.click(screen.getByRole("button", { name: "Replay…" }));
		expect(screen.getByRole("textbox")).toHaveValue('{"t":10,"s":1}');
		fireEvent.click(screen.getByRole("button", { name: "Copy fetch expression" }));
		expect(writeText.mock.calls[0][0]).toContain('body: "{\\"t\\":10,\\"s\\":1}"');
	});

	test("shows the eval-unavailable message when Send is used outside DevTools", async () => {
		render(<ReplaySection entry={entry()} />);
		fireEvent.click(screen.getByRole("button", { name: "Replay…" }));
		fireEvent.click(screen.getByRole("button", { name: "Send" }));
		await waitFor(() =>
			expect(screen.getByText(/inspectedWindow\.eval is unavailable/)).toBeInTheDocument(),
		);
	});
});
