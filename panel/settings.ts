import { storage } from "wxt/utils/storage";

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
