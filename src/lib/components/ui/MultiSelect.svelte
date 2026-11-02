<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Check, ChevronDown, X } from 'lucide-svelte';
	import { lang, t, tf } from '$lib/stores/i18n';

	/**
	 * Checkbox dropdown used by the Search filter bar.
	 *
	 * - `multi` (default) renders a checkbox list; `multi={false}` behaves like a
	 *   single-choice selector (picking closes the popover, re-picking keeps it).
	 * - Selection lives in `value` (an id list). The page mirrors it into the URL
	 *   as a comma-joined query param via the `change` event.
	 */
	export let label = '';
	export let options: { id: string; label: string }[] = [];
	export let value: string[] = [];
	export let multi = true;
	/** Shown when nothing is selected. */
	export let placeholder = '';
	/** Optional leading lucide icon component. */
	export let icon: typeof Check | null = null;
	export let className = '';

	const dispatch = createEventDispatcher<{ change: string[] }>();

	let open = false;
	let btn: HTMLButtonElement;
	/** Flip the popover to the right edge when it would overflow the viewport. */
	let alignRight = false;

	$: selected = Array.isArray(value) ? value : [];
	$: labelFor = (id: string) => options.find((o) => o.id === id)?.label ?? id;
	$: placeholderText = placeholder || tf('anyFilter', { label }, $lang);
	$: summary =
		selected.length === 0
			? placeholderText
			: selected.length === 1
				? labelFor(selected[0])
				: tf('selectedCount', { n: selected.length }, $lang);
	$: title = selected.map(labelFor).join(', ');

	function toggleOpen() {
		if (btn) {
			const r = btn.getBoundingClientRect();
			alignRight = r.left + 236 > window.innerWidth;
		}
		open = !open;
	}

	function pick(id: string) {
		if (multi) {
			value = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
			dispatch('change', value);
		} else {
			open = false;
			// Single-select: clicking the active row clears the filter.
			value = selected.includes(id) ? [] : [id];
			dispatch('change', value);
		}
	}

	function clear(e: MouseEvent) {
		e.stopPropagation();
		if (!selected.length) return;
		value = [];
		dispatch('change', value);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window on:keydown={onKey} />

<div class="relative inline-block {className}">
	<button
		bind:this={btn}
		on:click={toggleOpen}
		class="flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 {selected.length
			? 'border-accent/50 bg-accent/10 text-accent'
			: 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink'} {open
			? 'border-accent/50'
			: ''}"
		aria-haspopup="listbox"
		aria-expanded={open}
		title={title || label}
	>
		{#if icon}
			<svelte:component this={icon} size={13} />
		{/if}
		{#if multi}
			<span>{label}</span>
			{#if selected.length === 1}
				<span class="max-w-[7rem] truncate font-semibold text-ink">{labelFor(selected[0])}</span>
			{:else if selected.length > 1}
				<span
					class="rounded border border-accent/40 bg-accent/15 px-1 py-px text-[10px] font-semibold leading-4"
				>
					{selected.length}
				</span>
			{/if}
		{:else}
			<span class="text-muted">{label}:</span>
			<span class="max-w-[8.5rem] truncate font-semibold text-ink">{summary}</span>
		{/if}
		<ChevronDown size={13} class="shrink-0 transition-transform duration-200 {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		<div
			transition:fade={{ duration: 120 }}
			class="absolute top-full z-50 mt-1.5 max-h-72 min-w-[13rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-line/60 bg-bg/95 p-1.5 shadow-2xl backdrop-blur-2xl {alignRight
				? 'right-0'
				: 'left-0'}"
			role="listbox"
		>
			<p class="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
				{label}
			</p>
			{#each options as o (o.id)}
				{@const isSel = selected.includes(o.id)}
				<button
					on:click={() => pick(o.id)}
					class="flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[13px] font-medium transition-colors {isSel
						? 'border-accent/50 bg-accent/15 text-accent'
						: 'border-transparent text-ink hover:bg-surface/60'}"
					role="option"
					aria-selected={isSel}
				>
					<span class="min-w-0 flex-1 truncate">{o.label}</span>
					{#if isSel}
						<Check size={13} strokeWidth={3} class="shrink-0 text-accent" />
					{/if}
				</button>
			{/each}
			{#if selected.length}
				<div class="mt-1.5 border-t border-line/50 pt-1.5">
					<button
						on:click={clear}
						class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface/60 hover:text-accent"
					>
						<X size={12} /> {t('clearSelection', $lang)}
					</button>
				</div>
			{/if}
		</div>
		<button
			class="fixed inset-0 z-40 cursor-default"
			aria-label={tf('closeMenu', { label }, $lang)}
			on:click={() => (open = false)}
		></button>
	{/if}
</div>
