// Minimal fixed-height row virtualization for the request list. The panel can
// accumulate thousands of rows over a long session and re-render them all on
// every capture / keystroke; this keeps only the visible slice (plus a small
// overscan) in the DOM, with spacer rows holding the scroll height.

export interface VirtualWindow {
	startIndex: number;
	/** Exclusive. */
	endIndex: number;
	/** Pixel height of the spacer above the rendered slice. */
	padTop: number;
	/** Pixel height of the spacer below. */
	padBottom: number;
}

export interface VirtualOptions {
	scrollTop: number;
	viewportHeight: number;
	rowHeight: number;
	count: number;
	/** Extra rows rendered beyond the viewport on each side. Default 6. */
	overscan?: number;
}

export function computeWindow(opts: VirtualOptions): VirtualWindow {
	const { scrollTop, viewportHeight, rowHeight, count } = opts;
	const overscan = opts.overscan ?? 6;

	if (count === 0 || rowHeight <= 0 || viewportHeight <= 0) {
		return { startIndex: 0, endIndex: count, padTop: 0, padBottom: 0 };
	}

	const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
	const visible = Math.ceil(viewportHeight / rowHeight);
	const startIndex = Math.max(0, first - overscan);
	const endIndex = Math.min(count, first + visible + overscan);

	return {
		startIndex,
		endIndex,
		padTop: startIndex * rowHeight,
		padBottom: (count - endIndex) * rowHeight,
	};
}

/** Below this many rows, virtualization isn't worth the spacer-row complexity. */
export const VIRTUALIZE_THRESHOLD = 150;
