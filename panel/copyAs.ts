import { decodeServerFnUrl } from "./functionName.ts";
import type { FunctionIdManifest } from "./functionName.ts";
import type { CapturedEntry } from "./types.ts";

// "Copy as" targets for a captured entry. Everything here is best-effort text
// generation for the clipboard — a starting point to paste into a REPL, a
// terminal, or a .d.ts, not a guaranteed round-trip.

/** `myServerFn({ data: … })` — the call as you'd write it in app code. */
export function toServerFnCall(
	entry: Pick<CapturedEntry, "url">,
	decodedRequest: unknown,
	manifest: FunctionIdManifest | null = null,
): string {
	const decoded = decodeServerFnUrl(entry.url, manifest);
	const name = decoded?.exportName ?? "serverFn";
	if (decodedRequest === undefined) return `${name}()`;
	// Server functions take a single options object; the decoded payload already
	// is that object ({ data, context }), so pass it straight through.
	return `${name}(${stringify(decodedRequest, 0)})`;
}

/** A `curl` invocation that reproduces the RPC request (wire payload, not decoded). */
export function toCurl(
	entry: Pick<CapturedEntry, "url" | "method" | "requestRaw" | "requestContentType">,
): string {
	const lines = [`curl '${entry.url}'`];
	if (entry.method !== "GET") lines.push(`  -X ${entry.method}`);
	lines.push(`  -H 'x-tsr-serverFn: true'`);
	if (entry.method !== "GET" && entry.requestRaw !== null) {
		lines.push(
			`  -H 'content-type: ${entry.requestContentType ?? "application/json"}'`,
		);
		lines.push(`  --data-raw ${shellQuote(entry.requestRaw)}`);
	}
	return lines.join(" \\\n");
}

/** A `type Result = …` declaration inferred structurally from a decoded value. */
export function toTypeScript(value: unknown, name = "Result"): string {
	return `type ${name} = ${inferType(value, 0, new WeakSet())};`;
}

// --- internals ---------------------------------------------------------------

function stringify(value: unknown, indent: number): string {
	const pad = "\t".repeat(indent + 1);
	const closePad = "\t".repeat(indent);
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (typeof value === "bigint") return `${value}n`;
	if (value instanceof Date) return `new Date(${JSON.stringify(value.toISOString())})`;
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map((v) => pad + stringify(v, indent + 1));
		return `[\n${items.join(",\n")}\n${closePad}]`;
	}
	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return "{}";
		const body = entries
			.map(([k, v]) => `${pad}${keyLiteral(k)}: ${stringify(v, indent + 1)}`)
			.join(",\n");
		return `{\n${body}\n${closePad}}`;
	}
	return "undefined";
}

function keyLiteral(key: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function shellQuote(text: string): string {
	// Single-quote for the shell, escaping embedded single quotes the POSIX way.
	return `'${text.replace(/'/g, `'\\''`)}'`;
}

function inferType(value: unknown, depth: number, seen: WeakSet<object>): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	const t = typeof value;
	if (t === "string") return "string";
	if (t === "number") return "number";
	if (t === "boolean") return "boolean";
	if (t === "bigint") return "bigint";
	if (value instanceof Date) return "Date";
	if (value instanceof Error) return "Error";
	if (depth > 6) return "unknown";

	if (Array.isArray(value)) {
		if (value.length === 0) return "unknown[]";
		const memberTypes = [
			...new Set(value.map((v) => inferType(v, depth + 1, seen))),
		];
		const inner =
			memberTypes.length === 1 ? memberTypes[0] : `(${memberTypes.join(" | ")})`;
		return `${inner}[]`;
	}

	if (t === "object") {
		if (seen.has(value as object)) return "unknown";
		seen.add(value as object);
		const pad = "\t".repeat(depth + 1);
		const closePad = "\t".repeat(depth);
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return "Record<string, never>";
		const body = entries
			.map(
				([k, v]) =>
					`${pad}${keyLiteral(k)}: ${inferType(v, depth + 1, seen)};`,
			)
			.join("\n");
		return `{\n${body}\n${closePad}}`;
	}

	return "unknown";
}
