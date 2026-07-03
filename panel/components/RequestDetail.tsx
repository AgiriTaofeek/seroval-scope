import { useMemo, useState } from "react";

import { decodeRequest, decodeResponse } from "../deserialize.ts";
import { entryByteSize, formatBytes } from "../format.ts";
import { decodeServerFnUrl } from "../functionName.ts";
import type { CapturedEntry, DecodeResult } from "../types.ts";
import { ErrorBoundaryFallback } from "./ErrorBoundaryFallback.tsx";
import { JsonTree } from "./JsonTree.tsx";

function DecodeSection({
	title,
	result,
	byteSize,
}: {
	title: string;
	result: DecodeResult;
	byteSize: number;
}) {
	// Decode failures auto-select Raw instead of defaulting to a broken/empty
	// Decoded view the user has to notice is broken.
	const [mode, setMode] = useState<"decoded" | "raw">(
		result.ok ? "decoded" : "raw",
	);

	return (
		<div style={{ marginTop: 12 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<strong style={{ fontSize: 12 }}>{title}</strong>
				<span style={{ fontSize: 11, color: "#888" }}>
					{formatBytes(byteSize)}
				</span>
				<div>
					<button
						type="button"
						disabled={mode === "decoded"}
						onClick={() => setMode("decoded")}
					>
						Decoded
					</button>
					<button
						type="button"
						disabled={mode === "raw"}
						onClick={() => setMode("raw")}
					>
						Raw
					</button>
					<button
						type="button"
						title="Copy decoded value"
						onClick={() => {
							// Copies the decoded JS value, not the wire-format text — that's
							// the entire point of this tool.
							const text = result.ok
								? JSON.stringify(result.value, null, 2)
								: result.rawText;
							navigator.clipboard.writeText(text);
						}}
					>
						Copy
					</button>
				</div>
			</div>
			{!result.ok && (
				<div style={{ color: "#b00", fontSize: 11, marginTop: 4 }}>
					Could not fully deserialize — showing raw parsed JSON.{" "}
					{result.error}
				</div>
			)}
			<div style={{ marginTop: 4 }}>
				{mode === "decoded" && result.ok ? (
					<ErrorBoundaryFallback>
						<JsonTree value={result.value} />
					</ErrorBoundaryFallback>
				) : (
					<pre
						style={{
							whiteSpace: "pre-wrap",
							wordBreak: "break-all",
							fontSize: 11,
							background: "#f5f5f5",
							padding: 8,
							margin: 0,
						}}
					>
						{result.ok
							? JSON.stringify(result.rawParsed, null, 2)
							: result.rawText}
					</pre>
				)}
			</div>
		</div>
	);
}

export function RequestDetail({ entry }: { entry: CapturedEntry }) {
	const requestResult = useMemo(
		() => decodeRequest(entry.requestRaw),
		[entry],
	);
	const responseResult = useMemo(
		() => decodeResponse(entry.responseRaw, entry.isSerialized),
		[entry],
	);
	const { requestBytes, responseBytes } = entryByteSize(entry);
	const decoded = useMemo(() => decodeServerFnUrl(entry.url), [entry]);

	return (
		<div style={{ padding: 8, overflowY: "auto" }}>
			<div style={{ fontFamily: "monospace", fontSize: 11, color: "#666" }}>
				{entry.method}{" "}
				{decoded ? `${decoded.exportName} (${decoded.file})` : entry.url}
			</div>
			{decoded && (
				<div style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa" }}>
					{entry.url}
				</div>
			)}
			{entry.isFormData ? (
				<p style={{ fontSize: 12, fontStyle: "italic" }}>
					Form submission (not decoded in v1).
				</p>
			) : (
				<>
					<DecodeSection title="Request" result={requestResult} byteSize={requestBytes} />
					<DecodeSection title="Response" result={responseResult} byteSize={responseBytes} />
				</>
			)}
		</div>
	);
}
