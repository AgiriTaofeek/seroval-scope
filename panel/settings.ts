import { storage } from "wxt/utils/storage";

import type { FunctionIdManifest } from "./functionName.ts";
import type { SearchMode } from "./search.ts";

// `defaultValue` on defineItem's options is deprecated in favor of
// `fallback` (confirmed in @wxt-dev/storage's current type defs) — using
// the current API, not the older name some docs/examples still show.
export const urlPatternSetting = storage.defineItem<string>("local:urlPattern", {
	fallback: "_serverFn/",
});

export const clearOnNavigateSetting = storage.defineItem<boolean>(
	"local:clearOnNavigate",
	{ fallback: false },
);

export const searchModeSetting = storage.defineItem<SearchMode>(
	"local:searchMode",
	{ fallback: "text" },
);

export const groupByFunctionSetting = storage.defineItem<boolean>(
	"local:groupByFunction",
	{ fallback: false },
);

// "system" defers to the DevTools / OS theme; the other two force it.
export const themeOverrideSetting = storage.defineItem<
	"system" | "light" | "dark"
>("local:themeOverride", { fallback: "system" });

// A production id -> source map the user pastes in (built at deploy time), so
// hashed prod RPC ids can still be named. Stored as-is; may be large-ish but
// these are just short strings.
export const functionIdManifestSetting = storage.defineItem<FunctionIdManifest>(
	"local:functionIdManifest",
	{ fallback: {} },
);

// Optional display labels for the app's own seroval serialization adapters,
// keyed by adapter tag or its short name (e.g. { "money": "Money (cents)" }).
// Decoding works without this; it's only cosmetic.
export const adapterLabelsSetting = storage.defineItem<Record<string, string>>(
	"local:adapterLabels",
	{ fallback: {} },
);
