<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		ArrowRight,
		ChevronLeft,
		ChevronRight,
		Grid,
		List,
		RotateCcw,
		Search,
		X
	} from 'lucide-svelte';
	import AnimeCard from '$lib/components/anime/AnimeCard.svelte';
	import AnimeRow from '$lib/components/anime/AnimeRow.svelte';
	import MultiSelect from '$lib/components/ui/MultiSelect.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		getCatalog,
		GENRES,
		TAGS,
		FORMATS,
		STATUSES,
		SEASONS,
		COUNTRIES
	} from '$lib/services/anilist';
	import type { Anime } from '$lib/types';
	import { settings } from '$lib/stores/settings';
	import { lang, t, tf } from '$lib/stores/i18n';

	/* ------------------------------------------------------------------ *
	 * Filter option tables (all sourced from the live catalog service)    *
	 * ------------------------------------------------------------------ */

	const PER_PAGE = 48;

	const SORTS = [
		{ id: 'TRENDING_DESC', key: 'sortTrending' },
		{ id: 'POPULARITY_DESC', key: 'sortPopular' },
		{ id: 'SCORE_DESC', key: 'sortTopRated' },
		{ id: 'START_DATE_DESC', key: 'sortNewest' }
	];
	const DEFAULT_SORT = 'TRENDING_DESC';
	$: sortOpts = SORTS.map((s) => ({ id: s.id, label: t(s.key, $lang) }));

	const currentYear = new Date().getFullYear();
	/** Recent year range offered in the Year dropdown (newest first, 2015..now). */
	const YEARS: string[] = Array.from({ length: currentYear - 2014 }, (_, i) =>
		String(currentYear - i)
	);
	const yearOptsBase = YEARS.map((y) => ({ id: y, label: y }));

	type MultiKey = 'genre' | 'year' | 'season' | 'tags' | 'format' | 'status' | 'country';

	/* ------------------------------------------------------------------ *
	 * URL-synced state                                                    *
	 * ------------------------------------------------------------------ */

	let q = '';
	let genre: string[] = [];
	let year: string[] = [];
	let season: string[] = [];
	let tags: string[] = [];
	let format: string[] = [];
	let status: string[] = [];
	let country: string[] = [];
	let sort = DEFAULT_SORT;
	let pageNum = 1;
	let view: 'grid' | 'row' = $settings.searchView;

	let items: Anime[] = [];
	let total = 0;
	let loading = true;
	let error = '';

	/** Everything the URL carries, in a canonical shape. */
	interface F {
		q: string;
		genre: string[];
		year: string[];
		season: string[];
		tags: string[];
		format: string[];
		status: string[];
		country: string[];
		sort: string;
		page: number;
		view: 'grid' | 'row';
	}

	const current = (): F => ({
		q,
		genre,
		year,
		season,
		tags,
		format,
		status,
		country,
		sort,
		page: pageNum,
		view
	});

	/** encodeURIComponent, but keeps literal commas so lists stay readable in the URL. */
	function enc(v: string): string {
		return encodeURIComponent(v).replace(/%2C/gi, ',');
	}

	function serialize(f: F): string {
		const parts: string[] = [];
		const qq = f.q.trim();
		if (qq) parts.push(`q=${enc(qq)}`);
		if (f.genre.length) parts.push(`genre=${enc(f.genre.join(','))}`);
		if (f.year.length) parts.push(`year=${enc(f.year.join(','))}`);
		if (f.season.length) parts.push(`season=${enc(f.season.join(','))}`);
		if (f.tags.length) parts.push(`tags=${enc(f.tags.join(','))}`);
		if (f.format.length) parts.push(`format=${enc(f.format.join(','))}`);
		if (f.status.length) parts.push(`status=${enc(f.status.join(','))}`);
		if (f.country.length) parts.push(`country=${enc(f.country.join(','))}`);
		if (f.sort !== DEFAULT_SORT) parts.push(`sort=${enc(f.sort)}`);
		if (f.page > 1) parts.push(`page=${f.page}`);
		if (f.view !== 'grid') parts.push(`view=${f.view}`);
		return parts.join('&');
	}

	function splitList(v: string | null): string[] {
		if (!v) return [];
		const out: string[] = [];
		for (const raw of v.split(',')) {
			const s = raw.trim();
			if (s && !out.includes(s)) out.push(s);
		}
		return out;
	}

	function stateFromUrl(url: URL): F {
		const p = url.searchParams;
		const s = p.get('sort');
		const pg = parseInt(p.get('page') ?? '', 10);
		const viewParam = p.get('view');
		return {
			q: p.get('q') ?? '',
			genre: splitList(p.get('genre')).filter((g) => GENRES.includes(g)),
			year: splitList(p.get('year') ?? p.get('years')).filter((y) => /^\d{4}$/.test(y)),
			season: splitList(p.get('season')).filter((v) => SEASONS.some((x) => x.id === v)),
			tags: splitList(p.get('tags') ?? p.get('tag')).filter((v) => TAGS.includes(v)),
			format: splitList(p.get('format')).filter((v) => FORMATS.some((x) => x.id === v)),
			status: splitList(p.get('status')).filter((v) => STATUSES.some((x) => x.id === v)),
			country: splitList(p.get('country')).filter((v) => COUNTRIES.includes(v)),
			sort: s && SORTS.some((x) => x.id === s) ? s : DEFAULT_SORT,
			page: Number.isFinite(pg) && pg > 1 ? pg : 1,
			// Only use URL view if explicitly set; otherwise fall back to settings
			view: viewParam === 'row' ? 'row' : viewParam === 'grid' ? 'grid' : $settings.searchView
		};
	}

	function sync(url: URL) {
		const f = stateFromUrl(url);
		q = f.q;
		genre = f.genre;
		year = f.year;
		season = f.season;
		tags = f.tags;
		format = f.format;
		status = f.status;
		country = f.country;
		sort = f.sort;
		pageNum = f.page;
		view = f.view;
	}

	/** Serialisation of the URL we last wrote ourselves — used to skip feedback loops. */
	let echo = '';
	let lastKey = '';
	let booted = false;

	function writeUrl(replace: boolean): Promise<void> {
		const s = serialize(current());
		echo = s;
		return goto(s ? `/search?${s}` : '/search', {
			noScroll: true,
			keepFocus: true,
			replaceState: replace
		});
	}

	// Single reactive entry point: the URL is the source of truth.
	$: watchUrl($page.url);

	function watchUrl(url: URL) {
		const key = serialize(stateFromUrl(url));
		if (!booted) {
			booted = true;
			lastKey = key;
			sync(url);
			if (browser) load();
			return;
		}
		if (key === lastKey) return;
		lastKey = key;
		// Our own write — local state already matches. Anything else (back/forward,
		// a shared link, or an in-app link) gets pulled into the local state.
		if (key !== echo) sync(url);
		if (browser) load();
	}

	/* ------------------------------------------------------------------ *
	 * Loading                                                             *
	 * ------------------------------------------------------------------ */

	let token = 0;

	async function load() {
		const my = ++token;
		loading = true;
		error = '';
		const f = current();
		try {
			const res = await getCatalog({
				search: f.q.trim() || undefined,
				genre: f.genre.length ? f.genre : undefined,
				tags: f.tags.length ? f.tags : undefined,
				format: f.format.length ? f.format : undefined,
				status: f.status.length ? f.status : undefined,
				season: f.season.length ? f.season : undefined,
				years: f.year.length ? f.year.map(Number) : undefined,
				country: f.country[0] ?? null,
				includeAdult: !$settings.hideAdult,
				sort: f.sort,
				page: f.page,
				perPage: PER_PAGE
			});
			if (my !== token) return;
			items = $settings.hideAdult ? res.list.filter((a) => !a.isAdult) : res.list;
			total = res.total;
		} catch (e) {
			if (my !== token) return;
			error = e instanceof Error ? e.message : 'Search failed to load.';
			items = [];
			total = 0;
		} finally {
			if (my === token) loading = false;
		}
	}

	/* ------------------------------------------------------------------ *
	 * Mutations → URL                                                     *
	 * ------------------------------------------------------------------ */

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => clearTimeout(debounceTimer));

	function onQueryInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			pageNum = 1;
			writeUrl(true);
		}, 350);
	}

	function onQueryKey(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		clearTimeout(debounceTimer);
		pageNum = 1;
		writeUrl(true);
	}

	function clearQuery() {
		clearTimeout(debounceTimer);
		q = '';
		pageNum = 1;
		writeUrl(true);
	}

	function onMultiChange(key: MultiKey, v: string[]) {
		switch (key) {
			case 'genre':
				genre = v;
				break;
			case 'year':
				year = v;
				break;
			case 'season':
				season = v;
				break;
			case 'tags':
				tags = v;
				break;
			case 'format':
				format = v;
				break;
			case 'status':
				status = v;
				break;
			case 'country':
				country = v;
				break;
		}
		pageNum = 1;
		writeUrl(false);
	}

	function onSortChange(v: string[]) {
		sort = v[0] ?? DEFAULT_SORT;
		pageNum = 1;
		writeUrl(false);
	}

	function setView(v: 'grid' | 'row') {
		if (view === v) return;
		view = v;
		writeUrl(false);
	}

	function clearAll() {
		clearTimeout(debounceTimer);
		q = '';
		genre = [];
		year = [];
		season = [];
		tags = [];
		format = [];
		status = [];
		country = [];
		sort = DEFAULT_SORT;
		pageNum = 1;
		writeUrl(false);
	}

	async function setPage(next: number) {
		const target = Math.min(Math.max(1, next), totalPages);
		if (target === pageNum || loading) return;
		pageNum = target;
		await writeUrl(false);
		await tick();
		if (browser) {
			document.getElementById('results-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	/* ------------------------------------------------------------------ *
	 * Derived                                                             *
	 * ------------------------------------------------------------------ */

	$: activeCount =
		genre.length +
		year.length +
		season.length +
		tags.length +
		format.length +
		status.length +
		country.length +
		(sort !== DEFAULT_SORT ? 1 : 0);
	$: trimmed = q.trim();

	$: totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	$: viewAllHref = trimmed ? `/search?q=${enc(trimmed)}` : '/search';
	$: docTitle = trimmed
		? `${t('resultsFor', $lang)} “${trimmed}” — Anikage`
		: `${t('search', $lang)} — Anikage`;

	/** Smart pagination: show first, last, current±1 with ellipsis. */
	function paginationPages(): (number | '...')[] {
		const pages: (number | '...')[] = [];
		if (totalPages <= 7) {
			for (let i = 1; i <= totalPages; i++) pages.push(i);
			return pages;
		}
		pages.push(1);
		if (pageNum <= 3) {
			for (let i = 2; i <= 4; i++) pages.push(i);
			pages.push('...');
			pages.push(totalPages);
		} else if (pageNum >= totalPages - 2) {
			pages.push('...');
			for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
		} else {
			pages.push('...');
			for (let i = pageNum - 1; i <= pageNum + 1; i++) pages.push(i);
			pages.push('...');
			pages.push(totalPages);
		}
		return pages;
	}

	/** Let a shared link's value show through even if it's outside our curated list. */
	function extraOpts(base: { id: string; label: string }[], sel: string[]) {
		const extra = sel.filter((v) => !base.some((o) => o.id === v));
		return extra.length ? [...extra.map((v) => ({ id: v, label: v })), ...base] : base;
	}
	function extraYearOpts(sel: string[]) {
		const extra = sel.filter((y) => !YEARS.includes(y));
		return extra.length
			? [...extra.map((y) => ({ id: y, label: y })), ...yearOptsBase]
			: yearOptsBase;
	}
	$: genreOpts = extraOpts(GENRES.map((v) => ({ id: v, label: v })), genre);
	$: tagOpts = extraOpts(TAGS.map((v) => ({ id: v, label: v })), tags);
	$: yearOpts = extraYearOpts(year);
	$: seasonOpts = extraOpts(SEASONS, season);
	$: formatOpts = extraOpts(FORMATS, format);
	$: statusOpts = extraOpts(STATUSES, status);
	$: countryOpts = extraOpts(COUNTRIES.map((v) => ({ id: v, label: v })), country);
</script>

<svelte:head>
	<title>{docTitle}</title>
</svelte:head>

<div class="mx-auto max-w-[1600px] px-4 pt-8 sm:px-6">
	<!-- Title + view toggle -->
	<div class="mb-5 flex flex-wrap items-center justify-between gap-4">
		<h1 class="font-display text-2xl font-bold tracking-tight text-ink">{t('search', $lang)}</h1>
		<div class="flex items-center gap-1 rounded-md border border-line/60 bg-surface/40 p-1">
			<button
				on:click={() => setView('grid')}
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
				on:click={() => setView('row')}
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

	<!-- Search input -->
	<div class="mb-4 flex items-center gap-2">
		<div class="relative min-w-0 flex-1 sm:max-w-md">
			<Search
				size={15}
				class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
			/>
			<input
				bind:value={q}
				on:input={onQueryInput}
				on:keydown={onQueryKey}
				placeholder={t('searchTitles', $lang)}
				aria-label={t('searchTitlesLabel', $lang)}
				class="w-full rounded-md border border-line/60 bg-surface/40 py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:border-accent/50 focus:outline-none"
			/>
			{#if q}
				<button
					on:click={clearQuery}
					class="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted transition hover:text-ink active:scale-90"
					aria-label={t('clearSearch', $lang)}
				>
					<X size={14} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Filter bar -->
	<div class="mb-5 flex flex-wrap items-center gap-2">
		<MultiSelect
			label={t('fGenre', $lang)}
			options={genreOpts}
			value={genre}
			on:change={(e) => onMultiChange('genre', e.detail)}
		/>
		<MultiSelect
			label={t('fYear', $lang)}
			options={yearOpts}
			value={year}
			on:change={(e) => onMultiChange('year', e.detail)}
		/>
		<MultiSelect
			label={t('fSeason', $lang)}
			options={seasonOpts}
			value={season}
			on:change={(e) => onMultiChange('season', e.detail)}
		/>
		<MultiSelect
			label={t('fTags', $lang)}
			options={tagOpts}
			value={tags}
			on:change={(e) => onMultiChange('tags', e.detail)}
		/>
		<MultiSelect
			label={t('fFormat', $lang)}
			options={formatOpts}
			value={format}
			on:change={(e) => onMultiChange('format', e.detail)}
		/>
		<MultiSelect
			label={t('fStatus', $lang)}
			options={statusOpts}
			value={status}
			on:change={(e) => onMultiChange('status', e.detail)}
		/>
		<MultiSelect
			label={t('fOrigin', $lang)}
			placeholder={t('anywhere', $lang)}
			options={countryOpts}
			value={country}
			multi={false}
			on:change={(e) => onMultiChange('country', e.detail)}
		/>
		<span class="mx-1 hidden h-5 w-px bg-line/60 sm:block" aria-hidden="true"></span>
		<MultiSelect
			label={t('fSort', $lang)}
			options={sortOpts}
			value={[sort]}
			multi={false}
			placeholder={t('sortTrending', $lang)}
			on:change={(e) => onSortChange(e.detail)}
		/>
		{#if activeCount}
			<button
				on:click={clearAll}
				class="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface/40 px-2.5 py-1.5 text-xs font-medium text-muted transition-all duration-150 hover:border-accent/30 hover:text-ink active:scale-95"
			>
				<X size={13} /> {t('clearAll', $lang)}
			</button>
		{/if}
	</div>

	<!-- Results header -->
	<div id="results-top" class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			{#if trimmed}
				<span class="truncate text-sm text-muted">
					{t('resultsFor', $lang)} <span class="font-semibold text-ink">“{trimmed}”</span>
				</span>
				<span class="text-muted/50">·</span>
			{/if}
			<span class="text-xs text-muted">
				{loading ? t('loading', $lang) : `${total} ${total === 1 ? t('titleCount', $lang) : t('titlesCount', $lang)}`}
			</span>
		</div>
		{#if trimmed}
			<a
				href={viewAllHref}
				title={t('clearAll', $lang)}
				class="group inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-accent"
			>
				{t('viewAllResults', $lang)}
				<ArrowRight
					size={13}
					class="transition-transform duration-200 group-hover:translate-x-0.5"
				/>
			</a>
		{/if}
	</div>

	<!-- Results -->
	{#if error}
		<ErrorState message={error} onRetry={() => load()} />
	{:else if loading}
		{#if view === 'grid'}
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
				{#each Array(24) as _, i (i)}
					<div>
						<Skeleton variant="poster" />
						<div class="shimmer-bg mt-1.5 h-3 w-4/5 rounded"></div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{#each Array(9) as _, i (i)}
					<Skeleton variant="block" className="h-28" />
				{/each}
			</div>
		{/if}
	{:else if items.length === 0}
		<div class="hairline rounded-xl bg-surface/30 px-6 py-16 text-center backdrop-blur-md">
			<p class="text-sm text-muted">
				{trimmed
					? `${tf('noTitlesMatched', {}, $lang)} “${trimmed}”`
					: t('noTitlesMatched', $lang)}
			</p>
			<button
				on:click={clearAll}
				class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/50 hover:text-accent active:scale-95"
			>
				<RotateCcw size={13} /> {t('resetFilters', $lang)}
			</button>
		</div>
	{:else if view === 'grid'}
		<div
			class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
			transition:fade={{ duration: 240 }}
		>
			{#each items as a, i (a.id)}
				<AnimeCard anime={a} index={i} compact />
			{/each}
		</div>
	{:else}
		<!-- Row mode: 1 → 2 → 3 columns of horizontal cards -->
		<div
			class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
			transition:fade={{ duration: 240 }}
		>
			{#each items as a, i (a.id)}
				<AnimeRow anime={a} index={i} />
			{/each}
		</div>
	{/if}

	<!-- Pagination -->
	{#if !error && !loading && totalPages > 1}
		<div class="mt-8 flex flex-wrap items-center justify-center gap-1.5">
			<button
				on:click={() => setPage(pageNum - 1)}
				disabled={pageNum <= 1}
				class="flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-ink transition-all duration-150 hover:border-accent/50 hover:text-accent active:scale-95 disabled:pointer-events-none disabled:opacity-40"
				aria-label={t('previousPage', $lang)}
			>
				<ChevronLeft size={14} /> {t('prev', $lang)}
			</button>
			{#each paginationPages() as p, i}
				{#if p === '...'}
					<span class="flex items-center px-2 text-xs text-muted" aria-hidden="true">…</span>
				{:else}
					<button
						on:click={() => setPage(p as number)}
						class="flex h-8 min-w-[2.2rem] items-center justify-center rounded-md border border-line/60 px-2 py-1 text-xs font-medium text-ink transition-all duration-150 hover:border-accent/50 hover:text-accent active:scale-95 {pageNum === p
							? 'border-accent bg-accent/10 text-accent font-semibold'
							: ''}"
						aria-label={`${t('page', $lang)} ${p}`}
						aria-current={pageNum === p ? 'page' : undefined}
					>
						{p}
					</button>
				{/if}
			{/each}
			<button
				on:click={() => setPage(pageNum + 1)}
				disabled={pageNum >= totalPages}
				class="flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-ink transition-all duration-150 hover:border-accent/50 hover:text-accent active:scale-95 disabled:pointer-events-none disabled:opacity-40"
				aria-label={t('nextPage', $lang)}
			>
				{t('next', $lang)} <ChevronRight size={14} />
			</button>
		</div>
	{/if}
</div>
