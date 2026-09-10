import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { startCapture } from "../../panel/capture.ts";
import { decodeResponse, setAdapterLabels } from "../../panel/deserialize.ts";
import {
	ALL_METHODS,
	ALL_STATUSES,
	distinctMethods,
	filterEntries,
	STATUS_BUCKETS,
} from "../../panel/filters.ts";
import { entryByteSize, formatBytes } from "../../panel/format.ts";
import { decodeServerFnUrl, type FunctionIdManifest } from "../../panel/functionName.ts";
import { groupEntries } from "../../panel/grouping.ts";
import { startNavigationClear } from "../../panel/navigation.ts";
import { openFunctionSource } from "../../panel/openSource.ts";
import { classifyRequest, requestKindLabel } from "../../panel/requestKind.ts";
import { classifyResponse } from "../../panel/responseOutcome.ts";
import { SEARCH_MODES, type SearchMode } from "../../panel/search.ts";
import { parseSession, serializeSession } from "../../panel/session.ts";
import {
	adapterLabelsSetting,
	clearOnNavigateSetting,
	functionIdManifestSetting,
	groupByFunctionSetting,
	searchModeSetting,
	themeOverrideSetting,
	urlPatternSetting,
} from "../../panel/settings.ts";
import { percentFromPointerX } from "../../panel/splitPane.ts";
import { detectTheme, tokensFor, type ThemeTokens } from "../../panel/theme.ts";
import { formatDuration } from "../../panel/timing.ts";
import type { CapturedEntry } from "../../panel/types.ts";
import { computeWindow, VIRTUALIZE_THRESHOLD } from "../../panel/virtual.ts";
import { OutcomeBadge } from "../../panel/components/OutcomeBadge.tsx";
import { RequestDetail } from "../../panel/components/RequestDetail.tsx";
import { ThemeProvider } from "../../panel/components/ThemeContext.tsx";

type ThemeOverride = "system" | "light" | "dark";

function useResolvedTheme(override: ThemeOverride): ThemeTokens {
	return useMemo(() => {
		if (override === "light" || override === "dark") return tokensFor(override);
		return detectTheme();
	}, [override]);
}

export default function App() {
	const [pattern, setPattern] = useState<string | null>(null);
	const [entries, setEntries] = useState<CapturedEntry[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [paused, setPaused] = useState(false);
	const [search, setSearch] = useState("");
	const [searchMode, setSearchMode] = useState<SearchMode>("text");
	const [methodFilter, setMethodFilter] = useState(ALL_METHODS);
	const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
	const [clearOnNavigate, setClearOnNavigate] = useState(false);
	const [follow, setFollow] = useState(false);
	const [groupByFunction, setGroupByFunction] = useState(false);
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
	const [themeOverride, setThemeOverride] = useState<ThemeOverride>("system");
	const [manifest, setManifest] = useState<FunctionIdManifest>({});
	const [manifestText, setManifestText] = useState("{}");
	const [manifestError, setManifestError] = useState<string | null>(null);
	const [adapterLabelsText, setAdapterLabelsText] = useState("{}");
	const [adapterLabelsError, setAdapterLabelsError] = useState<string | null>(null);
	const [decodeNonce, setDecodeNonce] = useState(0);
	const [showSettings, setShowSettings] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const [leftWidthPercent, setLeftWidthPercent] = useState(50);
	const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const listPaneRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const pausedRef = useRef(paused);
	pausedRef.current = paused;

	const theme = useResolvedTheme(themeOverride);

	useEffect(() => {
		urlPatternSetting.getValue().then(setPattern);
		clearOnNavigateSetting.getValue().then(setClearOnNavigate);
		searchModeSetting.getValue().then(setSearchMode);
		groupByFunctionSetting.getValue().then(setGroupByFunction);
		themeOverrideSetting.getValue().then(setThemeOverride);
		functionIdManifestSetting.getValue().then((m) => {
			setManifest(m);
			setManifestText(JSON.stringify(m, null, 2));
		});
		adapterLabelsSetting.getValue().then((l) => {
			setAdapterLabels(l);
			setAdapterLabelsText(JSON.stringify(l, null, 2));
			setDecodeNonce((n) => n + 1);
		});
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

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 4000);
		return () => clearTimeout(t);
	}, [toast]);

	const { entries: filteredEntries, searchError } = useMemo(
		() =>
			filterEntries(entries, {
				search,
				searchMode,
				method: methodFilter,
				status: statusFilter,
			}),
		// decodeNonce: re-run when the adapter-label map changes, since decoding
		// (and therefore search-over-decoded-content) depends on it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[entries, search, searchMode, methodFilter, statusFilter, decodeNonce],
	);
	const methodOptions = useMemo(() => distinctMethods(entries), [entries]);
	const groups = useMemo(
		() => (groupByFunction ? groupEntries(filteredEntries, manifest) : []),
		[groupByFunction, filteredEntries, manifest],
	);

	useEffect(() => {
		if (!follow || filteredEntries.length === 0) return;
		setSelectedId(filteredEntries[filteredEntries.length - 1].id);
	}, [follow, filteredEntries]);

	const selected = entries.find((e) => e.id === selectedId) ?? null;

	const moveSelection = useCallback(
		(delta: number) => {
			if (filteredEntries.length === 0) return;
			const idx = filteredEntries.findIndex((e) => e.id === selectedId);
			const next = Math.min(
				filteredEntries.length - 1,
				Math.max(0, (idx === -1 ? 0 : idx) + delta),
			);
			setSelectedId(filteredEntries[next].id);
		},
		[filteredEntries, selectedId],
	);

	function handleOpenSource(entry: CapturedEntry) {
		void openFunctionSource(decodeServerFnUrl(entry.url, manifest)).then((r) => {
			if (!r.ok) setToast(r.reason ?? "Couldn't open source.");
		});
	}

	function persistManifest(text: string) {
		setManifestText(text);
		try {
			const parsed = JSON.parse(text) as FunctionIdManifest;
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				throw new Error("expected an object");
			}
			setManifest(parsed);
			setManifestError(null);
			void functionIdManifestSetting.setValue(parsed);
		} catch (e) {
			setManifestError(e instanceof Error ? e.message : "invalid JSON");
		}
	}

	function persistAdapterLabels(text: string) {
		setAdapterLabelsText(text);
		try {
			const parsed = JSON.parse(text) as Record<string, string>;
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				throw new Error("expected an object");
			}
			setAdapterLabels(parsed);
			setAdapterLabelsError(null);
			setDecodeNonce((n) => n + 1);
			void adapterLabelsSetting.setValue(parsed);
		} catch (e) {
			setAdapterLabelsError(e instanceof Error ? e.message : "invalid JSON");
		}
	}

	function exportSession() {
		const blob = new Blob([serializeSession(pattern ?? "_serverFn/", entries)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `serovalscope-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function importSession(file: File) {
		void file.text().then((text) => {
			try {
				const parsed = parseSession(text);
				setEntries(parsed.entries);
				setSelectedId(null);
				setPattern(parsed.pattern);
				setToast(`Loaded ${parsed.entries.length} entries.`);
			} catch (e) {
				setToast(
					`Import failed: ${e instanceof Error ? e.message : "unknown error"}`,
				);
			}
		});
	}

	return (
		<ThemeProvider tokens={theme}>
			<div
				style={{
					fontFamily: "system-ui, sans-serif",
					fontSize: 12,
					display: "flex",
					flexDirection: "column",
					height: "100vh",
					background: theme.bg,
					color: theme.fg,
				}}
			>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						alignItems: "center",
						padding: 8,
						borderBottom: `1px solid ${theme.border}`,
					}}
				>
					<strong>SerovalScope</strong>
					<input
						value={pattern ?? ""}
						onChange={(e) => {
							setPattern(e.target.value);
							void urlPatternSetting.setValue(e.target.value);
						}}
						placeholder="URL pattern"
						style={{ flex: 1, minWidth: 100, fontFamily: "monospace" }}
					/>
					<select
						value={searchMode}
						onChange={(e) => {
							const mode = e.target.value as SearchMode;
							setSearchMode(mode);
							void searchModeSetting.setValue(mode);
						}}
						title={SEARCH_MODES.find((m) => m.value === searchMode)?.hint}
					>
						{SEARCH_MODES.map((m) => (
							<option key={m.value} value={m.value}>
								{m.label}
							</option>
						))}
					</select>
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search decoded content…"
						style={{
							flex: 1,
							minWidth: 100,
							border: searchError ? `1px solid ${theme.error}` : undefined,
						}}
						title={searchError ?? undefined}
					/>
					<select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
						<option value={ALL_METHODS}>All methods</option>
						{methodOptions.map((method) => (
							<option key={method} value={method}>
								{method}
							</option>
						))}
					</select>
					<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
								void clearOnNavigateSetting.setValue(e.target.checked);
							}}
						/>
						Clear on nav
					</label>
					<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<input
							type="checkbox"
							checked={follow}
							onChange={(e) => setFollow(e.target.checked)}
						/>
						Follow
					</label>
					<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<input
							type="checkbox"
							checked={groupByFunction}
							onChange={(e) => {
								setGroupByFunction(e.target.checked);
								void groupByFunctionSetting.setValue(e.target.checked);
							}}
						/>
						Group
					</label>
					<button type="button" onClick={() => setShowSettings((s) => !s)}>
						{showSettings ? "Close settings" : "Settings"}
					</button>
					<span style={{ color: theme.muted }}>
						{filteredEntries.length}
						{filteredEntries.length !== entries.length && ` / ${entries.length}`}
					</span>
				</div>

				{showSettings && (
					<div
						style={{
							padding: 8,
							borderBottom: `1px solid ${theme.border}`,
							background: theme.surface,
							display: "flex",
							flexDirection: "column",
							gap: 8,
						}}
					>
						<div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
							<label style={{ display: "flex", gap: 4, alignItems: "center" }}>
								Theme
								<select
									value={themeOverride}
									onChange={(e) => {
										const v = e.target.value as ThemeOverride;
										setThemeOverride(v);
										void themeOverrideSetting.setValue(v);
									}}
								>
									<option value="system">Match DevTools</option>
									<option value="light">Light</option>
									<option value="dark">Dark</option>
								</select>
							</label>
							<button type="button" onClick={exportSession} disabled={entries.length === 0}>
								Export session
							</button>
							<button type="button" onClick={() => fileInputRef.current?.click()}>
								Import session
							</button>
							<input
								ref={fileInputRef}
								type="file"
								accept="application/json,.json"
								style={{ display: "none" }}
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) importSession(file);
									e.target.value = "";
								}}
							/>
						</div>
						<div>
							<div style={{ fontSize: 11, color: theme.muted }}>
								Production function-id manifest (JSON: sha256 → {"{ file, exportName }"}).
								Names hashed prod RPC ids.
							</div>
							<textarea
								value={manifestText}
								onChange={(e) => persistManifest(e.target.value)}
								spellCheck={false}
								style={{
									width: "100%",
									minHeight: 80,
									fontFamily: "monospace",
									fontSize: 11,
									background: theme.rawBg,
									color: theme.fg,
									border: `1px solid ${manifestError ? theme.error : theme.border}`,
								}}
							/>
							{manifestError && (
								<div style={{ color: theme.error, fontSize: 11 }}>{manifestError}</div>
							)}
						</div>
						<div>
							<div style={{ fontSize: 11, color: theme.muted }}>
								Custom serialization-adapter labels (JSON: adapter key → label).
								Optional — payloads using an app adapter decode either way, to
								the adapter's serializable form.
							</div>
							<textarea
								value={adapterLabelsText}
								onChange={(e) => persistAdapterLabels(e.target.value)}
								spellCheck={false}
								style={{
									width: "100%",
									minHeight: 60,
									fontFamily: "monospace",
									fontSize: 11,
									background: theme.rawBg,
									color: theme.fg,
									border: `1px solid ${adapterLabelsError ? theme.error : theme.border}`,
								}}
							/>
							{adapterLabelsError && (
								<div style={{ color: theme.error, fontSize: 11 }}>
									{adapterLabelsError}
								</div>
							)}
						</div>
					</div>
				)}

				<div
					ref={splitContainerRef}
					style={{ flex: 1, display: "flex", minHeight: 0 }}
				>
					<div
						ref={listPaneRef}
						style={{ width: `${leftWidthPercent}%`, overflowY: "auto", outline: "none" }}
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								moveSelection(1);
							} else if (e.key === "ArrowUp") {
								e.preventDefault();
								moveSelection(-1);
							}
						}}
					>
						{groupByFunction ? (
							<GroupedList
								groups={groups}
								theme={theme}
								selectedId={selectedId}
								expandedGroups={expandedGroups}
								onToggleGroup={(key) =>
									setExpandedGroups((prev) => {
										const next = new Set(prev);
										next.has(key) ? next.delete(key) : next.add(key);
										return next;
									})
								}
								onSelect={setSelectedId}
							/>
						) : (
							<FlatList
								entries={filteredEntries}
								theme={theme}
								manifest={manifest}
								selectedId={selectedId}
								onSelect={setSelectedId}
								scrollRef={listPaneRef}
							/>
						)}
					</div>
					<div
						onMouseDown={() => setIsDraggingSplitter(true)}
						style={{
							width: 6,
							flexShrink: 0,
							cursor: "col-resize",
							background: isDraggingSplitter ? theme.accent : theme.border,
						}}
					/>
					<div style={{ flex: 1, overflowY: "auto" }}>
						{selected ? (
							<RequestDetail
								key={`${selected.id}:${decodeNonce}`}
								entry={selected}
								entries={entries}
								manifest={manifest}
								onOpenSource={handleOpenSource}
							/>
						) : (
							<div style={{ padding: 8, color: theme.muted }}>
								Select a request to see its decoded payload.
							</div>
						)}
					</div>
				</div>

				{toast && (
					<div
						role="status"
						style={{
							position: "fixed",
							bottom: 12,
							left: "50%",
							transform: "translateX(-50%)",
							background: theme.toastBg,
							color: theme.toastFg,
							fontSize: 11,
							padding: "6px 12px",
							borderRadius: 4,
							maxWidth: "80%",
						}}
					>
						{toast}
					</div>
				)}
			</div>
		</ThemeProvider>
	);
}

function rowOutcome(entry: CapturedEntry) {
	return classifyResponse(entry, decodeResponse(entry));
}

function FunctionCell({
	entry,
	manifest,
	theme,
}: {
	entry: CapturedEntry;
	manifest: FunctionIdManifest;
	theme: ThemeTokens;
}) {
	const decoded = decodeServerFnUrl(entry.url, manifest);
	if (!decoded) return <span>{entry.url}</span>;
	return (
		<>
			<div>{decoded.exportName}</div>
			<div style={{ fontSize: 10, color: theme.muted }}>{decoded.file}</div>
		</>
	);
}

const ROW_HEIGHT = 44;

function FlatRow({
	entry,
	theme,
	manifest,
	selected,
	onSelect,
}: {
	entry: CapturedEntry;
	theme: ThemeTokens;
	manifest: FunctionIdManifest;
	selected: boolean;
	onSelect: (id: string) => void;
}) {
	const outcome = rowOutcome(entry);
	const kind = classifyRequest(entry.url);
	return (
		<tr
			onClick={() => onSelect(entry.id)}
			style={{
				borderBottom: `1px solid ${theme.borderSubtle}`,
				cursor: "pointer",
				height: ROW_HEIGHT,
				background: selected ? theme.rowSelected : undefined,
			}}
		>
			<td style={{ padding: 4 }}>
				{entry.method}
				{kind !== "server-fn" && (
					<span style={{ color: theme.muted, fontSize: 9 }}>
						{" "}
						{requestKindLabel(kind)}
					</span>
				)}
			</td>
			<td style={{ padding: 4, fontFamily: "monospace" }}>
				<FunctionCell entry={entry} manifest={manifest} theme={theme} />
			</td>
			<td style={{ padding: 4, whiteSpace: "nowrap" }}>
				<OutcomeBadge
					kind={outcome.kind}
					hiddenInStatus={outcome.hiddenInStatus}
					title={outcome.summary}
				/>{" "}
				<span style={{ color: theme.muted, fontSize: 10 }}>{entry.status}</span>
			</td>
			<td style={{ padding: 4, color: theme.muted }}>
				{entry.timings ? formatDuration(entry.timings.total) : "—"}
			</td>
			<td style={{ padding: 4 }}>
				{formatBytes(entryByteSize(entry).totalBytes)}
			</td>
		</tr>
	);
}

function FlatList({
	entries,
	theme,
	manifest,
	selectedId,
	onSelect,
	scrollRef,
}: {
	entries: CapturedEntry[];
	theme: ThemeTokens;
	manifest: FunctionIdManifest;
	selectedId: string | null;
	onSelect: (id: string) => void;
	scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportHeight, setViewportHeight] = useState(600);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const sync = () => {
			setScrollTop(el.scrollTop);
			// jsdom / an unlaid-out pane reports 0 — keep the last real height.
			setViewportHeight((h) => (el.clientHeight > 0 ? el.clientHeight : h));
		};
		sync();
		el.addEventListener("scroll", sync, { passive: true });
		const ro =
			typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
		ro?.observe(el);
		window.addEventListener("resize", sync);
		return () => {
			el.removeEventListener("scroll", sync);
			window.removeEventListener("resize", sync);
			ro?.disconnect();
		};
	}, [scrollRef]);

	const virtualize = entries.length > VIRTUALIZE_THRESHOLD;
	const win = virtualize
		? computeWindow({
				scrollTop,
				viewportHeight,
				rowHeight: ROW_HEIGHT,
				count: entries.length,
			})
		: { startIndex: 0, endIndex: entries.length, padTop: 0, padBottom: 0 };
	const slice = entries.slice(win.startIndex, win.endIndex);

	return (
		<table style={{ width: "100%", borderCollapse: "collapse" }}>
			<thead>
				<tr style={{ textAlign: "left", borderBottom: `1px solid ${theme.border}` }}>
					<th style={{ padding: 4 }}>Method</th>
					<th style={{ padding: 4 }}>Function</th>
					<th style={{ padding: 4 }}>Result</th>
					<th style={{ padding: 4 }}>Time</th>
					<th style={{ padding: 4 }}>Size</th>
				</tr>
			</thead>
			<tbody>
				{win.padTop > 0 && <tr style={{ height: win.padTop }} aria-hidden />}
				{slice.map((entry) => (
					<FlatRow
						key={entry.id}
						entry={entry}
						theme={theme}
						manifest={manifest}
						selected={entry.id === selectedId}
						onSelect={onSelect}
					/>
				))}
				{win.padBottom > 0 && (
					<tr style={{ height: win.padBottom }} aria-hidden />
				)}
			</tbody>
		</table>
	);
}

function GroupedList({
	groups,
	theme,
	selectedId,
	expandedGroups,
	onToggleGroup,
	onSelect,
}: {
	groups: ReturnType<typeof groupEntries>;
	theme: ThemeTokens;
	selectedId: string | null;
	expandedGroups: Set<string>;
	onToggleGroup: (key: string) => void;
	onSelect: (id: string) => void;
}) {
	return (
		<table style={{ width: "100%", borderCollapse: "collapse" }}>
			<tbody>
				{groups.map((group) => {
					const open = expandedGroups.has(group.key);
					return (
						<Fragment key={group.key}>
							<tr
								onClick={() => onToggleGroup(group.key)}
								style={{
									borderBottom: `1px solid ${theme.border}`,
									cursor: "pointer",
									background: theme.surface,
								}}
							>
								<td style={{ padding: 4, fontFamily: "monospace" }}>
									{open ? "▾" : "▸"} {group.label}
									<span style={{ color: theme.muted }}> ×{group.count}</span>
									{group.errorCount > 0 && (
										<span style={{ color: theme.error }}> · {group.errorCount} err</span>
									)}
								</td>
								<td style={{ padding: 4, textAlign: "right", color: theme.muted }}>
									{group.totalMs > 0 ? formatDuration(group.totalMs) : ""}{" "}
									{formatBytes(group.totalBytes)}
								</td>
							</tr>
							{open &&
								group.entries.map((entry) => {
									const outcome = rowOutcome(entry);
									return (
										<tr
											key={entry.id}
											onClick={() => onSelect(entry.id)}
											style={{
												borderBottom: `1px solid ${theme.borderSubtle}`,
												cursor: "pointer",
												background:
													entry.id === selectedId ? theme.rowSelected : undefined,
											}}
										>
											<td style={{ padding: "4px 4px 4px 20px" }}>
												{entry.method}{" "}
												<OutcomeBadge
													kind={outcome.kind}
													hiddenInStatus={outcome.hiddenInStatus}
												/>{" "}
												<span style={{ color: theme.muted }}>{entry.status}</span>
											</td>
											<td style={{ padding: 4, textAlign: "right", color: theme.muted }}>
												{entry.timings ? formatDuration(entry.timings.total) : ""}{" "}
												{formatBytes(entryByteSize(entry).totalBytes)}
											</td>
										</tr>
									);
								})}
						</Fragment>
					);
				})}
			</tbody>
		</table>
	);
}
