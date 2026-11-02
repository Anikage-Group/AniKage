/**
 * Shared domain types for Anikage.
 * Normalized shapes produced from live AniList / ani.zip / Anikage worker data.
 */

export interface Title {
	romaji: string;
	english: string | null;
	native: string | null;
}

export interface CoverImage {
	extraLarge: string;
	large: string;
	color: string | null;
}

export interface AiringEpisode {
	episode: number;
	airingAt: number;
}

/** Normalized anime record used across the entire app. */
export interface Anime {
	id: number;
	malId: number | null;
	title: Title;
	/** Best display title: english → romaji */
	display: string;
	banner: string | null;
	cover: string;
	color: string | null;
	description: string;
	genres: string[];
	tags: string[];
	score: number | null;
	popularity: number;
	favorites: number;
	status: string;
	format: string | null;
	season: string | null;
	seasonYear: number | null;
	episodes: number | null;
	duration: number | null;
	studio: string | null;
	startDate: string | null;
	nextAiring: AiringEpisode | null;
	isAdult: boolean;
	/** Related seasons / prequels / sequels (optional, fetched on detail pages). */
	relations?: {
		id: number;
		relationType: string;
		title: string;
		cover: string | null;
		score: number | null;
		/** Full record, so shared card components can be used. */
		anime: Anime;
	}[];
	/** Main characters / actors (optional). */
	characters?: {
		name: string;
		role: string | null;
		image: string | null;
		/** Voice actors behind the character. */
		voiceActors: { name: string; image: string | null }[];
	}[];
	/** Recommended titles (optional). */
	recommendations?: {
		id: number;
		title: string;
		cover: string | null;
		score: number | null;
		/** Full record, so shared card components can be used. */
		anime: Anime;
	}[];
	/** YouTube trailer id (optional). */
	trailer?: string | null;
}

export interface ScheduleEntry {
	anime: Anime;
	episode: number;
	airingAt: number;
}

export interface EpisodeAsset {
	number: number;
	title: string | null;
	image: string | null;
	/** Episode description/synopsis from the data source. */
	description?: string | null;
	/** Episode air/release date in ISO format (YYYY-MM-DD). */
	releaseDate?: string | null;
}

export interface AniZipResult {
	pictures: string[];
	coverImage: string | null;
	bannerImage: string | null;
	/** Transparent title artwork, listed under `coverType: 'Clearlogo'` in ani.zip. */
	clearlogo: string | null;
	episodes: Record<string, EpisodeAsset>;
	/** Total episode count reported by ani.zip (useful when episodes map is empty for upcoming titles). */
	episodeCount: number;
	/** Cross-database ids — the bridge to the MyAnimeList-based fallback sources. */
	mappings: AniZipMappings | null;
	/** Every title ani.zip knows, keyed by language code. */
	titles: Record<string, string>;
}

/** Ids of one title across the databases ani.zip tracks. */
export interface AniZipMappings {
	anilist_id?: number | null;
	mal_id?: number | null;
	kitsu_id?: number | null;
	thetvdb_id?: number | null;
	anidb_id?: number | null;
	type?: string | null;
}

/* ---------------- Player / stream data ---------------- */

/** A single embeddable provider entry. */
export interface StreamSource {
	/** Human label, e.g. "VidStreaming", "Mp4upload" */
	label: string;
	url: string;
}

/** Server sub-categories returned by the stream worker. */
export type StreamCategory = 'h-sub' | 's-sub' | 'dub' | 'e-sub' | 'e-dub' | 'v-sub' | 'v-dub';

export interface SkipWindow {
	/** Seconds — start of the segment */
	start: number;
	/** Seconds — end of the segment */
	end: number;
}

export interface DownloadEntry {
	label: string;
	url: string;
	quality?: string;
}

export interface StreamData {
	/** Multi-provider embedded player URLs, grouped by category. */
	groups: Record<StreamCategory, StreamSource[]>;
	skip: {
		intro: SkipWindow | null;
		outro: SkipWindow | null;
	};
	downloads: DownloadEntry[];
}

/* ---------------- Watch state ---------------- */

export type WatchStatus =
	| 'watching'
	| 'completed'
	| 'planned'
	| 'rewatching'
	| 'dropped'
	| 'paused';

export const WATCH_STATUSES: { id: WatchStatus; label: string }[] = [
	{ id: 'watching', label: 'Watching' },
	{ id: 'completed', label: 'Completed' },
	{ id: 'planned', label: 'Plan to Watch' },
	{ id: 'rewatching', label: 'Rewatching' },
	{ id: 'dropped', label: 'Dropped' },
	{ id: 'paused', label: 'Paused' }
];

/** Site display language for titles. */
export type Lang = 'en' | 'jp' | 'romaji';

export interface WatchlistEntry {
	id: number;
	malId: number | null;
	display: string;
	cover: string;
	banner: string | null;
	status: WatchStatus;
	genres: string[];
	score: number | null;
	totalEpisodes: number | null;
	addedAt: number;
	/** Optional title + adult flag, mirrored from the Anime record when known. */
	title?: Title;
	isAdult?: boolean;
}

export interface ProgressEntry {
	id: number;
	display: string;
	cover: string;
	banner: string | null;
	episode: number;
	episodeTitle: string | null;
	/** 0..1 */
	progress: number;
	/** Absolute playback position in seconds — used to resume where the user left off. */
	position?: number;
	/** Total media duration in seconds, for the "watched / total" overlay. */
	duration?: number;
	updatedAt: number;
	totalEpisodes: number | null;
	genres: string[];
	score: number | null;
}
