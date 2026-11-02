/**
 * Shared drag behaviour for the bottom drawers.
 *
 * Every drawer on the site can be:
 *   • pulled up from the very bottom of the page — the sheet grows upward
 *     from the bottom edge, with a rubber-band once it hits the top
 *   • pulled back down to dismiss it — the sheet follows the finger
 *
 * The handle is a large touch target, so it is easy to grab with a thumb.
 */
export interface DrawerDragOptions {
	/** Dismiss the drawer. */
	onClose: () => void;
	/** The sheet was pulled past its resting height → expand it. */
	onExpand: () => void;
	/** The sheet was pulled back down while expanded → collapse it. */
	onCollapse?: () => void;
	/** Current expanded state (read when a drag starts). */
	isExpanded?: () => boolean;
	/** Downward drag (px) that dismisses the drawer. */
	closeThreshold?: number;
	/** Smallest height (px) the sheet may shrink to while dragging. */
	minHeight?: number;
}

export function createDrawerDrag(
	getSheet: () => HTMLElement | null,
	opts: DrawerDragOptions
) {
	let startY = 0;
	let dy = 0;
	let dragging = false;
	/** Height of the sheet when the drag started. */
	let restHeight = 0;
	/** Whether the sheet was already expanded when the drag started. */
	let wasExpanded = false;

	function sheet(): HTMLElement | null {
		return getSheet();
	}

	function reset(el: HTMLElement) {
		el.style.transition = 'transform 260ms cubic-bezier(0.2, 0.9, 0.25, 1), height 260ms cubic-bezier(0.2, 0.9, 0.25, 1)';
		el.style.height = '';
		el.style.transform = '';
	}

	function onPointerDown(e: PointerEvent) {
		const el = sheet();
		if (!el) return;
		dragging = true;
		startY = e.clientY;
		dy = 0;
		restHeight = el.getBoundingClientRect().height;
		wasExpanded = opts.isExpanded?.() ?? false;
		el.style.transition = 'none';
		try {
			// Capture on the element that received the event (the handle) —
			// capturing on the sheet would retarget the move/up events away
			// from the handle's own listeners and break the drag.
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* pointer capture is best-effort */
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const el = sheet();
		if (!el) return;
		dy = e.clientY - startY;

		const vh = window.innerHeight;

		if (dy < 0) {
			// Pulling up: the sheet grows upward from the bottom edge.
			const wanted = restHeight - dy;
			const height = Math.min(vh, wanted);
			el.style.height = `${height}px`;
			// Past the top of the screen the extra pull is rubber-banded.
			const over = wanted - height;
			el.style.transform = over > 0 ? `translateY(${-over * 0.25}px)` : 'translateY(0)';
		} else {
			// Pulling down: the sheet follows the finger.
			el.style.height = `${restHeight}px`;
			el.style.transform = `translateY(${dy}px)`;
		}
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		const el = sheet();
		if (!el) return;

		const threshold = opts.closeThreshold ?? 90;

		if (wasExpanded && dy > 60) {
			// It was full screen and got pulled down → collapse it.
			reset(el);
			opts.onCollapse?.();
			return;
		}

		if (dy > threshold) {
			// Pulled far enough down → dismiss.
			reset(el);
			opts.onClose();
			return;
		}

		// Keep it open: snap back to the resting height, or stay expanded if
		// the pull was a deliberate upward gesture.
		const vh = window.innerHeight;
		const grown = restHeight - dy;
		reset(el);
		if (grown > vh * 0.8 || dy < -60) opts.onExpand();
	}

	return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
