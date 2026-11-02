<script lang="ts">
	import { Building2, Calendar, Clock, Layers, Star, Tag, Trophy } from 'lucide-svelte';
	import type { Anime } from '$lib/types';
	import { formatScore, formatCount } from '$lib/utils/format';
	import { lang, t, titleFor } from '$lib/stores/i18n';

	export let anime: Anime;
	export let compact = false;
	/** Clamp the description to this many lines (0 = show it all). */
	export let descriptionLines = 0;
	/** When set, the poster and the title link to the anime's details page. */
	export let detailHref: string | null = null;
</script>

<div class="space-y-4">
	<!-- Thumbnail + title header (shown in the details popup) -->
	{#if !compact}
		<div class="flex items-start gap-3">
			{#if anime.cover}
				{#if detailHref}
					<a href={detailHref} class="shrink-0" aria-label={titleFor(anime, $lang)}>
						<img
							src={anime.cover}
							alt=""
							loading="lazy"
							class="h-24 w-16 shrink-0 rounded-md object-cover transition-transform duration-300 hover:scale-105"
						/>
					</a>
				{:else}
					<img
						src={anime.cover}
						alt=""
						loading="lazy"
						class="h-24 w-16 shrink-0 rounded-md object-cover"
					/>
				{/if}
			{/if}
			<div class="min-w-0">
				{#if detailHref}
					<a
						href={detailHref}
						class="font-display text-sm font-semibold leading-tight text-ink transition-colors hover:text-accent"
					>
						{titleFor(anime, $lang)}
					</a>
				{:else}
					<p class="font-display text-sm font-semibold leading-tight text-ink">
						{titleFor(anime, $lang)}
					</p>
				{/if}
				{#if anime.genres.length}
					<p class="mt-1 text-[11px] text-muted">{anime.genres.slice(0, 3).join(' · ')}</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Score / status strip -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
		{#if anime.score}
			<span class="flex items-center gap-1.5 font-semibold text-amber-300">
				<Star size={13} fill="currentColor" /> {formatScore(anime.score)}
			</span>
		{/if}
		{#if anime.popularity}
			<span class="flex items-center gap-1.5 text-muted">
				<Trophy size={12} /> {formatCount(anime.popularity)}
			</span>
		{/if}
		{#if anime.status}
			<span
				class="rounded border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
			>
				{anime.status.replace('_', ' ')}
			</span>
		{/if}
	</div>

	<!-- Description -->
	{#if !compact && anime.description}
		<p
			class="text-sm leading-relaxed text-muted {descriptionLines === 2
				? 'line-clamp-2'
				: descriptionLines === 3
					? 'line-clamp-3'
					: descriptionLines === 4
						? 'line-clamp-4'
						: ''}"
		>
			{anime.description}
		</p>
	{/if}

	<!-- Facts grid -->
	<div class="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
		{#if anime.format}
			<div class="flex items-start gap-2">
				<Tag size={13} class="mt-0.5 shrink-0 text-accent" />
				<div>
					<p class="text-muted">{t('format', $lang)}</p>
					<p class="mt-0.5 font-medium text-ink">{anime.format}</p>
				</div>
			</div>
		{/if}
		{#if anime.episodes}
			<div class="flex items-start gap-2">
				<Layers size={13} class="mt-0.5 shrink-0 text-accent" />
				<div>
					<p class="text-muted">{t('episodes', $lang)}</p>
					<p class="mt-0.5 font-medium text-ink">{anime.episodes}</p>
				</div>
			</div>
		{/if}
		{#if anime.startDate}
			<div class="flex items-start gap-2">
				<Calendar size={13} class="mt-0.5 shrink-0 text-accent" />
				<div>
					<p class="text-muted">{t('started', $lang)}</p>
					<p class="mt-0.5 font-medium text-ink">{anime.startDate}</p>
				</div>
			</div>
		{/if}
		{#if anime.studio}
			<div class="flex items-start gap-2">
				<Building2 size={13} class="mt-0.5 shrink-0 text-accent" />
				<div>
					<p class="text-muted">{t('studio', $lang)}</p>
					<p class="mt-0.5 font-medium text-ink">{anime.studio}</p>
				</div>
			</div>
		{/if}
		{#if anime.duration}
			<div class="flex items-start gap-2">
				<Clock size={13} class="mt-0.5 shrink-0 text-accent" />
				<div>
					<p class="text-muted">{t('duration', $lang)}</p>
					<p class="mt-0.5 font-medium text-ink">{anime.duration} {t('min', $lang)}</p>
				</div>
			</div>
		{/if}
		{#if anime.seasonYear}
			<div class="flex items-start gap-2">
				<Calendar size={13} class="mt-0.5 shrink-0 text-accent" />
				<div>
					<p class="text-muted">{t('season', $lang)}</p>
					<p class="mt-0.5 font-medium text-ink">{anime.season} {anime.seasonYear}</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Genres -->
	{#if anime.genres.length}
		<div class="flex flex-wrap gap-1.5">
			{#each anime.genres as g (g)}
				<a
					href={`/search?genre=${encodeURIComponent(g)}`}
					class="rounded border border-line/60 px-2 py-1 text-[11px] font-medium text-muted transition hover:border-accent/40 hover:text-accent"
				>
					{g}
				</a>
			{/each}
		</div>
	{/if}
</div>
