<script lang="ts">
	/**
	 * Anikage brand mark.
	 *
	 * The artwork ships as two white PNGs:
	 *   • `/logo-ani.png` — the character plus the "ani" lettering
	 *   • `/logo-kage.png` — the "kage" lettering
	 *
	 * Both are painted as CSS masks, so the white pixels become a solid fill
	 * that can follow the theme:
	 *   • "ani"  → the theme accent colour
	 *   • "kage" → the theme ink colour (black on light themes, white on dark)
	 *
	 * The two files have the same canvas height, so rendering them at the same
	 * height lines the lettering up exactly.
	 */
	/** Rendered height of the mark in pixels. */
	export let height = 30;
	/** Hide the lettering and show only the character mark. */
	export let compact = false;
</script>

<span
	class="inline-flex items-center select-none align-middle"
	style="height: {height}px;"
	role="img"
	aria-label="Anikage"
>
	<!-- "ani": character + lettering, tinted with the theme accent -->
	<span
		class="block h-full bg-accent"
		style="aspect-ratio: 1136 / 744; -webkit-mask: url('/logo-ani.png') no-repeat center / contain; mask: url('/logo-ani.png') no-repeat center / contain;"
	></span>

	<!-- "kage": lettering in the theme ink colour (black / white) -->
	{#if !compact}
		<span
			class="block h-full bg-ink"
			style="aspect-ratio: 1375 / 744; -webkit-mask: url('/logo-kage.png') no-repeat center / contain; mask: url('/logo-kage.png') no-repeat center / contain;"
		></span>
	{/if}
</span>
