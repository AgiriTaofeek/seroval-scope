import { useEffect, useMemo, useRef, useState } from "react";

import { startCapture } from "../../panel/capture.ts";
import { RequestDetail } from "../../panel/components/RequestDetail.tsx";
import { ALL_METHODS, ALL_STATUSES, distinctMethods, filterEntries, STATUS_BUCKETS } from "../../panel/filters.ts";
import { entryByteSize, formatBytes } from "../../panel/format.ts";
import { decodeServerFnUrl } from "../../panel/functionName.ts";
import { startNavigationClear } from "../../panel/navigation.ts";
import { clearOnNavigateSetting, urlPatternSetting } from "../../panel/settings.ts";
import { percentFromPointerX } from "../../panel/splitPane.ts";
import type { CapturedEntry } from "../../panel/types.ts";

export default function App() {
	const [pattern, setPattern] = useState<string | null>(null);
	const [entries, setEntries] = useState<CapturedEntry[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [paused, setPaused] = useState(false);
	const [search, setSearch] = useState("");
	const [methodFilter, setMethodFilter] = useState(ALL_METHODS);
	const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
	const [clearOnNavigate, setClearOnNavigate] = useState(false);
	const [leftWidthPercent, setLeftWidthPercent] = useState(50);
	const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const pausedRef = useRef(paused);
	pausedRef.current = paused;

	useEffect(() => {
		urlPatternSetting.getValue().then(setPattern);
		clearOnNavigateSetting.getValue().then(setClearOnNavigate);
	}, []);

	useEffect(() => {
		if (pattern === null) return;
		const stop = startCapture(pattern, (entry) => {
			if (pausedRef.current) return;
			setEntries((prev) => [...prev, entry]);
		});
		return stop;
	}, [pattern]);

	useEffect(() => {
		if (!clearOnNavigate) return;
		return startNavigationClear(() => {
			setEntries([]);
			setSelectedId(null);
		});
	}, [clearOnNavigate]);

	useEffect(() => {
		if (!isDraggingSplitter) return;
		function handleMouseMove(e: MouseEvent) {
			const rect = splitContainerRef.current?.getBoundingClientRect();
			if (!rect) return;
			setLeftWidthPercent(percentFromPointerX(e.clientX, rect));
		}
		function handleMouseUp() {
			setIsDraggingSplitter(false);
		}
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDraggingSplitter]);

	// Decoding every entry on each keystroke is the simple, correct approach
	// for a debugging tool's realistic capture volumes (dozens to low
	// hundreds of rows, not a firehose) — not worth a caching layer for v1.
	const filteredEntries = useMemo(
		() => filterEntries(entries, { search, method: methodFilter, status: statusFilter }),
		[entries, search, methodFilter, statusFilter],
	);
	const methodOptions = useMemo(() => distinctMethods(entries), [entries]);

	const selected = entries.find((e) => e.id === selectedId) ?? null;

	return (
		<div
			style={{
				fontFamily: "system-ui, sans-serif",
				fontSize: 12,
				display: "flex",
				flexDirection: "column",
				height: "100vh",
			}}
		>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					alignItems: "center",
					padding: 8,
					borderBottom: "1px solid #ddd",
				}}
			>
				<strong>SerovalScope</strong>
				<input
					value={pattern ?? ""}
					onChange={(e) => {
						setPattern(e.target.value);
						urlPatternSetting.setValue(e.target.value);
					}}
					placeholder="URL pattern"
					style={{ flex: 1, minWidth: 120, fontFamily: "monospace" }}
				/>
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search decoded content..."
					style={{ flex: 1, minWidth: 120 }}
				/>
				<select
					value={methodFilter}
					onChange={(e) => setMethodFilter(e.target.value)}
				>
					<option value={ALL_METHODS}>All methods</option>
					{methodOptions.map((method) => (
						<option key={method} value={method}>
							{method}
						</option>
					))}
				</select>
				<select
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value)}
				>
					<option value={ALL_STATUSES}>All statuses</option>
					{STATUS_BUCKETS.map((bucket) => (
						<option key={bucket} value={bucket}>
							{bucket}
						</option>
					))}
				</select>
				<button type="button" onClick={() => setPaused((p) => !p)}>
					{paused ? "Resume" : "Pause"}
				</button>
				<button
					type="button"
					onClick={() => {
						setEntries([]);
						setSelectedId(null);
					}}
				>
					Clear
				</button>
				<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<input
						type="checkbox"
						checked={clearOnNavigate}
						onChange={(e) => {
							setClearOnNavigate(e.target.checked);
							clearOnNavigateSetting.setValue(e.target.checked);
						}}
					/>
					Clear on navigate
				</label>
				<span>
					{filteredEntries.length}
					{filteredEntries.length !== entries.length && ` / ${entries.length}`}
				</span>
			</div>
			<div
				ref={splitContainerRef}
				style={{ flex: 1, display: "flex", minHeight: 0 }}
			>
				<div style={{ width: `${leftWidthPercent}%`, overflowY: "auto" }}>
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<thead>
							<tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
								<th style={{ padding: 4 }}>Method</th>
								<th style={{ padding: 4 }}>URL</th>
								<th style={{ padding: 4 }}>Status</th>
								<th style={{ padding: 4 }}>Serialized</th>
								<th style={{ padding: 4 }}>Size</th>
							</tr>
						</thead>
						<tbody>
							{filteredEntries.map((entry) => (
								<tr
									key={entry.id}
									onClick={() => setSelectedId(entry.id)}
									style={{
										borderBottom: "1px solid #eee",
										cursor: "pointer",
										background: entry.id === selectedId ? "#e8f0fe" : undefined,
									}}
								>
									<td style={{ padding: 4 }}>{entry.method}</td>
									<td style={{ padding: 4, fontFamily: "monospace" }}>
										{(() => {
											const decoded = decodeServerFnUrl(entry.url);
											if (!decoded) return entry.url;
											return (
												<>
													<div>{decoded.exportName}</div>
													<div style={{ fontSize: 10, color: "#888" }}>
														{decoded.file}
													</div>
												</>
											);
										})()}
									</td>
									<td style={{ padding: 4 }}>{entry.status}</td>
									<td style={{ padding: 4 }}>
										{entry.isFormData
											? "form-data"
											: entry.isSerialized
												? "yes"
												: "no"}
									</td>
									<td style={{ padding: 4 }}>
										{formatBytes(entryByteSize(entry).totalBytes)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div
					onMouseDown={() => setIsDraggingSplitter(true)}
					style={{
						width: 6,
						flexShrink: 0,
						cursor: "col-resize",
						background: isDraggingSplitter ? "#8ab4f8" : "#ddd",
					}}
				/>
				<div style={{ flex: 1, overflowY: "auto" }}>
					{selected ? (
						// Keyed by entry id so switching the selected row resets each
						// DecodeSection's Decoded/Raw toggle instead of carrying over
						// the previous row's state.
						<RequestDetail key={selected.id} entry={selected} />
					) : (
						<div style={{ padding: 8, color: "#888" }}>
							Select a request to see its decoded payload.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
