/**
 * Page scroll lock.
 *
 * While a drawer is open the page underneath must not scroll — otherwise a
 * swipe on the content area scrolls the document while the sheet is up.
 *
 * The scrollbar width is compensated with padding so nothing shifts sideways
 * when the lock is applied.
 */
let locks = 0;
let savedPadding = '';
let savedOverflow = '';

function isBrowser(): boolean {
	return typeof document !== 'undefined' && typeof window !== 'undefined';
}

export function lockScroll(): void {
	if (!isBrowser()) return;
	locks += 1;
	if (locks > 1) return;

	const scrollbar = window.innerWidth - document.documentElement.clientWidth;
	savedPadding = document.body.style.paddingRight;
	savedOverflow = document.body.style.overflow;
	document.body.style.overflow = 'hidden';
	if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
}

export function unlockScroll(): void {
	if (!isBrowser()) return;
	locks = Math.max(0, locks - 1);
	if (locks > 0) return;
	document.body.style.overflow = savedOverflow;
	document.body.style.paddingRight = savedPadding;
}
