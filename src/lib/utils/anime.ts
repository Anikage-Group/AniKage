import type { Anime, ProgressEntry, WatchlistEntry } from '$lib/types';

/**
 * Structural adapter: build a minimal `Anime`-shaped object from a stored
 * watchlist / progress entry so shared components (title language picker,
 * watchlist menu) can consume it without a second network fetch.
 */
export function toAnimeLike(
	e: WatchlistEntry | ProgressEntry
): Anime {
	const title = 'title' in e && e.title ? e.title : { romaji: e.display, english: null, native: null };
	return {
		id: e.id,
		malId: 'malId' in e ? e.malId : null,
		title,
		display: e.display,
		banner: e.banner,
		cover: e.cover,
		color: null,
		description: '',
		genres: e.genres ?? [],
		tags: [],
		score: e.score,
		popularity: 0,
		favorites: 0,
		status: 'UNKNOWN',
		format: null,
		season: null,
		seasonYear: null,
		episodes: e.totalEpisodes,
		duration: null,
		studio: null,
		startDate: null,
		nextAiring: null,
		isAdult: 'isAdult' in e ? !!e.isAdult : false
	};
}

/** Convenience predicate used across the watchlist surfaces. */
export function isEntryAdult(e: WatchlistEntry): boolean {
	return 'isAdult' in e ? !!e.isAdult : false;
}
