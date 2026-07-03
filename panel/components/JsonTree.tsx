import { useRef, useState } from "react";
import { JsonView, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

// defaultStyles' value-* keys are the (only) public way to identify a
// rendered leaf value node — react-json-view-lite doesn't expose a per-node
// click callback, so we distinguish "clicked a value" from "clicked
// punctuation/a field label/the expand icon" by className membership in this
// set rather than parsing DOM structure.
const VALUE_CLASSES = new Set(
	[
		defaultStyles.stringValue,
		defaultStyles.numberValue,
		defaultStyles.booleanValue,
		defaultStyles.nullValue,
		defaultStyles.undefinedValue,
		defaultStyles.otherValue,
	].flatMap((cls) => cls.split(" ")),
);

function isValueLeaf(el: HTMLElement): boolean {
	return el.className.split(" ").some((cls) => VALUE_CLASSES.has(cls));
}

// JsonView's `data` prop only accepts Object | Array — bare primitives
// (a decoded value that's just a string/number/boolean/undefined, or the
// "no payload" case) need their own rendering path instead of being forced
// through the tree view.
export function JsonTree({ value }: { value: unknown }) {
	const [copiedAt, setCopiedAt] = useState<{ x: number; y: number } | null>(
		null,
	);
	const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	if (value === undefined) {
		return <span style={{ color: "#888", fontStyle: "italic" }}>undefined</span>;
	}
	if (typeof value !== "object" || value === null) {
		return <span style={{ fontFamily: "monospace" }}>{String(value)}</span>;
	}

	function handleClick(e: React.MouseEvent<HTMLDivElement>) {
		const target = e.target as HTMLElement;
		if (!isValueLeaf(target)) return;
		const text = target.textContent ?? "";
		// react-json-view-lite renders string values wrapped in display quotes
		// ("world") — copying should give the raw string, not its display form.
		const raw = /^".*"$/.test(text) ? text.slice(1, -1) : text;
		navigator.clipboard.writeText(raw);

		setCopiedAt({ x: e.clientX, y: e.clientY });
		if (hideTimeout.current) clearTimeout(hideTimeout.current);
		hideTimeout.current = setTimeout(() => setCopiedAt(null), 900);
	}

	return (
		<div style={{ position: "relative" }} onClick={handleClick}>
			<JsonView
				data={value as object}
				style={defaultStyles}
				shouldExpandNode={(level) => level < 2}
			/>
			{copiedAt && (
				<div
					role="status"
					style={{
						position: "fixed",
						left: copiedAt.x + 8,
						top: copiedAt.y - 20,
						background: "#333",
						color: "#fff",
						fontSize: 10,
						padding: "2px 6px",
						borderRadius: 3,
						pointerEvents: "none",
					}}
				>
					Copied
				</div>
			)}
		</div>
	);
}
