import { defaultSerovalPlugins } from "@tanstack/router-core";

// @tanstack/start-client-core also exports a getDefaultSerovalPlugins()
// wrapper, but it's not usable here: it internally calls getStartOptions(),
// which — absent TanStack Start's own build-time isomorphic-function
// transform (a Start-specific Vite plugin this WXT project doesn't have) —
// falls back to its .server() implementation unconditionally
// (@tanstack/start-fn-stubs' createIsomorphicFn resolves to whichever of
// .client()/.server() was chained last, and getStartOptions.js chains
// .server() last). That implementation calls
// @tanstack/start-storage-context's getStartContext(), which throws
// ("No Start context found in AsyncLocalStorage...") whenever there's no
// live TanStack Start server request in flight — always true here. Verified
// by reading both packages directly, not assumed.
//
// defaultSerovalPlugins is the static array of Start's built-in plugins
// (ShallowErrorPlugin, RawStreamSSRPlugin, ReadableStreamPlugin) with none
// of that coupling — safe to import anywhere. The one thing it doesn't
// cover: a given TanStack Start app's own custom serializationAdapters
// (configured via that app's createStart() options), which really do only
// exist inside a live app instance. A payload using a genuinely custom
// adapter type falls through to deserialize.ts's raw-JSON fallback instead
// of decoding cleanly — the correct degrade-gracefully behavior for that
// case, not a bug.
export const serovalPlugins = defaultSerovalPlugins;
