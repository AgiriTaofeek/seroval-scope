import type { CapturedEntry } from "./types.ts";

const UNITS = ["B", "KB", "MB", "GB"];

// Debugging payloads are text (JSON/seroval), never far into GB territory —
// this only needs to look reasonable up to a few hundred MB, not handle
// exabyte-scale precision.
export function formatBytes(bytes: number): string {
	if (bytes <= 0) return "0 B";
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < UNITS.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	const precision = unitIndex === 0 ? 0 : value < 10 ? 1 : 0;
	return `${value.toFixed(precision)} ${UNITS[unitIndex]}`;
}

export interface EntrySize {
	requestBytes: number;
	responseBytes: number;
	totalBytes: number;
}

// UTF-8 byte length, not string.length (character count) -- these payloads
// can carry non-ASCII text (names, emoji, etc.) and DevTools' own Network
// tab reports transfer size in bytes, so this should match that convention.
export function entryByteSize(
	entry: Pick<CapturedEntry, "requestRaw" | "responseRaw">,
): EntrySize {
	const requestBytes = entry.requestRaw
		? new TextEncoder().encode(entry.requestRaw).length
		: 0;
	const responseBytes = new TextEncoder().encode(entry.responseRaw).length;
	return {
		requestBytes,
		responseBytes,
		totalBytes: requestBytes + responseBytes,
	};
}
