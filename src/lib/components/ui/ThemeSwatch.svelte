<script lang="ts">
	import type { ThemeId } from '$lib/stores/theme';

	export let theme: ThemeId;
	export let size: 'sm' | 'md' = 'sm';
</script>

<!--
	Preview dots are rendered inside a nested data-theme scope, so each dot
	resolves the theme's own --c-* tokens instead of the active page palette.
-->
<span
	data-theme={theme}
	class="flex shrink-0 items-center gap-1"
	aria-hidden="true"
>
	<span
		class={size === 'md'
			? 'h-3.5 w-3.5 rounded-full border border-black/20 bg-accent'
			: 'h-2.5 w-2.5 rounded-full border border-black/20 bg-accent'}
	></span>
	<span
		class={size === 'md'
			? 'h-3.5 w-3.5 rounded-full border border-black/20 bg-accent2'
			: 'h-2.5 w-2.5 rounded-full border border-black/20 bg-accent2'}
	></span>
	<span
		class={size === 'md'
			? 'h-3.5 w-3.5 rounded-full border border-black/20 bg-surface2'
			: 'h-2.5 w-2.5 rounded-full border border-black/20 bg-surface2'}
	></span>
	<span
		class={size === 'md'
			? 'h-3.5 w-3.5 rounded-full border border-black/20 bg-bg'
			: 'h-2.5 w-2.5 rounded-full border border-black/20 bg-bg'}
	></span>
</span>
