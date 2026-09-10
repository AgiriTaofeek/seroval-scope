import { describe, expect, test } from "vitest";

import { fromCrossJSON } from "seroval";

import {
	buildAdapterPlugins,
	discoverAdapterTags,
	isAdapterValue,
	shortAdapterName,
} from "./customAdapters.ts";
import { serovalPlugins } from "./serovalPlugins.ts";

// Real wire node for { result: { total: <Money> }, error, context } where Money
// is an app serialization adapter (key "money") — produced by running seroval's
// makeSerovalPlugin (from @tanstack/router-core) against a Money instance.
const NODE_WITH_ADAPTER = {
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
									p: {
										k: ["cents", "currency"],
										v: [
											{ t: 0, s: 1999 },
											{ t: 1, s: "USD" },
										],
									},
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
};

describe("shortAdapterName", () => {
	test("strips the $TSR/t/ prefix", () => {
		expect(shortAdapterName("$TSR/t/money")).toBe("money");
		expect(shortAdapterName("weird")).toBe("weird");
	});
});

describe("discoverAdapterTags", () => {
	test("finds custom adapter tags but not built-in ones", () => {
		const tags = discoverAdapterTags(NODE_WITH_ADAPTER);
		expect([...tags]).toEqual(["$TSR/t/money"]);
	});

	test("ignores $TSR/Error and other built-in plugin tags", () => {
		const node = { t: 25, c: "$TSR/Error", s: { message: { t: 1, s: "x" } } };
		expect([...discoverAdapterTags(node)]).toEqual([]);
	});

	test("returns nothing for a plain payload", () => {
		expect([...discoverAdapterTags({ t: 10, p: { k: ["a"], v: [{ t: 0, s: 1 }] } })]).toEqual(
			[],
		);
	});
});

describe("buildAdapterPlugins + fromCrossJSON", () => {
	test("a payload using a custom adapter decodes to its serializable form", () => {
		const tags = discoverAdapterTags(NODE_WITH_ADAPTER);
		const plugins = [...buildAdapterPlugins(tags), ...serovalPlugins];
		const value = fromCrossJSON(NODE_WITH_ADAPTER as never, {
			refs: new Map(),
			plugins,
		}) as { result: { total: unknown } };

		expect(isAdapterValue(value.result.total)).toBe(true);
		expect(value.result.total).toEqual({
			__serovalscopeAdapter: "money",
			value: { cents: 1999, currency: "USD" },
		});
	});

	test("a provided label is used instead of the short name", () => {
		const plugins = [
			...buildAdapterPlugins(["$TSR/t/money"], { money: "Money (cents)" }),
			...serovalPlugins,
		];
		const value = fromCrossJSON(NODE_WITH_ADAPTER as never, {
			refs: new Map(),
			plugins,
		}) as { result: { total: { __serovalscopeAdapter: string } } };
		expect(value.result.total.__serovalscopeAdapter).toBe("Money (cents)");
	});

	test("without the tolerant plugin the same payload throws", () => {
		expect(() =>
			fromCrossJSON(NODE_WITH_ADAPTER as never, { refs: new Map(), plugins: serovalPlugins }),
		).toThrow();
	});
});
