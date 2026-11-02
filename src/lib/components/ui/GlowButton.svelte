<script lang="ts">
	export let href: string | null = null;
	export let variant: 'primary' | 'ghost' | 'underline' = 'primary';
	export let size: 'sm' | 'md' | 'lg' = 'md';
	export let disabled = false;
	export let full = false;

	const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
</script>

{#if href && !disabled}
	<a
		{href}
		class="group relative inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-95 {sizes[size]}
			{full ? 'w-full' : ''}
			{variant === 'primary'
			? 'bg-accent text-white shadow-glow-sm hover:shadow-glow'
			: variant === 'ghost'
				? 'border border-line/60 bg-surface/40 text-ink hover:border-accent/40 hover:bg-surface/70'
				: 'relative text-ink'}"
	>
		{#if variant === 'underline'}
			<span
				class="absolute inset-x-0 -bottom-0.5 h-px bg-accent opacity-60 transition-opacity group-hover:opacity-100"
			></span>
		{/if}
		<span class="relative z-10 flex items-center gap-2"><slot /></span>
	</a>
{:else}
	<button
		{disabled}
		on:click
		class="group relative inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:pointer-events-none {sizes[size]}
			{full ? 'w-full' : ''}
			{variant === 'primary'
			? 'bg-accent text-white shadow-glow-sm hover:shadow-glow'
			: variant === 'ghost'
				? 'border border-line/60 bg-surface/40 text-ink hover:border-accent/40 hover:bg-surface/70'
				: 'relative text-ink'}"
	>
		{#if variant === 'underline'}
			<span
				class="absolute inset-x-0 -bottom-0.5 h-px bg-accent opacity-60 transition-opacity group-hover:opacity-100"
			></span>
		{/if}
		<span class="relative z-10 flex items-center gap-2"><slot /></span>
	</button>
{/if}
