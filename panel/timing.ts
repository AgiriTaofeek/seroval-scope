import type { EntryTimings } from "./types.ts";

// HAR `timings` phases. -1 is the spec's "not applicable / unknown" sentinel;
// `blocked`, `dns`, `connect`, `ssl` are all optional and frequently -1.
interface HarTimings {
	blocked?: number;
	dns?: number;
	connect?: number;
	ssl?: number;
	send?: number;
	wait?: number;
	receive?: number;
}

function phase(value: number | undefined): number {
	// Anything missing or negative (the HAR -1 sentinel) collapses to 0 so
	// downstream sums and bar widths don't have to special-case it.
	return typeof value === "number" && value > 0 ? value : 0;
}

/**
 * Normalizes a HAR entry's `time` + `timings` into the flat, always-defined
 * shape the panel renders. Returns null when neither is usable, so callers can
 * cleanly hide the timing UI rather than show a row of zeros.
 */
export function normalizeTimings(
	totalTime: number | undefined,
	timings: HarTimings | undefined | null,
): EntryTimings | null {
	const hasTotal = typeof totalTime === "number" && totalTime >= 0;
	if (!hasTotal && !timings) return null;

	const wait = phase(timings?.wait);
	const receive = phase(timings?.receive);
	const blocked = phase(timings?.blocked);
	const dns = phase(timings?.dns);
	const connect = phase(timings?.connect);
	const ssl = phase(timings?.ssl);
	const send = phase(timings?.send);

	// Prefer HAR's own `time`; fall back to the sum of known phases. `ssl` is,
	// per the HAR spec, included *within* `connect`, so it's not added again.
	const summed = blocked + dns + connect + send + wait + receive;
	const total = hasTotal ? (totalTime as number) : summed;

	return { total, blocked, dns, connect, ssl, send, wait, receive };
}

/** "1.2 s", "840 ms", "12 ms" — compact, human, and stable across magnitudes. */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "—";
	if (ms < 1) return "<1 ms";
	if (ms < 1000) return `${Math.round(ms)} ms`;
	const seconds = ms / 1000;
	return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
}

/**
 * The phases worth showing in a breakdown, largest-impact first for a
 * debugging read: wait (TTFB / server compute) then receive (download).
 */
export function timingBreakdown(
	t: EntryTimings,
): { label: string; ms: number }[] {
	const rows: { label: string; ms: number }[] = [
		{ label: "Waiting (TTFB)", ms: t.wait },
		{ label: "Content download", ms: t.receive },
		{ label: "Blocked", ms: t.blocked },
		{ label: "DNS", ms: t.dns },
		{ label: "Connect", ms: t.connect },
		{ label: "TLS", ms: t.ssl },
		{ label: "Send", ms: t.send },
	];
	return rows.filter((r) => r.ms > 0);
}
