// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ErrorBoundaryFallback } from "./ErrorBoundaryFallback.tsx";

function Bomb(): never {
	throw new Error("boom");
}

describe("ErrorBoundaryFallback", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("renders children normally when nothing throws", () => {
		render(
			<ErrorBoundaryFallback>
				<span>fine</span>
			</ErrorBoundaryFallback>,
		);
		expect(screen.getByText("fine")).toBeInTheDocument();
	});

	test("catches a render error from a child and shows a fallback message instead of crashing", () => {
		// React logs the caught error to console.error too; silence it so the
		// test output isn't noisy with an error that's expected and handled.
		vi.spyOn(console, "error").mockImplementation(() => {});

		render(
			<ErrorBoundaryFallback>
				<Bomb />
			</ErrorBoundaryFallback>,
		);

		expect(screen.getByText(/Failed to render this value/)).toBeInTheDocument();
		expect(screen.getByText(/boom/)).toBeInTheDocument();
	});
});
