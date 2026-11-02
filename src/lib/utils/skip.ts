/** Skip-window helpers for the player. */

export function formatSkipWindow(w: { start: number; end: number } | null): string {
	if (!w) return '';
	return `${w.start}s → ${w.end}s`;
}

/** For embedded iframes we cannot read time; expose a countdown helper for UI demos. */
export function countdownSeconds(window_: { start: number; end: number } | null, now: number): number {
	if (!window_) return 0;
	return Math.max(0, window_.start - now);
}
