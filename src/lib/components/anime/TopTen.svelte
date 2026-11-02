<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Star, RotateCcw } from 'lucide-svelte';
	import type { Anime } from '$lib/types';
	import { formatScore } from '$lib/utils/format';
	import { lang, t, titleFor } from '$lib/stores/i18n';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';

	/**
	 * Combined rankings section — a single panel with an internal range switcher
	 * (Today / This Week / This Month) instead of three separate ranked columns.
	 */
	export let title = 'Rankings';
	export let ranges: { id: string; label: string; items: Anime[]; error?: string }[] = [];
	export let loading = false;
	export let onRetry: (() => void) | null = null;
	/** Stagger position of this section in the page's entrance cascade. */
	export let reveal = 0;

	/** Error ids raised by the home page → dictionary keys. */
	const ERR_KEYS: Record<string, string> = {
		trending: 'errTrending',
		seasonal: 'errSeasonal',
		recent: 'errRecent',
		airing: 'errAiring',
		topToday: 'errToday',
		topWeek: 'errWeek',
		topMonth: 'errMonth'
	};

	let active = ranges?.[0]?.id ?? '';
	let started = false;

	$: if (!started && ranges.length) {
		active = ranges[0].id;
		started = true;
	}
	$: current = ranges.find((r) => r.id === active) ?? ranges[0];
	$: items = current?.items ?? [];
	$: errorText = current?.error
		? ERR_KEYS[current.error]
			? t(ERR_KEYS[current.error], $lang)
			: current.error
		: '';
</script>

<section
	class="hairline overflow-hidden rounded-xl bg-surface/30 backdrop-blur-md"
	in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(reveal) }}
>
	<div class="flex items-center gap-3 border-b border-line/50 px-4 py-3">
		<span class="h-4 w-0.5 rounded-full bg-accent"></span>
		<h3 class="font-display text-sm font-semibold tracking-tight text-ink">{title}</h3>

		<!-- internal range switcher keeps rankings in one section -->
		<div class="ml-auto flex items-center gap-0.5 rounded-md bg-surface/50 p-0.5">
			{#each ranges as r (r.id)}
				<button
					on:click={() => (active = r.id)}
					class="rounded px-2 py-1 text-[11px] font-medium transition-colors {active === r.id
						? 'bg-accent/15 text-accent'
						: 'text-muted hover:text-ink'}"
				>
					{r.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="p-2">
		{#if loading}
			{#each Array(6) as _, i (i)}
				<div class="flex items-center gap-3 px-2 py-2.5">
					<Skeleton className="h-6 w-8 shrink-0" />
					<Skeleton className="h-14 w-10 shrink-0" />
					<div class="flex-1 space-y-1.5">
						<Skeleton className="h-3 w-3/4" />
						<Skeleton className="h-2.5 w-1/3" />
					</div>
				</div>
			{/each}
		{:else if current?.error}
			<div class="px-4 py-8 text-center">
				<p class="text-xs text-muted">{errorText}</p>
				{#if onRetry}
					<button
						on:click={onRetry}
						class="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/50 hover:text-accent active:scale-95"
					>
						<RotateCcw size={12} /> {t('retry', $lang)}
					</button>
				{/if}
			</div>
		{:else}
			{#key active}
				{#each items.slice(0, 10) as a, i (a.id)}
					<a
						href={`/anime/${a.id}`}
						in:fade={{ duration: 240, delay: i * 30 }}
						class="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface/60"
					>
						<span
							class="w-8 shrink-0 text-center font-display text-lg font-bold tabular-nums {i === 0
								? 'text-amber-300'
								: i === 1
									? 'text-zinc-300'
									: i === 2
										? 'text-orange-400'
										: 'text-muted/60'}"
						>
							#{String(i + 1).padStart(2, '0')}
						</span>
						<div class="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-surface2">
							{#if a.cover}
								<img
									src={a.cover}
									alt=""
									loading="lazy"
									class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
								/>
							{/if}
							<!-- solid bottom merge so the thumb melts into the row -->
							<div class="top10-merge-b pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-black/55"></div>
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[13px] font-medium text-ink transition-colors group-hover:text-accent">
								{titleFor(a, $lang)}
							</p>
							<p class="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
								{#if a.nextAiring}<span>EP {a.nextAiring.episode}</span>{/if}
								{#if a.episodes}<span>{a.episodes} {t('eps', $lang)}</span>{/if}
								{#if a.score}
									<span class="flex items-center gap-0.5 text-amber-300">
										<Star size={9} fill="currentColor" /> {formatScore(a.score)}
									</span>
								{/if}
							</p>
						</div>
					</a>
				{/each}
			{/key}
		{/if}
	</div>
</section>

<style>
	/* Solid dark band, faded out with a CSS mask (no background gradients). */
	.top10-merge-b {
		-webkit-mask-image: linear-gradient(to top, black 0%, black 40%, transparent 100%);
		mask-image: linear-gradient(to top, black 0%, black 40%, transparent 100%);
	}
</style>
