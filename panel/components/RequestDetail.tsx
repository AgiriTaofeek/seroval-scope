import { useEffect, useMemo, useState } from "react";

import { backendCallsFor } from "../backendCalls.ts";
import { decodeRequest, decodeResponse, resolveStreamed } from "../deserialize.ts";
import { decodeFormData } from "../formData.ts";
import { entryByteSize, formatBytes } from "../format.ts";
import { decodeServerFnUrl, type FunctionIdManifest } from "../functionName.ts";
import { classifyResponse } from "../responseOutcome.ts";
import { formatDuration, timingBreakdown } from "../timing.ts";
import type { CapturedEntry, DecodeResult } from "../types.ts";
import { CopyAsMenu } from "./CopyAsMenu.tsx";
import { DiffSection } from "./DiffSection.tsx";
import { ErrorBoundaryFallback } from "./ErrorBoundaryFallback.tsx";
import { JsonTree } from "./JsonTree.tsx";
import { OutcomeBadge, outcomeColor } from "./OutcomeBadge.tsx";
import { ReplaySection } from "./ReplaySection.tsx";
import { useTheme } from "./ThemeContext.tsx";

function DecodeSection({
	title,
	result,
	byteSize,
	displayValue,
	notes,
	streamed,
}: {
	title: string;
	result: DecodeResult;
	byteSize: number;
	/** Overrides `result.value` in the Decoded view (outcome-unwrapped / stream-resolved). */
	displayValue?: unknown;
	notes?: string[];
	streamed?: boolean;
}) {
	const theme = useTheme();
	const [mode, setMode] = useState<"decoded" | "raw">(
		result.ok ? "decoded" : "raw",
	);
	const shown = displayValue !== undefined ? displayValue : result.ok ? result.value : undefined;

	return (
		<div style={{ marginTop: 12 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
				<strong style={{ fontSize: 12 }}>{title}</strong>
				<span style={{ fontSize: 11, color: theme.muted }}>
					{formatBytes(byteSize)}
				</span>
				{streamed && (
					<span style={{ fontSize: 10, color: theme.accent }}>streamed</span>
				)}
				<div>
					<button type="button" disabled={mode === "decoded"} onClick={() => setMode("decoded")}>
						Decoded
					</button>
					<button type="button" disabled={mode === "raw"} onClick={() => setMode("raw")}>
						Raw
					</button>
					<button
						type="button"
						title="Copy decoded value"
						onClick={() => {
							const text = result.ok
								? safeStringify(shown)
								: result.rawText;
							navigator.clipboard.writeText(text);
						}}
					>
						Copy
					</button>
				</div>
			</div>
			{!result.ok && (
				<div style={{ color: theme.error, fontSize: 11, marginTop: 4 }}>
					Could not fully deserialize — showing raw parsed JSON. {result.error}
				</div>
			)}
			{notes?.map((note) => (
				<div key={note} style={{ color: theme.muted, fontSize: 10, marginTop: 4 }}>
					{note}
				</div>
			))}
			<div style={{ marginTop: 4 }}>
				{mode === "decoded" && result.ok ? (
					<ErrorBoundaryFallback>
						<JsonTree value={shown} />
					</ErrorBoundaryFallback>
				) : (
					<pre
						style={{
							whiteSpace: "pre-wrap",
							wordBreak: "break-all",
							fontSize: 11,
							background: theme.rawBg,
							color: theme.fg,
							padding: 8,
							margin: 0,
						}}
					>
						{result.ok ? safeStringify(result.rawParsed) : result.rawText}
					</pre>
				)}
			</div>
		</div>
	);
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value, replacer, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

function replacer(_key: string, value: unknown): unknown {
	if (typeof value === "bigint") return `${value}n`;
	if (value instanceof Error) return { name: value.name, message: value.message };
	return value;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	const theme = useTheme();
	return (
		<div style={{ display: "flex", gap: 8, fontSize: 11, padding: "1px 0" }}>
			<span style={{ color: theme.muted, minWidth: 96 }}>{label}</span>
			<span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
				{children}
			</span>
		</div>
	);
}

export function RequestDetail({
	entry,
	entries,
	manifest,
	onOpenSource,
}: {
	entry: CapturedEntry;
	entries: CapturedEntry[];
	manifest: FunctionIdManifest | null;
	onOpenSource: (entry: CapturedEntry) => void;
}) {
	const theme = useTheme();
	const requestResult = useMemo(() => decodeRequest(entry.requestRaw), [entry]);
	const responseResult = useMemo(() => decodeResponse(entry), [entry]);
	const outcome = useMemo(
		() => classifyResponse(entry, responseResult),
		[entry, responseResult],
	);
	const decoded = useMemo(
		() => decodeServerFnUrl(entry.url, manifest),
		[entry, manifest],
	);
	const backendCalls = useMemo(() => backendCallsFor(entry), [entry]);
	const formData = useMemo(
		() =>
			entry.isFormData
				? decodeFormData(entry.requestRaw, entry.requestContentType)
				: null,
		[entry],
	);
	const { requestBytes, responseBytes } = entryByteSize(entry);

	const [resolved, setResolved] = useState<unknown>(undefined);
	useEffect(() => {
		setResolved(undefined);
		if (responseResult.ok && responseResult.streamed) {
			let cancelled = false;
			void resolveStreamed(responseResult.value).then((v) => {
				if (!cancelled) setResolved(v);
			});
			return () => {
				cancelled = true;
			};
		}
	}, [responseResult]);

	// Prefer the stream-resolved value, then the outcome-unwrapped value.
	const responseDisplay =
		resolved !== undefined
			? unwrapEnvelope(resolved, outcome.kind)
			: outcome.display;

	return (
		<div style={{ padding: 8, overflowY: "auto" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
				}}
			>
				<span style={{ fontFamily: "monospace", fontSize: 11, color: theme.muted }}>
					{entry.method}
				</span>
				<strong style={{ fontFamily: "monospace", fontSize: 12 }}>
					{decoded ? decoded.exportName : entry.url}
				</strong>
				<OutcomeBadge
					kind={outcome.kind}
					hiddenInStatus={outcome.hiddenInStatus}
					title={outcome.summary}
				/>
				<span style={{ fontSize: 11, color: theme.muted }}>
					{entry.status}
					{entry.timings ? ` · ${formatDuration(entry.timings.total)}` : ""}
				</span>
				{decoded && (
					<button
						type="button"
						title="Open the server function's source in the Sources panel"
						onClick={() => onOpenSource(entry)}
					>
						Open source
					</button>
				)}
			</div>
			{decoded && (
				<div style={{ fontFamily: "monospace", fontSize: 10, color: theme.muted }}>
					{decoded.file}
					{decoded.source === "manifest" ? " (via manifest)" : ""}
					{decoded.source === undefined ? "" : ""}
				</div>
			)}
			<div style={{ fontFamily: "monospace", fontSize: 10, color: theme.muted, wordBreak: "break-all" }}>
				{entry.url}
			</div>

			{outcome.kind !== "ok" && (
				<div
					style={{
						marginTop: 8,
						padding: 8,
						borderLeft: `3px solid ${outcomeColor(outcome.kind, theme)}`,
						background: theme.surface,
						fontSize: 12,
					}}
				>
					<div style={{ fontWeight: 600 }}>{outcome.summary}</div>
					{outcome.error?.extra && (
						<div style={{ marginTop: 4 }}>
							<JsonTree value={outcome.error.extra} />
						</div>
					)}
					{outcome.error?.fromErrorInstance && (
						<div style={{ color: theme.muted, fontSize: 10, marginTop: 4 }}>
							TanStack Start transports only the error message — no stack or
							custom fields cross the wire.
						</div>
					)}
					{outcome.redirectTo && (
						<div style={{ marginTop: 4, fontFamily: "monospace" }}>
							→ {outcome.redirectTo}
						</div>
					)}
				</div>
			)}

			{formData ? (
				<div style={{ marginTop: 12 }}>
					<strong style={{ fontSize: 12 }}>Form data</strong>
					<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 4 }}>
						<tbody>
							{formData.fields.map((field, i) => (
								<tr key={`${field.name}-${i}`} style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
									<td style={{ padding: 3, color: theme.muted, verticalAlign: "top", fontFamily: "monospace" }}>
										{field.name || "(unnamed)"}
										{field.isContext ? " ·ctx" : ""}
									</td>
									<td style={{ padding: 3, fontFamily: "monospace", wordBreak: "break-all" }}>
										{field.filename
											? `${field.filename} — ${field.contentType ?? "?"}, ${formatBytes(field.size ?? 0)}`
											: field.value}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{formData.context !== undefined && (
						<div style={{ marginTop: 6 }}>
							<span style={{ fontSize: 11, color: theme.muted }}>Decoded context</span>
							<JsonTree value={formData.context} />
						</div>
					)}
				</div>
			) : (
				<>
					<DecodeSection
						title="Request"
						result={requestResult}
						byteSize={requestBytes}
						notes={adapterNote(requestResult)}
					/>
					<DecodeSection
						title="Response"
						result={responseResult}
						byteSize={responseBytes}
						displayValue={responseDisplay}
						streamed={responseResult.ok ? responseResult.streamed : undefined}
						notes={[
							...(responseResult.ok ? (responseResult.notes ?? []) : []),
							...adapterNote(responseResult),
						]}
					/>
				</>
			)}

			<div style={{ marginTop: 12 }}>
				<strong style={{ fontSize: 12 }}>Backend calls</strong>
				{backendCalls.length === 0 ? (
					<div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>
						None reported. The server-to-backend request isn't visible to
						DevTools — add the middleware from{" "}
						<code>examples/serovalscope-middleware.ts</code> to have the server
						report it via <code>x-serovalscope-upstream</code> or use{" "}
						<code>Server-Timing</code>.
					</div>
				) : (
					<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 4 }}>
						<tbody>
							{backendCalls.map((call, i) => (
								<tr key={`${call.url}-${i}`} style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
									<td style={{ padding: 3, color: theme.muted }}>{call.method ?? ""}</td>
									<td style={{ padding: 3, fontFamily: "monospace", wordBreak: "break-all" }}>{call.url}</td>
									<td style={{ padding: 3, textAlign: "right" }}>{call.status ?? ""}</td>
									<td style={{ padding: 3, textAlign: "right", color: theme.muted }}>
										{call.durationMs != null ? formatDuration(call.durationMs) : ""}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{entry.timings && (
				<div style={{ marginTop: 12 }}>
					<strong style={{ fontSize: 12 }}>Timing</strong>
					<div style={{ fontSize: 11, color: theme.muted }}>
						Total {formatDuration(entry.timings.total)}
					</div>
					{timingBreakdown(entry.timings).map((row) => (
						<div key={row.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
							<span style={{ minWidth: 120, color: theme.muted }}>{row.label}</span>
							<span
								style={{
									display: "inline-block",
									height: 8,
									background: theme.accent,
									width: `${Math.max(2, (row.ms / entry.timings!.total) * 160)}px`,
								}}
							/>
							<span>{formatDuration(row.ms)}</span>
						</div>
					))}
				</div>
			)}

			<CopyAsMenu
				entry={entry}
				requestValue={requestResult.ok ? requestResult.value : undefined}
				responseValue={responseDisplay}
				manifest={manifest}
			/>

			<ReplaySection entry={entry} />

			<DiffSection current={entry} entries={entries} manifest={manifest} />
		</div>
	);
}

function adapterNote(result: DecodeResult): string[] {
	if (!result.ok || !result.adapterTags?.length) return [];
	return [
		`Custom serialization adapter${result.adapterTags.length > 1 ? "s" : ""} decoded to serializable form: ${result.adapterTags
			.map((t) => t.replace(/^\$TSR\/t\//, ""))
			.join(", ")}`,
	];
}

function unwrapEnvelope(value: unknown, kind: string): unknown {
	if (
		typeof value === "object" &&
		value !== null &&
		"result" in value &&
		"error" in value &&
		"context" in value
	) {
		const v = value as { result: unknown; error: unknown };
		return kind === "error" ? v.error : v.result;
	}
	return value;
}
