<script lang="ts">
	import { onMount } from 'svelte';
	import HeroSlider from '$lib/components/anime/HeroSlider.svelte';
	import RailRow from '$lib/components/anime/RailRow.svelte';
	import TopTen from '$lib/components/anime/TopTen.svelte';
	import ContinueCard from '$lib/components/anime/ContinueCard.svelte';
	import TodaySchedule from '$lib/components/home/TodaySchedule.svelte';
	import {
		getTrending,
		getPopularThisSeason,
		getRecentlyUpdated,
		getTopAiring,
		getTop10
	} from '$lib/services/anilist';
	import type { Anime, ProgressEntry } from '$lib/types';
	import { continueList, progress } from '$lib/stores/history';
	import { settings } from '$lib/stores/settings';
	import { lang, t } from '$lib/stores/i18n';

	let trending: Anime[] = [];
	let seasonal: Anime[] = [];
	let recent: Anime[] = [];
	let airing: Anime[] = [];
	let topToday: Anime[] = [];
	let topWeek: Anime[] = [];
	let topMonth: Anime[] = [];
	let cont: ProgressEntry[] = [];

	let loading = true;
	let errors: Record<string, string> = {};

	$: hideAdult = $settings.hideAdult;
	// Stay in sync with the progress store so removing a card updates instantly
	// (and a newly-started episode appears without a reload).
	$: cont = continueList($progress);
	// The mirror fallback wires getTrending to the airing list (and getTopAiring
	// to the popularity list), so the hero shows the current Top Airing titles.
	$: heroItems = clean(trending, hideAdult).slice(0, 10);
	$: trendingList = clean(trending, hideAdult);
	$: seasonalList = clean(seasonal, hideAdult);
	$: recentList = clean(recent, hideAdult);
	$: airingList = clean(airing, hideAdult);
	$: topTodayList = clean(topToday, hideAdult);
	$: topWeekList = clean(topWeek, hideAdult);
	$: topMonthList = clean(topMonth, hideAdult);

	function clean(list: Anime[], hide: boolean): Anime[] {
		return hide ? list.filter((a) => !a.isAdult) : list;
	}

	async function loadAll() {
		loading = true;
		errors = {};
		const results = await Promise.allSettled([
			getTrending(1, 16),
			getPopularThisSeason(1, 18),
			getRecentlyUpdated(1, 18),
			getTopAiring(1, 18),
			getTop10('today'),
			getTop10('week'),
			getTop10('month')
		]);
		const [t, s, r, a, tt, tw, tm] = results;
		if (t.status === 'fulfilled') trending = t.value.list;
		else errors.trending = 'trending';
		if (s.status === 'fulfilled') seasonal = s.value.list;
		else errors.seasonal = 'seasonal';
		if (r.status === 'fulfilled') recent = r.value.list;
		else errors.recent = 'recent';
		if (a.status === 'fulfilled') airing = a.value.list;
		else errors.airing = 'airing';
		if (tt.status === 'fulfilled') topToday = tt.value.list;
		else errors.topToday = 'topToday';
		if (tw.status === 'fulfilled') topWeek = tw.value.list;
		else errors.topWeek = 'topWeek';
		if (tm.status === 'fulfilled') topMonth = tm.value.list;
		else errors.topMonth = 'topMonth';
		loading = false;
	}

	onMount(loadAll);
</script>

<svelte:head>
	<title>Anikage — Watch Anime</title>
</svelte:head>

<div class="relative">
	<HeroSlider items={heroItems} {loading} />

	<div class="relative z-10 px-4 sm:px-6 lg:px-8">
		<!-- Continue Watching (compact) -->
		{#if cont.length}
			<section class="mb-8">
				<div class="mb-3 flex items-center gap-3">
					<span class="h-4 w-0.5 rounded-full bg-accent"></span>
					<h2 class="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
						{t('continueWatching', $lang)}
					</h2>
					<a href="/continue" class="ml-auto text-xs font-medium text-muted hover:text-accent">{t('viewAll', $lang)}</a>
				</div>
				<div class="no-scrollbar flex gap-3 overflow-x-auto pb-1">
					{#each cont.slice(0, 6) as entry (entry.id)}
						<div class="w-52 shrink-0 sm:w-60">
							<ContinueCard {entry} />
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Main feed + compact ~400px Top 10 column (desktop) -->
		<div class="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
			<div class="min-w-0 space-y-10">
				<RailRow
					title={t('popularThisSeason', $lang)}
					items={seasonalList}
					loading={loading}
					error={errors.seasonal}
					onRetry={loadAll}
					viewAllHref="/search?sort=POPULARITY_DESC"
					reveal={0}
				/>
				<RailRow
					title={t('recentlyUpdated', $lang)}
					items={recentList}
					loading={loading}
					error={errors.recent}
					onRetry={loadAll}
					reveal={1}
				/>
				<RailRow
					title={t('topAiring', $lang)}
					items={airingList}
					loading={loading}
					error={errors.airing}
					onRetry={loadAll}
					reveal={2}
				/>
				<RailRow
					title={t('trendingNow', $lang)}
					items={trendingList}
					loading={loading}
					error={errors.trending}
					onRetry={loadAll}
					reveal={3}
				/>
			</div>

			<!-- Desktop sidebar: one combined rankings section + today's schedule under it -->
			<aside class="hidden lg:block">
				<div class="space-y-6">
					<TopTen
						title={t('rankings', $lang)}
						ranges={[
							{ id: 'today', label: t('topToday', $lang), items: topTodayList, error: errors.topToday },
							{ id: 'week', label: t('topWeek', $lang), items: topWeekList, error: errors.topWeek },
							{ id: 'month', label: t('topMonth', $lang), items: topMonthList, error: errors.topMonth }
						]}
						{loading}
						onRetry={loadAll}
						reveal={4}
					/>

					<!-- Today's airing schedule sits under the rankings column -->
					<TodaySchedule limit={8} reveal={5} />
				</div>
			</aside>
		</div>

		<!-- Mobile: rankings (one section) + schedule list, at the bottom -->
		<div class="mt-10 space-y-10 lg:hidden">
			<TopTen
				title={t('rankings', $lang)}
				ranges={[
					{ id: 'today', label: t('topToday', $lang), items: topTodayList, error: errors.topToday },
					{ id: 'week', label: t('topWeek', $lang), items: topWeekList, error: errors.topWeek },
					{ id: 'month', label: t('topMonth', $lang), items: topMonthList, error: errors.topMonth }
				]}
				{loading}
				onRetry={loadAll}
				reveal={4}
			/>
			<TodaySchedule limit={12} reveal={5} />
		</div>
	</div>
</div>
