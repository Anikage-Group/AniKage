<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { Calendar, ChevronLeft, ChevronRight, Clock, Layers } from 'lucide-svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import WatchlistMenu from '$lib/components/anime/WatchlistMenu.svelte';
	import {
		getWeekSchedule,
		dayKeyOf,
		dayDate,
		dayDateNumber,
		weekStart,
		DAY_LABELS,
		type DayKey
	} from '$lib/services/anilist';
	import { countdown, formatTime } from '$lib/utils/format';
	import type { ScheduleEntry } from '$lib/types';
	import { watchlist } from '$lib/stores/watchlist';
	import { settings, updateSetting } from '$lib/stores/settings';
	import { lang, t, titleFor } from '$lib/stores/i18n';

	const days: { id: DayKey; label: string }[] = (
		['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as DayKey[]
	).map((d) => ({ id: d, label: DAY_LABELS[d] }));

	let schedule = new Map<string, ScheduleEntry[]>();
	let active = dayKeyOf();
	let loading = true;
	let error = '';
	let now = Date.now();
	let ticker: ReturnType<typeof setInterval>;
	let weekOffset = 0;
	let today = dayKeyOf();

	/** The Monday of the week currently on screen. */
	$: weekFrom = new Date((weekStart() + weekOffset * 7 * 86400) * 1000);
	$: activeDate = dayDate(active, weekFrom);
	$: weekLabel = weekFrom.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	$: weekEndLabel = new Date(weekFrom.getTime() + 6 * 86400000).toLocaleDateString(undefined, {
		day: 'numeric',
		month: 'short'
	});

	$: onlyWatchlist = $settings.scheduleWatchlistOnly;

	async function load() {
		loading = true;
		error = '';
		const offset = weekOffset;
		try {
			const result = await getWeekSchedule(offset);
			// A slower older request must not overwrite a newer week.
			if (offset === weekOffset) schedule = result;
		} catch (e) {
			if (offset === weekOffset) error = e instanceof Error ? e.message : 'Schedule unavailable.';
		} finally {
			if (offset === weekOffset) loading = false;
		}
	}

	function goWeek(delta: number) {
		weekOffset += delta;
		load();
	}

	function goThisWeek() {
		if (weekOffset === 0) return;
		weekOffset = 0;
		active = dayKeyOf();
		load();
	}

	onMount(() => {
		load();
		ticker = setInterval(() => {
			now = Date.now();
			const todayNow = dayKeyOf();
			if (todayNow !== today) {
				// Midnight rolled over — follow "today" when viewing this week.
				today = todayNow;
				if (weekOffset === 0) active = todayNow;
			}
		}, 1000);
	});
	onDestroy(() => clearInterval(ticker));

	$: entries = (schedule.get(active) ?? []).filter(
		(e) =>
			(!onlyWatchlist || $watchlist[e.anime.id]) && (!$settings.hideAdult || !e.anime.isAdult)
	);

	/** Index of the first entry still to air today — the "next up" marker line. */
	$: nextUpIndex = entries.findIndex((e) => e.airingAt * 1000 > now);
</script>

<svelte:head>
	<title>Release Schedule — Anikage</title>
</svelte:head>

<div class="relative">
	<Ambient />
	<div class="relative z-10 mx-auto max-w-[1100px] px-4 pt-8 sm:px-6">
		<div
			class="mb-6 flex flex-col items-center gap-4 text-center"
			in:fly={{ y: 14, duration: 420, delay: 0 }}
		>
			<div>
				<h1 class="font-display text-2xl font-bold tracking-tight text-ink">{t('releaseSchedule', $lang)}</h1>
				<p class="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted">
					<Calendar size={12} /> {DAY_LABELS[active]} · {activeDate} · {t('timesInTimezone', $lang)}
				</p>
			</div>

			<!-- Week navigation -->
			<div class="flex items-center gap-1 rounded-lg border border-line/60 bg-surface/30 p-1">
				<button
					on:click={() => goWeek(-1)}
					aria-label="Previous week"
					class="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-surface/60 hover:text-ink active:scale-95"
				>
					<ChevronLeft size={16} />
				</button>
				<button
					on:click={goThisWeek}
					class="flex min-w-[9.5rem] flex-col items-center rounded-md px-3 py-1 transition hover:bg-surface/60 {weekOffset ===
					0
						? 'cursor-default'
						: 'active:scale-95'}"
					title={weekOffset === 0 ? 'This week' : 'Back to this week'}
				>
					<span class="text-[11px] font-semibold text-ink">
						{weekOffset === 0 ? 'This week' : weekOffset > 0 ? `In ${weekOffset} week${weekOffset > 1 ? 's' : ''}` : `${-weekOffset} week${weekOffset < -1 ? 's' : ''} ago`}
					</span>
					<span class="text-[10px] text-muted">{weekLabel} – {weekEndLabel}</span>
				</button>
				<button
					on:click={() => goWeek(1)}
					aria-label="Next week"
					class="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-surface/60 hover:text-ink active:scale-95"
				>
					<ChevronRight size={16} />
				</button>
			</div>

			<button
				on:click={() => updateSetting('scheduleWatchlistOnly', !onlyWatchlist)}
				class="flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-all duration-150 active:scale-95 {onlyWatchlist
					? 'border-accent/50 bg-accent/10 text-accent'
					: 'border-line/60 text-muted hover:border-accent/30 hover:text-ink'}"
			>
				<Layers size={13} /> {t('inMyWatchlistOnly', $lang)}
			</button>
		</div>

		<!-- Day tabs: date above day name, centred as a group -->
		<div
			class="no-scrollbar mb-6 overflow-x-auto border-b border-line/50"
			in:fly={{ y: 14, duration: 420, delay: 80 }}
		>
			<div class="mx-auto flex w-max items-end gap-1 sm:gap-2">
				{#each days as d (d.id)}
					{@const isActive = active === d.id}
					{@const isToday = weekOffset === 0 && d.id === today}
					<button
						on:click={() => (active = d.id)}
						class="relative shrink-0 rounded-t-md px-1.5 pb-2.5 pt-1 text-center transition-colors duration-200 sm:px-3 {isActive
							? 'bg-accent/10 text-ink'
							: 'text-muted hover:text-ink'}"
					>
						<span
							class="block text-[10px] font-medium uppercase tracking-wide {isActive
								? 'text-accent'
								: 'text-muted'}"
						>
							<span class="sm:hidden">{dayDateNumber(d.id, weekFrom)}</span>
							<span class="hidden sm:inline">{dayDate(d.id, weekFrom)}</span>
						</span>
						<span class="mt-0.5 flex items-center justify-center gap-1 text-sm font-semibold tracking-wide">
							{d.label}
							{#if isToday}
								<span class="h-1 w-1 rounded-full bg-accent" aria-hidden="true"></span>
							{/if}
						</span>
						{#if isActive}
							<span
								class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
								style="box-shadow: 0 0 12px color-mix(in srgb, var(--c-accent) 60%, transparent);"
							></span>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		{#if error}
			<ErrorState message={error} onRetry={load} />
		{:else if loading}
			<!-- one anime per row -->
			<div class="grid gap-3">
				{#each Array(6) as _}
					<div class="hairline flex min-w-0 items-center gap-4 rounded-xl bg-surface/30 p-3">
						<Skeleton className="h-24 w-16 shrink-0" />
						<div class="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-2/3" />
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-4/5" />
						</div>
						<Skeleton className="h-4 w-16 shrink-0" />
					</div>
				{/each}
			</div>
		{:else if entries.length === 0}
			<div class="hairline rounded-xl bg-surface/30 py-16 text-center">
				<p class="text-sm text-muted">
					{onlyWatchlist
						? t('nothingWatchlistDay', $lang)
						: t('noAiringDay', $lang)}
				</p>
			</div>
		{:else}
			<!-- One anime per row: image + description on the left, time right-aligned.
			     The whole list is keyed by day and fades in once, instead of every
			     row fading out and back in on its own (which read as a double
			     flicker when switching days). -->
			{#key active}
				<div class="grid gap-3" in:fade={{ duration: 200 }}>
					{#each entries as e, i (e.anime.id + ':' + e.episode)}
						{@const past = e.airingAt * 1000 < now}
						{#if i === nextUpIndex && nextUpIndex > 0}
							<!-- dotted "next up" divider -->
							<div class="flex items-center gap-3 py-1" aria-hidden="true">
								<span class="text-[10px] font-semibold uppercase tracking-widest text-accent">
									{t('nextUp', $lang)}
								</span>
								<span class="h-px flex-1 border-t border-dashed border-accent/50"></span>
							</div>
						{/if}
						<div
							class="group hairline relative flex min-w-0 items-center gap-4 rounded-xl bg-surface/30 p-3 backdrop-blur-md transition-all duration-300 hover:border-accent/40 hover:shadow-glow-sm"
							in:fade={{ duration: 320, delay: Math.min(i * 55, 700) }}
						>
							<!-- stretched row link; action controls sit above it -->
							<a
								href={`/watch/${e.anime.id}/${e.episode}`}
								class="absolute inset-0 z-0 rounded-xl"
								aria-label={titleFor(e.anime, $lang)}
							></a>

							<div
								class="pointer-events-none relative z-10 h-24 w-16 shrink-0 overflow-hidden rounded-md bg-surface2"
							>
								{#if e.anime.cover}
									<img
										src={e.anime.cover}
										alt=""
										loading="lazy"
										class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
									/>
								{/if}
							</div>

							<div class="pointer-events-none relative z-10 min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent">
									{titleFor(e.anime, $lang)}
								</p>
								<p class="mt-1 text-xs leading-relaxed text-muted line-clamp-2">
									{e.anime.description || e.anime.genres.slice(0, 3).join(' · ')}
								</p>
								<p class="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
									<span
										class="rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-semibold text-accent"
									>
										EP {e.episode}
									</span>
									{past ? t('aired', $lang) : countdown(e.airingAt)}
								</p>
							</div>

							<div class="relative z-20 flex shrink-0 items-center gap-2">
								<!-- time right-aligned -->
								<div class="pointer-events-none text-right">
									<p class="flex items-center justify-end gap-1 text-sm font-semibold {past ? 'text-muted' : 'text-accent2'}">
										<Clock size={13} /> {formatTime(e.airingAt)}
									</p>
								</div>
								<div class="pointer-events-auto">
									<WatchlistMenu anime={e.anime} />
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/key}
		{/if}
	</div>
</div>
