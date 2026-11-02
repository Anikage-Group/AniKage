<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Grid, List, Play, Search, X } from 'lucide-svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import AnimeCard from '$lib/components/anime/AnimeCard.svelte';
	import AnimeRow from '$lib/components/anime/AnimeRow.svelte';
	import WatchlistMenu from '$lib/components/anime/WatchlistMenu.svelte';
	import { watchlist } from '$lib/stores/watchlist';
	import { WATCH_STATUSES, type WatchStatus } from '$lib/types';
	import { toast } from '$lib/stores/toast';
	import { lang, t, titleFor } from '$lib/stores/i18n';
	import { settings } from '$lib/stores/settings';
	import { toAnimeLike } from '$lib/utils/anime';

	let view: 'grid' | 'row' = $settings.watchlistView;
	let active: WatchStatus | 'all' = 'all';
	let query = '';

	$: tabs = [
		{ id: 'all' as const, label: t('all', $lang) },
		...WATCH_STATUSES.map((s) => ({ id: s.id, label: s.label }))
	];

	$: all = Object.values($watchlist)
		.filter((e) => !$settings.hideAdult || !e.isAdult)
		.sort((a, b) => b.addedAt - a.addedAt);

	$: byStatus = active === 'all' ? all : all.filter((e) => e.status === active);

	$: entries = query.trim()
		? byStatus.filter((e) => e.display.toLowerCase().includes(query.trim().toLowerCase()))
		: byStatus;

	function countOf(id: WatchStatus | 'all') {
		return id === 'all' ? all.length : all.filter((e) => e.status === id).length;
	}

	$: titleOf = (e: (typeof entries)[number]) => titleFor(toAnimeLike(e), $lang);
</script>

<svelte:head>
	<title>{t('watchlist', $lang)} — Anikage</title>
</svelte:head>

<div class="relative">
	<Ambient />
	<div class="relative z-10 mx-auto max-w-[1600px] px-4 pt-8 sm:px-6">
		<!-- Title + view toggle (exact copy of search page) -->
		<div class="mb-5 flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="font-display text-2xl font-bold tracking-tight text-ink">{t('watchlist', $lang)}</h1>
				<p class="mt-1 text-xs text-muted">{all.length} {t('titlesSaved', $lang)}</p>
			</div>
			<div class="flex items-center gap-1 rounded-md border border-line/60 bg-surface/40 p-1">
				<button
					on:click={() => (view = 'grid')}
					class="grid h-7 w-7 place-items-center rounded transition-all duration-150 active:scale-95 {view ===
					'grid'
						? 'bg-accent/15 text-accent'
						: 'text-muted hover:text-ink'}"
					aria-label={t('gridView', $lang)}
					aria-pressed={view === 'grid'}
					title={t('gridView', $lang)}
				>
					<Grid size={14} />
				</button>
				<button
					on:click={() => (view = 'row')}
					class="grid h-7 w-7 place-items-center rounded transition-all duration-150 active:scale-95 {view ===
					'row'
						? 'bg-accent/15 text-accent'
						: 'text-muted hover:text-ink'}"
					aria-label={t('rowView', $lang)}
					aria-pressed={view === 'row'}
					title={t('rowView', $lang)}
				>
					<List size={14} />
				</button>
			</div>
		</div>

		<!-- Search input (exact copy of search page) -->
		<div class="mb-4 flex items-center gap-2">
			<div class="relative min-w-0 flex-1 sm:max-w-md">
				<Search
					size={15}
					class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
				/>
				<input
					bind:value={query}
					placeholder={t('searchWatchlist', $lang)}
					aria-label={t('searchWatchlist', $lang)}
					class="w-full rounded-md border border-line/60 bg-surface/40 py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:border-accent/50 focus:outline-none"
				/>
				{#if query}
					<button
						on:click={() => (query = '')}
						class="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted transition hover:text-ink active:scale-90"
						aria-label={t('clearSearch', $lang)}
					>
						<X size={14} />
					</button>
				{/if}
			</div>
		</div>

		<!-- Status filters (watchlist-specific, kept as-is) -->
		<div class="mb-5 flex flex-wrap gap-2">
			{#each tabs as tb (tb.id)}
				<button
					on:click={() => (active = tb.id)}
					class="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 {active ===
					tb.id
						? 'border-accent/50 bg-accent/10 text-accent'
						: 'border-line/60 text-muted hover:border-accent/30 hover:text-ink'}"
				>
					{tb.label}
					<span class="rounded-full bg-black/20 px-1.5 text-[10px]">{countOf(tb.id)}</span>
				</button>
			{/each}
		</div>

		<!-- Results (exact copy of search page grid/row structure). Keyed by the
		     active filter + view so a switch rebuilds the whole list: old cards
		     disappear immediately instead of stuttering through their exit. -->
		{#key `${active}:${view}`}
			{#if entries.length === 0}
				<div
					in:fade={{ duration: 240 }}
					class="hairline rounded-xl bg-surface/30 py-20 text-center backdrop-blur-md"
				>
					<p class="text-sm text-muted">
						{query.trim()
							? `${t('noTitlesMatch', $lang)} "${query}".`
							: active === 'all'
								? t('watchlistEmpty', $lang)
								: `${t('nothingIn', $lang)} "${tabs.find((x) => x.id === active)?.label}".`}
					</p>
					<a href="/search" class="mt-4 inline-flex items-center gap-1.5 pb-0.5 text-sm font-semibold text-accent">
						{t('findSomething', $lang)} <span class="h-px w-6 bg-accent"></span>
					</a>
				</div>
			{:else if view === 'grid'}
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
					{#each entries as e, i (e.id)}
						<AnimeCard anime={toAnimeLike(e)} index={i} compact />
					{/each}
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each entries as e, i (e.id)}
						<AnimeRow anime={toAnimeLike(e)} index={i} />
					{/each}
				</div>
			{/if}
		{/key}
	</div>
</div>
