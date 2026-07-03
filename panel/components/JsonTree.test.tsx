// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { JsonTree } from "./JsonTree.tsx";

describe("JsonTree", () => {
	test("renders 'undefined' for an undefined value", () => {
		render(<JsonTree value={undefined} />);
		expect(screen.getByText("undefined")).toBeInTheDocument();
	});

	test("renders primitives as plain text, not through the JSON tree view", () => {
		render(<JsonTree value={42} />);
		expect(screen.getByText("42")).toBeInTheDocument();
	});

	test("renders a string primitive as plain text", () => {
		render(<JsonTree value="hello" />);
		expect(screen.getByText("hello")).toBeInTheDocument();
	});

	test("renders objects through the JSON tree view", () => {
		render(<JsonTree value={{ name: "example", count: 3 }} />);
		expect(screen.getByText(/name/)).toBeInTheDocument();
		expect(screen.getByText(/example/)).toBeInTheDocument();
	});

	test("renders arrays through the JSON tree view", () => {
		render(<JsonTree value={["needle-a", "needle-b"]} />);
		expect(screen.getByText(/needle-a/)).toBeInTheDocument();
		expect(screen.getByText(/needle-b/)).toBeInTheDocument();
	});

	describe("click-to-copy on leaf values", () => {
		afterEach(() => {
			vi.useRealTimers();
			vi.restoreAllMocks();
		});

		test("clicking a string value copies the unquoted raw value and shows a Copied indicator", () => {
			const writeText = vi.fn();
			Object.assign(navigator, { clipboard: { writeText } });

			render(<JsonTree value={{ name: "example" }} />);
			fireEvent.click(screen.getByText('"example"'));

			expect(writeText).toHaveBeenCalledWith("example");
			expect(screen.getByRole("status")).toHaveTextContent("Copied");
		});

		test("the Copied indicator disappears after a short delay", () => {
			vi.useFakeTimers();
			Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

			render(<JsonTree value={{ name: "example" }} />);
			fireEvent.click(screen.getByText('"example"'));
			expect(screen.getByRole("status")).toBeInTheDocument();

			act(() => {
				vi.advanceTimersByTime(1000);
			});
			expect(screen.queryByRole("status")).not.toBeInTheDocument();
		});

		test("clicking a field label (not a value) does not copy anything", () => {
			const writeText = vi.fn();
			Object.assign(navigator, { clipboard: { writeText } });

			render(<JsonTree value={{ name: "example" }} />);
			fireEvent.click(screen.getByText(/name/));

			expect(writeText).not.toHaveBeenCalled();
			expect(screen.queryByRole("status")).not.toBeInTheDocument();
		});

		test("clicking a number value copies it without quotes", () => {
			const writeText = vi.fn();
			Object.assign(navigator, { clipboard: { writeText } });

			render(<JsonTree value={{ count: 42 }} />);
			fireEvent.click(screen.getByText("42"));

			expect(writeText).toHaveBeenCalledWith("42");
		});
	});
});
