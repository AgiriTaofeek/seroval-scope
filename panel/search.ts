import { decodeRequest, decodeResponse, entrySearchText } from "./deserialize.ts";
import type { CapturedEntry } from "./types.ts";

export type SearchMode = "text" | "regex" | "path";

export const SEARCH_MODES: { value: SearchMode; label: string; hint: string }[] = [
	{ value: "text", label: "Text", hint: "plain substring, case-insensitive" },
	{ value: "regex", label: "Regex", hint: "JS regex against decoded content" },
	{
		value: "path",
		label: "Key path",
		hint: "user.email=ada — match a key's value",
	},
];

export interface CompiledSearch {
	/** True when the query is empty (matches everything). */
	empty: boolean;
	/** Set when the query itself is invalid (bad regex, malformed path). */
	error?: string;
	test: (entry: CapturedEntry) => boolean;
}

const MATCH_ALL: CompiledSearch = { empty: true, test: () => true };

export function compileSearch(query: string, mode: SearchMode): CompiledSearch {
	const trimmed = query.trim();
	if (!trimmed) return MATCH_ALL;

	if (mode === "regex") {
		let re: RegExp;
		try {
			re = new RegExp(trimmed, "i");
		} catch (e) {
			return {
				empty: false,
				error: e instanceof Error ? e.message : "invalid regular expression",
				test: () => false,
			};
		}
		return { empty: false, test: (entry) => re.test(entrySearchText(entry)) };
	}

	if (mode === "path") {
		const sep = trimmed.search(/[:=]/);
		if (sep === -1) {
			return {
				empty: false,
				error: "expected key=value (or key:value)",
				test: () => false,
			};
		}
		const path = trimmed.slice(0, sep).trim().split(".").filter(Boolean);
		const needle = trimmed.slice(sep + 1).trim().toLowerCase();
		if (path.length === 0) {
			return { empty: false, error: "missing key", test: () => false };
		}
		return {
			empty: false,
			test: (entry) => entryMatchesPath(entry, path, needle),
		};
	}

	const needle = trimmed.toLowerCase();
	return {
		empty: false,
		test: (entry) => entrySearchText(entry).toLowerCase().includes(needle),
	};
}

function decodedValues(entry: CapturedEntry): unknown[] {
	if (entry.isFormData) return [];
	const req = decodeRequest(entry.requestRaw);
	const res = decodeResponse(entry);
	return [req.ok ? req.value : undefined, res.ok ? res.value : undefined];
}

// Walks every value reachable at `path` (arrays are traversed element-wise, so
// `items.name=foo` checks every item) and reports whether any stringifies to
// something containing `needle`.
function entryMatchesPath(
	entry: CapturedEntry,
	path: string[],
	needle: string,
): boolean {
	const found: unknown[] = [];
	for (const root of decodedValues(entry)) collectAtPath(root, path, found);
	return found.some((v) => valueContains(v, needle));
}

function collectAtPath(node: unknown, path: string[], out: unknown[]): void {
	if (path.length === 0) {
		out.push(node);
		return;
	}
	if (node === null || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const item of node) collectAtPath(item, path, out);
		return;
	}
	const [head, ...rest] = path;
	if (head in (node as Record<string, unknown>)) {
		collectAtPath((node as Record<string, unknown>)[head], rest, out);
	}
}

function valueContains(value: unknown, needle: string): boolean {
	if (value === null || value === undefined) return needle === String(value);
	if (typeof value === "object") {
		try {
			return JSON.stringify(value).toLowerCase().includes(needle);
		} catch {
			return false;
		}
	}
	return String(value).toLowerCase().includes(needle);
}
