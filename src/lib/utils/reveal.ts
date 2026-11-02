/**
 * Shared entrance-animation timings.
 *
 * Every page reveals its sections one by one on load: a short upward fly with
 * a fade, staggered so the content cascades in.
 */
export const REVEAL_Y = 14;
export const REVEAL_DURATION = 420;
/** Delay added per section. */
export const REVEAL_STEP = 70;
/** Longest total stagger — beyond this everything lands together. */
export const REVEAL_MAX = 560;

/** Stagger delay for the nth section on a page. */
export function revealDelay(index: number): number {
	return Math.min(index * REVEAL_STEP, REVEAL_MAX);
}
