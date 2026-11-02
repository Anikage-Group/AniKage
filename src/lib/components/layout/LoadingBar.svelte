<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate, afterNavigate } from '$app/navigation';

	/**
	 * Global double-layered loading bar.
	 *
	 * Two solid bars are stacked at the very top of the viewport:
	 *   • the lower one (accent)  grows quickly and fills most of the width
	 *   • the upper one (accent2) grows slower and trails behind it
	 *
	 * The trailing second layer is what gives it the "double layered" look —
	 * the gap between the two shows the progress of the slower layer.
	 *
	 * It shows for the initial page load (straight from the first paint) and
	 * for every client-side navigation.
	 */
	type State = 'idle' | 'loading' | 'done';

	/** Visible from the very first paint so the initial load is covered. */
	let state: State = 'loading';

	/** Bumped on every load so the key blocks re-mount and the bars restart. */
	let run = 0;

	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	function start() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		run += 1;
		state = 'loading';
	}

	function finish() {
		if (state === 'done') return;
		state = 'done';
		if (hideTimer) clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			state = 'idle';
			hideTimer = null;
		}, 340);
	}

	// Client-side navigations.
	beforeNavigate(() => start());
	afterNavigate(() => finish());

	onMount(() => {
		// Backstop: if the load event never lands, never leave the bar stuck.
		const max = setTimeout(finish, 8000);
		const onLoad = () => finish();
		window.addEventListener('load', onLoad, { once: true });
		return () => {
			clearTimeout(max);
			window.removeEventListener('load', onLoad);
			if (hideTimer) clearTimeout(hideTimer);
		};
	});
</script>

<div
	class="pointer-events-none fixed inset-x-0 top-0 z-[999] h-[5px] select-none transition-opacity duration-200 {state ===
	'idle'
		? 'opacity-0'
		: 'opacity-100'}"
	aria-hidden="true"
>
	{#key run}
		<!-- Layer 1 — the accent bar, fills fast -->
		<div class="bar bar-1 {state}"></div>
		<!-- Layer 2 — the accent2 bar, trails behind -->
		<div class="bar bar-2 {state}"></div>
	{/key}
</div>

<style>
	.bar {
		position: absolute;
		inset-inline: 0;
		transform-origin: left center;
		transform: scaleX(0);
		will-change: transform;
	}

	/* Lower layer: accent, 3px, fills quickly */
	.bar-1 {
		bottom: 0;
		height: 3px;
		background-color: var(--c-accent);
	}

	/* Upper layer: accent2, 2px, slower — the trailing edge of the load */
	.bar-2 {
		top: 0;
		height: 2px;
		background-color: var(--c-accent2);
	}

	/* Loading: grow to 90% and hold */
	.bar-1.loading {
		animation: bar-grow 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
	.bar-2.loading {
		animation: bar-grow 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	/* Done: snap to 100% and fade out with the container */
	.bar-1.done {
		animation: bar-finish 200ms ease-out forwards;
	}
	.bar-2.done {
		animation: bar-finish 320ms ease-out forwards;
	}

	@keyframes bar-grow {
		0% {
			transform: scaleX(0);
		}
		55% {
			transform: scaleX(0.78);
		}
		100% {
			transform: scaleX(0.9);
		}
	}

	@keyframes bar-finish {
		from {
			transform: scaleX(0.9);
		}
		to {
			transform: scaleX(1);
		}
	}
</style>
