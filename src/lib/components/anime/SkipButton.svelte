<script lang="ts">
	import { slide } from 'svelte/transition';
	import { SkipForward } from 'lucide-svelte';
	import type { SkipWindow } from '$lib/types';
	import { countdownSeconds } from '$lib/utils/skip';

	export let window_: SkipWindow | null = null;
	export let currentTime = 0; // seconds
	export let label = 'Skip Intro';
	export let onSkip: () => void = () => {};
	export let autoTriggered = false;

	$: inWindow =
		!!window_ && currentTime >= window_.start && currentTime <= window_.end;

	$: show = !!window_ && (inWindow || autoTriggered);
</script>

{#if show}
	<div
		transition:slide={{ duration: 260, axis: 'y' }}
		class="absolute bottom-20 right-4 z-20"
	>
		<button
			on:click={onSkip}
			class="group flex items-center gap-2 rounded-md border border-accent/40 bg-black/70 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition-all duration-150 hover:border-accent hover:bg-accent/25 active:scale-95"
			style="box-shadow: 0 0 24px color-mix(in srgb, var(--c-accent) 35%, transparent);"
		>
			<SkipForward size={16} class="text-accent transition-transform group-hover:translate-x-0.5" />
			{label}
		</button>
	</div>
{/if}
