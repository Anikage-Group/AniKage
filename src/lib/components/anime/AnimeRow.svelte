<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Play, Star, X } from 'lucide-svelte';
	import WatchlistMenu from '$lib/components/anime/WatchlistMenu.svelte';
	import type { Anime } from '$lib/types';
	import { WATCH_STATUSES } from '$lib/types';
	import { watchlist } from '$lib/stores/watchlist';
	import { lang, t, titleFor } from '$lib/stores/i18n';
	import { formatScore } from '$lib/utils/format';

	export let anime: Anime;
	/** Used to stagger the entrance animation. */
	export let index = 0;
	/** Show the watch-page shortcut (watchlist rows). */
	export let showPlay = false;
	/** Show the remove-from-watchlist action (watchlist rows). */
	export let showRemove = false;

	const dispatch = createEventDispatcher<{ remove: void }>();

	$: meta = [anime.format, anime.seasonYear, anime.studio].filter(Boolean).join(' · ');
	$: entry = $watchlist[anime.id];
	$: statusLabel = entry
		? (WATCH_STATUSES.find((s) => s.id === entry.status)?.label ?? entry.status)
		: '';

	function onRemove(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		dispatch('remove');
	}
</script>

<!--
	Horizontal card shared by search row mode and the watchlist. The stretched
	link covers the whole card at z-10; poster, text, and controls either sit
	above it or pass clicks through so every part of the card still navigates.
-->
<div
	in:fade={{ duration: 240, delay: Math.min(index * 14, 320) }}
	class="group relative flex gap-3 rounded-lg border border-line/50 bg-surface/30 p-2 transition-all duration-200 hover:border-accent/40 hover:bg-surface/50 hover:shadow-glow-sm active:scale-[0.98]"
>
	<a
		href={`/anime/${anime.id}`}
		class="absolute inset-0 z-10 rounded-lg"
		aria-label={titleFor(anime, $lang)}
	></a>

	<div
		class="pointer-events-none relative h-[104px] w-[70px] shrink-0 overflow-hidden rounded-md"
	>
		{#if anime.cover}
			<img
				src={anime.cover}
				alt=""
				loading="lazy"
				class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
			/>
		{:else}
			<div class="shimmer-bg h-full w-full"></div>
		{/if}
	</div>

	<div class="pointer-events-none flex min-w-0 flex-1 flex-col">
		<div class="flex min-w-0 items-start gap-2">
			<p class="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-ink group-hover:text-accent">
				{titleFor(anime, $lang)}
			</p>
			<div class="pointer-events-auto relative z-20 -mt-1 shrink-0">
				<WatchlistMenu {anime} />
			</div>
		</div>

		{#if entry}
			<p class="mt-1 text-[11px] font-medium text-accent">{statusLabel}</p>
		{/if}

		{#if meta}
			<p class="mt-1 truncate text-[11px] text-muted">{meta}</p>
		{/if}

		{#if anime.description}
			<p class="mt-1 line-clamp-2 text-[11px] leading-snug text-muted/80">
				{anime.description}
			</p>
		{/if}

		<div class="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5">
			{#if anime.score}
				<span
					class="flex items-center gap-1 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
				>
					<Star size={9} fill="currentColor" /> {formatScore(anime.score)}
				</span>
			{/if}
			{#if anime.episodes}
				<span class="rounded border border-line/60 px-1.5 py-0.5 text-[10px] text-muted">
					{anime.episodes} {t('eps', $lang)}
				</span>
			{/if}
			{#each anime.genres.slice(0, 2) as g (g)}
				<span
					class="rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
				>
					{g}
				</span>
			{/each}
		</div>
	</div>

	{#if showPlay || showRemove}
		<div class="relative z-20 flex shrink-0 items-center gap-1.5 self-center">
			{#if showPlay}
				<a
					href={`/watch/${anime.id}/1`}
					class="rounded-md border border-line/60 p-2 text-muted transition hover:border-accent/40 hover:text-accent"
					aria-label={t('play', $lang)}
				>
					<Play size={14} />
				</a>
			{/if}
			{#if showRemove}
				<button
					on:click={onRemove}
					class="rounded-md border border-line/60 p-1.5 text-muted transition hover:border-red-500/40 hover:text-red-400"
					aria-label={t('remove', $lang)}
					title={t('removeFromList', $lang)}
				>
					<X size={13} />
				</button>
			{/if}
		</div>
	{/if}
</div>
