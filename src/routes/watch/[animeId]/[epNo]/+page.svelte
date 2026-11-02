<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { beforeNavigate } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { ChevronRight, Download, Info, Loader2, RefreshCw } from 'lucide-svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import ShowInfo from '$lib/components/anime/ShowInfo.svelte';
	import RailRow from '$lib/components/anime/RailRow.svelte';
	import EpisodeList from '$lib/components/anime/EpisodeList.svelte';
	import ServerBar from '$lib/components/anime/ServerBar.svelte';
	import ServerDropdown from '$lib/components/anime/ServerDropdown.svelte';
	import AiringCountdown from '$lib/components/anime/AiringCountdown.svelte';
	import Comments from '$lib/components/anime/Comments.svelte';
	import EmbedPlayer from '$lib/components/player/EmbedPlayer.svelte';
	import ControlBar from '$lib/components/player/ControlBar.svelte';
	import type { ToggleKey } from '$lib/components/player/ControlBar.svelte';
	import WatchlistMenu from '$lib/components/player/WatchlistMenu.svelte';
	import ShortcutsHelp from '$lib/components/player/ShortcutsHelp.svelte';
	import { getAnimeById } from '$lib/services/anilist';
	import { fallbackDetail, fallbackEpisodes } from '$lib/services/fallback';
	import {
		getStream,
		prefetchStream,
		invalidateStream,
		isAbortError,
		type StreamErrorCode
	} from '$lib/services/streams';
	import type {
		Anime,
		EpisodeAsset,
		StreamCategory,
		StreamData,
		StreamSource,
		WatchStatus
	} from '$lib/types';
	import { markWatched, recordProgress, progress, isWatched } from '$lib/stores/history';
	import { settings, updateSetting } from '$lib/stores/settings';
	import {
		addToWatchlist,
		setWatchStatus,
		watchlist
	} from '$lib/stores/watchlist';
	import {
		syncEpisodeProgress,
		syncWatchlistEntry,
		removeWatchlistEverywhere,
		notifyLocalSyncIssues,
		syncIssueText
	} from '$lib/services/watchSync';
	import { toast } from '$lib/stores/toast';
	import { lang, t, titleFor } from '$lib/stores/i18n';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';
	import { setOg, OG_FALLBACK_IMAGE } from '$lib/utils/og';

	$: animeId = Number($page.params.animeId);
	$: epNo = Number($page.params.epNo);

	/* ---------------- data ---------------- */
	let anime: Anime | null = null;
	let animeLoading = true;
	let animeError = '';
	let episodes: EpisodeAsset[] = [];
	let stream: StreamData | null = null;
	let streamError = '';

	let activeSource: StreamSource | null = null;
	let activeCategory: StreamCategory | null = null;
	/** Lifecycle of the server-list request for the current episode. */
	type StreamState = 'idle' | 'loading' | 'retrying' | 'ready' | 'error';
	let streamState: StreamState = 'idle';
	/** Servers are usable as soon as a list is on screen (a reload keeps it). */
	$: serversReady = streamState === 'ready' || streamState === 'retrying';
	/** Aborts the in-flight request when the episode changes or the page unmounts. */
	let streamAbort: AbortController | null = null;
	/** Guards against a late response overwriting newer state. */
	let streamToken = 0;
	/** Machine-readable failure reason so the message can be translated. */
	let streamErrorCode: StreamErrorCode | null = null;
	/** Shared episode-list display mode (sidebar + small-screen section). */
	let listView: 'tiles' | 'titles' | 'detailed' = $settings.episodeView;

	$: activeUrl = activeSource?.url ?? '';

	let loadedAnimeId = 0;
	/** Last episode whose server list was requested — avoids duplicate loads. */
	let lastStreamKey = '';

	$: currentEpisode = episodes.find((e) => e.number === epNo) ?? null;
	$: episodeTitle = currentEpisode?.title ?? '';
	$: displayName = anime ? titleFor(anime, $lang) : '';
	$: totalEps = anime?.episodes ?? (episodes.length || null);
	$: hasPrev = epNo > 1;
	$: hasNext = totalEps != null ? epNo < totalEps : episodes.length > 0 && epNo < episodes.length;
	$: saved = anime ? !!$watchlist[anime.id] : false;
	$: savedStatus = anime ? ($watchlist[anime.id]?.status ?? null) : null;

	/**
	 * Link preview for this episode: the episode name and its thumbnail,
	 * falling back to the series artwork when the episode has none.
	 */
	$: if (anime) {
		const epLabel = episodeTitle ? `EP ${epNo} · ${episodeTitle}` : `EP ${epNo}`;
		setOg({
			title: `${epLabel} — ${displayName}`,
			description: anime.description?.trim() || `Watch ${epLabel} of ${displayName} on Anikage.`,
			image: currentEpisode?.image || anime.banner || anime.cover || OG_FALLBACK_IMAGE,
			url: typeof location !== 'undefined' ? location.href : '',
			type: 'video.episode',
			extra: {
				'video:episode_number': String(epNo),
				'video:title': episodeTitle || displayName,
				'video:series': displayName
			}
		});
	}

	/* ---------------- loading ---------------- */

	/** A minimal list so the episode navigation is never empty. */
	function synthesizedEpisodes(count: number): EpisodeAsset[] {
		const size = Math.max(count, 1);
		return Array.from({ length: size }, (_, i) => ({ number: i + 1, title: null, image: null }));
	}

	/**
	 * Episode list and the optional sections.
	 *
	 * AniList returns everything in one query; when a mirror served the page
	 * these are patched in afterwards. Never blocks the player.
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
					// Keep the active source's sections; fill only what it lacked.
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
				/* the list can synthesise from the episode count */
			});
	}

	async function loadAnime(id: number) {
		if (!id || loadedAnimeId === id) return;
		loadedAnimeId = id;
		animeLoading = true;
		animeError = '';
		try {
			const data = await getAnimeById(id);
			anime = data;
			animeLoading = false;
			// The header is usable now; the rest streams in.
			loadExtras(data);
		} catch (e) {
			// Playback only needs the AniList id and the episode number, both
			// of which are in the URL. Keep the player on screen and offer a
			// retry for the metadata instead of replacing the whole page.
			anime = null;
			episodes = synthesizedEpisodes(epNo);
			animeError = e instanceof Error ? e.message : 'Failed to load this title.';
			animeLoading = false;
		}
	}

	/** Pick the first server of the first category matching the audio preference. */
	function pickDefault(s: StreamData): { src: StreamSource; cat: StreamCategory } | null {
		const needle = $settings.preferredAudio === 'dub' ? 'dub' : 'sub';
		const order: StreamCategory[] = ['h-sub', 's-sub', 'dub', 'e-sub', 'e-dub', 'v-sub', 'v-dub'];
		for (const cat of order) {
			if (!cat.includes(needle)) continue;
			const first = s.groups[cat]?.[0];
			if (first) return { src: first, cat };
		}
		// No category matched the preference → first non-empty of any kind.
		for (const cat of order) {
			const first = s.groups[cat]?.[0];
			if (first) return { src: first, cat };
		}
		return null;
	}

	/**
	 * Every source currently offered for the episode, in the same preferred
	 * category order as the default picker.
	 */
	function orderedSources(s: StreamData): { src: StreamSource; cat: StreamCategory }[] {
		const order: StreamCategory[] = [
			'h-sub',
			's-sub',
			'dub',
			'e-sub',
			'e-dub',
			'v-sub',
			'v-dub',
			...(Object.keys(s.groups) as StreamCategory[])
		];
		const seen = new Set<StreamCategory>();
		const out: { src: StreamSource; cat: StreamCategory }[] = [];
		for (const cat of order) {
			if (seen.has(cat)) continue;
			seen.add(cat);
			for (const src of s.groups[cat] ?? []) out.push({ src, cat });
		}
		return out;
	}

	/** The embed's terminal failure marker (e.g. player error code 4). */
	function isTerminalPlayerError(detail: string): boolean {
		const d = detail.trim().toLowerCase();
		if (!d) return false;
		if (['4', 'final', 'fatal', 'error 4', 'code 4', 'error_code_4'].includes(d)) return true;
		if (/final|fatal/.test(d)) return true;
		return /(?:code|error)[\s:_-]*4\b/.test(d);
	}

	/**
	 * A terminal player failure should not leave the episode on a dead mirror.
	 * Mark that source failed and advance to the next one that has not failed
	 * yet. The failed set resets per episode, and a source only ever gets one
	 * turn — so a broken provider can never make this bounce forever.
	 */
	function onPlayerStatus(e: CustomEvent<{ ok: boolean; attempt: number; detail: string }>) {
		const { ok, detail } = e.detail;
		if (ok || !stream || !activeSource || !isTerminalPlayerError(detail)) return;

		failedSources.add(activeSource.url);
		const sources = orderedSources(stream);
		const index = sources.findIndex((s) => s.src.url === activeSource?.url);
		if (index < 0) return;
		const rotated = [...sources.slice(index + 1), ...sources.slice(0, index)];
		const next = rotated.find((s) => !failedSources.has(s.src.url));
		if (!next) {
			toast('Every server for this episode failed to load.', false);
			return;
		}
		toast(`Server error — trying ${next.src.label}`, false);
		selectSource(next.src, next.cat);
	}

	async function loadStream(id: number, ep: number, opts: { force?: boolean } = {}) {
		if (!id || !ep) return;
		const key = `${id}:${ep}`;
		if (opts.force) failedSources = new Set<string>();

		// Already loaded and healthy — nothing to do.
		if (!opts.force && key === lastStreamKey && streamState === 'ready') return;

		const hadData = !!stream;
		const sameEpisode = key === lastStreamKey;
		lastStreamKey = key;

		// A newer request supersedes whatever is running right now.
		const token = ++streamToken;
		streamAbort?.abort();
		const ctrl = new AbortController();
		streamAbort = ctrl;

		// Switching episodes always starts from a clean slate — the previous
		// episode's servers must never be shown for the new one. Re-running the
		// same episode (manual retry) keeps the current list on screen.
		streamState = sameEpisode && hadData ? 'retrying' : 'loading';
		streamError = '';
		streamErrorCode = null;
		if (!sameEpisode) {
			stream = null;
			activeSource = null;
			activeCategory = null;
		}
		nextPrefetched = false;

		try {
			if (opts.force) invalidateStream(id, ep);
			const data = await getStream(id, ep, { force: opts.force, signal: ctrl.signal });
			// A newer request already won — drop this result on the floor.
			if (token !== streamToken) return;

			stream = data;
			const chosen = pickDefault(data);
			if (chosen) {
				activeSource = chosen.src;
				activeCategory = chosen.cat;
			} else {
				streamError = 'No playable servers for this episode right now.';
			}
			streamState = 'ready';
			// Warm the cache for the next episode while this one plays.
			prefetchStream(id, ep + 1);
		} catch (e) {
			if (token !== streamToken) return;
			// The caller (episode change / unmount) cancelled it — not a failure.
			if (isAbortError(e)) return;

			stream = null;
			activeSource = null;
			activeCategory = null;
			streamError = e instanceof Error ? e.message : 'Stream service unavailable.';
			streamErrorCode = (e as { code?: StreamErrorCode })?.code ?? 'server';
			streamState = 'error';
		}
	}

	/** Localised message for the current server-list failure. */
	function serverErrorText(): string {
		switch (streamErrorCode) {
			case 'offline':
				return t('serverLoadOffline', $lang);
			case 'timeout':
				return t('serverLoadTimeout', $lang);
			case 'not-found':
				return t('serverLoadNotFound', $lang);
			default:
				return streamError || t('serverLoadFailed', $lang);
		}
	}

	$: if (animeId) loadAnime(animeId);
	$: if (animeId && epNo) loadStream(animeId, epNo);

	// Reset resume flag whenever the active source changes (manual switch or audio toggle)
	$: if (activeSource?.url) resumeApplied.delete(activeSource.url);

	// A new episode gets a fresh resume decision (and a fresh duration).
	$: prepareEpisode(epNo);

	/**
	 * Per-episode setup: snapshot the resume point and reset the playback
	 * bookkeeping. Called through a reactive statement so it only runs when
	 * the episode actually changes.
	 */
	function prepareEpisode(n: number) {
		resumeApplied.clear(); // new episode = fresh resume state
		failedSources = new Set<string>();
		lastDuration = 0;
		lastTime = 0;
		if (!animeId) {
			resumeTarget = 0;
			return;
		}
		const saved = $progress[animeId];
		resumeTarget = saved && saved.episode === n ? saved.position ?? 0 : 0;
	}

	function selectSource(src: StreamSource, cat: StreamCategory) {
		// The old embed is going away. Snapshot the newest known position BEFORE
		// swapping, otherwise the new server starts from the point captured when
		// the episode first loaded (often 0 on a fresh watch).
		resumeTarget = latestResumePosition();
		activeSource = src;
		activeCategory = cat;
		serversOpen = false;
		resumeApplied.delete(src.url); // reset so new server seeks to saved position
		toast(`Switched to ${src.label}`, true);
	}

	/**
	 * Best known playback position for the current episode.
	 *
	 * Combines the last player tick with the persisted store so a server that
	 * dies before its next 15s heartbeat still resumes from roughly where the
	 * viewer was.
	 */
	function latestResumePosition(): number {
		const stored = anime ? $progress[anime.id] : undefined;
		const storedPos = stored && stored.episode === epNo ? stored.position ?? 0 : 0;
		return Math.max(lastTime, storedPos);
	}

	/**
	 * Create a Continue Watching row as soon as playback starts, without
	 * overwriting an existing resume point for the same episode.
	 */
	function ensureProgressEntry(): void {
		if (!anime || isWatched(animeId, epNo)) return;
		const current = $progress[anime.id];
		if (current && current.episode === epNo) return;
		recordProgress({
			id: anime.id,
			display: anime.display,
			cover: anime.cover,
			banner: anime.banner,
			episode: epNo,
			episodeTitle: episodeTitle || null,
			position: Math.max(0, Math.min(lastTime, resumeTarget || lastTime)),
			duration: lastDuration > 0 ? lastDuration : undefined,
			progress: Math.max(0.01, lastDuration > 0 ? Math.min(0.99, lastTime / lastDuration) : 0.01),
			totalEpisodes: totalEps,
			genres: anime.genres,
			score: anime.score
		});
	}

	/**
	 * Change the preferred audio track and re-run the default pick against the
	 * already-loaded stream (no network round-trip).
	 */
	function setAudio(audio: 'sub' | 'dub') {
		if ($settings.preferredAudio === audio || !stream) return;
		updateSetting('preferredAudio', audio);
		const needle = audio;
		const order: StreamCategory[] = ['h-sub', 's-sub', 'dub', 'e-sub', 'e-dub', 'v-sub', 'v-dub'];
		const cat = order.find((c) => c.includes(needle) && stream?.groups[c]?.length);
		if (cat && stream) {
			resumeTarget = latestResumePosition();
			activeSource = stream.groups[cat][0];
			activeCategory = cat;
			resumeApplied.delete(activeSource.url); // reset so new server seeks to saved position
			toast(`Preferring ${audio} servers`, true);
		} else {
			toast(`No ${audio} servers for this episode`, false);
		}
	}

	function goToEpisode(n: number) {
		const max = totalEps ?? n;
		const target = Math.min(Math.max(1, n), max || n);
		if (target === epNo) return;
		// Flush the current position before leaving the episode.
		saveProgress(lastTime, lastDuration, true);
		// Moving on means the episode left behind counts as watched.
		if (target > epNo) markCurrentWatched();
		goto(`/watch/${animeId}/${target}`);
	}

	/* ---------------- playback state ---------------- */
	let player: EmbedPlayer;
	let theater = false;
	let light = false;
	let shortcutsOpen = false;
	let serversOpen = false;
	let nextPrefetched = false;
	let lastSave = 0;
	let lastTime = 0;
	/** Last known media duration — kept so a pause (which reports no duration) still saves a sane ratio. */
	let lastDuration = 0;
	/** Guards the one-shot "resume where I left off" seek per source URL. */
	let resumeApplied = new Set<string>();
	/**
	 * Resume target captured before the player starts.
	 *
	 * It is snapshotted up front because the embed fires `play`/`time` at 0s
	 * right after booting, which would otherwise overwrite the stored
	 * position before the `ready` handshake asks us to seek.
	 */
	let resumeTarget = 0;

	/** Sources known to have failed on this episode, so fallback never loops. */
	let failedSources = new Set<string>();
	/** Watch-page anchor: measured on scroll so the compact player never flickers. */
	let playerAnchor: HTMLDivElement | null = null;

	/** Episodes already pushed to the connected providers — one push each. */
	const pushedEpisodes = new Set<string>();

	/**
	 * Mark the current episode as watched locally and on both providers.
	 *
	 * Runs when playback passes 75%, when the user moves on to the next
	 * episode and when the video ends. The remote push happens at most once
	 * per episode per page load.
	 */
	function markCurrentWatched(): void {
		if (!anime) return;
		const total = anime.episodes ?? episodes.length ?? null;
		const done = total != null && epNo >= total;

		if (!isWatched(animeId, epNo)) {
			markWatched(animeId, epNo, total);
			// Keep the local watchlist in step with the remote list.
			if ($watchlist[animeId]) {
				setWatchStatus(animeId, done ? 'completed' : 'watching');
			} else {
				addToWatchlist(
					{
						id: anime.id,
						malId: anime.malId,
						display: anime.display,
						cover: anime.cover,
						banner: anime.banner,
						genres: anime.genres,
						score: anime.score,
						totalEpisodes: total
					},
					done ? 'completed' : 'watching'
				);
			}
			toast(`Episode ${epNo} marked as watched`, true);
		}

		const key = `${animeId}:${epNo}`;
		if (pushedEpisodes.has(key)) return;
		pushedEpisodes.add(key);
		void syncEpisodeProgress({ id: anime.id, malId: anime.malId }, epNo, done)
			.then((report) => {
				if (report.issues.length) {
					pushedEpisodes.delete(key);
					toast(`Episode ${epNo} saved locally — ${syncIssueText(report)}`, false);
				} else if (report.synced.length) {
					toast(`Episode ${epNo} synced to ${report.synced.join(' & ')}`, true);
				}
			})
			.catch((e) => {
				// Offline or rate limited — allow a later retry and reconcile from
				// the settings page in the meantime.
				pushedEpisodes.delete(key);
				toast(
					`Episode ${epNo} saved locally — ${e instanceof Error ? e.message : 'sync failed'}`,
					false
				);
			});
	}

	/**
	 * Persist how far the user got.
	 *
	 * The absolute position (seconds) is stored alongside the ratio so the
	 * player can resume at the exact spot instead of guessing from a
	 * percentage. `force` flushes the throttle — used when the episode changes
	 * or the tab is closed, where the last tick would otherwise be lost.
	 */
	function saveProgress(currentTime: number, duration: number, force = false) {
		if (!anime) return;
		// Never overwrite a stored position with zero — that would wipe the
		// resume point when the page is left before the player ever started.
		if (currentTime <= 0) return;
		const now = Date.now();

		const dur = duration > 0 ? duration : lastDuration;
		if (dur > 0) lastDuration = dur;
		const ratio = dur > 0 ? Math.min(0.99, currentTime / dur) : 0.05;

		// Save continuously: throttle at 1s instead of 5s, and always save on force.
		if (force || now - lastSave >= 1000) {
			lastSave = now;
			// A watched episode has no resume point worth keeping.
			if (!isWatched(animeId, epNo)) {
				recordProgress({
					id: anime.id,
					display: anime.display,
					cover: anime.cover,
					banner: anime.banner,
					episode: epNo,
					episodeTitle: episodeTitle || null,
					position: Math.max(0, currentTime),
					duration: dur > 0 ? dur : undefined,
					progress: Math.max(0.02, ratio),
					totalEpisodes: totalEps,
					genres: anime.genres,
					score: anime.score
				});
			}
		}

		// Three quarters watched → the episode counts as seen. Deliberately
		// outside the save throttle so a skipped tick never delays it.
		if (ratio >= 0.75) markCurrentWatched();
	}

	/**
	 * Resume playback where the user left off.
	 *
	 * The embed answers with a `ready` handshake once it can accept commands —
	 * that is the only safe moment to seek. Positions too close to the start
	 * (nothing meaningful to resume) or to the end (basically finished) are
	 * ignored.
	 */
	function onPlayerReady(e: CustomEvent<number>) {
		const srcUrl = activeSource?.url;
		if (!srcUrl) return;
		if (resumeApplied.has(srcUrl)) return;
		resumeApplied.add(srcUrl);

		// Always refresh resume target from latest known position at the moment
		// of handshake (covers server switch after user already played).
		resumeTarget = latestResumePosition();
		ensureProgressEntry();

		const pos = resumeTarget;
		if (pos < 15) return;
		const dur = Number(e.detail) || lastDuration;
		if (dur > 0 && pos > dur * 0.95) return;

		player?.seek(pos);
		const m = Math.floor(pos / 60);
		const s = Math.floor(pos % 60);
		toast(`Resuming from ${m}:${String(s).padStart(2, '0')}`, true);
	}

	function onTime(e: CustomEvent<{ currentTime: number; duration: number; reason: string }>) {
		const { currentTime, duration } = e.detail;
		lastTime = currentTime;
		if (duration > 0) lastDuration = duration;
		// Near the end → warm the next episode's stream.
		if (!nextPrefetched && duration > 0 && currentTime > duration - 30) {
			nextPrefetched = true;
			prefetchStream(animeId, epNo + 1);
		}
		// Create/update continue-watching entry on any playback activity so it
		// appears as soon as the user starts watching (not just at pause/end).
		ensureProgressEntry();
		saveProgress(currentTime, duration);
	}

	function onPlay(e: CustomEvent<number>) {
		lastTime = e.detail;
		saveProgress(e.detail, 0);
		ensureProgressEntry();
	}

	function onPause(e: CustomEvent<number>) {
		lastTime = e.detail;
		if (anime) {
			saveProgress(e.detail, 0, true); // flush progress on pause
		}
	}

	function onEnded() {
		if (anime) {
			const total = anime.episodes ?? episodes.length ?? null;
			recordProgress({
				id: anime.id,
				display: anime.display,
				cover: anime.cover,
				banner: anime.banner,
				episode: epNo,
				episodeTitle: episodeTitle || null,
				position: lastDuration > 0 ? lastDuration : undefined,
				duration: lastDuration > 0 ? lastDuration : undefined,
				progress: 1,
				totalEpisodes: total,
				genres: anime.genres,
				score: anime.score
			});
			// Marks the episode watched and clears the resume row for a finished show.
			markCurrentWatched();
		}
		if ($settings.autoNextOnEnd && hasNext) {
			toast('Playing next episode…', true);
			goto(`/watch/${animeId}/${epNo + 1}`);
		}
	}

	function onSkipped(e: CustomEvent<{ segment: string; auto: boolean }>) {
		const { segment, auto } = e.detail;
		if (auto) toast(`${segment === 'outro' ? 'Outro' : 'Intro'} skipped`, true);
	}

	/* ---------------- control bar actions ---------------- */
	function onControlToggle(e: CustomEvent<{ key: ToggleKey; value: boolean }>) {
		const { key, value } = e.detail;
		switch (key) {
			case 'autoplay':
				updateSetting('autoNext', value);
				break;
			case 'autoNext':
				updateSetting('autoNextOnEnd', value);
				break;
			case 'skipIntro':
				updateSetting('autoSkipIntro', value);
				break;
			case 'skipOutro':
				updateSetting('autoSkipOutro', value);
				break;
		}
	}

	function toggleTheater() {
		theater = !theater;
		if (theater) revealClose();
	}

	/* Theater close button: top-left hotspot + tap reveal, auto-hide ~5s. */
	let closeVisible = false;
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	function revealClose() {
		closeVisible = true;
		if (closeTimer) clearTimeout(closeTimer);
		closeTimer = setTimeout(() => (closeVisible = false), 5000);
	}

	function onPointerMove(e: MouseEvent) {
		if (!theater) return;
		if (e.clientX <= 260 && e.clientY <= 200) revealClose();
	}

	/* ---------------- watchlist ---------------- */
	function onWatchlistSelect(e: CustomEvent<{ status: WatchStatus }>) {
		if (!anime) return;
		const status = e.detail.status;
		const entry = {
			id: anime.id,
			malId: anime.malId,
			display: anime.display,
			cover: anime.cover,
			banner: anime.banner,
			genres: anime.genres,
			score: anime.score,
			totalEpisodes: anime.episodes
		};
		if ($watchlist[anime.id]) {
			setWatchStatus(anime.id, status);
			toast(`Moved to “${status}”`, true);
		} else {
			addToWatchlist(entry, status);
			toast(`Added to “${status}”`, true);
		}
		// Mirror the change on every connected provider.
		void syncWatchlistEntry(entry, status).then((report) =>
			notifyLocalSyncIssues(report, 'Saved locally')
		);
	}

	function onWatchlistRemove() {
		if (!anime || !$watchlist[anime.id]) return;
		void removeWatchlistEverywhere(anime.id).then((report) =>
			notifyLocalSyncIssues(report, 'Removed locally')
		);
		toast('Removed from watchlist', false);
	}

	/* ---------------- keyboard ---------------- */
	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
			return;
		}
		if (e.key === 'Escape') {
			if (shortcutsOpen) {
				shortcutsOpen = false;
			} else if (theater) {
				theater = false;
			}
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		switch (e.key) {
			case ' ':
			case 'k':
				e.preventDefault();
				player?.togglePlay();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				player?.seek(Math.max(0, lastTime - 10));
				break;
			case 'ArrowRight':
				e.preventDefault();
				player?.seek(lastTime + 10);
				break;
			case 's':
			case 'S': {
				const w = stream?.skip;
				if (w?.intro && lastTime >= w.intro.start && lastTime <= w.intro.end) {
					player?.skipIntroSegment();
				} else if (w?.outro && lastTime >= w.outro.start && lastTime <= w.outro.end) {
					player?.skipOutroSegment();
				}
				break;
			}
			case 'j':
				if (hasPrev) goToEpisode(epNo - 1);
				break;
			case 'l':
				if (hasNext) goToEpisode(epNo + 1);
				break;
			case 't':
				toggleTheater();
				break;
			case 'd':
				light = !light;
				break;
			case 'a':
				updateSetting('autoNext', !$settings.autoNext);
				break;
			case 'n':
				updateSetting('autoNextOnEnd', !$settings.autoNextOnEnd);
				break;
			case 'p':
				setAudio($settings.preferredAudio === 'sub' ? 'dub' : 'sub');
				break;
			case '?':
				shortcutsOpen = true;
				break;
		}
	}

	/** Flush the last known position when the tab is closed or reloaded. */
	function onUnload() {
		saveProgress(lastTime, lastDuration, true);
	}

	/**
	 * The comment widget renders `mm:ss` / `hh:mm:ss` text as clickable
	 * timestamps and posts `TAC-TIMESTAMP-CLICK` to the parent window.
	 * Seek the active player to that position so those links actually work.
	 */
	function onTimestampMessage(e: MessageEvent) {
		if (e.origin !== 'https://theanimecommunity.com') return;
		const data = e.data as { type?: string; time?: number } | null;
		if (!data || data.type !== 'TAC-TIMESTAMP-CLICK') return;
		const time = Number(data.time);
		if (!Number.isFinite(time) || time < 0) return;
		player?.seek(time);
		player?.play();
		// Discussion sits below the player on every breakpoint — always bring
		// the video back into view, even when the compact mini layout is active.
		scrollToPlayer();
	}

	/** Bring the real watch page back from the compact floating player. */
	function scrollToPlayer(): void {
		playerAnchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	

	

	onMount(() => {
		// Measure the stable player wrapper rather than the stage itself: when
		// the stage becomes fixed, the wrapper keeps its layout height in flow.
		window.addEventListener('mousemove', onPointerMove);
		window.addEventListener('beforeunload', onUnload);

		return () => {
			window.removeEventListener('mousemove', onPointerMove);
			window.removeEventListener('beforeunload', onUnload);
		};
	});

	onDestroy(() => {
		if (closeTimer) clearTimeout(closeTimer);
		// Cancel any in-flight server request so it can't resolve after unmount.
		streamToken++;
		streamAbort?.abort();
		// Persist the final position so returning to the episode resumes there.
		saveProgress(lastTime, lastDuration, true);
	});
</script>

<svelte:window on:keydown={onKeydown} on:message={onTimestampMessage} />

<svelte:head>
	<title>
		{anime ? `${displayName} — EP ${epNo}${episodeTitle ? ` · ${episodeTitle}` : ''} — Anikage` : 'Watching — Anikage'}
	</title>
</svelte:head>

<div class="relative px-4 pt-4 sm:px-6 lg:px-8">
	<!-- Metadata failure never blocks playback: the player only needs the URL. -->
	{#if animeError}
		<div
			class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line/60 bg-surface/40 px-4 py-3 text-sm text-muted"
			role="status"
		>
			<Info size={14} class="shrink-0 text-accent" aria-hidden="true" />
			<span class="min-w-0 flex-1">{animeError} — playback is still available.</span>
			<button
				on:click={() => {
					loadedAnimeId = 0;
					loadAnime(animeId);
				}}
				class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent active:scale-95"
			>
				<RefreshCw size={12} />
				{t('retry', $lang)}
			</button>
		</div>
	{/if}
		<!-- Light mode: dim everything except the player; clicking the dark area dismisses it -->
		{#if light && !theater}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed inset-0 z-[90] bg-black/85"
				on:click={() => (light = false)}
				aria-hidden="true"
			></div>
		{/if}

		<div class="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
			<!-- ============ Sidebar (desktop) ============
			     First in the DOM so the episode list precedes the discussion in
			     the page flow; `order` keeps it on the right visually. -->
			<aside class="order-2 hidden lg:block">
				<!-- Episode list: exactly one page height, scrolling internally -->
				<div class="sticky top-24 flex h-[calc(100vh-7rem)] flex-col">
					<div class="hairline flex min-h-0 flex-1 flex-col rounded-xl bg-surface/30 p-4 backdrop-blur-md">
						<h2 class="mb-3 shrink-0 font-display text-sm font-semibold tracking-tight text-ink">
							{t('episodes', $lang)}
						</h2>
						<div class="min-h-0 flex-1 overflow-y-auto pr-1">
							<EpisodeList
								{animeId}
								{episodes}
								total={totalEps}
								currentEp={epNo}
								tileSize="xl"
								onePerRow={true}
								bind:view={listView}
							/>
						</div>
					</div>
				</div>
			</aside>

			<!-- ============ Player column ============
			     The three lower sections are ordered per breakpoint. The
			     discussion flips from drawer to inline at 768px (md), so that is
			     where the order flips too:
			       < 768px  (drawer)  → discussion, episode list, details
			       ≥ 768px  (inline)  → episode list, details, discussion
			       ≥ 1024px           → episode list moves into the sidebar
			                            (first in the DOM), details, discussion -->
			<div class="order-1 flex min-w-0 flex-col">
				<!-- Player stage (theater mode → full viewport). The stable anchor
				     keeps layout space while the stage itself is fixed as a miniplayer. -->
				<div
					bind:this={playerAnchor}
					class="relative w-full {theater ? '' : 'aspect-video'}"
				>
					<div
						id="watch-player"
						class="{theater
							? 'fixed inset-0 z-[100] h-screen w-screen bg-black'
							: light
								? 'absolute inset-0 z-[95] overflow-hidden rounded-xl bg-black shadow-2xl lg:rounded-lg'
								: 'absolute inset-0 overflow-hidden rounded-xl bg-black shadow-2xl lg:rounded-lg'}"
						role="region"
						aria-label={t('videoPlayer', $lang)}
						on:pointerdown={() => theater && revealClose()}
						in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(0) }}
					>
					{#if activeSource}
							<!-- Keyed so changing servers destroys the old iframe before the
							     new stream mounts: exactly one stream can ever be active. -->
							{#key activeSource.url}
								<EmbedPlayer
									bind:this={player}
									src={activeSource.url}
									title={`Anikage player — ${displayName} episode ${epNo}`}
									intro={stream?.skip.intro ?? null}
									outro={stream?.skip.outro ?? null}
									autoSkipIntro={$settings.autoSkipIntro}
									autoSkipOutro={$settings.autoSkipOutro}
									autoplay={true}
									on:ready={onPlayerReady}
									on:time={onTime}
									on:play={onPlay}
									on:pause={onPause}
									on:ended={onEnded}
									on:skipped={onSkipped}
									on:status={onPlayerStatus}
								/>
							{/key}
						{:else}
							<!-- No server picked yet: the stage waits for the server list. -->
							<div
								class="absolute inset-0 grid place-items-center bg-black px-6 text-center"
								aria-live="polite"
							>
								{#if streamState === 'error'}
									<div class="space-y-3">
										<p class="text-sm text-white/70">{serverErrorText()}</p>
										<button
											on:click={() => loadStream(animeId, epNo, { force: true })}
											class="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-3 py-1.5 text-xs font-medium text-white transition hover:border-accent/50 hover:text-accent active:scale-95"
										>
											<RefreshCw size={12} />
											{t('retry', $lang)}
										</button>
									</div>
								{:else}
									<div class="flex flex-col items-center gap-3">
										<Loader2 size={26} class="animate-spin text-accent" aria-hidden="true" />
										<p class="text-sm text-white/70">{t('loadingServers', $lang)}</p>
									</div>
								{/if}
							</div>
						{/if}

					<!-- Theater mode close: top-left hotspot, auto-hides -->
					{#if theater}
						<button
							on:click={toggleTheater}
							class="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-md border border-white/20 bg-black/60 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition-all duration-200 hover:border-accent/50 hover:text-accent active:scale-95 {closeVisible
								? 'opacity-100'
								: 'pointer-events-none opacity-0'}"
							aria-label={t('exitTheater', $lang)}
						>
							✕ {t('exitTheater', $lang)}
						</button>
					{/if}

						<!-- Floating-player controls removed - now handled by global miniplayer -->
					</div>
				</div>

				<!-- 1. Quick-action control bar -->
				<div
					class="mt-4"
					in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(1) }}
				>
					<ControlBar
						{hasPrev}
						{hasNext}
						{light}
						{theater}
						autoplay={$settings.autoNext}
						autoNext={$settings.autoNextOnEnd}
						autoSkipIntro={$settings.autoSkipIntro}
						autoSkipOutro={$settings.autoSkipOutro}
						{saved}
						on:prev={() => goToEpisode(epNo - 1)}
						on:next={() => goToEpisode(epNo + 1)}
						on:theater={toggleTheater}
						on:light={() => (light = !light)}
						on:shortcuts={() => (shortcutsOpen = true)}
						on:toggle={onControlToggle}
					>
						<svelte:fragment slot="end">
							<WatchlistMenu
								{saved}
								status={savedStatus}
								on:select={onWatchlistSelect}
								on:remove={onWatchlistRemove}
							/>
						</svelte:fragment>
					</ControlBar>
				</div>

				<!-- Episode number + title (single row; only truncates in the sidebar layout) -->
				<div
					class="mt-4 flex min-w-0 items-center gap-3"
					in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(2) }}
				>
					<span
						class="shrink-0 rounded border border-accent/25 bg-accent/10 px-2 py-0.5 font-display text-xs font-bold tracking-wide text-accent"
					>
						EP {epNo}
					</span>
					{#if episodeTitle}
						<h1 class="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight text-ink">
							{episodeTitle}
						</h1>
					{/if}
				</div>

				{#if anime}
					<a
						href={`/anime/${anime.id}`}
						class="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
					>
						{displayName}
						<ChevronRight size={13} />
					</a>
				{:else if animeLoading}
					<Skeleton variant="line" className="mt-2 max-w-40" />
				{/if}

				<!-- Next broadcast, immediately above the server list. -->
				{#if anime?.nextAiring}
					<div
						class="mt-4"
						in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(3) }}
					>
						<AiringCountdown airing={anime.nextAiring} />
					</div>
				{/if}

				<!-- Server category + name (dropdown) / mobile sheet -->
				<div
					class="mt-4"
					in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(3) }}
				>
					<div class="mb-1.5 flex items-center justify-between gap-2">
						<p class="text-[10px] font-semibold uppercase tracking-widest text-muted">{t('server', $lang)}</p>
						<div class="flex items-center gap-0.5 rounded-md border border-line/60 bg-surface/40 p-0.5">
							{#each [{ id: 'sub' as const, label: 'SUB' }, { id: 'dub' as const, label: 'DUB' }] as a (a.id)}
								<button
									on:click={() => serversReady && setAudio(a.id)}
									disabled={!serversReady}
									class="rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide transition disabled:opacity-40 { $settings.preferredAudio === a.id
										? 'bg-accent/15 text-accent'
										: 'text-muted hover:text-ink'}"
									title={`${t('preferServers', $lang)} ${a.label} ${t('serversSuffix', $lang)} (J)`}
								>
									{a.label}
								</button>
							{/each}
						</div>
					</div>
					{#if streamState === 'loading'}
						<!-- Spinner under the "Server" label while the list is on its way -->
						<div class="flex items-center gap-2 text-sm text-muted" aria-live="polite">
							<Loader2 size={14} class="animate-spin text-accent" aria-hidden="true" />
							<span>{t('loadingServers', $lang)}</span>
						</div>
					{:else if stream}
						<div class="relative">
							<!-- Reloading keeps the current list visible but inert -->
							{#if streamState === 'retrying'}
								<div
									class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-bg/50 backdrop-blur-[1px]"
								>
									<span class="flex items-center gap-2 text-xs text-muted">
										<Loader2 size={13} class="animate-spin text-accent" aria-hidden="true" />
										{t('reloadingServers', $lang)}
									</span>
								</div>
							{/if}
							<div class="hidden sm:block">
								<ServerDropdown
									groups={stream.groups}
									{activeUrl}
									onSelect={selectSource}
									loading={false}
								/>
							</div>
							<button
								on:click={() => (serversOpen = true)}
								class="flex w-full items-center justify-between gap-2 rounded-md border border-line/60 bg-surface/40 px-4 py-2.5 text-sm text-muted transition hover:border-accent/40 active:scale-95 sm:hidden"
							>
								<span class="min-w-0 truncate">
									{t('server', $lang)}:
									<span class="font-semibold text-ink">{activeSource?.label ?? '—'}</span>
								</span>
								<Info size={14} class="shrink-0 text-accent" />
							</button>
						</div>
					{:else if streamState === 'error'}
						<p class="text-sm text-muted">{serverErrorText()}</p>
						<button
							on:click={() => loadStream(animeId, epNo, { force: true })}
							class="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent active:scale-95"
						>
							<RefreshCw size={12} />
							{t('retry', $lang)}
						</button>
					{:else}
						<p class="text-sm text-muted">{t('noServers', $lang)}</p>
					{/if}
				</div>

				<!-- 5. Downloads -->
				{#if stream && stream.downloads.length}
					<div class="mt-5">
						<p class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
							<Download size={11} /> {t('downloads', $lang)}
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#each stream.downloads as d (d.url)}
								<a
									href={d.url}
									target="_blank"
									rel="noopener noreferrer"
									class="rounded-md border border-line/60 bg-surface/40 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/30 hover:text-ink active:scale-95"
								>
									{d.label}{d.quality ? ` · ${d.quality}` : ''}
								</a>
							{/each}
						</div>
					</div>
				{/if}


				<!-- Episode list below the player on small screens -->
				<section
					class="mt-8 order-2 md:order-1 lg:hidden"
					in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(6) }}
				>
					<h2 class="mb-3 font-display text-base font-semibold tracking-tight text-ink">
						{t('episodes', $lang)}
					</h2>
					<EpisodeList
						{animeId}
						{episodes}
						total={totalEps}
						currentEp={epNo}
						tileSize="lg"
						onePerRow={true}
						bind:view={listView}
					/>
				</section>

				<!-- Discussion: drawer below 768px (first), inline above (last) -->
				{#if anime}
					<section
						class="mt-8 order-1 md:order-3 lg:order-2"
						in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(5) }}
					>
						<Comments
							anilistId={anime.id}
							malId={anime.malId}
							title={anime.display}
							episode={epNo}
							inline={true}
							showMobileTrigger={true}
						/>
					</section>
				{/if}

				<!-- Anime details: below the player on every breakpoint -->
				{#if anime}
					<section
						class="mt-8 order-3 md:order-2 lg:order-1"
						in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(4) }}
					>
						<ShowInfo {anime} descriptionLines={4} detailHref={`/anime/${anime.id}`} />
					</section>
				{/if}

				<!-- Related seasons + recommended (same rails as the details page) -->
				<div class="order-4 mt-8">
					{#if anime?.relations?.length}
						<RailRow
							title="Seasons & Related"
							items={anime.relations.map((r) => r.anime)}
							meta={Object.fromEntries(
								anime.relations.map((r) => [r.id, r.relationType.replace('_', ' ')])
							)}
							reveal={7}
						/>
					{/if}

					{#if anime?.recommendations?.length}
						<RailRow
							title="Recommended"
							items={anime.recommendations.map((r) => r.anime)}
							reveal={8}
						/>
					{/if}
				</div>
			</div>
		</div>

		<!-- Mobile sheets -->
		<BottomSheet open={serversOpen} title={t('selectServer', $lang)} on:close={() => (serversOpen = false)}>
			{#if stream}
				<ServerBar groups={stream.groups} {activeUrl} onSelect={selectSource} loading={streamState === 'loading'} />
			{/if}
		</BottomSheet>
	</div>

<ShortcutsHelp open={shortcutsOpen} on:close={() => (shortcutsOpen = false)} />
