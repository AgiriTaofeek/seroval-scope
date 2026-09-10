import type { OutcomeKind } from "../responseOutcome.ts";
import { useTheme } from "./ThemeContext.tsx";

const LABELS: Record<OutcomeKind, string> = {
	ok: "OK",
	error: "ERROR",
	redirect: "REDIRECT",
	notFound: "NOT FOUND",
	raw: "RAW",
};

export function outcomeColor(
	kind: OutcomeKind,
	theme: ReturnType<typeof useTheme>,
): string {
	switch (kind) {
		case "error":
			return theme.error;
		case "redirect":
			return theme.redirect;
		case "notFound":
			return theme.warn;
		case "raw":
			return theme.muted;
		default:
			return theme.ok;
	}
}

/** Compact status pill for the request list and the detail header. */
export function OutcomeBadge({
	kind,
	hiddenInStatus,
	title,
}: {
	kind: OutcomeKind;
	hiddenInStatus?: boolean;
	title?: string;
}) {
	const theme = useTheme();
	const color = outcomeColor(kind, theme);
	return (
		<span
			title={title}
			style={{
				display: "inline-block",
				fontSize: 9,
				fontWeight: 700,
				letterSpacing: 0.3,
				padding: "1px 4px",
				borderRadius: 3,
				color,
				border: `1px solid ${color}`,
				whiteSpace: "nowrap",
			}}
		>
			{LABELS[kind]}
			{hiddenInStatus ? " ⚠" : ""}
		</span>
	);
}
