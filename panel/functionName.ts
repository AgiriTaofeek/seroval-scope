export interface DecodedFunctionId {
	file: string;
	exportName: string;
}

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

// The RPC id is always the last path segment, regardless of the configured
// base path (default "/_serverFn/", but user-customizable) — so this doesn't
// need to know what pattern the panel is filtering on.
export function decodeServerFnUrl(url: string): DecodedFunctionId | null {
	try {
		const { pathname } = new URL(url);
		const idSegment = pathname.split("/").filter(Boolean).pop();
		if (!idSegment) return null;
		return decodeDevFunctionId(idSegment);
	} catch {
		return null;
	}
}
