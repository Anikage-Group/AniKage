<script lang="ts">
	import { fade } from 'svelte/transition';
	import { AlertTriangle, RotateCcw } from 'lucide-svelte';

	export let message = 'Something went wrong.';
	export let onRetry: (() => void) | null = null;
</script>

<div
	transition:fade
	class="hairline flex flex-col items-center justify-center gap-3 rounded-xl bg-surface/40 px-6 py-10 text-center backdrop-blur-md"
>
	<div class="rounded-full border border-accent/20 bg-accent/10 p-3 text-accent">
		<AlertTriangle size={22} />
	</div>
	<p class="max-w-sm text-sm text-muted">{message}</p>
	{#if onRetry}
		<button
			on:click={onRetry}
			class="mt-1 inline-flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/50 hover:text-accent active:scale-95"
		>
			<RotateCcw size={13} /> Retry
		</button>
	{/if}
</div>
