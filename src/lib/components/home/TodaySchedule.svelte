<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { onMount, onDestroy } from 'svelte';
	import { Clock, CalendarDays } from 'lucide-svelte';
	import { getWeekSchedule, dayKeyOf, dayDate, DAY_LABELS, type DayKey } from '$lib/services/anilist';
	import type { ScheduleEntry } from '$lib/types';
	import { formatTime, countdown } from '$lib/utils/format';
	import { settings } from '$lib/stores/settings';
	import { lang, t, titleFor } from '$lib/stores/i18n';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';

	/**
	 * Airing schedule around the current time.
	 *
	 * The list is a rolling window centred on "now": half of the entries are
	 * from the past and half from the future, with the "next up" line in the
	 * middle. When the current day runs out of past or future episodes the
	 * window simply reaches into the previous / next day, so the split always
	 * stays centred (e.g. 4 old + 4 new).
	 */
	export let limit = 8;
	/** Stagger position of this section in the page's entrance cascade. */
	export let reveal = 0;

	let week = new Map<string, ScheduleEntry[]>();
	let loading = true;
	let error = '';
	let now = Date.now();
	let ticker: ReturnType<typeof setInterval>;

	const todayKey: DayKey = dayKeyOf();
	const dayLabel = DAY_LABELS[todayKey];
	const todayDate = dayDate(todayKey);

	/** Entries shown before / after the "next up" line. */
	$: before = Math.floor(limit / 2);
	$: after = limit - before;

	$: hideAdult = $settings.hideAdult;

	/** Every episode of the week on a single timeline. */
	$: timeline = [...week.values()]
		.flat()
		.filter((e) => !hideAdult || !e.anime.isAdult)
		.sort((a, b) => a.airingAt - b.airingAt);

	/** Where "now" sits on that timeline. */
	$: splitIndex = timeline.findIndex((e) => e.airingAt * 1000 > now);

	$: pastEntries =
		splitIndex < 0
			? timeline.slice(-before)
			: timeline.slice(Math.max(0, splitIndex - before), splitIndex);
	$: futureEntries = splitIndex < 0 ? [] : timeline.slice(splitIndex, splitIndex + after);

	/** The window: past entries first, then the upcoming ones. */
	$: rows = [
		...pastEntries.map((e) => ({ entry: e, upcoming: false })),
		...futureEntries.map((e) => ({ entry: e, upcoming: true }))
	];

	/** Index the "next up" line is drawn before. */
	$: splitAt = pastEntries.length;

	async function load() {
		loading = true;
		error = '';
		try {
			week = await getWeekSchedule();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load today’s schedule.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		load();
		ticker = setInterval(() => (now = Date.now()), 30_000);
	});
	onDestroy(() => clearInterval(ticker));
</script>

<section
	class="relative mb-10"
	in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(reveal) }}
>
	<div class="mb-3 flex items-end justify-between gap-4">
		<div class="flex items-center gap-3">
			<span class="h-4 w-0.5 rounded-full bg-accent"></span>
			<h2 class="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
				{t('airingToday', $lang)}
				<span class="ml-2 text-xs font-medium text-muted">· {dayLabel} {todayDate}</span>
			</h2>
		</div>
		<a href="/schedule" class="text-xs font-medium text-muted transition hover:text-accent">
			{t('fullSchedule', $lang)}
		</a>
	</div>

	{#if error}
		<ErrorState message={error} onRetry={load} />
	{:else if loading}
		<div class="grid gap-2">
			{#each Array(5) as _, i (i)}
				<div class="hairline flex items-center gap-3 rounded-lg bg-surface/30 p-2.5">
					<Skeleton className="h-14 w-10 shrink-0" />
					<div class="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-3.5 w-2/3" />
						<Skeleton className="h-2.5 w-1/3" />
					</div>
					<Skeleton className="h-3 w-12 shrink-0" />
				</div>
			{/each}
		</div>
	{:else if rows.length === 0}
		<div class="hairline rounded-xl bg-surface/30 py-10 text-center backdrop-blur-md">
			<p class="text-sm text-muted">{t('nothingAirsToday', $lang)}</p>
			<a href="/schedule" class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
				<CalendarDays size={13} /> {t('browseWeekly', $lang)}
			</a>
		</div>
	{:else}
		<!-- compact list: one anime per row -->
		<div class="grid gap-2">
			{#each rows as row, i (row.entry.anime.id + ':' + row.entry.episode)}
				{@const e = row.entry}
				{@const past = e.airingAt * 1000 < now}
				{@const day = dayKeyOf(new Date(e.airingAt * 1000))}
				{@const otherDay = day !== todayKey}

				<!-- "next up" line, centred in the window -->
				{#if i === splitAt && splitAt > 0 && splitAt < rows.length}
					<div class="flex items-center gap-3 py-1" aria-hidden="true">
						<span class="text-[10px] font-semibold uppercase tracking-widest text-accent">
							{t('nextUp', $lang)}
						</span>
						<span class="h-px flex-1 border-t border-dashed border-accent/50"></span>
					</div>
				{/if}

				<a
					href={`/watch/${e.anime.id}/${e.episode}`}
					transition:fade={{ duration: 240 }}
					class="group hairline flex min-w-0 items-center gap-3 rounded-lg bg-surface/30 p-2.5 backdrop-blur-md transition-all duration-300 hover:border-accent/40"
				>
					<div class="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface2">
						{#if e.anime.cover}
							<img
								src={e.anime.cover}
								alt=""
								loading="lazy"
								class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
							/>
						{/if}
					</div>

					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-ink transition-colors group-hover:text-accent">
							{titleFor(e.anime, $lang)}
						</p>
						<p class="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
							<span
								class="rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-semibold text-accent"
							>
								EP {e.episode}
							</span>
							<span class={past ? 'text-muted' : 'text-accent2'}>
								{past ? t('aired', $lang) : countdown(e.airingAt)}
							</span>
							{#if otherDay}
								<span class="rounded border border-line/60 px-1.5 py-0.5 text-[10px] font-medium">
									{DAY_LABELS[day]}
								</span>
							{/if}
						</p>
					</div>

					<span class="flex shrink-0 items-center gap-1 text-xs font-semibold {past ? 'text-muted' : 'text-accent2'}">
						<Clock size={12} /> {formatTime(e.airingAt)}
					</span>
				</a>
			{/each}
		</div>
	{/if}
</section>
