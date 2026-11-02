<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import {
		Building2,
		Calendar,
		Check,
		ChevronDown,
		Clock,
		Copy,
		EyeOff,
		Layers,
		Play,
		Share2,
		Star,
		Tag
	} from 'lucide-svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import EpisodeList from '$lib/components/anime/EpisodeList.svelte';
	import AnimeSections from '$lib/components/anime/AnimeSections.svelte';
	import AniListIcon from '$lib/components/icons/AniListIcon.svelte';
	import MalIcon from '$lib/components/icons/MalIcon.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';
	import WatchlistMenu from '$lib/components/anime/WatchlistMenu.svelte';
	import Comments from '$lib/components/anime/Comments.svelte';
	import { getAnimeById } from '$lib/services/anilist';
	import { getAniZip } from '$lib/services/aniZip';
	import { trimTransparentLogo } from '$lib/utils/logo';
	import { fallbackDetail, fallbackEpisodes } from '$lib/services/fallback';
	import type { Anime, EpisodeAsset } from '$lib/types';
	import { progress, watched, watchedCount } from '$lib/stores/history';
	import { settings } from '$lib/stores/settings';
	import { lang, t, titleFor, tf } from '$lib/stores/i18n';
	import { formatScore } from '$lib/utils/format';
	import { setOg, OG_FALLBACK_IMAGE } from '$lib/utils/og';
	import AiringCountdown from '$lib/components/anime/AiringCountdown.svelte';

	$: id = Number($page.params.id);

	let anime: Anime | null = null;
	let episodes: EpisodeAsset[] = [];
	let loading = true;
	let error = '';
	let view: 'tiles' | 'titles' | 'detailed' = 'tiles';
	let descExpanded = false;
	/** Share drawer. */
	let shareOpen = false;
	let copied = false;
	/** Anchor for the desktop share popover. */
	let shareAnchor: HTMLDivElement;
	/** Wide enough for the popover (the drawer is used below this). */
	let isWide = false;

	/** The canonical link for this title. */
	$: shareUrl = typeof location !== 'undefined' ? location.href : '';

	/** ani.zip clearlogo for the title treatment (trimmed when possible). */
	let clearLogo: string | null = null;
	let logoId = 0;
	$: if (anime && anime.id !== logoId) {
		logoId = anime.id;
		loadClearLogo(anime.id);
	}

	async function loadClearLogo(anilistId: number) {
		clearLogo = null;
		try {
			const zip = await getAniZip(anilistId);
			if (!zip.clearlogo) return;
			const trimmed = await trimTransparentLogo(zip.clearlogo);
			if (anime?.id === anilistId) clearLogo = trimmed ?? zip.clearlogo;
		} catch {
			/* text title remains the fallback */
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			copied = false;
		}
	}

	onMount(() => {
		const mq = window.matchMedia('(min-width: 640px)');
		const sync = () => (isWide = mq.matches);
		sync();
		mq.addEventListener('change', sync);

		// Close the desktop popover when clicking outside of it.
		function onDocClick(e: MouseEvent) {
			if (!shareOpen || !isWide) return;
			const target = e.target as Node;
			if (shareAnchor && !shareAnchor.contains(target)) shareOpen = false;
		}
		document.addEventListener('click', onDocClick, true);

		return () => {
			mq.removeEventListener('change', sync);
			document.removeEventListener('click', onDocClick, true);
		};
	});

	// reload when the route id changes (component is reused between /anime/x pages)
	let ready = false;
	let loadedId = 0;
	onMount(() => {
		ready = true;
	});
	$: if (ready && id && id !== loadedId) {
		loadedId = id;
		load();
	}

	$: watchedEp = anime ? watchedCount(anime.id, $watched) : 0;
	$: continueEp = anime ? continueEpisode() : 1;
	$: hasResume = anime ? !!$progress[anime.id] || watchedEp > 0 : false;

	/** Where the primary button should take the viewer. */
	function continueEpisode(): number {
		if (!anime) return 1;
		const total = anime.episodes ?? (episodes.length || null);
		const savedEntry = $progress[anime.id];
		// Mid-episode progress wins, as long as that episode is not finished.
		if (savedEntry && !$watched[`${anime.id}:${savedEntry.episode}`]) {
			return total ? Math.min(Math.max(1, savedEntry.episode), total) : savedEntry.episode;
		}
		const next = watchedEp + 1;
		return total ? Math.min(Math.max(1, next), total) : Math.max(1, next);
	}
	$: hiddenAdult = !!anime && $settings.hideAdult && anime.isAdult;
	$: title = anime ? titleFor(anime, $lang) : 'Anikage';
	$: descLong = (anime?.description?.length ?? 0) > 180;

	/** Link preview for this title: name, artwork and synopsis. */
	$: if (anime) {
		const name = titleFor(anime, $lang);
		setOg({
			title: `${name} — Anikage`,
			description:
				anime.description?.trim() ||
				`Watch ${name} online with a fast, distraction-free player.`,
			image: anime.banner || anime.cover || OG_FALLBACK_IMAGE,
			url: typeof location !== 'undefined' ? location.href : '',
			type: 'video.tv_show',
			extra: {
				'video:release_date': anime.startDate ?? '',
				'video:episode_count': anime.episodes ? String(anime.episodes) : ''
			}
		});
	}

	async function load() {
		const target = id;
		loading = true;
		error = '';
		descExpanded = false;
		try {
			const data = await getAnimeById(target);
			anime = data;
			// Episodes and the optional sections load after the header is
			// usable. A slow mirror must not hold the whole page hostage.
			void loadExtras(data);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load this title.';
			anime = null;
		} finally {
			loading = false;
		}
	}

	/**
	 * Fill in what the active source could not provide.
	 *
	 * AniList returns every section with its detail query. When the page was
	 * served by a mirror, those sections are patched in from the remaining
	 * sources (one at a time, cached), and the episode list comes from
	 * ani.zip or a mirror instead.
	 */
	function loadExtras(data: Anime) {
		const needsSections =
			!data.characters?.length ||
			!data.relations?.length ||
			!data.recommendations?.length ||
			!data.trailer;
		if (needsSections) {
			void fallbackDetail(data)
				.then((patch) => {
					if (!anime || anime.id !== data.id) return;
					if (
						!patch.characters?.length &&
						!patch.relations?.length &&
						!patch.recommendations?.length &&
						!patch.trailer
					) {
						return;
					}
					// The active source owns every section it supplied; the patch
					// only fills the sections that source could not provide.
					anime = {
						...anime,
						characters: anime.characters?.length ? anime.characters : patch.characters,
						relations: anime.relations?.length ? anime.relations : patch.relations,
						recommendations: anime.recommendations?.length
							? anime.recommendations
							: patch.recommendations,
						trailer: anime.trailer || patch.trailer
					};
				})
				.catch(() => {
					/* sections are optional */
				});
		}

		void fallbackEpisodes(data)
			.then((rows) => {
				if (!anime || anime.id !== data.id) return;
				episodes = rows;
			})
			.catch(() => {
				/* the episode list synthesises from the count */
			});
	}

	/** Uniform info-row items: one icon, one size, one alignment. */
	$: infoItems = anime
		? [
				{ icon: Star, value: anime.score ? formatScore(anime.score) : null, label: 'Score' },
				{ icon: Calendar, value: anime.startDate, label: 'Started' },
				{
					icon: Layers,
					value: anime.episodes ? `${anime.episodes} ep` : null,
					label: 'Episodes'
				},
				{
					icon: Clock,
					value: anime.duration ? `${anime.duration} min` : null,
					label: 'Duration'
				},
				{ icon: Building2, value: anime.studio, label: 'Studio' },
				{ icon: Tag, value: anime.format, label: 'Format' }
			].filter((i) => !!i.value)
		: [];
</script>

<svelte:head>
	<title>{anime ? `${title} — Anikage` : 'Anikage'}</title>
</svelte:head>

{#if error}
	<div class="mx-auto max-w-2xl px-4 pt-16">
		<ErrorState message={error} onRetry={load} />
	</div>
{:else if loading}
	<!-- Placeholder that mirrors the real layout, so nothing jumps when the
	     data arrives (same banner height, same overlap, same columns). -->
	<div class="relative -mt-16 h-[54vh] min-h-[340px] w-full overflow-hidden md:-mt-[76px]">
		<div class="shimmer-bg absolute inset-0"></div>
	</div>
	<div class="relative z-10 -mt-36 px-4 pb-16 sm:px-6 lg:px-8">
		<div class="grid gap-8 lg:grid-cols-[300px_1fr]">
			<!-- poster -->
			<div class="mx-auto w-full max-w-[220px] lg:max-w-none">
				<Skeleton variant="poster" className="w-full rounded-xl" />
			</div>

			<!-- info column -->
			<div class="pt-2 lg:pt-24">
				<Skeleton className="h-9 w-2/3" />
				<Skeleton className="mt-2 h-4 w-1/3" />

				<!-- action row -->
				<div class="mt-5 flex flex-wrap items-center gap-2">
					<Skeleton className="h-10 w-32 rounded-md" />
					<Skeleton className="h-10 w-28 rounded-md" />
					<Skeleton className="h-10 w-10 rounded-md" />
					<Skeleton className="h-10 w-10 rounded-md" />
					<Skeleton className="h-10 w-10 rounded-md" />
				</div>

				<!-- status chips -->
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<Skeleton className="h-5 w-20 rounded" />
					<Skeleton className="h-4 w-24" />
				</div>

				<!-- description -->
				<Skeleton className="mt-4 h-4 w-full" />
				<Skeleton className="mt-2 h-4 w-11/12" />
				<Skeleton className="mt-2 h-4 w-2/3" />

				<!-- info row -->
				<div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2.5">
					<Skeleton className="h-3.5 w-16" />
					<Skeleton className="h-3.5 w-20" />
					<Skeleton className="h-3.5 w-14" />
					<Skeleton className="h-3.5 w-18" />
				</div>

				<!-- genres -->
				<div class="mt-5 flex flex-wrap gap-1.5">
					<Skeleton className="h-6 w-16 rounded" />
					<Skeleton className="h-6 w-20 rounded" />
					<Skeleton className="h-6 w-14 rounded" />
					<Skeleton className="h-6 w-18 rounded" />
				</div>
			</div>
		</div>
	</div>
{:else if anime}
	{#if hiddenAdult}
		<!-- Adult title hidden by settings -->
		<div class="mx-auto max-w-2xl px-4 pt-20 sm:pt-28">
			<div class="hairline rounded-xl bg-surface/40 px-6 py-12 text-center backdrop-blur-md">
				<div
					class="mx-auto grid h-12 w-12 place-items-center rounded-full border border-accent/20 bg-accent/10 text-accent"
				>
					<EyeOff size={22} />
				</div>
				<h1 class="mt-4 font-display text-xl font-bold tracking-tight text-ink">{title}</h1>
				<p class="mx-auto mt-2 max-w-sm text-sm text-muted">
					This title is hidden because “Hide adult titles” is enabled in your settings.
				</p>
				<a
					href="/settings"
					class="mt-6 inline-flex items-center gap-2 rounded-md border border-line/60 bg-surface/40 px-4 py-2.5 text-sm font-medium text-ink transition-all duration-150 hover:border-accent/40 active:scale-95"
				>
					Open settings
				</a>
			</div>
		</div>
	{:else}
		<!-- Banner: AniList art, pulled up under the sticky top bar and dissolved
		     into the page background with a mask (no gradient background). -->
		<div
			class="relative -mt-16 h-[54vh] min-h-[340px] w-full overflow-hidden md:-mt-[76px]"
			in:fade={{ duration: 520 }}
		>
			<div class="absolute inset-0 banner-fade">
				{#if anime.banner}
					<img src={anime.banner} alt="" class="h-full w-full object-cover" />
				{:else}
					<div class="h-full w-full bg-surface2"></div>
				{/if}
				<!-- single solid scrim for legibility -->
				<div class="absolute inset-0 bg-bg/55"></div>
			</div>
			<Ambient intensity={0.1} />
		</div>

		<div class="relative z-10 -mt-36 px-4 pb-16 sm:px-6 lg:px-8">
			<div class="grid gap-8 lg:grid-cols-[300px_1fr]">
				<!-- Poster + actions -->
				<div
					class="mx-auto w-full max-w-[220px] lg:max-w-none"
					in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(1) }}
				>
					<div class="overflow-hidden rounded-xl shadow-2xl">
						{#if anime.cover}
							<img
								src={anime.cover}
								alt={title}
								class="aspect-[2/3] w-full object-cover"
							/>
						{:else}
							<div class="shimmer-bg aspect-[2/3] w-full"></div>
						{/if}
					</div>
				</div>

				<!-- Info -->
				<div
					class="pt-2 lg:pt-24"
					in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(2) }}
				>
					{#if clearLogo}
						<div class="flex flex-col items-center gap-3 lg:items-start">
							<img
								src={clearLogo}
								alt=""
								class="max-h-24 w-auto max-w-full object-contain sm:max-h-28"
								on:error={() => (clearLogo = null)}
							/>
							<h1
								class="text-center font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl lg:text-left"
							>
								{title}
							</h1>
						</div>
					{:else}
						<h1
							class="font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl"
						>
							{title}
						</h1>
					{/if}
					{#if anime.title.romaji && anime.title.romaji !== title}
						<p class="mt-1 text-sm text-muted text-center lg:text-left">{anime.title.romaji}</p>
					{/if}

					<!-- Watch actions + quick links (below the title) -->
					<div class="mt-5 flex flex-wrap items-center gap-2">
						<a
							href={`/watch/${anime.id}/${continueEp}`}
							class="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition-all duration-150 hover:shadow-glow active:scale-95"
						>
							<Play size={16} fill="currentColor" />
							{hasResume ? `Continue (EP ${continueEp})` : 'Watch Now'}
						</a>
						<WatchlistMenu {anime} variant="block" />
						<!-- Share: a small popup on desktop, a drawer on mobile -->
						<div class="relative" bind:this={shareAnchor}>
							<button
								on:click={() => (shareOpen = !shareOpen)}
								class="grid h-10 w-10 place-items-center rounded-md border border-line/60 text-muted transition-all duration-150 hover:border-accent/40 hover:text-ink active:scale-95"
								aria-label={t('share', $lang)}
								aria-haspopup="dialog"
								aria-expanded={shareOpen}
							>
								<Share2 size={16} />
							</button>
							<!-- Desktop popover -->
							{#if shareOpen && isWide}
								<div
									transition:fly={{ y: -4, duration: 160 }}
									class="absolute right-0 top-full z-[70] mt-2 w-80 rounded-lg border border-line/60 bg-bg/95 p-3 shadow-2xl backdrop-blur-xl"
									role="dialog"
									aria-label={t('share', $lang)}
								>
									<p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
										{t('shareLink', $lang)}
									</p>
									<div class="flex items-center gap-2">
										<input
											readonly
											value={shareUrl}
											on:focus={(e) => (e.currentTarget as HTMLInputElement).select()}
											class="min-w-0 flex-1 rounded-md border border-line/60 bg-surface/40 px-2.5 py-2 text-xs text-ink focus:border-accent/50 focus:outline-none"
											aria-label={t('shareLink', $lang)}
										/>
										<button
											on:click={copyLink}
											class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line/60 bg-surface/40 px-2.5 py-2 text-xs font-medium text-ink transition-all duration-150 hover:border-accent/40 active:scale-95"
										>
											{#if copied}
												<Check size={13} class="text-accent" />
											{:else}
												<Copy size={13} />
											{/if}
											{copied ? t('linkCopied', $lang) : t('copyLink', $lang)}
										</button>
									</div>
								</div>
							{/if}
						</div>
						<!-- AniList -->
						<a
							href={`https://anilist.co/anime/${anime.id}`}
							target="_blank"
							rel="noopener noreferrer"
							class="grid h-10 w-10 place-items-center rounded-md border border-line/60 text-muted transition-all duration-150 hover:border-accent/40 hover:text-ink active:scale-95"
							aria-label="AniList"
							title="AniList"
						>
							<AniListIcon size={17} />
						</a>
						<!-- MAL -->
						{#if anime.malId}
							<a
								href={`https://myanimelist.net/anime/${anime.malId}`}
								target="_blank"
								rel="noopener noreferrer"
								class="grid h-10 w-10 place-items-center rounded-md border border-line/60 text-muted transition-all duration-150 hover:border-accent/40 hover:text-ink active:scale-95"
								aria-label="MyAnimeList"
								title="MyAnimeList"
							>
								<MalIcon size={17} />
							</a>
						{/if}
					</div>

					<!-- status / season chips -->
					<div class="mt-4 flex flex-wrap items-center gap-2">
						{#if anime.status}
							<span
								class="rounded border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
							>
								{anime.status.replace('_', ' ')}
							</span>
						{/if}
						{#if anime.season || anime.seasonYear}
							<span class="text-xs text-muted">
								{[anime.season, anime.seasonYear].filter(Boolean).join(' ')}
							</span>
						{/if}
						{#if anime.isAdult}
							<span
								class="rounded border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-red-300"
							>
								18+
							</span>
						{/if}
					</div>

					<!-- description: first 4 lines + More -->
					{#if anime.description}
						<p class="mt-4 text-sm leading-relaxed text-muted {descExpanded ? '' : 'line-clamp-4'}">
							{anime.description}
						</p>
						{#if descLong}
							<button
								on:click={() => (descExpanded = !descExpanded)}
								class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent transition-all duration-150 hover:underline active:scale-95"
							>
								{descExpanded ? 'Less' : 'More'}
								<ChevronDown
									size={13}
									class="transition-transform duration-200 {descExpanded ? 'rotate-180' : ''}"
								/>
							</button>
						{/if}
					{/if}

					<!-- uniform info row -->
					{#if infoItems.length}
						<div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs">
							{#each infoItems as item (item.label)}
								<span class="flex items-start gap-1.5">
									<svelte:component
										this={item.icon}
										size={14}
										class="mt-0.5 shrink-0 text-accent"
										fill={item.icon === Star ? 'currentColor' : 'none'}
									/>
									<span class="flex min-w-0 flex-col leading-tight">
										<span class="font-medium text-ink">{item.value}</span>
										<span class="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{item.label}</span>
									</span>
								</span>
							{/each}
						</div>
					{/if}

					<!-- next broadcast, below the core information block -->
					{#if anime.nextAiring}
						<div class="mt-5">
							<AiringCountdown airing={anime.nextAiring} />
						</div>
					{/if}

					<!-- genres -->
					{#if anime.genres.length}
						<div class="mt-5 flex flex-wrap gap-1.5">
							{#each anime.genres as g (g)}
								<a
									href={`/search?genre=${encodeURIComponent(g)}`}
									class="rounded border border-line/60 px-2 py-1 text-[11px] font-medium text-muted transition-all duration-150 hover:border-accent/40 hover:text-accent active:scale-95"
								>
									{g}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Trailer + related + recommendations + cast, in one tabbed section -->
			<AnimeSections {anime} reveal={3} />

			<!-- Episodes -->
			<section
				class="mt-12"
				in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(4) }}
			>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="font-display text-lg font-semibold tracking-tight text-ink">{t('episodes', $lang)}</h2>
					{#if anime.episodes}
						<span class="text-xs text-muted">{tf('watchedCount', { n: watchedEp, total: anime.episodes }, $lang)}</span>
					{/if}
				</div>
				<EpisodeList
					animeId={anime.id}
					{episodes}
					total={anime.episodes}
					bind:view
				/>
			</section>

			<!-- Community comments: desktop inline / mobile drawer -->
			<section
				class="mt-10"
				in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(5) }}
			>
				<Comments
					anilistId={anime.id}
					malId={anime.malId}
					title={title}
					inline={true}
					showMobileTrigger={true}
				/>
			</section>
		</div>
	{/if}
{/if}

<!-- Share drawer (mobile only — desktop uses the popover) -->
<BottomSheet
	open={shareOpen && !isWide}
	title={t('share', $lang)}
	on:close={() => (shareOpen = false)}
>
	<div class="space-y-3">
		<p class="text-[10px] font-semibold uppercase tracking-widest text-muted">
			{t('shareLink', $lang)}
		</p>
		<div class="flex items-center gap-2">
			<input
				readonly
				value={shareUrl}
				on:focus={(e) => (e.currentTarget as HTMLInputElement).select()}
				class="min-w-0 flex-1 rounded-md border border-line/60 bg-surface/40 px-3 py-2.5 text-xs text-ink focus:border-accent/50 focus:outline-none"
				aria-label={t('shareLink', $lang)}
			/>
			<button
				on:click={copyLink}
				class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line/60 bg-surface/40 px-3 py-2.5 text-xs font-medium text-ink transition-all duration-150 hover:border-accent/40 active:scale-95"
			>
				{#if copied}
					<Check size={14} class="text-accent" />
					{t('linkCopied', $lang)}
				{:else}
					<Copy size={14} />
					{t('copyLink', $lang)}
				{/if}
			</button>
		</div>
	</div>
</BottomSheet>
