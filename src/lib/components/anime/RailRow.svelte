<script lang="ts">
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import AnimeCard from './AnimeCard.svelte';
	import type { Anime } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';

	export let title: string;
	export let items: Anime[] = [];
	export let loading = false;
	/** Either a literal message or a home-page error id (see `ERR_KEYS`). */
	export let error = '';
	export let onRetry: (() => void) | null = null;
	export let viewAllHref: string | null = null;
	/** Optional per-item caption shown under the card title (e.g. relation type). */
	export let meta: Record<number, string> = {};
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
	$: errorText = error ? (ERR_KEYS[error] ? t(ERR_KEYS[error], $lang) : error) : '';

	let rail: HTMLElement;

	function scrollBy(dir: number) {
		rail?.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: 'smooth' });
	}
</script>

<section
	class="relative"
	in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(reveal) }}
>
	<div class="mb-3 flex items-end justify-between gap-4">
		<div class="flex items-center gap-3">
			<span class="h-4 w-0.5 rounded-full bg-accent"></span>
			<h2 class="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">{title}</h2>
		</div>
		<div class="flex items-center gap-1.5">
			{#if viewAllHref}
				<a
					href={viewAllHref}
					class="mr-2 text-xs font-medium text-muted transition hover:text-accent"
				>
					{t('viewAll', $lang)}
				</a>
			{/if}
			<button
				on:click={() => scrollBy(-1)}
				class="hidden h-7 w-7 place-items-center rounded-md border border-line/50 text-muted transition hover:border-accent/40 hover:text-accent active:scale-95 sm:grid"
				aria-label={t('scrollLeft', $lang)}
			>
				<ChevronLeft size={15} />
			</button>
			<button
				on:click={() => scrollBy(1)}
				class="hidden h-7 w-7 place-items-center rounded-md border border-line/50 text-muted transition hover:border-accent/40 hover:text-accent active:scale-95 sm:grid"
				aria-label={t('scrollRight', $lang)}
			>
				<ChevronRight size={15} />
			</button>
		</div>
	</div>

	{#if error}
		<div class="hairline rounded-md bg-surface/30 px-4 py-6 text-center">
			<p class="text-sm text-muted">{errorText}</p>
			{#if onRetry}
				<button on:click={onRetry} class="mt-2 text-xs font-medium text-accent hover:underline">
					{t('retry', $lang)}
				</button>
			{/if}
		</div>
	{:else}
		<div
			bind:this={rail}
			class="no-scrollbar -mx-1 -mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 pb-1 pt-2"
		>
			{#if loading}
				{#each Array(7) as _, i (i)}
					<div class="w-[150px] shrink-0 sm:w-[170px]">
						<div class="shimmer-bg aspect-[2/3] w-full rounded-md"></div>
						<div class="shimmer-bg mt-2 h-3 w-4/5 rounded"></div>
						<div class="shimmer-bg mt-1.5 h-2.5 w-1/2 rounded"></div>
					</div>
				{/each}
			{:else}
				{#each items as a, i (a.id)}
					<div
						class="w-[150px] shrink-0 snap-start sm:w-[170px]"
						style="animation: none;"
					>
						<div style="--i:{i}">
							<AnimeCard anime={a} index={i} />
						</div>
						{#if meta[a.id]}
							<p class="mt-1 truncate text-[10px] uppercase tracking-wide text-muted">
								{meta[a.id]}
							</p>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</section>
