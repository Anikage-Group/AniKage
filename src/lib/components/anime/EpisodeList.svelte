<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { Check, ChevronDown, Film, LayoutGrid, List, Search, Sliders, Image as ImageIcon } from 'lucide-svelte';
	import type { EpisodeAsset } from '$lib/types';
	import { watched } from '$lib/stores/history';
	import { lang, t } from '$lib/stores/i18n';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';

	export let animeId: number;
	export let episodes: EpisodeAsset[] = [];
	export let total: number | null = null;
	export let currentEp = 0;
	export let view: 'tiles' | 'titles' | 'detailed' = 'tiles';
	/** Density of the numbered tiles: 'sm' (compact), 'lg' (spacious) or 'xl' (watch-page sidebar). */
	export let tileSize: 'sm' | 'lg' | 'xl' = 'lg';
	/**
	 * Force a single column for the "titles" and "thumbnails" views.
	 * Used on the watch page, where the list lives in a narrow sidebar and
	 * three columns squeeze the episode names into unreadable slivers.
	 */
	export let onePerRow = false;

	let query = '';
	let rangeIndex = 0;
	let rangeOpen = false;
	let mobilePicker = false;
	/** The episode-range list as a drawer (phones). */
	let rangeDrawer = false;
	/** Narrow viewport → drawers instead of dropdowns. */
	let isNarrow = false;

	/**
	 * Watched flags come straight from the store so the tick appears the
	 * moment an episode is marked as watched — a plain function read would
	 * only refresh on the next unrelated re-render.
	 */
	$: watchedFlags = $watched;

	onMount(() => {
		const mq = window.matchMedia('(max-width: 639px)');
		const sync = () => (isNarrow = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	$: source =
		episodes.length > 0
			? episodes
			: Array.from({ length: total ?? 0 }, (_, i) => ({
					number: i + 1,
					title: null,
					image: null,
					description: null,
					releaseDate: null
				}));

	/* ---- paging: groups of 100 episodes ---- */
	$: count = source.length;
	$: ranges =
		count > 0
			? Array.from({ length: Math.ceil(count / 100) }, (_, i) => ({
					start: i * 100 + 1,
					end: Math.min(count, (i + 1) * 100)
				}))
			: [];
	$: if (rangeIndex > 0 && rangeIndex >= ranges.length) rangeIndex = 0;
	$: activeRange = ranges[rangeIndex] ?? null;
	$: inRange = activeRange ? source.slice(activeRange.start - 1, activeRange.end) : source;

	$: filtered = query.trim()
		? inRange.filter(
				(e) =>
					String(e.number).includes(query.trim()) ||
					(e.title ?? '').toLowerCase().includes(query.trim().toLowerCase())
			)
		: inRange;

	/* ---- dates ---- */
	function prettyDate(d: string): string {
		const t = new Date(d);
		if (Number.isNaN(t.getTime())) return d;
		return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
	function dateFor(ep: EpisodeAsset): string | null {
		// Use episode's own release date if available
		if (ep.releaseDate) return prettyDate(ep.releaseDate);
		return null;
	}

	const modes = [
		{ id: 'tiles', key: 'tiles', icon: LayoutGrid },
		{ id: 'titles', key: 'titles', icon: List },
		{ id: 'detailed', key: 'thumbnails', icon: ImageIcon }
	] as const;

	function pickRange(i: number) {
		rangeIndex = i;
		rangeOpen = false;
		rangeDrawer = false;
	}
</script>

<div class="space-y-3">
	<!-- Toolbar row 1: view switcher + episode range -->
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<!-- desktop mode switch: icons only -->
			<div class="hidden items-center gap-1 rounded-md border border-line/60 bg-surface/40 p-1 sm:flex">
				{#each modes as m (m.id)}
					<button
						on:click={() => (view = m.id)}
						class="grid h-7 w-7 place-items-center rounded transition-all duration-150 active:scale-95 {view === m.id
							? 'bg-accent/15 text-accent'
							: 'text-muted hover:text-ink'}"
						aria-label={t(m.key, $lang)}
						title={t(m.key, $lang)}
					>
						<svelte:component this={m.icon} size={14} />
					</button>
				{/each}
			</div>

			<!-- mobile picker trigger -->
			<button
				on:click={() => (mobilePicker = true)}
				class="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface/40 px-3 py-2 text-xs font-medium text-muted sm:hidden"
			>
				<Sliders size={13} /> {t(modes.find((m) => m.id === view)?.key ?? 'tiles', $lang)}
			</button>
		</div>

		<!-- episode range selector (1–100, 101–200 …) — styled like the other dropdowns -->
		{#if ranges.length > 0}
			<div class="relative inline-flex items-center">
				<button
					on:click={() => {
						// On phones the range list is far too tall for a dropdown —
						// it opens as a drawer instead.
						if (isNarrow) rangeDrawer = true;
						else rangeOpen = !rangeOpen;
					}}
					aria-label={t('episodeRange', $lang)}
					aria-haspopup="listbox"
					aria-expanded={rangeOpen}
					class="flex items-center gap-2 rounded-md border border-line/60 bg-surface/40 py-2 pl-3 pr-2.5 text-xs font-medium tabular-nums text-ink transition-colors hover:border-accent/40 focus:border-accent/50 focus:outline-none {rangeOpen
						? 'border-accent/50'
						: ''}"
				>
					{activeRange ? `${activeRange.start}–${activeRange.end}` : ''}
					<ChevronDown size={13} class="text-muted transition-transform duration-200 {rangeOpen ? 'rotate-180' : ''}" />
				</button>

				{#if rangeOpen}
					<div
						transition:fade={{ duration: 140 }}
						class="absolute right-0 top-full z-50 mt-1 max-h-72 w-40 overflow-y-auto rounded-md border border-line/60 bg-surface/95 p-1 shadow-2xl backdrop-blur-xl"
						role="listbox"
					>
						{#each ranges as r, i (i)}
							<button
								on:click={() => pickRange(i)}
								role="option"
								aria-selected={rangeIndex === i}
								class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium tabular-nums transition-colors {rangeIndex === i
									? 'bg-accent/10 text-accent'
									: 'text-ink hover:bg-surface2'}"
							>
								<span class="grid w-4 shrink-0 place-items-center">
									{#if rangeIndex === i}<Check size={13} strokeWidth={3} />{/if}
								</span>
								{r.start}–{r.end}
							</button>
						{/each}
					</div>
					<button
						class="fixed inset-0 z-40 cursor-default"
						aria-label={t('closeRangeMenu', $lang)}
						on:click={() => (rangeOpen = false)}
					></button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Toolbar row 2: search / filter (below the options) -->
	<div class="relative">
		<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
		<input
			bind:value={query}
			placeholder={t('filterEpisodes', $lang)}
			class="w-full rounded-md border border-line/60 bg-surface/40 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent/50 focus:outline-none"
		/>
	</div>

	<!-- Episode views — rendered at every breakpoint -->
	{#if count === 0}
		<p class="py-6 text-center text-sm text-muted">{t('noEpisodeData', $lang)}</p>
	{:else if filtered.length === 0}
		<p class="py-6 text-center text-sm text-muted">{t('noEpisodesMatch', $lang)} “{query}”.</p>
	{:else if view === 'tiles'}
		<!-- numbered tiles only — as many as fit per row -->
		<div
			class="grid gap-2 {tileSize === 'xl'
				? 'grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))]'
				: tileSize === 'sm'
					? 'grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]'
					: 'grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))]'}"
		>
			{#each filtered as ep, i (ep.number)}
				{@const watched = !!watchedFlags[`${animeId}:${ep.number}`]}
				<a
					href={`/watch/${animeId}/${ep.number}`}
					title={ep.title ?? `${t('episode', $lang)} ${ep.number}`}
					class="relative grid place-items-center rounded-lg border {tileSize === 'sm'
						? 'h-10'
						: tileSize === 'xl'
							? 'h-14'
							: 'h-12'} transition-all duration-150 active:scale-95 {currentEp === ep.number
						? 'border-accent/60 bg-accent/15 text-accent shadow-glow-sm'
						: 'border-line/50 bg-surface/20 text-ink hover:border-accent/40'}"
					transition:fade={{ duration: 260, delay: Math.min(i * 22, 500) }}
				>
					<span class="text-sm font-bold tabular-nums {currentEp === ep.number ? 'text-accent' : 'text-ink'}">
						{String(ep.number).padStart(2, '0')}
					</span>
					{#if watched}
						<span
							class="absolute right-1 top-1 grid h-3 w-3 place-items-center rounded-full bg-accent text-white"
						>
							<Check size={8} strokeWidth={3} />
						</span>
					{/if}
				</a>
			{/each}
		</div>
	{:else if view === 'titles'}
		<!-- number + name — one per row on mobile and in narrow columns,
		     up to 3 per row when wider (unless onePerRow is set) -->
		<div class="grid gap-2 {onePerRow
				? 'grid-cols-1'
				: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}">
			{#each filtered as ep (ep.number)}
				{@const watched = !!watchedFlags[`${animeId}:${ep.number}`]}
				<a
					href={`/watch/${animeId}/${ep.number}`}
					class="flex items-center gap-3 rounded-md border border-line/50 px-3 py-2.5 transition-colors hover:bg-surface/50 active:scale-[0.99] {currentEp === ep.number
						? 'border-accent/50 bg-accent/10'
						: ''}"
					transition:fade={{ duration: 180 }}
				>
					<span
						class="w-8 shrink-0 text-xs font-semibold tabular-nums {currentEp === ep.number
							? 'text-accent'
							: 'text-muted'}"
					>
						#{String(ep.number).padStart(2, '0')}
					</span>
					<span class="min-w-0 flex-1 truncate text-sm text-ink">
						{ep.title ?? `${t('episode', $lang)} ${ep.number}`}
					</span>
					{#if watched}
						<Check size={14} class="shrink-0 text-accent" strokeWidth={3} />
					{/if}
				</a>
			{/each}
		</div>
	{:else}
		<!-- number + name + thumbnail + release date — one per row on mobile
		     and in narrow columns, up to 3 per row when wider (unless onePerRow
		     is set) -->
		<div class="grid gap-3 {onePerRow
				? 'grid-cols-1'
				: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}">
			{#each filtered as ep (ep.number)}
				{@const watched = !!watchedFlags[`${animeId}:${ep.number}`]}
				<a
					href={`/watch/${animeId}/${ep.number}`}
					class="flex items-center gap-3 rounded-lg border border-line/50 p-2 transition-colors hover:bg-surface/50 active:scale-[0.99] {currentEp ===
					ep.number
						? 'border-accent/50 bg-accent/10'
						: ''}"
					transition:fade={{ duration: 180 }}
				>
					<div class="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface2">
						{#if ep.image}
							<img src={ep.image} alt="" loading="lazy" class="h-full w-full object-cover" />
						{:else}
							<div class="grid h-full w-full place-items-center text-muted/40">
								<Film size={18} />
							</div>
						{/if}
						{#if watched}
							<span
								class="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-white"
							>
								<Check size={9} strokeWidth={3} />
							</span>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p
							class="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums {currentEp ===
							ep.number
								? 'text-accent'
								: 'text-muted'}"
						>
							EP {String(ep.number).padStart(2, '0')}
							{#if dateFor(ep)}
								<span class="font-normal text-muted/70">· {dateFor(ep)}</span>
							{/if}
						</p>
						<p
							class="mt-1 truncate text-sm font-medium {currentEp === ep.number
								? 'text-accent'
								: 'text-ink'}"
						>
							{ep.title ?? `${t('episode', $lang)} ${ep.number}`}
						</p>
						{#if ep.description}
							<p class="mt-1 line-clamp-2 text-xs text-muted/80">
								{ep.description}
							</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<!-- Mobile episode-range drawer -->
<BottomSheet open={rangeDrawer} title={t('episodeRange', $lang)} on:close={() => (rangeDrawer = false)}>
	<div class="space-y-1.5">
		{#each ranges as r, i (i)}
			<button
				on:click={() => pickRange(i)}
				class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left text-sm font-medium tabular-nums transition {rangeIndex === i
					? 'border-accent/50 bg-accent/10 text-accent'
					: 'border-line/50 text-ink active:bg-surface/60'}"
			>
				{r.start}–{r.end}
				{#if rangeIndex === i}
					<Check size={15} class="shrink-0 text-accent" strokeWidth={3} />
				{/if}
			</button>
		{/each}
	</div>
</BottomSheet>

<!-- Mobile display-mode bottom sheet -->
<BottomSheet open={mobilePicker} title={t('episodeDisplay', $lang)} on:close={() => (mobilePicker = false)}>
	<div class="space-y-1.5">
		{#each modes as m (m.id)}
			<button
				on:click={() => {
					view = m.id;
					mobilePicker = false;
				}}
				class="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition {view === m.id
					? 'border-accent/50 bg-accent/10 text-ink'
					: 'border-line/50 text-muted'}"
			>
				<svelte:component this={m.icon} size={15} />
				{t(m.key, $lang)}
			</button>
		{/each}
	</div>
</BottomSheet>
