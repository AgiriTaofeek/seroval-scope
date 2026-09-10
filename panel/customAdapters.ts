import { createPlugin, type Plugin } from "seroval";

import { serovalPlugins } from "./serovalPlugins.ts";

// A TanStack Start app can register its own `serializationAdapters` (via
// createStart). router-core turns each into a seroval plugin tagged
// `$TSR/t/<key>`, whose wire node is `{ t:25, c:"$TSR/t/<key>", s:{ v:<inner> } }`
// and whose `deserialize` does `adapter.fromSerializable(ctx.deserialize(node.v))`.
//
// The panel can't run the app's `fromSerializable`, but it doesn't need to:
// `ctx.deserialize(node.v)` alone yields the *serializable form* — the plain
// data the adapter round-trips through — which is exactly what's worth showing.
// So for every custom tag found in a payload we register a tolerant plugin that
// stops at that serializable form and wraps it with a marker.

const ADAPTER_TAG_PREFIX = "$TSR/t/";

const KNOWN_TAGS = new Set(
	serovalPlugins
		.map((p) => (p as { tag?: unknown }).tag)
		.filter((t): t is string => typeof t === "string"),
);

export interface AdapterValue {
	__serovalscopeAdapter: string;
	value: unknown;
}

export function isAdapterValue(v: unknown): v is AdapterValue {
	return (
		typeof v === "object" &&
		v !== null &&
		typeof (v as AdapterValue).__serovalscopeAdapter === "string" &&
		"value" in v
	);
}

/** `$TSR/t/money` -> `money`; anything else is returned unchanged. */
export function shortAdapterName(tag: string): string {
	return tag.startsWith(ADAPTER_TAG_PREFIX)
		? tag.slice(ADAPTER_TAG_PREFIX.length)
		: tag;
}

/**
 * Walks a parsed seroval Cross node and collects every plugin tag (`c` field)
 * that isn't handled by a built-in plugin — i.e. the app's own adapters.
 */
export function discoverAdapterTags(
	node: unknown,
	out: Set<string> = new Set(),
): Set<string> {
	if (Array.isArray(node)) {
		for (const child of node) discoverAdapterTags(child, out);
		return out;
	}
	if (node && typeof node === "object") {
		const tag = (node as { c?: unknown }).c;
		if (typeof tag === "string" && !KNOWN_TAGS.has(tag)) out.add(tag);
		for (const value of Object.values(node)) discoverAdapterTags(value, out);
	}
	return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlugin = Plugin<any, any>;

function makeTolerantPlugin(tag: string, label: string): AnyPlugin {
	return createPlugin({
		tag,
		// Never matches on the serialize side — this plugin is deserialize-only.
		test: () => false,
		parse: {},
		serialize: undefined as never,
		deserialize: (node, ctx) => {
			const n = node as { v?: unknown; s?: unknown };
			const inner =
				n && typeof n === "object" && "v" in n
					? ctx.deserialize(n.v as never)
					: n && typeof n === "object" && "s" in n
						? ctx.deserialize(n.s as never)
						: undefined;
			return { __serovalscopeAdapter: label, value: inner } satisfies AdapterValue;
		},
	}) as AnyPlugin;
}

/**
 * Tolerant plugins for the given tags, so a payload using a custom adapter
 * decodes to its underlying data instead of failing the whole response.
 * `labels` maps either a full tag or its short name to a display label.
 */
export function buildAdapterPlugins(
	tags: Iterable<string>,
	labels: Record<string, string> = {},
): AnyPlugin[] {
	return [...tags].map((tag) =>
		makeTolerantPlugin(
			tag,
			labels[tag] ?? labels[shortAdapterName(tag)] ?? shortAdapterName(tag),
		),
	);
}
