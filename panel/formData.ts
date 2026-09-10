// Decoding for the request bodies SerovalScope skipped in v1: multipart
// form-data and x-www-form-urlencoded. TanStack Start's server handler passes
// FormData straight to the server function as `data`, with one reserved field
// (`__TSS_CONTEXT`) carrying a seroval-serialized context object.

import { decodeRequest } from "./deserialize.ts";

const TSS_FORMDATA_CONTEXT = "__TSS_CONTEXT";

export interface FormField {
	name: string;
	/** Text value, or a short description for file parts. */
	value: string;
	/** Present for file parts. */
	filename?: string;
	contentType?: string;
	/** Byte length of a file part's content. */
	size?: number;
	/** True for the reserved TanStack Start context field. */
	isContext?: boolean;
}

export interface DecodedFormData {
	fields: FormField[];
	/** The decoded `__TSS_CONTEXT` value, if the field was present and parseable. */
	context?: unknown;
}

function boundaryFrom(contentType: string | null): string | null {
	if (!contentType) return null;
	const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
	const raw = match?.[1] ?? match?.[2];
	return raw ? raw.trim() : null;
}

function parseUrlEncoded(body: string): FormField[] {
	const params = new URLSearchParams(body);
	const fields: FormField[] = [];
	for (const [name, value] of params) {
		fields.push({ name, value, isContext: name === TSS_FORMDATA_CONTEXT });
	}
	return fields;
}

function parseMultipart(body: string, boundary: string): FormField[] {
	const delimiter = `--${boundary}`;
	const fields: FormField[] = [];
	// Sections are split on the delimiter; the first chunk before it and the
	// trailing "--" chunk are not real parts.
	for (const section of body.split(delimiter)) {
		const trimmed = section.replace(/^\r\n/, "");
		if (!trimmed || trimmed === "--" || trimmed === "--\r\n") continue;

		const headerEnd = trimmed.indexOf("\r\n\r\n");
		if (headerEnd === -1) continue;
		const headerBlock = trimmed.slice(0, headerEnd);
		let content = trimmed.slice(headerEnd + 4);
		// Drop the trailing CRLF that precedes the next delimiter.
		content = content.replace(/\r\n$/, "");

		const disposition = /content-disposition:[^\r\n]*/i.exec(headerBlock)?.[0] ?? "";
		const name = /name="([^"]*)"/i.exec(disposition)?.[1] ?? "";
		const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
		const contentType = /content-type:\s*([^\r\n]+)/i.exec(headerBlock)?.[1]?.trim();

		if (filename !== undefined) {
			fields.push({
				name,
				value: `(file: ${filename || "unnamed"})`,
				filename,
				contentType,
				size: content.length,
			});
		} else {
			fields.push({
				name,
				value: content,
				isContext: name === TSS_FORMDATA_CONTEXT,
			});
		}
	}
	return fields;
}

/**
 * Best-effort parse of a captured form body. `raw` is what DevTools gave us for
 * the request body (text); for multipart that's imperfect for binary file
 * parts but fine for the field names, text fields, and the context blob.
 * Returns null when there's nothing usable.
 */
export function decodeFormData(
	raw: string | null,
	contentType: string | null,
): DecodedFormData | null {
	if (raw === null) return null;
	const base = (contentType ?? "").split(";", 1)[0].trim().toLowerCase();

	let fields: FormField[];
	if (base === "application/x-www-form-urlencoded") {
		fields = parseUrlEncoded(raw);
	} else if (base === "multipart/form-data") {
		const boundary = boundaryFrom(contentType);
		if (!boundary) return null;
		fields = parseMultipart(raw, boundary);
	} else {
		return null;
	}

	if (fields.length === 0) return null;

	const contextField = fields.find((f) => f.isContext);
	let context: unknown;
	if (contextField) {
		const decoded = decodeRequest(contextField.value);
		if (decoded.ok) context = decoded.value;
	}
	return { fields, context };
}
