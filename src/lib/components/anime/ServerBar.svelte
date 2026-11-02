<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Check, Layers, Loader2 } from 'lucide-svelte';
	import type { StreamCategory, StreamSource } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';

	/**
	 * Mobile server list (bottom sheet) with two sections:
	 *   1. Category selector (raw keys)
	 *   2. Server list within the chosen category
	 * Raw category keys shown verbatim — no human-readable mapping.
	 */
	export let groups: Record<StreamCategory, StreamSource[]> = {
		'h-sub': [],
		's-sub': [],
		'dub': [],
		'e-sub': [],
		'e-dub': [],
		'v-sub': [],
		'v-dub': []
	};
	export let activeUrl = '';
	export let onSelect: (src: StreamSource, cat: StreamCategory) => void = () => {};
	export let loading = false;

	const ALL_CATEGORIES: StreamCategory[] = ['h-sub', 's-sub', 'dub', 'e-sub', 'e-dub', 'v-sub', 'v-dub'];

	/** Categories that actually have servers. */
	let availableCats: StreamCategory[] = [];
	/**
	 * Category the user picked. Kept apart from the derived category below so
	 * the derived block never has to read (and then overwrite) it — a block that
	 * both reads and writes the same value makes the compiler treat it as a
	 * dependency, so every click would re-trigger the block and snap the
	 * selection straight back.
	 */
	let pickedCat: StreamCategory | null = null;
	/** Category currently shown. */
	let effectiveCat: StreamCategory = 'h-sub';
	/** Servers inside the selected category. */
	let serversInCat: StreamSource[] = [];

	/**
	 * Derived values are computed in ONE reactive block. Separate `$:`
	 * statements would read a reactive value that has not been assigned yet on
	 * the first pass (legacy mode runs effects after the component body), which
	 * crashes the component on mount.
	 */
	$: {
		const cats = ALL_CATEGORIES.filter((c) => groups[c]?.length);
		availableCats = cats;

		// The category of the server that is currently playing.
		const active = activeUrl
			? ALL_CATEGORIES.find((c) => groups[c]?.some((s) => s.url === activeUrl))
			: undefined;

		// The user's pick wins, as long as that category still has servers.
		const picked = pickedCat && groups[pickedCat]?.length ? pickedCat : undefined;

		effectiveCat = picked ?? active ?? cats[0] ?? 'h-sub';
		serversInCat = groups[effectiveCat] ?? [];
	}

	/**
	 * Picking a category switches straight to that category's first server —
	 * the player follows the selection instead of waiting for a second click.
	 */
	function onCatPick(cat: StreamCategory) {
		pickedCat = cat;
		const first = groups[cat]?.[0];
		if (first) onSelect(first, cat);
	}
</script>

{#if loading}
	<div class="flex items-center justify-center gap-2 py-6 text-sm text-muted">
		<Loader2 class="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
		<span>{t('loadingServers', $lang)}</span>
	</div>
{:else if availableCats.length}
	<div class="space-y-4">
		<!-- Category picker -->
		<div>
			<p class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
				<Layers size={11} class="text-accent" /> {t('category', $lang)}
			</p>
			<div class="grid grid-cols-4 gap-1.5">
				{#each availableCats as cat (cat)}
					<button
						on:click={() => onCatPick(cat)}
						class="rounded-md border px-2 py-1.5 text-center text-xs font-mono font-semibold tracking-wider transition-all duration-150 active:scale-95 {effectiveCat === cat
							? 'border-accent/60 bg-accent/15 text-accent'
							: 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink'}"
					>
						{cat}
					</button>
				{/each}
			</div>
		</div>

		<!-- Server list for selected category -->
		<div>
			<p class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
				<Layers size={11} class="text-accent" /> {t('server', $lang)}
			</p>
			{#if serversInCat.length}
				<div class="space-y-1.5">
					{#each serversInCat as src (src.url)}
						<button
							on:click={() => onSelect(src, effectiveCat)}
							transition:fade={{ duration: 180 }}
							class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 active:scale-95 {activeUrl === src.url
								? 'border-accent/60 bg-accent/15 text-accent shadow-glow-sm'
								: 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink'}"
						>
							<span class="truncate">{src.label}</span>
							{#if activeUrl === src.url}
								<Check size={14} class="shrink-0 text-accent" strokeWidth={3} />
							{/if}
						</button>
					{/each}
				</div>
			{:else}
				<p class="py-2 text-center text-xs text-muted/60">{t('noServersInCategory', $lang)}</p>
			{/if}
		</div>
	</div>
{:else}
	<p class="py-4 text-center text-sm text-muted">{t('noServersIndexed', $lang)}</p>
{/if}