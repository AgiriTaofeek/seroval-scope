import { useState } from "react";

import { toCurl, toServerFnCall, toTypeScript } from "../copyAs.ts";
import type { FunctionIdManifest } from "../functionName.ts";
import type { CapturedEntry } from "../types.ts";
import { useTheme } from "./ThemeContext.tsx";

type Target = "call" | "curl" | "request-ts" | "response-ts";

const TARGETS: { value: Target; label: string }[] = [
	{ value: "call", label: "server-fn call" },
	{ value: "curl", label: "curl" },
	{ value: "request-ts", label: "request type" },
	{ value: "response-ts", label: "response type" },
];

export function CopyAsMenu({
	entry,
	requestValue,
	responseValue,
	manifest,
}: {
	entry: CapturedEntry;
	requestValue: unknown;
	responseValue: unknown;
	manifest: FunctionIdManifest | null;
}) {
	const theme = useTheme();
	const [preview, setPreview] = useState<{ target: Target; text: string } | null>(
		null,
	);

	function generate(target: Target): string {
		switch (target) {
			case "call":
				return toServerFnCall(entry, requestValue, manifest);
			case "curl":
				return toCurl(entry);
			case "request-ts":
				return toTypeScript(requestValue, "Request");
			case "response-ts":
				return toTypeScript(responseValue, "Response");
		}
	}

	return (
		<div style={{ marginTop: 12 }}>
			<strong style={{ fontSize: 12 }}>Copy as</strong>
			<div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
				{TARGETS.map((t) => (
					<button
						key={t.value}
						type="button"
						onClick={() => {
							const text = generate(t.value);
							navigator.clipboard.writeText(text);
							setPreview({ target: t.value, text });
						}}
					>
						{t.label}
					</button>
				))}
			</div>
			{preview && (
				<pre
					style={{
						whiteSpace: "pre-wrap",
						wordBreak: "break-all",
						fontSize: 11,
						background: theme.rawBg,
						color: theme.fg,
						padding: 8,
						marginTop: 6,
					}}
				>
					{preview.text}
					<span style={{ display: "block", color: theme.muted, fontSize: 10, marginTop: 4 }}>
						copied to clipboard
					</span>
				</pre>
			)}
		</div>
	);
}
