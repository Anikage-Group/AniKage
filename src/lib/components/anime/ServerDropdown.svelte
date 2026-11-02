<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Check, ChevronDown, Layers, Loader2 } from 'lucide-svelte';
	import type { StreamCategory, StreamSource } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';

	/**
	 * Desktop server selector with two dropdowns:
	 *   1. Category selector (raw keys: h-sub, s-sub, dub, e-sub, e-dub, v-sub, v-dub)
	 *   2. Server selector within the chosen category
	 * Raw category keys are shown verbatim — no human-readable mapping.
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

	// All possible category keys in a fixed order
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
	/** Active server label. */
	let activeLabel = '';

	/**
	 * Everything derived from the server groups is computed in ONE reactive
	 * block. Splitting it into separate `$:` statements is unsafe here: in
	 * legacy mode the reactive effects run *after* the component body, so a
	 * statement that reads another reactive value (e.g. `availableCats[0]`)
	 * would see it as `undefined` on the first pass and crash the component
	 * on mount — which silently aborted the parent's render and left the
	 * server list stuck on its loading state.
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
		// Never a generic "Best available" placeholder — show the real server
		// name (the one that is playing, or the first one of the category).
		activeLabel =
			serversInCat.find((s) => s.url === activeUrl)?.label ?? serversInCat[0]?.label ?? '';
	}

	let catOpen = false;
	let srvOpen = false;

	/**
	 * Picking a category switches straight to that category's first server —
	 * the player follows the selection instead of waiting for a second click.
	 */
	function onCatPick(cat: StreamCategory) {
		pickedCat = cat;
		catOpen = false;
		const first = groups[cat]?.[0];
		if (first) onSelect(first, cat);
	}

	function onSrvPick(src: StreamSource) {
		srvOpen = false;
		onSelect(src, effectiveCat);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			catOpen = false;
			srvOpen = false;
		}
	}
</script>

<svelte:window on:keydown={onKey} />

{#if loading}
	<!-- Loading circle while API returns server list -->
	<div class="flex items-center gap-2 text-sm text-muted">
		<Loader2 class="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
		<span>{t('loadingServers', $lang)}</span>
	</div>
{:else if availableCats.length}
	<div class="flex items-center gap-2">
		<!-- Category dropdown -->
		<div class="relative inline-block">
			<button
				on:click={() => (catOpen = !catOpen)}
				class="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface/40 px-3 py-2 text-sm text-muted transition-all duration-150 hover:border-accent/40 active:scale-95 {catOpen ? 'border-accent/50' : ''}"
				aria-haspopup="listbox"
				aria-expanded={catOpen}
				title={t('switchCategory', $lang)}
			>
				<Layers size={13} class="shrink-0 text-accent" />
				<span class="font-mono text-xs font-semibold uppercase tracking-wider text-ink">{effectiveCat}</span>
				<ChevronDown size={12} class="shrink-0 transition-transform duration-200 {catOpen ? 'rotate-180' : ''}" />
			</button>

			{#if catOpen}
				<div
					transition:fade={{ duration: 140 }}
					class="absolute left-0 top-full z-50 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl border border-line/60 bg-bg/95 shadow-2xl backdrop-blur-2xl"
					role="listbox"
				>
					{#each availableCats as cat (cat)}
						<button
							on:click={() => onCatPick(cat)}
							class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface/60 {effectiveCat === cat ? 'text-accent bg-accent/10' : 'text-ink'}"
							role="option"
							aria-selected={effectiveCat === cat}
						>
							<span class="font-mono text-xs tracking-wider">{cat}</span>
							{#if effectiveCat === cat}
								<Check size={12} class="shrink-0 text-accent" strokeWidth={3} />
							{/if}
						</button>
					{/each}
				</div>
				<button class="fixed inset-0 z-40 cursor-default" aria-label={t('close', $lang)} on:click={() => (catOpen = false)}></button>
			{/if}
		</div>

		<!-- Separator -->
		<span class="hidden sm:inline-flex h-5 w-px bg-line/50" aria-hidden="true"></span>

		<!-- Server dropdown (within selected category) -->
		<div class="relative inline-block">
			<button
				on:click={() => (srvOpen = !srvOpen)}
				class="flex items-center gap-2 rounded-md border border-line/60 bg-surface/40 px-4 py-2 text-sm text-muted transition-all duration-150 hover:border-accent/40 active:scale-95 {srvOpen ? 'border-accent/50' : ''}"
				aria-haspopup="listbox"
				aria-expanded={srvOpen}
				title={t('switchServer', $lang)}
				disabled={!serversInCat.length}
			>
				<Layers size={14} class="shrink-0 text-accent" />
				<span class="max-w-48 truncate font-semibold text-ink">{activeLabel}</span>
				<ChevronDown size={14} class="shrink-0 transition-transform duration-200 {srvOpen ? 'rotate-180' : ''}" />
			</button>

			{#if srvOpen && serversInCat.length}
				<div
					transition:fade={{ duration: 140 }}
					class="absolute left-0 top-full z-50 mt-1.5 max-h-64 min-w-[16rem] overflow-y-auto rounded-xl border border-line/60 bg-bg/95 shadow-2xl backdrop-blur-2xl"
					role="listbox"
				>
					{#each serversInCat as s (s.url)}
						<button
							on:click={() => onSrvPick(s)}
							class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface/60 {activeUrl === s.url ? 'text-accent' : 'text-ink'}"
							role="option"
							aria-selected={activeUrl === s.url}
						>
							<span class="truncate">{s.label}</span>
							{#if activeUrl === s.url}
								<Check size={13} class="shrink-0 text-accent" strokeWidth={3} />
							{/if}
						</button>
					{/each}
				</div>
				<button class="fixed inset-0 z-40 cursor-default" aria-label={t('close', $lang)} on:click={() => (srvOpen = false)}></button>
			{/if}
		</div>
	</div>
{:else}
	<p class="text-sm text-muted">{t('noServersIndexed', $lang)}</p>
{/if}