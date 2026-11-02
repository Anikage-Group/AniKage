<script lang="ts">
	import { toasts } from '$lib/stores/toast';
	import { fade, fly } from 'svelte/transition';
	import { Sparkles } from 'lucide-svelte';
</script>

<div class="pointer-events-none fixed bottom-24 left-1/2 z-[90] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col items-center gap-2 md:bottom-8">
	{#each $toasts as t (t.id)}
		<div
			in:fly={{ y: 22, duration: 280 }}
			out:fade={{ duration: 200 }}
			class="pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-line/60 bg-bg/95 px-4 py-2.5 text-sm text-ink shadow-2xl backdrop-blur-xl"
		>
			{#if t.accent}
				<Sparkles size={15} class="shrink-0 text-accent" />
			{/if}
			<span class="truncate">{t.message}</span>
		</div>
	{/each}
</div>
