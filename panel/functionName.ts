export interface DecodedFunctionId {
	file: string;
	exportName: string;
	/** How the id was resolved — dev ids are self-describing, prod ids need a manifest. */
	source?: "dev" | "manifest";
}

/**
 * A user-supplied map from a production function id (the sha256 hex in the URL)
 * to its source location. TanStack Start's production compiler uses
 * `sha256(filename + "--" + functionName)` for this slot, which is one-way — so
 * the only way to name a prod call is to feed the panel a lookup table built at
 * build time. Keys may be the full 64-char hash or any unique prefix.
 */
export type FunctionIdManifest = Record<
	string,
	{ file: string; exportName: string }
>;

// The compiled handler variable is always named `${exportName}_createServerFn_handler`,
// with a `_N` suffix appended if TanStack Start had to deduplicate multiple
// server functions of the same name within one file (see
// incrementFunctionNameVersion in @tanstack/start-plugin-core). Strip both so
// the displayed name matches what's written in the source.
const HANDLER_SUFFIX = /_createServerFn_handler(?:_\d+)?$/;

// TSS_SERVERFN_SPLIT_PARAM in @tanstack/start-plugin-core — an internal
// query param on the extracted-handler module, not part of the real file path.
const SPLIT_PARAM_SUFFIX = /\?tss-serverfn-split$/;

function base64UrlDecode(input: string): string {
	const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	return atob(padded);
}

// Confirmed against subpilot-web's real dev server output (curl
// localhost:3000/src/lib/api/invoices.ts): TanStack Start's dev compiler
// encodes createServerFn's RPC id as base64url(JSON.stringify({file, export}))
// — see start-plugin-core's compiler.js generateFunctionId, dev-mode branch.
// This is reversible by design (it's how the dev server routes RPC calls
// back to source), not an intentional obfuscation. Production builds instead
// use `sha256(filename--functionName)` for this same id slot — a real hash,
// not base64 — so decoding correctly returns null there rather than garbage.
export function decodeDevFunctionId(idSegment: string): DecodedFunctionId | null {
	try {
		const parsed: unknown = JSON.parse(base64UrlDecode(idSegment));
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			typeof (parsed as Record<string, unknown>).file !== "string" ||
			typeof (parsed as Record<string, unknown>).export !== "string"
		) {
			return null;
		}
		const { file, export: exportName } = parsed as {
			file: string;
			export: string;
		};
		return {
			file: file.replace(SPLIT_PARAM_SUFFIX, ""),
			exportName: exportName.replace(HANDLER_SUFFIX, ""),
		};
	} catch {
		return null;
	}
}

// A production RPC id is 64 lowercase hex chars: sha256(file--exportName).
const PROD_ID = /^[0-9a-f]{64}$/;

/** Looks a raw id segment up in a user-supplied manifest (exact key or unique prefix). */
export function resolveFromManifest(
	idSegment: string,
	manifest: FunctionIdManifest | null,
): DecodedFunctionId | null {
	if (!manifest) return null;
	const exact = manifest[idSegment];
	if (exact) return { ...exact, source: "manifest" };
	const matches = Object.keys(manifest).filter(
		(key) => idSegment.startsWith(key) || key.startsWith(idSegment),
	);
	if (matches.length === 1) {
		return { ...manifest[matches[0]], source: "manifest" };
	}
	return null;
}

/**
 * Resolves an RPC id segment to its source location: dev ids decode directly,
 * production sha256 ids fall back to the manifest. Returns null when neither
 * works (an unmapped prod build).
 */
export function resolveFunctionId(
	idSegment: string,
	manifest: FunctionIdManifest | null = null,
): DecodedFunctionId | null {
	const dev = decodeDevFunctionId(idSegment);
	if (dev) return { ...dev, source: "dev" };
	if (PROD_ID.test(idSegment)) return resolveFromManifest(idSegment, manifest);
	return resolveFromManifest(idSegment, manifest);
}

// The RPC id is always the last path segment, regardless of the configured
// base path (default "/_serverFn/", but user-customizable) — so this doesn't
// need to know what pattern the panel is filtering on.
export function decodeServerFnUrl(
	url: string,
	manifest: FunctionIdManifest | null = null,
): DecodedFunctionId | null {
	try {
		const { pathname } = new URL(url);
		const idSegment = pathname.split("/").filter(Boolean).pop();
		if (!idSegment) return null;
		return resolveFunctionId(idSegment, manifest);
	} catch {
		return null;
	}
}

/** The raw last-path-segment id, for manifest editing / display. */
export function serverFnIdSegment(url: string): string | null {
	try {
		return new URL(url).pathname.split("/").filter(Boolean).pop() ?? null;
	} catch {
		return null;
	}
}
