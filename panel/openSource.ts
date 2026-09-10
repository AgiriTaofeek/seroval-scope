import type { DecodedFunctionId } from "./functionName.ts";

// "Jump to the server function's source" — DevTools can open a resource in the
// Sources panel if it knows the page-relative URL. In dev, TanStack Start's
// function id decodes to the exact source path (e.g. "/src/api/invoices.ts"),
// which Vite serves at that same path, so it's usually already a loaded
// resource.

export interface OpenSourceResult {
	ok: boolean;
	/** Why it couldn't open, for a tooltip / toast. */
	reason?: string;
}

type ResourceLike = { url?: string };

function panelsApi():
	| {
			openResource?: (
				url: string,
				lineNumber: number,
				callback?: () => void,
			) => void;
	  }
	| undefined {
	try {
		return (
			globalThis as {
				chrome?: { devtools?: { panels?: Record<string, unknown> } };
			}
		).chrome?.devtools?.panels as never;
	} catch {
		return undefined;
	}
}

function inspectedWindowApi():
	| {
			getResources?: (callback: (resources: ResourceLike[]) => void) => void;
			eval?: (expression: string, callback?: (result: unknown) => void) => void;
	  }
	| undefined {
	try {
		return (
			globalThis as {
				chrome?: { devtools?: { inspectedWindow?: Record<string, unknown> } };
			}
		).chrome?.devtools?.inspectedWindow as never;
	} catch {
		return undefined;
	}
}

/**
 * Builds the candidate resource URLs for a decoded function id. Dev file paths
 * are absolute-from-root ("/src/…"); we also try without the leading slash and
 * with a `?t=` cache-buster stripped, since Vite-served module URLs vary.
 */
export function sourceUrlCandidates(
	decoded: Pick<DecodedFunctionId, "file">,
	origin: string,
): string[] {
	const file = decoded.file.replace(/\?.*$/, "");
	const rel = file.replace(/^\//, "");
	return [
		`${origin}${file.startsWith("/") ? file : `/${file}`}`,
		`${origin}/${rel}`,
		file,
	].filter((v, i, a) => a.indexOf(v) === i);
}

/**
 * Opens the given decoded function's source file in the Sources panel. Resolves
 * to `{ ok: false, reason }` rather than throwing when the API is missing or
 * the file isn't a known resource.
 */
export function openFunctionSource(
	decoded: Pick<DecodedFunctionId, "file"> | null,
): Promise<OpenSourceResult> {
	return new Promise((resolve) => {
		if (!decoded) {
			resolve({ ok: false, reason: "Function source is unknown for this call." });
			return;
		}
		const panels = panelsApi();
		const inspected = inspectedWindowApi();
		if (!panels?.openResource || !inspected?.getResources) {
			resolve({ ok: false, reason: "DevTools resource API unavailable." });
			return;
		}

		inspected.eval?.("location.origin", (origin: unknown) => {
			const candidates = sourceUrlCandidates(
				decoded,
				typeof origin === "string" ? origin : "",
			);
			inspected.getResources?.((resources) => {
				const known = new Set(resources.map((r) => r.url).filter(Boolean));
				const hit =
					candidates.find((c) => known.has(c)) ??
					[...known].find(
						(u): u is string =>
							typeof u === "string" && u.endsWith(decoded.file.replace(/\?.*$/, "")),
					);
				if (!hit) {
					resolve({
						ok: false,
						reason: `Source ${decoded.file} isn't a loaded resource — is the dev server running?`,
					});
					return;
				}
				panels.openResource?.(hit, 0, () => resolve({ ok: true }));
			});
		});
	});
}
