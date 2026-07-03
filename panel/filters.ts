import { entrySearchText } from "./deserialize.ts";
import type { CapturedEntry } from "./types.ts";

export const ALL_METHODS = "All";
export const ALL_STATUSES = "All";
export const STATUS_BUCKETS = ["2xx", "3xx", "4xx", "5xx"] as const;

export interface EntryFilters {
	search: string;
	method: string;
	status: string;
}

function matchesStatusBucket(status: number, bucket: string): boolean {
	// bucket looks like "4xx" -- its leading digit is the hundreds place.
	return Math.floor(status / 100) === Number(bucket[0]);
}

export function filterEntries(
	entries: CapturedEntry[],
	filters: EntryFilters,
): CapturedEntry[] {
	const needle = filters.search.trim().toLowerCase();
	return entries.filter((entry) => {
		if (filters.method !== ALL_METHODS && entry.method !== filters.method) {
			return false;
		}
		if (
			filters.status !== ALL_STATUSES &&
			!matchesStatusBucket(entry.status, filters.status)
		) {
			return false;
		}
		if (needle && !entrySearchText(entry).toLowerCase().includes(needle)) {
			return false;
		}
		return true;
	});
}

// Populates the Method filter dropdown with only the methods actually seen
// so far, instead of a fixed list that may not match this app's traffic.
export function distinctMethods(entries: CapturedEntry[]): string[] {
	return [...new Set(entries.map((e) => e.method))].sort();
}
