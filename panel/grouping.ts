import { entryByteSize } from "./format.ts";
import { decodeServerFnUrl, serverFnIdSegment } from "./functionName.ts";
import type { FunctionIdManifest } from "./functionName.ts";
import type { CapturedEntry } from "./types.ts";

export interface EntryGroup {
	/** Stable key: the resolved `file#export`, or the raw id segment, or the URL. */
	key: string;
	/** What to show as the group heading. */
	label: string;
	file?: string;
	entries: CapturedEntry[];
	count: number;
	totalBytes: number;
	/** Sum of per-entry total wall time, when timings were captured. */
	totalMs: number;
	/** Number of entries whose status was not 2xx. */
	errorCount: number;
}

function groupKey(entry: CapturedEntry, manifest: FunctionIdManifest | null): string {
	const decoded = decodeServerFnUrl(entry.url, manifest);
	if (decoded) return `${decoded.file}#${decoded.exportName}`;
	return serverFnIdSegment(entry.url) ?? entry.url;
}

function groupLabel(entry: CapturedEntry, manifest: FunctionIdManifest | null): string {
	const decoded = decodeServerFnUrl(entry.url, manifest);
	if (decoded) return decoded.exportName;
	return serverFnIdSegment(entry.url) ?? entry.url;
}

/**
 * Collapses repeated calls to the same server function into one row with a
 * call count and aggregate size/time. Groups appear in first-seen order and
 * their entries stay in capture order.
 */
export function groupEntries(
	entries: CapturedEntry[],
	manifest: FunctionIdManifest | null = null,
): EntryGroup[] {
	const groups = new Map<string, EntryGroup>();
	for (const entry of entries) {
		const key = groupKey(entry, manifest);
		let group = groups.get(key);
		if (!group) {
			const decoded = decodeServerFnUrl(entry.url, manifest);
			group = {
				key,
				label: groupLabel(entry, manifest),
				file: decoded?.file,
				entries: [],
				count: 0,
				totalBytes: 0,
				totalMs: 0,
				errorCount: 0,
			};
			groups.set(key, group);
		}
		group.entries.push(entry);
		group.count += 1;
		group.totalBytes += entryByteSize(entry).totalBytes;
		group.totalMs += entry.timings?.total ?? 0;
		if (entry.status < 200 || entry.status >= 300) group.errorCount += 1;
	}
	return [...groups.values()];
}
