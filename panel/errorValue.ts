// TanStack Start serializes a thrown server-function error through
// router-core's ShallowErrorPlugin, which transports *only* `error.message`
// (as `new Error(message)`) — no name, no stack, no `cause`, no custom
// fields. So the normalized shape here is deliberately small, and any `stack`
// on a decoded Error instance is the panel's own deserializer stack, not the
// server's — we never show it.

export interface NormalizedError {
	name: string;
	message: string;
	/**
	 * Own enumerable properties that survived serialization (rare — only when
	 * the error came across as a plain object rather than via ShallowErrorPlugin,
	 * e.g. a hand-built `{ message, code }` reject value).
	 */
	extra?: Record<string, unknown>;
	/** True when this came from a real Error instance (vs. an error-shaped object). */
	fromErrorInstance: boolean;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Coerces whatever a server function put on the wire as its failure into a
 * consistent `{ name, message }`. Returns null when `value` isn't plausibly an
 * error (so callers can fall back to rendering it as an ordinary value).
 */
export function normalizeError(value: unknown): NormalizedError | null {
	if (value instanceof Error) {
		return {
			name: value.name || "Error",
			message: value.message || "(no message)",
			fromErrorInstance: true,
		};
	}

	if (typeof value === "string") {
		return { name: "Error", message: value, fromErrorInstance: false };
	}

	if (isPlainRecord(value) && typeof value.message === "string") {
		const { name, message, stack, ...rest } = value;
		void stack;
		const extra = Object.keys(rest).length ? rest : undefined;
		return {
			name: typeof name === "string" && name ? name : "Error",
			message,
			extra,
			fromErrorInstance: false,
		};
	}

	return null;
}
