<script lang="ts">
	import { spring } from 'svelte/motion';

	export let value = 0; // 0..1
	export let showTip = true;
	export let height = 'h-1';

	const p = spring(0, { stiffness: 0.2, damping: 0.4 });
	$: p.set(Math.max(0, Math.min(1, value)));
</script>

<div class="relative w-full {height} rounded-full bg-white/10 overflow-hidden">
	<div
		class="h-full rounded-full bg-accent"
		style="width: {$p * 100}%; box-shadow: 0 0 12px color-mix(in srgb, var(--c-accent) 80%, transparent);"
	></div>
	{#if showTip && $p > 0.01}
		<span
			class="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent"
			style="left: calc({$p * 100}% - 4px); box-shadow: 0 0 10px color-mix(in srgb, var(--c-accent) 90%, transparent);"
			aria-hidden="true"
		></span>
	{/if}
</div>
