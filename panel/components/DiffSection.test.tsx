// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { CapturedEntry } from "../types.ts";
import { DiffSection } from "./DiffSection.tsx";

const devId =
	"eyJmaWxlIjoiL3NyYy9saWIvYXBpL2ludm9pY2VzLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InZvaWRJbnZvaWNlX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

function entry(overrides: Partial<CapturedEntry>): CapturedEntry {
	return {
		id: "0",
		url: `http://localhost:3000/_serverFn/${devId}`,
		method: "POST",
		status: 200,
		time: 0,
		requestRaw: null,
		responseRaw: "{}",
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

describe("DiffSection", () => {
	test("renders nothing when there is no other call of the same function", () => {
		const { container } = render(
			<DiffSection current={entry({ id: "0" })} entries={[entry({ id: "0" })]} manifest={null} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("diffs the decoded responses of two calls of the same function", () => {
		const a = entry({ id: "0", responseRaw: '{"total":10,"label":"x"}' });
		const b = entry({ id: "1", responseRaw: '{"total":12,"label":"x"}' });
		render(<DiffSection current={b} entries={[a, b]} manifest={null} />);

		fireEvent.click(screen.getByRole("button", { name: /Diff vs\. another call/ }));
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "0" } });

		const changeRow = screen.getByText(/~\s*total/).closest("tr")!;
		expect(changeRow.textContent).toContain("10");
		expect(changeRow.textContent).toContain("→");
		expect(changeRow.textContent).toContain("12");
	});

	test("says so when the two responses are identical", () => {
		const a = entry({ id: "0", responseRaw: '{"same":1}' });
		const b = entry({ id: "1", responseRaw: '{"same":1}' });
		render(<DiffSection current={b} entries={[a, b]} manifest={null} />);
		fireEvent.click(screen.getByRole("button", { name: /Diff vs/ }));
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "0" } });
		expect(screen.getByText(/structurally identical/)).toBeInTheDocument();
	});
});
