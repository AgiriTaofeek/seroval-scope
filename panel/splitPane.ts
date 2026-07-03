// Clamped so neither pane can be dragged down to nothing — the request list
// still needs room for its columns, and the detail pane still needs room to
// be useful, even at the extremes of a drag.
export const MIN_PANE_PERCENT = 15;
export const MAX_PANE_PERCENT = 85;

export function clampPanePercent(percent: number): number {
	return Math.min(MAX_PANE_PERCENT, Math.max(MIN_PANE_PERCENT, percent));
}

export function percentFromPointerX(
	pointerX: number,
	container: { left: number; width: number },
): number {
	if (container.width <= 0) return 50;
	const raw = ((pointerX - container.left) / container.width) * 100;
	return clampPanePercent(raw);
}
