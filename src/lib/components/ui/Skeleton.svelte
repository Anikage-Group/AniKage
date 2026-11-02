<script lang="ts">
	import { fade } from 'svelte/transition';

	export let variant: 'poster' | 'wide' | 'line' | 'block' = 'block';
	export let className = '';

	/**
	 * Width classes are detected so the variant never fights the caller for
	 * control of the width. `w-full` is only added when the caller didn't ask
	 * for one — otherwise `w-full` (generated after the numeric widths in the
	 * Tailwind output) would silently override `w-16`, `w-11`, … and blow the
	 * placeholder out of its container.
	 *
	 * The match requires whitespace/start before `w-` so `max-w-40` is not
	 * mistaken for an explicit width.
	 */
	$: hasWidth = /(?:^|\s)w-(?:full|auto|fit|min|max|px|\d)/.test(className);

	$: shape =
		variant === 'poster'
			? hasWidth
				? 'aspect-[2/3]'
				: 'aspect-[2/3] w-full'
			: variant === 'wide'
				? hasWidth
					? 'aspect-video'
					: 'aspect-video w-full'
				: variant === 'line'
					? hasWidth
						? 'h-4'
						: 'h-4 w-full'
					: hasWidth
						? ''
						: 'w-full';
</script>

<div
	transition:fade={{ duration: 260 }}
	class="shimmer-bg rounded-md {shape} {className}"
	aria-hidden="true"
></div>
