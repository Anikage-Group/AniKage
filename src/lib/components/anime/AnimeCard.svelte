<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Bookmark, Check, Play, RotateCcw, Star, Trash2 } from 'lucide-svelte';
	import type { Anime, WatchStatus } from '$lib/types';
	import { WATCH_STATUSES } from '$lib/types';
	import {
		watchlist,
		addToWatchlist,
		setWatchStatus
	} from '$lib/stores/watchlist';
	import { toast } from '$lib/stores/toast';
	import {
		removeWatchlistEverywhere,
		notifyLocalSyncIssues,
		syncWatchlistEntry
	} from '$lib/services/watchSync';
	import { formatScore } from '$lib/utils/format';
	import { lang, t, titleFor } from '$lib/stores/i18n';

	export let anime: Anime;
	/** Reserved for stagger/usage by hosts; kept optional for API compatibility. */
	export let index = 0;
	export let showEpisodeBadge = true;
	export let compact = false;
	// `index` is part of the component's public API (hosts pass it for stagger).
	$: void index;
	/** Card flip: the watchlist options live on the back face (rotated 180°). */
	let flipped = false;

	$: entry = $watchlist[anime.id];
	$: saved = !!entry;

	function labelFor(s: WatchStatus): string {
		return WATCH_STATUSES.find((x) => x.id === s)?.label ?? s;
	}

	function entryData() {
		return {
			id: anime.id,
			malId: anime.malId,
			display: anime.display,
			cover: anime.cover,
			banner: anime.banner,
			genres: anime.genres,
			score: anime.score,
			totalEpisodes: anime.episodes
		};
	}

	function openFlip(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		flipped = true;
	}

	function closeFlip(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		flipped = false;
	}

	function pick(status: WatchStatus, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!entry) {
			const data = entryData();
			addToWatchlist(data, status);
			toast(`Added “${anime.display}” to ${labelFor(status)}`, true);
			void syncWatchlistEntry(data, status).then((report) =>
				notifyLocalSyncIssues(report, 'Saved locally')
			);
		} else if (entry.status === status) {
			toast(`Already in ${labelFor(status)}`);
		} else {
			const data = entryData();
			setWatchStatus(anime.id, status);
			toast(`Moved “${anime.display}” to ${labelFor(status)}`, true);
			void syncWatchlistEntry(data, status).then((report) =>
				notifyLocalSyncIssues(report, 'Saved locally')
			);
		}
		flipped = false;
	}

	function remove(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		void removeWatchlistEverywhere(anime.id).then((report) =>
			notifyLocalSyncIssues(report, 'Removed locally')
		);
		toast(`Removed “${anime.display}” from watchlist`);
		flipped = false;
	}
</script>

<!--
	Borderless card: image + text only.
	The stretched <a> lives INSIDE the front face so it sits in the same
	stacking context as the buttons — as a sibling of the flip stage it would
	paint over them (the stage creates its own context via preserve-3d) and
	every click would navigate instead of flipping the card.
	Only the IMAGE flips: the title/meta below it stays put, and the back
	face is exactly the size of the poster.
	The bookmark button flips the card to reveal the watchlist options.
-->
<div
	class="group relative z-0 [perspective:1200px] hover:z-30"
	class:z-50={flipped}
	in:fade={{ duration: 320, delay: Math.min(index * 45, 700) }}
>
	<!-- flip stage: the poster only -->
	<div
		class="relative transition-transform duration-500 [transform-style:preserve-3d]"
		class:flipped
	>
		<!-- FRONT -->
		<div class="relative [backface-visibility:hidden]" class:pointer-events-none={flipped}>
			<!-- stretched link over the poster -->
			<a
				href={`/anime/${anime.id}`}
				class="absolute inset-0 z-10 rounded-xl"
				aria-label={titleFor(anime, $lang)}
			></a>

			<!-- image stage: lifts up on hover, passes clicks through to the link -->
			<div
				class="pointer-events-none relative z-20 transition-transform duration-300 ease-out group-hover:-translate-y-1.5"
			>
				<div
					class="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface2 transition-shadow duration-300 group-hover:shadow-glow-sm"
				>
					{#if anime.cover}
						<img
							src={anime.cover}
							alt={titleFor(anime, $lang)}
							loading="lazy"
							class="h-full w-full object-cover"
						/>
					{:else}
						<div class="shimmer-bg h-full w-full"></div>
					{/if}

					<!-- adult badge -->
					{#if anime.isAdult}
						<span
							class="absolute left-2 top-2 rounded border border-white/15 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-red-300"
						>
							18+
						</span>
					{/if}

					<!-- hover play button → watch page (always visible on touch) -->
					<a
						href={`/watch/${anime.id}/1`}
						class="pointer-events-auto absolute left-1/2 top-1/2 z-30 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/60 text-white opacity-100 backdrop-blur-md transition-all duration-200 hover:scale-105 hover:opacity-100 active:scale-95 md:opacity-0 md:group-hover:opacity-100"
						aria-label={`Play ${titleFor(anime, $lang)}`}
						title={t('watchEpisode1', $lang)}
					>
						<Play size={19} fill="currentColor" />
					</a>

					<!-- watchlist status + flip trigger (always visible) -->
					<div class="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-1.5">
						{#if saved && entry}
							<span
								class="rounded border border-accent/30 bg-bg/75 px-1.5 py-0.5 text-[10px] font-semibold text-accent backdrop-blur-md"
							>
								{labelFor(entry.status)}
							</span>
						{/if}
						<button
							on:click={openFlip}
							class="pointer-events-auto grid h-8 w-8 place-items-center rounded-md border border-line/60 bg-bg/75 text-ink backdrop-blur-md transition-all duration-150 hover:border-accent/40 active:scale-95 {saved
								? 'border-accent/40 text-accent opacity-100'
								: 'opacity-100'}"
							aria-label={saved
								? `${t('watchlist', $lang)}: ${labelFor(entry!.status)}`
								: t('addToWatchlist', $lang)}
							aria-expanded={flipped}
						>
							<Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
						</button>
					</div>

					<!-- upcoming episode badge -->
					{#if showEpisodeBadge && anime.nextAiring}
						<span
							class="absolute bottom-2 left-2 rounded border border-accent/30 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent"
						>
							EP {anime.nextAiring.episode} next
						</span>
					{/if}

					<!-- score chip -->
					{#if anime.score}
						<span
							class="absolute bottom-2 right-2 flex items-center gap-1 rounded border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
						>
							<Star size={9} fill="currentColor" /> {formatScore(anime.score)}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- BACK (watchlist options) — same box as the poster.
		     The panel carries the same hover lift as the front face, otherwise
		     the front (still translated up) would peek out from behind it. -->
		<div
			class="absolute inset-0 z-30 [backface-visibility:hidden] [transform:rotateY(180deg)]"
			class:pointer-events-none={!flipped}
		>
			<div
				class="flex h-full flex-col overflow-hidden rounded-xl border border-line/60 bg-surface p-2 transition-transform duration-300 ease-out group-hover:-translate-y-1.5"
			>
			<div class="flex items-center justify-between px-1 pb-1.5">
				<p class="truncate text-[11px] font-semibold uppercase tracking-widest text-muted">
					{t('watchlist', $lang)}
				</p>
				<button
					on:click={closeFlip}
					class="grid h-6 w-6 shrink-0 place-items-center rounded text-muted transition hover:text-ink active:scale-90"
					aria-label={t('close', $lang)}
				>
					<RotateCcw size={13} />
				</button>
			</div>

			<div class="min-h-0 flex-1 space-y-1 overflow-y-auto">
				{#each WATCH_STATUSES as s (s.id)}
					<button
						on:click={(e) => pick(s.id, e)}
						class="flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition {entry?.status ===
						s.id
							? 'border-accent/50 bg-accent/15 text-accent'
							: 'border-transparent text-ink hover:bg-surface2'}"
					>
						<span class="grid w-3.5 shrink-0 place-items-center">
							{#if entry?.status === s.id}
								<Check size={12} strokeWidth={3} />
							{/if}
						</span>
						<span class="truncate">{s.label}</span>
					</button>
				{/each}
			</div>

			{#if saved}
				<button
					on:click={remove}
					class="mt-1 flex w-full shrink-0 items-center gap-1.5 rounded-md border border-red-500/30 px-2 py-1.5 text-left text-[11px] font-medium text-red-400 transition hover:bg-red-500/10"
				>
					<Trash2 size={12} />
					{t('removeFromList', $lang)}
				</button>
			{/if}
			</div>
		</div>
	</div>

	<!-- Title + meta: outside the flip stage, so it never flips -->
	<a
		href={`/anime/${anime.id}`}
		class="relative z-20 block pt-2.5"
		aria-label={titleFor(anime, $lang)}
	>
		<p
			class="truncate text-[13px] font-medium leading-tight text-ink transition-colors duration-200 group-hover:text-accent"
		>
			{titleFor(anime, $lang)}
		</p>
		{#if !compact}
			<p class="mt-1 truncate text-[11px] text-muted">
				{[anime.format, anime.seasonYear].filter(Boolean).join(' · ')}
				{#if anime.genres[0]} · {anime.genres[0]}{/if}
			</p>
		{/if}
	</a>
</div>

<style>
	/* Flip the whole stage 180° when the bookmark trigger is pressed. */
	.flipped {
		transform: rotateY(180deg);
	}
</style>
