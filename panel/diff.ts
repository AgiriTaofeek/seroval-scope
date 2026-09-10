// Structural diff of two decoded values, for comparing two captures of the
// same server function (e.g. before/after a code change, or two calls with
// different inputs). Output is a flat list of leaf-level changes keyed by a
// dotted/bracketed path — enough to render a compact "what changed" list
// without a full side-by-side tree.

export type ChangeKind = "added" | "removed" | "changed";

export interface Change {
	path: string;
	kind: ChangeKind;
	before?: unknown;
	after?: unknown;
}

const MISSING = Symbol("missing");

// "Plain" = a keyed record we should recurse into. Dates, Errors, RegExps and
// the like are objects but carry their meaning in their value, not their
// enumerable keys, so they're compared directly instead.
function isObject(v: unknown): v is Record<string, unknown> {
	if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
	return !(v instanceof Date || v instanceof RegExp || v instanceof Error);
}

function joinPath(base: string, key: string | number): string {
	if (typeof key === "number") return `${base}[${key}]`;
	return base ? `${base}.${key}` : key;
}

function primitivesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	// NaN
	if (typeof a === "number" && typeof b === "number") {
		return Number.isNaN(a) && Number.isNaN(b);
	}
	if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
	return false;
}

function walk(a: unknown, b: unknown, path: string, out: Change[]): void {
	if (a === MISSING) {
		out.push({ path, kind: "added", after: b });
		return;
	}
	if (b === MISSING) {
		out.push({ path, kind: "removed", before: a });
		return;
	}

	const aArr = Array.isArray(a);
	const bArr = Array.isArray(b);
	if (aArr && bArr) {
		const len = Math.max(a.length, b.length);
		for (let i = 0; i < len; i++) {
			walk(
				i < a.length ? a[i] : MISSING,
				i < b.length ? b[i] : MISSING,
				joinPath(path, i),
				out,
			);
		}
		return;
	}

	if (isObject(a) && isObject(b)) {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const key of keys) {
			walk(
				key in a ? a[key] : MISSING,
				key in b ? b[key] : MISSING,
				joinPath(path, key),
				out,
			);
		}
		return;
	}

	// At least one side is a primitive, or the shapes differ (object vs array
	// vs scalar) — compare directly.
	if (isObject(a) !== isObject(b) || aArr !== bArr || !primitivesEqual(a, b)) {
		if (!deepEqual(a, b)) {
			out.push({ path, kind: "changed", before: a, after: b });
		}
	}
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (primitivesEqual(a, b)) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
	}
	if (isObject(a) && isObject(b)) {
		const ak = Object.keys(a);
		const bk = Object.keys(b);
		return (
			ak.length === bk.length && ak.every((k) => k in b && deepEqual(a[k], b[k]))
		);
	}
	return false;
}

/** Every leaf-level difference between `before` and `after`, root path "". */
export function diffValues(before: unknown, after: unknown): Change[] {
	const out: Change[] = [];
	walk(before, after, "", out);
	return out;
}
