<script lang="ts">
	import { spring } from 'svelte/motion';

	export let label = '';
	export let side: 'top' | 'bottom' = 'top';

	// Spring-driven entrance: scale snaps in with a gentle bounce.
	const scale = spring(0, { stiffness: 0.4, damping: 0.35 });
	let show = false;

	function enter() {
		show = true;
		scale.set(1);
	}
	function leave() {
		show = false;
		scale.set(0);
	}
</script>

<span class="relative inline-flex" on:mouseenter={enter} on:mouseleave={leave} on:focusin={enter} on:focusout={leave} role="presentation">
	<slot />

	{#if label}
		<span
			class="pointer-events-none absolute left-1/2 z-50 whitespace-nowrap rounded-md border border-line/60 bg-bg/95 px-2.5 py-1 text-[11px] font-medium tracking-wide text-ink shadow-xl backdrop-blur-md"
			class:bottom-full={side === 'top'}
			class:mb-2={side === 'top'}
			class:top-full={side === 'bottom'}
			class:mt-2={side === 'bottom'}
			style="
				transform: translateX(-50%) scale({$scale});
				opacity: {$scale};
				visibility: {show ? 'visible' : 'hidden'};
				transition: visibility 0s linear {show ? '0s' : '0.25s'};
			"
			role="tooltip"
		>
			{label}
		</span>
	{/if}
</span>
