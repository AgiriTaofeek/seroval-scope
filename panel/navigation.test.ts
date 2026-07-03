import { describe, expect, test, vi } from "vitest";

import { startNavigationClear } from "./navigation.ts";

type Listener = (url: string) => void;

function installFakeChromeNavigation() {
	const listeners = new Set<Listener>();
	const fakeChrome = {
		devtools: {
			network: {
				onNavigated: {
					addListener: (fn: Listener) => listeners.add(fn),
					removeListener: (fn: Listener) => listeners.delete(fn),
				},
			},
		},
	};
	// @ts-expect-error -- test-only global, real type comes from @types/chrome
	globalThis.chrome = fakeChrome;
	return {
		fire: (url: string) => {
			for (const fn of [...listeners]) fn(url);
		},
		listenerCount: () => listeners.size,
	};
}

describe("startNavigationClear", () => {
	test("calls onNavigate when the tab navigates", () => {
		const fake = installFakeChromeNavigation();
		const onNavigate = vi.fn();
		startNavigationClear(onNavigate);

		fake.fire("http://localhost:3000/other-page");

		expect(onNavigate).toHaveBeenCalledTimes(1);
	});

	test("a throwing callback does not break subsequent navigation events", () => {
		const fake = installFakeChromeNavigation();
		const onNavigate = vi.fn(() => {
			throw new Error("boom");
		});
		startNavigationClear(onNavigate);

		expect(() => fake.fire("http://localhost:3000/a")).not.toThrow();
		fake.fire("http://localhost:3000/b");

		expect(onNavigate).toHaveBeenCalledTimes(2);
	});

	test("the returned unsubscribe function stops future notifications", () => {
		const fake = installFakeChromeNavigation();
		const onNavigate = vi.fn();
		const stop = startNavigationClear(onNavigate);

		expect(fake.listenerCount()).toBe(1);
		stop();
		expect(fake.listenerCount()).toBe(0);

		fake.fire("http://localhost:3000/a");
		expect(onNavigate).not.toHaveBeenCalled();
	});
});
