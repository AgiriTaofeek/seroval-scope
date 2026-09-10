import { useState } from "react";

import { buildReplayExpression, runReplay, type ReplayOutcome } from "../replay.ts";
import type { CapturedEntry } from "../types.ts";
import { useTheme } from "./ThemeContext.tsx";

/**
 * Re-issue the captured request from the inspected page, optionally with an
 * edited *wire* payload (the seroval JSON, sent verbatim — no re-serialization).
 */
export function ReplaySection({ entry }: { entry: CapturedEntry }) {
	const theme = useTheme();
	const [open, setOpen] = useState(false);
	const [payload, setPayload] = useState(entry.requestRaw ?? "");
	const [busy, setBusy] = useState(false);
	const [outcome, setOutcome] = useState<ReplayOutcome | null>(null);

	if (entry.isFormData) return null;

	const req = {
		entry,
		rawPayload: payload.trim() === "" ? null : payload,
	};

	return (
		<div style={{ marginTop: 12 }}>
			<button type="button" onClick={() => setOpen((o) => !o)}>
				{open ? "Hide replay" : "Replay…"}
			</button>
			{open && (
				<div style={{ marginTop: 6 }}>
					<div style={{ fontSize: 11, color: theme.muted }}>
						Edited text is the raw wire payload, sent as-is with the page's
						cookies.
					</div>
					<textarea
						value={payload}
						onChange={(e) => setPayload(e.target.value)}
						spellCheck={false}
						style={{
							width: "100%",
							minHeight: 80,
							fontFamily: "monospace",
							fontSize: 11,
							background: theme.rawBg,
							color: theme.fg,
							border: `1px solid ${theme.border}`,
							marginTop: 4,
						}}
					/>
					<div style={{ display: "flex", gap: 4, marginTop: 4 }}>
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								setBusy(true);
								setOutcome(null);
								void runReplay(req).then((o) => {
									setOutcome(o);
									setBusy(false);
								});
							}}
						>
							{busy ? "Running…" : "Send"}
						</button>
						<button
							type="button"
							onClick={() =>
								navigator.clipboard.writeText(buildReplayExpression(req))
							}
						>
							Copy fetch expression
						</button>
					</div>
					{outcome && (
						<pre
							style={{
								whiteSpace: "pre-wrap",
								wordBreak: "break-all",
								fontSize: 11,
								background: theme.rawBg,
								color: outcome.ok ? theme.fg : theme.error,
								padding: 8,
								marginTop: 6,
							}}
						>
							{outcome.ok
								? `${outcome.status}\n\n${outcome.body ?? ""}`
								: outcome.error}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
