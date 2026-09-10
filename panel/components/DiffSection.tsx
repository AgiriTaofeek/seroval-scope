import { useMemo, useState } from "react";

import { decodeResponse } from "../deserialize.ts";
import { diffValues } from "../diff.ts";
import { decodeServerFnUrl, type FunctionIdManifest } from "../functionName.ts";
import { classifyResponse } from "../responseOutcome.ts";
import type { CapturedEntry } from "../types.ts";
import { useTheme } from "./ThemeContext.tsx";

function sameFunction(
	a: CapturedEntry,
	b: CapturedEntry,
	manifest: FunctionIdManifest | null,
): boolean {
	const da = decodeServerFnUrl(a.url, manifest);
	const db = decodeServerFnUrl(b.url, manifest);
	if (da && db) return da.file === db.file && da.exportName === db.exportName;
	return a.url.split("?")[0] === b.url.split("?")[0];
}

function responseValue(entry: CapturedEntry): unknown {
	const decoded = decodeResponse(entry);
	return classifyResponse(entry, decoded).display;
}

/** Compare this entry's decoded response against another capture of the same function. */
export function DiffSection({
	current,
	entries,
	manifest,
}: {
	current: CapturedEntry;
	entries: CapturedEntry[];
	manifest: FunctionIdManifest | null;
}) {
	const theme = useTheme();
	const [open, setOpen] = useState(false);
	const [otherId, setOtherId] = useState<string | null>(null);

	const candidates = useMemo(
		() =>
			entries.filter(
				(e) => e.id !== current.id && sameFunction(e, current, manifest),
			),
		[entries, current, manifest],
	);

	const other = candidates.find((e) => e.id === otherId) ?? null;
	const changes = useMemo(
		() => (other ? diffValues(responseValue(other), responseValue(current)) : []),
		[other, current],
	);

	if (candidates.length === 0) return null;

	return (
		<div style={{ marginTop: 12 }}>
			<button type="button" onClick={() => setOpen((o) => !o)}>
				{open ? "Hide diff" : `Diff vs. another call (${candidates.length})`}
			</button>
			{open && (
				<div style={{ marginTop: 6 }}>
					<select
						value={otherId ?? ""}
						onChange={(e) => setOtherId(e.target.value || null)}
					>
						<option value="">Pick a call to compare…</option>
						{candidates.map((e) => (
							<option key={e.id} value={e.id}>
								#{e.id} · {e.method} · {e.status} ·{" "}
								{new Date(e.time).toLocaleTimeString()}
							</option>
						))}
					</select>
					{other && (
						<div style={{ marginTop: 6, fontSize: 11 }}>
							{changes.length === 0 ? (
								<span style={{ color: theme.muted }}>
									Responses are structurally identical.
								</span>
							) : (
								<table style={{ width: "100%", borderCollapse: "collapse" }}>
									<tbody>
										{changes.map((c) => (
											<tr
												key={`${c.kind}-${c.path}`}
												style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}
											>
												<td
													style={{
														padding: 3,
														color:
															c.kind === "added"
																? theme.ok
																: c.kind === "removed"
																	? theme.error
																	: theme.warn,
														fontFamily: "monospace",
													}}
												>
													{c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~"}{" "}
													{c.path || "(root)"}
												</td>
												<td style={{ padding: 3, fontFamily: "monospace", wordBreak: "break-all" }}>
													{c.kind !== "added" && (
														<span style={{ color: theme.muted }}>
															{JSON.stringify(c.before)}
														</span>
													)}
													{c.kind === "changed" && " → "}
													{c.kind !== "removed" && JSON.stringify(c.after)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
