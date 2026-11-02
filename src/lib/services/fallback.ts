import type { Anime, EpisodeAsset, ScheduleEntry } from '$lib/types';
import { getAniZip, getAniZipByMal, getAniZipByKitsu } from '$lib/services/aniZip';
import { cacheGet, cacheSet, cachedStale } from '$lib/services/cache';
import {
	ANILIST_GRAPHQL,
	JIKAN_URL,
	KITSU_URL,
	MAL_API_PATH,
	SOURCE_ORDER,
	TENRAI_URL,
	sourceEnabled
} from '$lib/config';
import {
	fetchMalAnime as fetchMalRecord,
	MAL_LIST_FIELDS,
	malHeaders,
	type MalRecord
} from '$lib/services/malOAuth';

/**
 * Fallback metadata sources.
 *
 * AniList can switch its API off — they did exactly that over "severe
 * stability issues" — and when that happens every view in the app would go
 * blank. These sources keep the site alive:
 *
 *   1. Tenrai  — a normalised MyAnimeList REST API
 *   2. Jikan   — the community MyAnimeList API
 *   3. Kitsu   — the Kitsu API
 *   4. ani.zip — artwork, titles and id mappings; always reachable
 *
 * Which of them is queried (and in which order) comes from
 * `PUBLIC_SOURCE_ORDER`; a single letter means that source only.
 *
 * AniList ids stay the app's identifiers everywhere. MAL and Kitsu ids are
 * only used to look records up, and ani.zip's mapping endpoint converts
 * between the two.
 *
 * Every request for one piece of information walks the order **one source at
 * a time**: the first answer wins, the rest are never queried, and the
 * assembled result is cached once. Only when a source is unreachable is the
 * next one tried.
 */

/** Log which source answered — handy when tuning the order. */
function used(name: string): void {
	if (typeof console !== 'undefined') console.info(`[anikage] metadata source → ${name}`);
}

/* ---------------- MyAnimeList-shaped record ---------------- */

interface MalTitle {
	type?: string;
	title?: string;
}

interface MalNamed {
	mal_id?: number;
	name?: string;
}

interface MalAnime {
	mal_id?: number;
	/** Set when the record came from Kitsu instead of a MyAnimeList source. */
	kitsu_id?: number;
	/** Kitsu's mapping table also knows the AniList id — no ani.zip needed. */
	anilist_id?: number;
	url?: string;
	title?: string;
	title_japanese?: string;
	titles?: MalTitle[];
	synopsis?: string;
	background?: string;
	score?: number;
	scored_by?: number;
	rank?: number;
	popularity?: number;
	members?: number;
	favorites?: number;
	status?: string;
	genres?: MalNamed[];
	themes?: MalNamed[];
	demographics?: MalNamed[];
	explicit_genres?: MalNamed[];
	studios?: MalNamed[];
	producers?: MalNamed[];
	duration?: string;
	episodes?: number;
	type?: string;
	aired_from?: string;
	aired_to?: string;
	broadcast?: string;
	source?: string;
	year?: number;
	season?: string;
	/** Wide artwork (Kitsu's cover image). */
	banner?: string | null;
	/** Age rating, e.g. "R - 17+" (Kitsu). */
	ageRating?: string;
	/** MyAnimeList's age rating field ("PG-13", "R - 17+", "Rx - Hentai"). */
	rating?: string;
	next_airing_episode?: { episode?: number; airing_at?: number } | null;
	images?: {
		jpg?: { large_image_url?: string; image_url?: string; small_image_url?: string };
		webp?: { large_image_url?: string; image_url?: string; small_image_url?: string };
	};
	trailer?: { url?: string; embed_url?: string; youtube_id?: string; id?: string };
	/** Jikan/Tenrai embed the relations of a title in its detail record. */
	relations?: {
		relation?: string;
		entry?: { mal_id?: number; type?: string; name?: string; url?: string }[];
	}[];
}

/** A Kitsu record (JSON:API shape). */
interface KitsuAnime {
	id?: string | number;
	type?: string;
	attributes?: {
		canonicalTitle?: string;
		titles?: { en?: string; en_jp?: string; ja_jp?: string };
		synopsis?: string;
		description?: string;
		episodeCount?: number | null;
		episodeLength?: number | null;
		status?: string;
		ageRating?: string;
		averageRating?: string | number;
		userCount?: number;
		favoritesCount?: number;
		popularityRank?: number;
		startDate?: string | null;
		endDate?: string | null;
		subtype?: string;
		genres?: string[];
		youtubeVideoId?: string | null;
		posterImage?: { tiny?: string; small?: string; medium?: string; large?: string; original?: string };
		coverImage?: { tiny?: string; small?: string; medium?: string; large?: string; original?: string };
		bannerImage?: string | null;
	};
	relationships?: {
		categories?: { data?: { id: string; type: string }[] };
		mappings?: { data?: { id: string; type: string }[] };
	};
}

/** One entry of a Kitsu response's `included` array (categories, mappings, …). */
interface KitsuResource {
	id?: string;
	type?: string;
	attributes?: {
		title?: string;
		externalSite?: string;
		externalId?: string;
		canonicalTitle?: string;
		name?: string;
		role?: string;
		number?: number | null;
		thumbnail?: { original?: string; large?: string } | null;
		image?: { original?: string; large?: string } | null;
		posterImage?: { original?: string; large?: string } | null;
		averageRating?: string | number;
	};
	relationships?: {
		item?: { data?: { id?: string; type?: string } | null };
		destination?: { data?: { id?: string; type?: string } | null };
		character?: { data?: { id?: string; type?: string } | null };
		person?: { data?: { id?: string; type?: string } | null };
	};
}

/** A schedule row (Tenrai/Jikan style): which title, which episode, when. */
interface MalSchedule {
	mal_id?: number;
	anime_id?: number;
	episode?: number;
	number?: number;
	airing_at?: number;
	airing_date?: string;
	timestamp?: number;
	/** Jikan's schedule rows describe a weekly broadcast instead of a timestamp. */
	broadcast?: { day?: string | null; time?: string | null };
	/**
	 * The record, when the source already returned it.
	 *
	 * MyAnimeList's season list carries every field a schedule row needs, so
	 * the row is built from it instead of asking for each title again — 80
	 * extra requests at MAL's three-a-second limit used to stall the page.
	 */
	record?: MalAnime;
}

const JIKAN_WEEKDAYS = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday'
];

/** Anime season for a month index (both Kitsu and MAL spell autumn "fall"). */
function seasonName(month: number): string {
	return ['winter', 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall'][
		month
	];
}

/** The Monday of this week, local time. */
function mondayOfThisWeek(): Date {
	const d = new Date();
	const day = d.getDay();
	d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
	d.setHours(0, 0, 0, 0);
	return d;
}

/** When a schedule row airs, in UTC seconds (null when the row has no time). */
function scheduleTime(entry: MalSchedule): number | null {
	const explicit = entry.airing_at ?? entry.timestamp;
	if (typeof explicit === 'number' && Number.isFinite(explicit)) {
		// Some mirrors answer in milliseconds.
		return explicit > 1e12 ? Math.floor(explicit / 1000) : Math.floor(explicit);
	}
	if (entry.airing_date) {
		const parsed = Date.parse(entry.airing_date);
		if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
	}

	const day = entry.broadcast?.day?.replace(/s$/i, '').toLowerCase();
	const index = day ? JIKAN_WEEKDAYS.indexOf(day) : -1;
	if (index < 0) return null;
	const date = mondayOfThisWeek();
	date.setDate(date.getDate() + index);
	const [hh, mm] = (entry.broadcast?.time ?? '00:00').split(':').map(Number);
	// MyAnimeList broadcast times are Japan Standard Time (UTC+9).
	const utc = Date.UTC(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
		(hh || 0) - 9,
		mm || 0,
		0
	);
	return Math.floor(utc / 1000);
}

/* ---------------- tiny helpers ---------------- */

/** Kitsu only answers the JSON:API media type — anything else is a 406. */
const KITSU_ACCEPT = 'application/vnd.api+json';

/**
 * How long each source's answers stay usable, and the cache namespace they
 * live in. Schedules are short-lived: an airing time a few hours stale is
 * simply wrong, while a title's record barely changes.
 */
const MINUTE = 60_000;

function cachePolicy(url: string): { ns: string; ttl: number } | null {
	const isSchedule = /schedule/i.test(url);
	let ns = '';
	let ttl = 0;
	if (url.startsWith(JIKAN_URL)) {
		ns = 'jikan';
		ttl = 30 * MINUTE;
	} else if (url.startsWith(TENRAI_URL)) {
		ns = 'tenrai';
		ttl = 30 * MINUTE;
	} else if (url.startsWith(KITSU_URL)) {
		ns = 'kitsu';
		ttl = 60 * MINUTE;
	} else if (url.startsWith(MAL_API_PATH)) {
		ns = 'mal';
		ttl = 60 * MINUTE;
	}
	if (!ns) return null;
	return { ns, ttl: isSchedule ? 10 * MINUTE : ttl };
}

/**
 * Fetch JSON with a timeout; any failure returns null (never throws).
 *
 * Successful answers are cached under their source's namespace, so paging
 * back and forth — or reloading the page — does not re-query a mirror that is
 * rate-limited to three requests a second.
 */
async function fetchJson<T>(
	url: string,
	timeout = 6500,
	accept = 'application/json',
	extraHeaders: Record<string, string> = {}
): Promise<T | null> {
	const policy = cachePolicy(url);
	// The media type is part of the identity: Kitsu answers differently to it.
	const key = `${accept}|${url}`;
	if (policy) {
		const hit = cacheGet<T>(policy.ns, key);
		if (hit !== undefined) return hit;
		// A mirror that just timed out is not asked again straight away.
		if (sourceDown(policy.ns)) return null;
	}

	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeout);
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: { Accept: accept, ...extraHeaders }
		});
		clearTimeout(timer);
		if (!res.ok) {
			// 4xx (other than auth/rate limit) means the source is alive but the
			// request was wrong — do not blacklist it for that.
			if (policy && (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500)) {
				markSourceDown(policy.ns);
			}
			return null;
		}
		const data = (await res.json()) as T;
		if (policy) {
			markSourceUp(policy.ns);
			cacheSet(policy.ns, key, data, policy.ttl);
		}
		return data;
	} catch {
		if (policy) markSourceDown(policy.ns);
		return null;
	}
}

/* ---------------- AniList id bridge ---------------- */

/**
 * A tiny AniList query, used only to translate ids when ani.zip is down.
 *
 * The fallback module cannot import the AniList client (that client imports
 * this module), so this keeps the two bridges self-contained. Answers land in
 * the same `anilist` namespace the client uses.
 */
async function anilistQuery<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
	if (!sourceEnabled('a') || sourceDown('anilist')) return null;
	const key = `bridge|${query}|${JSON.stringify(variables)}`;
	const hit = cacheGet<T>('anilist', key);
	if (hit !== undefined) return hit;
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 6500);
		const res = await fetch(ANILIST_GRAPHQL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ query, variables }),
			signal: ctrl.signal
		});
		clearTimeout(timer);
		if (!res.ok) {
			if (res.status === 403 || res.status === 429 || res.status >= 500) markSourceDown('anilist');
			return null;
		}
		const json = (await res.json()) as { data?: T; errors?: unknown[] };
		if (json.errors?.length) return null;
		markSourceUp('anilist');
		if (json.data === undefined) return null;
		cacheSet('anilist', key, json.data, 1000 * 60 * 60 * 3);
		return json.data;
	} catch {
		markSourceDown('anilist');
		return null;
	}
}

/** AniList id behind a MyAnimeList id, using AniList's own mapping field. */
export async function anilistIdFromMal(malId: number): Promise<number | null> {
	const data = await anilistQuery<{ Media?: { id?: number } | null }>(
		'query ($mal: Int) { Media(idMal: $mal, type: ANIME) { id } }',
		{ mal: malId }
	);
	return data?.Media?.id ?? null;
}

/** MyAnimeList id behind an AniList id. */
export async function malIdFromAnilist(anilistId: number): Promise<number | null> {
	const data = await anilistQuery<{ Media?: { idMal?: number | null } | null }>(
		'query ($id: Int) { Media(id: $id, type: ANIME) { idMal } }',
		{ id: anilistId }
	);
	return data?.Media?.idMal ?? null;
}

/** Strip the HTML the mirrors embed in their synopses. */
function clean(text: string | null | undefined): string {
	return (text ?? '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&amp;/g, '&')
		.trim();
}

/** Both APIs wrap a single record in `{ data }`; some lists do not. */
function unwrap<T>(raw: unknown): T | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as { data?: T };
	if (obj.data) return obj.data;
	return raw as T;
}

/** MyAnimeList's list and search endpoints nest each entry under `node`. */
function malNodes(rows: unknown): MalRecord[] {
	if (!Array.isArray(rows)) return [];
	return rows
		.map((row) => {
			if (row && typeof row === 'object' && 'node' in row) {
				return (row as { node?: MalRecord }).node ?? null;
			}
			return row as MalRecord;
		})
		.filter((row): row is MalRecord => !!row && typeof row === 'object');
}

/**
 * One source to try, tagged with its cache namespace.
 *
 * `first` walks them in the configured order and stops at the first answer.
 * Sources that just failed are skipped for a while, so a dead mirror can
 * never stack its timeout onto every view again.
 */
interface Attempt<T> {
	ns: 'jikan' | 'tenrai' | 'kitsu' | 'mal' | 'anilist' | 'anizip';
	run: () => Promise<T | null>;
}

/** How long a source is skipped after a network/5xx failure. */
const SOURCE_DOWN_MS = 90_000;
const downUntil = new Map<string, number>();

function sourceDown(ns: string): boolean {
	const until = downUntil.get(ns);
	return !!until && until > Date.now();
}

function markSourceDown(ns: string): void {
	downUntil.set(ns, Date.now() + SOURCE_DOWN_MS);
}

function markSourceUp(ns: string): void {
	downUntil.delete(ns);
}

/**
 * Try each source in order — never at the same time.
 *
 * The first non-null answer wins and later sources are not touched, so a page
 * only ever queries (and caches) the one API that is actually serving it.
 */
async function first<T>(attempts: Array<Attempt<T>>): Promise<T | null> {
	for (const attempt of attempts) {
		if (sourceDown(attempt.ns)) continue;
		try {
			const value = await attempt.run();
			if (value !== null && value !== undefined) return value;
		} catch {
			// A parser error does not mean the source is down (the request
			// already succeeded); only `fetchJson` blacklists on transport
			// failures. Moving on keeps a broken parser from hiding the source
			// for every feature for the next 90 seconds.
		}
	}
	return null;
}

/** Fetch one record from Jikan. */
async function fetchJikanAnime(malId: number): Promise<MalAnime | null> {
	const raw = unwrap<MalAnime>(await fetchJson(`${JIKAN_URL}/anime/${malId}`));
	return raw?.mal_id || raw?.title ? raw : null;
}

/** Fetch one record from Tenrai. */
async function fetchTenraiAnime(malId: number): Promise<MalAnime | null> {
	const raw = unwrap<MalAnime>(await fetchJson(`${TENRAI_URL}/anime/${malId}?sfw-strict`));
	return raw?.mal_id || raw?.title ? raw : null;
}

/** Fetch one record from Kitsu (its API only answers the JSON:API media type). */
async function fetchKitsuAnime(kitsuId: number): Promise<MalAnime | null> {
	const raw = await fetchJson<{ data?: KitsuAnime; included?: KitsuResource[] }>(
		`${KITSU_URL}/anime/${kitsuId}?include=categories,mappings`,
		9000,
		KITSU_ACCEPT
	);
	if (!raw?.data?.attributes) return null;
	return kitsuToMal(raw.data, raw.included ?? []);
}

/** Fetch one record from the official MyAnimeList API. */
async function fetchMalAnime(malId: number): Promise<MalAnime | null> {
	const raw = await fetchMalRecord(malId);
	if (!raw) return null;
	return malToMalAnime(raw);
}

/** Convert a MyAnimeList API record into the shared shape. */
function malToMalAnime(raw: MalRecord): MalAnime {
	// The official API names some fields differently from Jikan/Tenrai
	// (`num_episodes`, `num_list_users`, `num_favorites`, `average_episode_duration`),
	// so both spellings are read.
	const english =
		raw.title_english?.trim() || raw.alternative_titles?.en?.trim() || null;
	const native = raw.title_japanese?.trim() || raw.alternative_titles?.ja?.trim() || null;
	const poster =
		raw.main_picture?.original ??
		raw.main_picture?.large ??
		raw.main_picture?.medium ??
		raw.pictures?.[0]?.original ??
		raw.pictures?.[0]?.large;
	const seconds = raw.average_episode_duration;
	const duration =
		raw.duration ??
		(typeof seconds === 'number' && seconds > 0 ? `${Math.round(seconds / 60)} min` : undefined);
	return {
		mal_id: raw.mal_id ?? raw.id,
		title: raw.title ?? '',
		title_japanese: native ?? undefined,
		titles: english ? [{ type: 'English', title: english }] : [],
		synopsis: raw.synopsis ?? '',
		// The official API's mean is already 0–10, as is a mirror's score.
		score: typeof raw.mean === 'number' ? raw.mean : raw.score,
		members: raw.members ?? raw.num_list_users,
		favorites: raw.favorites ?? raw.num_favorites,
		popularity: raw.popularity,
		rank: raw.rank,
		background: raw.background ?? undefined,
		status:
			raw.status === 'finished_airing'
				? 'Finished Airing'
				: raw.status === 'currently_airing'
					? 'Currently Airing'
					: raw.status === 'not_yet_aired' || raw.status === 'not_yet_airing'
						? 'Not yet aired'
						: undefined,
		aired_from: raw.start_date ?? undefined,
		aired_to: raw.end_date ?? undefined,
		episodes: raw.episodes ?? raw.num_episodes ?? undefined,
		duration,
		type: raw.media_type ?? undefined,
		genres: (raw.genres ?? []).map((g) => ({ name: g.name })),
		studios: (raw.studios ?? []).map((s) => ({ name: s.name })),
		explicit_genres: raw.nsfw && raw.nsfw !== 'white' ? [{ name: 'Hentai' }] : [],
		rating: raw.rating ?? undefined,
		images: { jpg: { large_image_url: poster, image_url: poster } }
	};
}

/** Convert a Kitsu record into the MyAnimeList-shaped record the mapper uses. */
function kitsuToMal(kitsu: KitsuAnime, included: KitsuResource[] = []): MalAnime {
	const a = kitsu.attributes ?? {};
	const title = a.titles?.en ?? a.canonicalTitle ?? '';
	const score = Number(a.averageRating);

	// Kitsu only sends relationships inline; the actual names arrive in `included`.
	const lookup = (rel: { id: string; type: string }) =>
		included.find((row) => row.type === rel.type && row.id === rel.id);
	const categories = (kitsu.relationships?.categories?.data ?? [])
		.map((rel) => lookup(rel)?.attributes?.title)
		.filter((name): name is string => !!name);
	const malId = (kitsu.relationships?.mappings?.data ?? [])
		.map((rel) => lookup(rel)?.attributes)
		.find((attrs) => attrs?.externalSite === 'myanimelist/anime' && attrs?.externalId)?.externalId;
	// Kitsu's mapping table also carries the AniList id. Recording it means a
	// Kitsu page needs no ani.zip lookup at all to link its titles.
	const anilistId = (kitsu.relationships?.mappings?.data ?? [])
		.map((rel) => lookup(rel)?.attributes)
		.find((attrs) => attrs?.externalSite === 'anilist/anime' && attrs?.externalId)?.externalId;
	const anilistNumeric = anilistId ? Number(anilistId) : null;
	if (anilistNumeric && Number.isFinite(anilistNumeric)) {
		if (malId) rememberId(`mal:${Number(malId)}`, anilistNumeric);
		if (kitsu.id) rememberId(`kitsu:${Number(kitsu.id)}`, anilistNumeric);
	}

	return {
		mal_id: malId ? Number(malId) : undefined,
		kitsu_id: Number(kitsu.id) || undefined,
		anilist_id: anilistNumeric && Number.isFinite(anilistNumeric) ? anilistNumeric : undefined,
		title,
		title_japanese: a.titles?.ja_jp ?? undefined,
		titles: [{ type: 'English', title }],
		synopsis: a.synopsis ?? a.description ?? '',
		// Kitsu scores are 0–100; the mapper expects MyAnimeList's 0–10.
		score: Number.isFinite(score) ? score / 10 : undefined,
		members: a.userCount,
		favorites: a.favoritesCount,
		popularity: a.popularityRank,
		status:
			a.status === 'finished'
				? 'Finished Airing'
				: a.status === 'current'
					? 'Currently Airing'
					: a.status === 'upcoming'
						? 'Not yet aired'
						: undefined,
		aired_from: a.startDate ?? undefined,
		episodes: a.episodeCount ?? undefined,
		duration: a.episodeLength ? `${a.episodeLength} min per ep` : undefined,
		type: a.subtype,
		genres: (a.genres ?? categories).map((name) => ({ name })),
		banner: a.coverImage?.original ?? a.coverImage?.large ?? a.bannerImage ?? null,
		ageRating: a.ageRating,
		rating: a.ageRating,
		trailer: a.youtubeVideoId ? { youtube_id: a.youtubeVideoId } : undefined,
		images: {
			jpg: {
				large_image_url: a.posterImage?.large ?? a.posterImage?.original,
				image_url: a.posterImage?.medium ?? a.posterImage?.small
			}
		}
	};
}

/** Fetch Kitsu rows, resolving the categories/mappings they include. */
async function fetchKitsuRows(url: string): Promise<MalAnime[] | null> {
	const raw = await fetchJson<{ data?: KitsuAnime[]; included?: KitsuResource[] }>(
		url,
		9000,
		KITSU_ACCEPT
	);
	const rows = raw?.data;
	if (!Array.isArray(rows) || !rows.length) return null;
	const included = raw?.included ?? [];
	return rows.map((row) => kitsuToMal(row, included));
}

/**
 * The record sources to try, in the order `PUBLIC_SOURCE_ORDER` asks for.
 *
 * Only the enabled letters are queried, so `PUBLIC_SOURCE_ORDER=j` means
 * Jikan is the only source that is ever asked.
 */
function recordSources(malId: number | null, kitsuId: number | null): Array<Attempt<MalAnime>> {
	const sources: Array<Attempt<MalAnime>> = [];
	for (const letter of SOURCE_ORDER) {
		if (letter === 'j' && malId) {
			sources.push({
				ns: 'jikan',
				run: async () => {
					const raw = await fetchJikanAnime(malId);
					if (raw) used('Jikan');
					return raw;
				}
			});
		}
		if (letter === 't' && malId) {
			sources.push({
				ns: 'tenrai',
				run: async () => {
					const raw = await fetchTenraiAnime(malId);
					if (raw) used('Tenrai');
					return raw;
				}
			});
		}
		if (letter === 'k' && kitsuId) {
			sources.push({
				ns: 'kitsu',
				run: async () => {
					const raw = await fetchKitsuAnime(kitsuId);
					if (raw) used('Kitsu');
					return raw;
				}
			});
		}
		if (letter === 'm' && malId) {
			sources.push({
				ns: 'mal',
				run: async () => {
					const raw = await fetchMalAnime(malId);
					if (raw) used('MyAnimeList');
					return raw;
				}
			});
		}
	}
	return sources;
}

/**
 * The list endpoints, per source and per row.
 *
 * Tenrai and Jikan both mirror MyAnimeList, so the same request would return
 * the same titles — each row therefore points at a *different* list on each
 * source, and every row ends up with its own content.
 */
/** The list endpoints for every source and every row. */
type ListPaths = Record<
	'jikan' | 'tenrai' | 'kitsu' | 'mal',
	Record<'trending' | 'seasonal' | 'airing' | 'updated', string>
>;

function listPaths(kind: 'trending' | 'seasonal' | 'airing' | 'updated'): ListPaths {
	const now = new Date();
	const year = now.getFullYear();
	// Kitsu spells autumn "fall".
	const season = seasonName(now.getMonth());
	return {
		jikan: {
			trending: 'top/anime?filter=bypopularity&limit={n}',
			seasonal: 'seasons/now?limit={n}',
			airing: 'top/airing?limit={n}',
			updated: 'top/anime?filter=byupdated&limit={n}'
		},
		tenrai: {
			trending: 'top/anime?sfw-strict&limit={n}',
			seasonal: 'seasons/now?sfw-strict&limit={n}',
			airing: 'top/airing?sfw-strict&limit={n}',
			updated: 'top/anime?filter=byupdated&sfw-strict&limit={n}'
		},
		kitsu: {
			trending: 'anime?sort=popularityRank&page[limit]={n}&include=categories,mappings',
			seasonal: `anime?filter[season]=${season}&filter[seasonYear]=${year}&sort=popularityRank&page[limit]={n}&include=categories,mappings`,
			airing: 'anime?filter[status]=current&sort=popularityRank&page[limit]={n}&include=categories,mappings',
			updated: 'anime?sort=-updatedAt&page[limit]={n}&include=categories,mappings'
		},
		mal: {
			// MyAnimeList has no `sort` on /anime (that is 400 Bad Request) and
			// no "recently updated" ranking, so these four rows use the real
			// endpoints it does have: rankings and the season browse list.
			trending: `anime/ranking?ranking_type=bypopularity&limit={n}&fields=${MAL_LIST_FIELDS}`,
			seasonal: `anime/season/${year}/${season}?sort=anime_num_list_users&limit={n}&fields=${MAL_LIST_FIELDS}`,
			airing: `anime/ranking?ranking_type=airing&limit={n}&fields=${MAL_LIST_FIELDS}`,
			updated: `anime/season/${year}/${season}?sort=anime_score&limit={n}&fields=${MAL_LIST_FIELDS}`
		}
	};
}

/** Fetch a list of records, following the configured order. */
async function fetchMalList(
	kind: 'trending' | 'seasonal' | 'airing' | 'updated',
	per: number,
	swapTrendingAiring = false
): Promise<MalAnime[]> {
	const paths = listPaths(kind);
	// MyAnimeList, Jikan and Tenrai expose both lists under the same names, but
	// the home page wants the airing titles in the Trending Now rail and the
	// all-time popularity titles in Top Airing. Kitsu keeps its natural rails.
	const swap =
		swapTrendingAiring && (kind === 'trending' || kind === 'airing');
	const mirrorKind = swap ? (kind === 'trending' ? 'airing' : 'trending') : kind;
	const sources: Array<Attempt<MalAnime[]>> = [];
	for (const letter of SOURCE_ORDER) {
		if (letter === 'j') {
			sources.push({
				ns: 'jikan',
				run: async () => {
					const raw = unwrap<MalAnime[]>(await fetchJson(`${JIKAN_URL}/${paths.jikan[mirrorKind].replace('{n}', String(per))}`));
					if (Array.isArray(raw) && raw.length) {
						used('Jikan');
						return raw;
					}
					return null;
				}
			});
		}
		if (letter === 't') {
			sources.push({
				ns: 'tenrai',
				run: async () => {
					const raw = unwrap<MalAnime[]>(await fetchJson(`${TENRAI_URL}/${paths.tenrai[mirrorKind].replace('{n}', String(per))}`));
					if (Array.isArray(raw) && raw.length) {
						used('Tenrai');
						return raw;
					}
					return null;
				}
			});
		}
		if (letter === 'k') {
			sources.push({
				ns: 'kitsu',
				run: async () => {
					const rows = await fetchKitsuRows(
						`${KITSU_URL}/${paths.kitsu[kind].replace('{n}', String(per))}`
					);
					if (!rows) return null;
					used('Kitsu');
					return rows;
				}
			});
		}
		if (letter === 'm') {
			sources.push({
				ns: 'mal',
				run: async () => {
					const raw = await fetchJson<unknown>(
						`${MAL_API_PATH}/${paths.mal[mirrorKind].replace('{n}', String(per))}`,
						9000,
						'application/json',
						malHeaders()
					);
					const rows = malNodes(unwrap<unknown>(raw));
					if (!rows.length) return null;
					used('MyAnimeList');
					return rows.map(malToMalAnime);
				}
			});
		}
	}
	const rows = await first(sources);
	return rows ?? [];
}

/* ---------------- id mapping ---------------- */

const ID_MAP_KEY = 'anikage:id-map';

type IdMap = Record<string, number>;

let idMap: IdMap = {};
try {
	if (typeof localStorage !== 'undefined') {
		idMap = JSON.parse(localStorage.getItem(ID_MAP_KEY) || '{}') as IdMap;
	}
} catch {
	idMap = {};
}

let saveIdMapTimer: ReturnType<typeof setTimeout> | null = null;
function saveIdMap(): void {
	if (typeof localStorage === 'undefined') return;
	if (saveIdMapTimer) return;
	saveIdMapTimer = setTimeout(() => {
		saveIdMapTimer = null;
		try {
			localStorage.setItem(ID_MAP_KEY, JSON.stringify(idMap));
		} catch {
			/* quota — the in-memory map still works for this session */
		}
	}, 1200);
}

function rememberId(key: string, value: number): void {
	idMap[key] = value;
	saveIdMap();
}

/**
 * Look a title up in Kitsu's mapping table.
 *
 * Kitsu is the only mirror that stores AniList ids, so it is the bridge of
 * last resort when ani.zip (and AniList itself) are unavailable.
 */
async function kitsuIdFromMapping(
	site: 'myanimelist/anime' | 'anilist/anime',
	externalId: number
): Promise<number | null> {
	const raw = await fetchJson<{ data?: KitsuResource[]; included?: KitsuResource[] }>(
		`${KITSU_URL}/mappings?filter[externalSite]=${site}&filter[externalId]=${externalId}&include=item`,
		6500,
		KITSU_ACCEPT
	);
	const id = Number(raw?.data?.[0]?.relationships?.item?.data?.id);
	return Number.isFinite(id) && id > 0 ? id : null;
}

const ID_BATCH_SIZE = 50;
const ID_FALLBACK_CONCURRENCY = 4;

interface AniListIdRow {
	id: number;
	idMal: number | null;
}

/**
 * Resolve a whole page of ids in one AniList request.
 *
 * Syncing a MAL list used to translate every entry separately, which quickly
 * exhausted AniList's request quota. `idMal_in`/`id_in` accept up to 50 ids at
 * a time, so a full list now costs a handful of requests instead of one per
 * title.
 */
async function anilistIdRows(ids: number[], byMal: boolean): Promise<AniListIdRow[] | null> {
	const field = byMal ? 'idMal_in' : 'id_in';
	const data = await anilistQuery<{ Page?: { media?: AniListIdRow[] } }>(
		`query ($ids: [Int]) { Page(perPage: 50) { media(${field}: $ids, type: ANIME) { id idMal } } }`,
		{ ids }
	);
	return data?.Page?.media ?? null;
}

/** Resolve a small batch without opening thousands of parallel sockets. */
async function mapIdsWithConcurrency(
	ids: number[],
	resolve: (id: number) => Promise<number | null>
): Promise<Map<number, number>> {
	const out = new Map<number, number>();
	let cursor = 0;
	async function worker(): Promise<void> {
		while (cursor < ids.length) {
			const id = ids[cursor++];
			const mapped = await resolve(id).catch(() => null);
			if (mapped) out.set(id, mapped);
		}
	}
	const workers = Math.min(ID_FALLBACK_CONCURRENCY, ids.length);
	await Promise.all(Array.from({ length: workers }, () => worker()));
	return out;
}

/**
 * Translate many ids at once, using the in-memory cache first and ani.zip as
 * the fallback when AniList is unavailable or rate-limiting.
 */
async function batchMapIds(ids: number[], from: 'mal' | 'anilist'): Promise<Map<number, number>> {
	const fromMal = from === 'mal';
	const result = new Map<number, number>();
	const pending: number[] = [];
	const prefix = fromMal ? 'mal:' : 'al:';

	for (const id of new Set(ids)) {
		if (!Number.isFinite(id) || id <= 0) continue;
		const cached = idMap[`${prefix}${id}`];
		if (cached) result.set(id, cached);
		else pending.push(id);
	}

	for (let offset = 0; offset < pending.length; offset += ID_BATCH_SIZE) {
		const chunk = pending.slice(offset, offset + ID_BATCH_SIZE);
		const rows = await anilistIdRows(chunk, fromMal);

		if (rows) {
			for (const row of rows) {
				const sourceId = fromMal ? row.idMal : row.id;
				const targetId = fromMal ? row.id : row.idMal;
				if (!sourceId || !targetId) continue;
				result.set(sourceId, targetId);
				rememberId(`${fromMal ? 'mal' : 'al'}:${sourceId}`, targetId);
				rememberId(`${fromMal ? 'al' : 'mal'}:${targetId}`, sourceId);
			}
			// An empty page means AniList answered and has no mapping for those
			// titles; there is nothing left for ani.zip to improve.
			continue;
		}

		// AniList is down or throttled. ani.zip still knows the mapping, so use
		// it for this chunk rather than dropping the entries.
		const missing = chunk.filter((id) => !result.has(id));
		const mapped = await mapIdsWithConcurrency(missing, async (id) => {
			if (fromMal) {
				const zip = await getAniZipByMal(id).catch(() => null);
				return zip?.mappings?.anilist_id ?? null;
			}
			const zip = await getAniZip(id).catch(() => null);
			return zip?.mappings?.mal_id ?? null;
		});
		for (const [sourceId, targetId] of mapped) {
			result.set(sourceId, targetId);
			rememberId(`${fromMal ? 'mal' : 'al'}:${sourceId}`, targetId);
			rememberId(`${fromMal ? 'al' : 'mal'}:${targetId}`, sourceId);
		}
	}

	return result;
}

/** Batch version of `anilistIdFromMal`, for list syncs. */
export function anilistIdsForMal(malIds: number[]): Promise<Map<number, number>> {
	return batchMapIds(malIds, 'mal');
}

/** Batch version of `malIdFromAnilist`, for list syncs. */
export function malIdsForAnilist(anilistIds: number[]): Promise<Map<number, number>> {
	return batchMapIds(anilistIds, 'anilist');
}

/** The MyAnimeList id behind an AniList id (ani.zip → AniList → Kitsu). */
export async function malIdFor(anilistId: number): Promise<number | null> {
	const cached = idMap[`al:${anilistId}`];
	if (cached) return cached;

	const zip = await getAniZip(anilistId).catch(() => null);
	let malId = zip?.mappings?.mal_id ?? null;
	// The id bridges follow the same order as the metadata sources: AniList
	// only translates the id when it is actually ahead of Kitsu (or Kitsu is
	// disabled), never merely because both are enabled.
	for (const letter of SOURCE_ORDER) {
		if (malId) break;
		if (letter === 'a') malId = await malIdFromAnilist(anilistId);
		if (letter === 'k') {
			const kitsuId =
				zip?.mappings?.kitsu_id ?? (await kitsuIdFromMapping('anilist/anime', anilistId));
			if (kitsuId) {
				const record = await fetchKitsuAnime(kitsuId);
				malId = record?.mal_id ?? null;
			}
		}
	}
	if (malId) {
		rememberId(`al:${anilistId}`, malId);
		rememberId(`mal:${malId}`, anilistId);
	}
	return malId;
}

/** The Kitsu id behind an AniList id (ani.zip → Kitsu's mapping table). */
export async function kitsuIdFor(anilistId: number): Promise<number | null> {
	const cached = idMap[`al-kitsu:${anilistId}`];
	if (cached) return cached;

	const zip = await getAniZip(anilistId).catch(() => null);
	let kitsuId = zip?.mappings?.kitsu_id ?? null;
	if (!kitsuId) kitsuId = await kitsuIdFromMapping('anilist/anime', anilistId);
	if (kitsuId) {
		rememberId(`al-kitsu:${anilistId}`, kitsuId);
		rememberId(`kitsu:${kitsuId}`, anilistId);
	}
	return kitsuId;
}

/** The AniList id behind a MyAnimeList id (ani.zip → AniList → Kitsu). */
export async function anilistIdFor(malId: number): Promise<number | null> {
	const cached = idMap[`mal:${malId}`];
	if (cached) return cached;

	const zip = await getAniZipByMal(malId).catch(() => null);
	let anilistId = zip?.mappings?.anilist_id ?? null;
	for (const letter of SOURCE_ORDER) {
		if (anilistId) break;
		if (letter === 'a') anilistId = await anilistIdFromMal(malId);
		if (letter === 'k') {
			const kitsuId =
				zip?.mappings?.kitsu_id ?? (await kitsuIdFromMapping('myanimelist/anime', malId));
			if (kitsuId) {
				const record = await fetchKitsuAnime(kitsuId);
				anilistId = record?.anilist_id ?? null;
			}
		}
	}
	if (anilistId) {
		rememberId(`mal:${malId}`, anilistId);
		rememberId(`al:${anilistId}`, malId);
	}
	return anilistId;
}

/** The AniList id behind a Kitsu id (ani.zip → Kitsu's own mappings). */
export async function anilistIdForKitsu(kitsuId: number): Promise<number | null> {
	const cached = idMap[`kitsu:${kitsuId}`];
	if (cached) return cached;

	const zip = await getAniZipByKitsu(kitsuId).catch(() => null);
	let anilistId = zip?.mappings?.anilist_id ?? null;
	if (!anilistId) {
		const record = await fetchKitsuAnime(kitsuId);
		anilistId = record?.anilist_id ?? null;
	}
	if (anilistId) {
		rememberId(`kitsu:${kitsuId}`, anilistId);
		const malId = zip?.mappings?.mal_id ?? null;
		if (malId) rememberId(`al:${anilistId}`, malId);
	}
	return anilistId;
}

/** Resolve any fallback record back to its AniList id. */
async function resolveAniListId(entry: MalAnime): Promise<number | null> {
	// Kitsu hands the AniList id over in its mapping include.
	if (entry.anilist_id) {
		if (entry.mal_id) rememberId(`al:${entry.anilist_id}`, entry.mal_id);
		return entry.anilist_id;
	}
	if (entry.kitsu_id) return anilistIdForKitsu(entry.kitsu_id);
	if (entry.mal_id) return anilistIdFor(entry.mal_id);
	return null;
}

/** Every id a fallback lookup can use, resolved with a single ani.zip call. */
interface RecordRefs {
	zip: Awaited<ReturnType<typeof getAniZip>> | null;
	malId: number | null;
	kitsuId: number | null;
}

async function refsFor(anilistId: number): Promise<RecordRefs> {
	const zip = await getAniZip(anilistId).catch(() => null);
	let malId: number | null = zip?.mappings?.mal_id ?? idMap[`al:${anilistId}`] ?? null;
	let kitsuId: number | null = zip?.mappings?.kitsu_id ?? idMap[`al-kitsu:${anilistId}`] ?? null;

	// Remaining ids follow the configured order too: AniList translates only
	// when it comes before Kitsu, and an earlier answer is never overwritten.
	for (const letter of SOURCE_ORDER) {
		if (malId && kitsuId) break;
		if (letter === 'a' && !malId) malId = await malIdFromAnilist(anilistId);
		if (letter === 'k') {
			if (!kitsuId) kitsuId = await kitsuIdFromMapping('anilist/anime', anilistId);
			// A Kitsu record can complete the pair when ani.zip had nothing.
			if (kitsuId && !malId) {
				const record = await fetchKitsuAnime(kitsuId);
				malId = record?.mal_id ?? null;
			}
		}
	}

	if (malId) rememberId(`al:${anilistId}`, malId);
	if (kitsuId) rememberId(`al-kitsu:${anilistId}`, kitsuId);
	if (malId && kitsuId) rememberId(`kitsu:${kitsuId}`, anilistId);
	return { zip, malId, kitsuId };
}

/* ---------------- record mapping ---------------- */

const SEASON_BY_MONTH = ['WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'AUTUMN', 'AUTUMN', 'AUTUMN', 'WINTER'];

function englishTitle(raw: MalAnime): string | null {
	const hit = (raw.titles ?? []).find((t) => (t.type ?? '').toLowerCase() === 'english');
	return hit?.title?.trim() || null;
}

function statusLabel(raw: MalAnime): string {
	switch ((raw.status ?? '').toLowerCase()) {
		case 'finished airing':
		case 'completed':
			return 'FINISHED';
		case 'currently airing':
		case 'releasing':
			return 'RELEASING';
		case 'not yet aired':
		case 'announced':
			return 'NOT_YET_RELEASED';
		case 'hiatus':
			return 'HIATUS';
		case 'cancelled':
			return 'CANCELLED';
		default:
			return 'UNKNOWN';
	}
}

function parseDuration(raw: MalAnime): number | null {
	const m = /(\d+)\s*min/i.exec(raw.duration ?? '');
	return m ? Number(m[1]) : null;
}

function parseStart(raw: MalAnime): { startDate: string | null; season: string | null; seasonYear: number | null } {
	const iso = (raw.aired_from ?? '').slice(0, 10);
	const y = raw.year ?? (iso ? Number(iso.slice(0, 4)) : NaN);
	const m = iso ? Number(iso.slice(5, 7)) : NaN;
	const startDate = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
	return {
		startDate,
		season: Number.isFinite(m) && m >= 1 && m <= 12 ? SEASON_BY_MONTH[m - 1] : (raw.season ? raw.season.toUpperCase() : null),
		seasonYear: Number.isFinite(y) ? y : null
	};
}

/** Build an app-shaped record from a MyAnimeList-shaped one. */
function toAnime(
	raw: MalAnime,
	anilistId: number,
	art: {
		cover?: string | null;
		banner?: string | null;
		malId?: number | null;
		episodes?: number | null;
	} = {}
): Anime {
	const english = englishTitle(raw);
	const romaji = clean(raw.title);
	const native = clean(raw.title_japanese) || null;
	const images = raw.images?.jpg ?? raw.images?.webp ?? {};
	const cover = images.large_image_url ?? images.image_url ?? art.cover ?? '';
	const genres = [
		...(raw.genres ?? []),
		...(raw.themes ?? []),
		...(raw.demographics ?? [])
	]
		.map((g) => g.name?.trim())
		.filter((n): n is string => !!n);
	const explicit = (raw.explicit_genres ?? []).map((g) => g.name?.trim() ?? '');
	const { startDate, season, seasonYear } = parseStart(raw);
	const next = raw.next_airing_episode;
	const adult =
		explicit.some((g) => /hentai|erotica|ecchi/i.test(g)) ||
		[...(raw.genres ?? []), ...(raw.themes ?? [])].some((g) => /hentai|erotica/i.test(g.name ?? '')) ||
		/^rx|^r\+|hentai|porn|xxx/i.test((raw.ageRating ?? raw.rating ?? '').trim());

	const malId = raw.mal_id ?? art.malId ?? null;
	if (malId) {
		rememberId(`al:${anilistId}`, malId);
		rememberId(`mal:${malId}`, anilistId);
	}
	if (raw.kitsu_id) rememberId(`kitsu:${raw.kitsu_id}`, anilistId);

	return {
		id: anilistId,
		malId,
		title: { romaji, english, native },
		display: english || romaji,
		banner: raw.banner ?? art.banner ?? null,
		cover,
		color: null,
		description: clean(raw.synopsis),
		genres,
		tags: explicit,
		// MyAnimeList scores are 0–10, AniList uses 0–100.
		score: typeof raw.score === 'number' ? Math.round(raw.score * 10) : null,
		popularity: raw.members ?? 0,
		favorites: raw.favorites ?? 0,
		status: statusLabel(raw),
		format: raw.type ?? null,
		season,
		seasonYear,
		episodes: raw.episodes ?? art.episodes ?? null,
		duration: parseDuration(raw),
		studio: raw.studios?.[0]?.name ?? raw.producers?.[0]?.name ?? null,
		startDate,
		nextAiring: next?.episode ? { episode: next.episode, airingAt: next.airing_at ?? 0 } : null,
		isAdult: adult
	};
}

/**
 * The last-resort record: built from ani.zip alone (titles + artwork).
 *
 * No synopsis or score, but the title, poster, banner and episode list all
 * survive — enough for the site to keep working.
 */
function animeFromZip(zip: Awaited<ReturnType<typeof getAniZip>>, anilistId: number): Anime {
	const titles = zip.titles ?? {};
	const english = titles.en?.trim() || null;
	const romaji = titles['x-jat']?.trim() || titles.ja?.trim() || english || 'Anime';
	const native = titles.ja?.trim() || null;
	const year = /(\d{4})/.exec(titles.en ?? romaji)?.[1] ?? null;

	return {
		id: anilistId,
		malId: zip.mappings?.mal_id ?? null,
		title: { romaji, english, native },
		display: english || romaji,
		banner: zip.bannerImage,
		cover: zip.coverImage ?? '',
		color: null,
		description: '',
		genres: [],
		tags: [],
		score: null,
		popularity: 0,
		favorites: 0,
		status: 'UNKNOWN',
		format: zip.mappings?.type ?? null,
		season: null,
		seasonYear: year ? Number(year) : null,
		episodes: zip.episodeCount || null,
		duration: null,
		studio: null,
		startDate: null,
		nextAiring: null,
		isAdult: false
	};
}

/** The ani.zip-only record for a title (no mirror involved). */
export async function zipAnime(anilistId: number): Promise<Anime | null> {
	const zip = await getAniZip(anilistId).catch(() => null);
	return zip ? animeFromZip(zip, anilistId) : null;
}

/**
 * Titles to ask ani.zip for when every live source is unreachable.
 *
 * These are ids only — the artwork, titles and episode lists still come from
 * the live API. The list just says *which* titles to ask for, so the home
 * rails are never completely empty during an outage.
 */
const RESILIENT_IDS = [21, 20, 1, 1735, 1535, 5114, 9253, 11061, 30276, 154587, 10165, 113415, 16498, 38000];

/** Where each rail starts inside RESILIENT_IDS, so the rails never look identical. */
const RESILIENT_OFFSET: Record<'trending' | 'seasonal' | 'airing' | 'updated', number> = {
	trending: 0,
	seasonal: 4,
	airing: 8,
	updated: 11
};

/** Remember the last list each rail received, so an outage still shows *its* titles. */
const LAST_LIST_KEY = 'anikage:last-list';

function readLastList(kind: string): Anime[] {
	try {
		const raw = localStorage.getItem(`${LAST_LIST_KEY}:${kind}`);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as Anime[]) : [];
	} catch {
		return [];
	}
}

function saveLastList(kind: string, list: Anime[]): void {
	if (!list.length) return;
	try {
		localStorage.setItem(`${LAST_LIST_KEY}:${kind}`, JSON.stringify(list.slice(0, 20)));
	} catch {
		/* storage full or disabled — the next load simply refetches */
	}
}

/* ---------------- assembled-view cache ---------------- */

/** How long an assembled view stays fresh before its sources are asked again. */
const META_DETAIL_TTL = 3 * 60 * 60 * 1000;
const META_LIST_TTL = 30 * 60 * 1000;
const META_SCHEDULE_TTL = 10 * 60 * 1000;
const META_EPISODES_TTL = 6 * 60 * 60 * 1000;

/**
 * Every assembled result lives under one key in the `meta` namespace.
 *
 * That is the "cache once" rule: one entry per request, no matter how many
 * sources were consulted. The entry is also the outage copy — `cachedStale`
 * falls back to it when all live sources fail.
 */
function meta<T>(key: string, ttl: number, load: () => Promise<T>, usable: (v: T) => boolean) {
	return cachedStale('meta', key, ttl, load, usable);
}

/**
 * Key for an assembled detail record. Versioned so an artwork fix (or any
 * record-shape change) is not hidden behind a copy cached by an older build.
 */
function animeMetaKey(id: number): string {
	return `anime:v2:${id}`;
}

/* ---------------- local title index ---------------- */

/**
 * A small offline catalogue of titles the user has already seen.
 *
 * Search, rails and detail lookups can fall back to it when every live API is
 * down, so the site stays usable instead of going blank.
 */
const INDEX_KEY = 'anikage:index-v1';
const INDEX_MAX = 240;

interface IndexRow {
	a: Anime;
	t: number;
}

let index: Record<string, IndexRow> = {};
try {
	if (typeof localStorage !== 'undefined') {
		const raw = localStorage.getItem(INDEX_KEY);
		const parsed = raw ? (JSON.parse(raw) as Record<string, IndexRow>) : {};
		if (parsed && typeof parsed === 'object') index = parsed;
	}
} catch {
	index = {};
}

let indexSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveIndex(): void {
	if (typeof localStorage === 'undefined' || indexSaveTimer) return;
	indexSaveTimer = setTimeout(() => {
		indexSaveTimer = null;
		try {
			localStorage.setItem(INDEX_KEY, JSON.stringify(index));
		} catch {
			/* quota — the in-memory index still serves this session */
		}
	}, 1500);
}

/** Detail sections are re-fetched on demand; the index keeps only card data. */
function slim(a: Anime): Anime {
	return {
		...a,
		relations: undefined,
		characters: undefined,
		recommendations: undefined
	};
}

/** Remember a title for offline search and detail pages. */
export function rememberAnime(anime: Anime | null | undefined): void {
	if (!anime?.id) return;
	rememberIndex(anime);
	// Also keep the assembled detail copy, so an outage can still open it.
	cacheSet('meta', animeMetaKey(anime.id), anime, META_DETAIL_TTL);
}

/**
 * The offline index entry only.
 *
 * Rails and search results arrive by the dozen; keeping every card in the
 * `meta` cache would evict the assembled lists and detail patches that the
 * outage actually needs. The index already remembers the card, so that is
 * enough for a list entry.
 */
function rememberIndex(anime: Anime): void {
	index[String(anime.id)] = { a: slim(anime), t: Date.now() };
	const rows = Object.values(index).sort((x, y) => y.t - x.t);
	if (rows.length > INDEX_MAX) {
		index = Object.fromEntries(rows.slice(0, INDEX_MAX).map((row) => [String(row.a.id), row]));
	}
	saveIndex();
}

function rememberRecords(list: Anime[]): void {
	for (const anime of list) if (anime?.id) rememberIndex(anime);
}

function indexedAnime(id: number): Anime | null {
	return index[String(id)]?.a ?? null;
}

function indexRows(): Anime[] {
	return Object.values(index)
		.sort((a, b) => b.t - a.t)
		.map((row) => row.a);
}

/** Substring search over the local index — never touches the network. */
function searchIndex(query: string, limit: number): Anime[] {
	const tokens = query
		.toLowerCase()
		.split(/\s+/)
		.map((s) => s.trim())
		.filter(Boolean);
	if (!tokens.length) return [];
	return indexRows()
		.map((a) => ({
			a,
			hay: [
				a.title.romaji,
				a.title.english ?? '',
				a.title.native ?? '',
				a.display,
				a.studio ?? '',
				...a.genres
			]
				.join(' ')
				.toLowerCase()
		}))
		.filter((row) => tokens.every((token) => row.hay.includes(token)))
		.sort((x, y) => (y.a.popularity || 0) - (x.a.popularity || 0))
		.slice(0, limit)
		.map((row) => row.a);
}

/** The best titles the local index knows, for rails during an outage. */
function listFromIndex(filters: FallbackFilters, limit: number): Anime[] {
	return applyFilters(indexRows(), filters)
		.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
		.slice(0, limit);
}

/* ---------------- public API ---------------- */

/**
 * One title, looked up by its AniList id.
 *
 * ani.zip is asked for the id bridge and artwork, then the configured
 * metadata sources are walked **one by one** until one answers. The assembled
 * record is cached once; if every source is down, the last good copy (or the
 * offline index) is returned.
 */
export async function fallbackAnime(anilistId: number): Promise<Anime | null> {
	return meta(
		animeMetaKey(anilistId),
		META_DETAIL_TTL,
		async () => {
			const refs = await refsFor(anilistId);
			const record = await first(recordSources(refs.malId, refs.kitsuId));
			if (record) {
				const anime = toAnime(record, anilistId, {
					// ani.zip artwork is the last resort - the live record's own
					// poster/banner always wins (see `toAnime`). MAL has no banner,
					// so its 1920x1080 fanart is what keeps the hero sharp.
					cover: refs.zip?.coverImage ?? null,
					banner: refs.zip?.bannerImage ?? null,
					malId: refs.zip?.mappings?.mal_id ?? null,
					episodes: refs.zip?.episodeCount ?? null
				});
				rememberAnime(anime);
				return anime;
			}
			if (refs.zip) {
				used('ani.zip');
				const anime = animeFromZip(refs.zip, anilistId);
				rememberAnime(anime);
				return anime;
			}
			return indexedAnime(anilistId);
		},
		(value) => !!value
	);
}

/** Extra knobs for the home rails; the default mirrors keep their natural order. */
export interface FallbackListOptions {
	/**
	 * MyAnimeList, Jikan and Tenrai: serve the airing list as `trending` and
	 * the popularity list as `airing`. Used by the home page only.
	 */
	swapTrendingAiring?: boolean;
}

/**
 * A page of titles, from the fallback sources.
 *
 * The lists are keyed by MAL id, so each entry is translated to its AniList id
 * through ani.zip before it is handed back - the app keeps using AniList ids.
 * The assembled rail is cached once; an outage falls back to the same rail's
 * last good copy, then to the local index.
 */
export async function fallbackList(
	kind: 'trending' | 'seasonal' | 'airing' | 'updated',
	limit = 18,
	filters: FallbackFilters = {},
	options: FallbackListOptions = {}
): Promise<Anime[]> {
	// The mirrors cap a page at 20 (Kitsu) / 25 (Jikan).
	const per = Math.min(Math.max(limit, 1), 20);
	// The swapped home rail is a different list from the natural one, so the
	// cache key and the outage copy must not share their slots.
	const swap =
		options.swapTrendingAiring === true && (kind === 'trending' || kind === 'airing');
	const variant = swap ? 'swap' : 'std';
	const key = `list:v2:${kind}:${variant}:${per}:${filterKey(filters)}`;
	const rail = swap ? `${kind}:swap` : kind;

	return meta(
		key,
		META_LIST_TTL,
		async () => {
			const raw = await fetchMalList(kind, per, swap);
			if (raw.length) {
				const resolved = await Promise.all(
					raw.slice(0, per).map(async (entry) => {
						const anilistId = await resolveAniListId(entry);
						if (!anilistId) return null;
						return toAnime(entry, anilistId);
					})
				);
				const list = resolved.filter((a): a is Anime => !!a);
				const filtered = applyFilters(list, filters);
				if (filtered.length) {
					rememberRecords(filtered);
					saveLastList(rail, filtered);
					return filtered;
				}
			}

			// Every live source failed: keep this exact rail intact.
			const cached = readLastList(rail);
			if (cached.length) {
				const hit = applyFilters(cached, filters);
				if (hit.length) return hit;
			}
			const local = listFromIndex(filters, per);
			if (local.length) return local;

			// Last resort: a handful of well-known titles, rotated per rail.
			const offset = RESILIENT_OFFSET[kind];
			const rotated = [...RESILIENT_IDS.slice(offset), ...RESILIENT_IDS.slice(0, offset)];
			const picked = rotated.slice(0, per);
			const rows = await Promise.all(picked.map((id) => zipAnime(id).catch(() => null)));
			const list = rows.filter((a): a is Anime => !!a);
			rememberRecords(list);
			return applyFilters(list, filters);
		},
		(value) => value.length > 0
	);
}

/** Filters the mirrors cannot express — applied to the results locally. */
export interface FallbackFilters {
	genre?: string[];
	/** AniList tags are not separate fields on the mirrors; match genres too. */
	tags?: string[];
	format?: string[];
	status?: string[];
	season?: string[];
	years?: number[];
	includeAdult?: boolean;
	/** AniList sort key, e.g. `POPULARITY_DESC`. */
	sort?: string;
}

/** A stable key for the filter combination, so each view caches separately. */
function filterKey(f: FallbackFilters): string {
	return [
		f.genre?.join(','),
		f.tags?.join(','),
		f.format?.join(','),
		f.status?.join(','),
		f.season?.join(','),
		f.years?.join(','),
		f.includeAdult ? '1' : '0',
		f.sort ?? ''
	]
		.map((part) => part ?? '')
		.join('|');
}

/** Approximate the AniList sort locally for mirrors that ignore it. */
function sortList(list: Anime[], sort?: string): Anime[] {
	if (!sort) return list;
	const rows = [...list];
	switch (sort.toUpperCase()) {
		case 'SCORE_DESC':
			return rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
		case 'POPULARITY_DESC':
		case 'TRENDING_DESC':
			return rows.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
		case 'FAVOURITES_DESC':
			return rows.sort((a, b) => (b.favorites ?? 0) - (a.favorites ?? 0));
		case 'START_DATE_DESC':
			return rows.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
		case 'START_DATE':
			return rows.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
		case 'TITLE_ROMAJI':
		case 'TITLE_ROMAJI_DESC':
			return rows.sort((a, b) => a.title.romaji.localeCompare(b.title.romaji));
		case 'EPISODES_DESC':
			return rows.sort((a, b) => (b.episodes ?? 0) - (a.episodes ?? 0));
		default:
			return rows;
	}
}

/** MyAnimeList spells formats "Movie"/"Special"; AniList uses "MOVIE"/"SPECIAL". */
const FORMAT_ALIASES: Record<string, string> = {
	tv: 'TV',
	movie: 'MOVIE',
	ova: 'OVA',
	ona: 'ONA',
	special: 'SPECIAL',
	music: 'MUSIC',
	tv_short: 'TV_SHORT'
};

function normalizeFormat(value: string | null | undefined): string {
	const trimmed = (value ?? '').trim();
	return FORMAT_ALIASES[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
}

/** Kitsu calls "Sci-Fi" *Science Fiction*, and a few tags differ by a word. */
const GENRE_ALIASES: Record<string, string> = {
	'science fiction': 'sci-fi',
	'sci fi': 'sci-fi',
	'sci-fi': 'sci-fi',
	'slice of life': 'slice of life',
	'martial arts': 'martial arts'
};

function normalizeGenre(value: string | null | undefined): string {
	const trimmed = (value ?? '').trim().toLowerCase();
	return GENRE_ALIASES[trimmed] ?? trimmed;
}

/** Keep only the titles that match every active filter. */
function applyFilters(list: Anime[], f: FallbackFilters): Anime[] {
	const filtered = list.filter((a) => {
		if (f.genre?.length) {
			const genres = a.genres.map(normalizeGenre);
			if (!f.genre.some((g) => genres.includes(normalizeGenre(g)))) return false;
		}
		if (f.tags?.length) {
			const tags = [...a.genres, ...a.tags].map(normalizeGenre);
			// A tag matches if any genre/tag of the title matches it.
			if (!f.tags.some((tag) => tags.includes(normalizeGenre(tag)))) return false;
		}
		if (f.format?.length) {
			const format = normalizeFormat(a.format);
			if (!f.format.some((x) => normalizeFormat(x) === format)) return false;
		}
		if (f.status?.length) {
			if (!f.status.some((x) => (a.status ?? '').toUpperCase() === x.toUpperCase())) return false;
		}
		if (f.season?.length) {
			if (!f.season.some((x) => (a.season ?? '').toUpperCase() === x.toUpperCase())) return false;
		}
		if (f.years?.length) {
			const year = a.seasonYear;
			if (!year || !f.years.includes(year)) return false;
		}
		if (!f.includeAdult && a.isAdult) return false;
		return true;
	});
	return sortList(filtered, f.sort);
}

/* ---------------- search ---------------- */

/** A search, from the fallback sources. */
export async function fallbackSearch(
	query: string,
	limit = 20,
	filters: FallbackFilters = {}
): Promise<Anime[]> {
	const text = query.trim();
	// The mirrors cap a page at 20 (Kitsu) / 25 (Jikan) — asking for more is
	// answered with a 400 and no results.
	const per = Math.min(Math.max(limit, 1), 20);
	if (!text) return listFromIndex(filters, per);

	const q = encodeURIComponent(text);
	const key = `search:${text.toLowerCase()}:${per}:${filterKey(filters)}`;

	return meta(
		key,
		META_LIST_TTL,
		async () => {
			const sources: Array<Attempt<MalAnime[]>> = [];
			for (const letter of SOURCE_ORDER) {
				if (letter === 'j') {
					sources.push({
						ns: 'jikan',
						run: async () => {
							const r = unwrap<MalAnime[]>(
								await fetchJson(`${JIKAN_URL}/anime?q=${q}&limit=${per}`)
							);
							if (Array.isArray(r) && r.length) {
								used('Jikan');
								return r;
							}
							return null;
						}
					});
				}
				if (letter === 't') {
					sources.push({
						ns: 'tenrai',
						run: async () => {
							const r = unwrap<MalAnime[]>(
								await fetchJson(`${TENRAI_URL}/anime?q=${q}&limit=${per}&sfw-strict`)
							);
							if (Array.isArray(r) && r.length) {
								used('Tenrai');
								return r;
							}
							return null;
						}
					});
				}
				if (letter === 'k') {
					sources.push({
						ns: 'kitsu',
						run: async () => {
							const rows = await fetchKitsuRows(
								`${KITSU_URL}/anime?filter[text]=${q}&page[limit]=${per}&include=categories,mappings`
							);
							if (!rows) return null;
							used('Kitsu');
							return rows;
						}
					});
				}
				if (letter === 'm') {
					sources.push({
						ns: 'mal',
						run: async () => {
							const raw = await fetchJson<unknown>(
								`${MAL_API_PATH}/anime?q=${q}&limit=${per}&sort=score&fields=${MAL_LIST_FIELDS}`,
								9000,
								'application/json',
								malHeaders()
							);
							const rows = malNodes(unwrap<unknown>(raw));
							if (!rows.length) return null;
							used('MyAnimeList');
							return rows.map(malToMalAnime);
						}
					});
				}
			}

			const rows = (await first(sources)) ?? [];
			if (rows.length) {
				const resolved = await Promise.all(
					rows.slice(0, per).map(async (entry) => {
						const anilistId = await resolveAniListId(entry);
						if (!anilistId) return null;
						return toAnime(entry, anilistId);
					})
				);
				const list = applyFilters(
					resolved.filter((a): a is Anime => !!a),
					filters
				);
				if (list.length) {
					rememberRecords(list);
					return list;
				}
			}

			// No live source matched — search the titles already seen locally.
			return applyFilters(searchIndex(text, per), filters).slice(0, per);
		},
		(value) => value.length > 0
	);
}

/** This week's airing schedule, from the fallback sources. */
export async function fallbackSchedule(): Promise<ScheduleEntry[]> {
	const now = new Date();
	const key = `schedule:${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

	return meta(
		key,
		META_SCHEDULE_TTL,
		async () => {
			const raw = await fetchMalSchedule();
			if (!raw.length) return [];

			const rows: ScheduleEntry[] = [];
			// Resolving each title to its AniList id (through ani.zip) is the
			// only network work left here; a handful at a time keeps the
			// browser's connection pool free and the page responsive.
			for (let i = 0; i < raw.length; i += 8) {
				const chunk = await Promise.all(
					raw.slice(i, i + 8).map(async (entry): Promise<ScheduleEntry | null> => {
						const malId = entry.mal_id ?? entry.anime_id;
						if (!malId) return null;
						const airingAt = scheduleTime(entry);
						if (airingAt == null) return null;
						const anilistId = await anilistIdFor(malId);
						if (!anilistId) return null;
						// MyAnimeList rows arrive with their record attached; the
						// mirrors describe a title in list form only, so they need
						// one lookup. `first` tries them one at a time.
						const record = entry.record ?? (await first(recordSources(malId, null)));
						if (!record) return null;
						const anime = toAnime(record, anilistId);
						rememberAnime(anime);
						return {
							anime,
							episode: entry.episode ?? entry.number ?? 1,
							airingAt
						} satisfies ScheduleEntry;
					})
				);
				for (const row of chunk) if (row) rows.push(row);
			}
			return rows.sort((a, b) => a.airingAt - b.airingAt);
		},
		(value) => value.length > 0
	);
}

/** Ask the configured mirrors for this week's schedule rows. */
async function fetchMalSchedule(): Promise<MalSchedule[]> {
	const sources: Array<Attempt<MalSchedule[]>> = [];
	for (const letter of SOURCE_ORDER) {
		if (letter === 't') {
			sources.push({
				ns: 'tenrai',
				run: async () => {
					const raw = unwrap<MalSchedule[]>(
						await fetchJson(`${TENRAI_URL}/schedules?sfw-strict&limit=100`)
					);
					return Array.isArray(raw) && raw.length ? raw : null;
				}
			});
		}
		if (letter === 'j') {
			sources.push({
				ns: 'jikan',
				run: async () => {
					// Jikan lists a day at a time; fetch the week and drop repeats.
					const pages = await Promise.all(
						JIKAN_WEEKDAYS.map(async (day) => {
							const raw = unwrap<MalSchedule[]>(
								await fetchJson(`${JIKAN_URL}/schedules?filter=${day}&limit=25&sfw`)
							);
							return Array.isArray(raw) ? raw : [];
						})
					);
					const seen = new Set<number>();
					const unique = pages.flat().filter((row) => {
						const id = row.mal_id;
						if (!id || seen.has(id)) return false;
						seen.add(id);
						return true;
					});
					return unique.length ? unique : null;
				}
			});
		}
		if (letter === 'm') {
			sources.push({
				ns: 'mal',
				run: async () => {
					// MyAnimeList has no schedule endpoint. Its season list carries
					// each title's weekly broadcast slot (`broadcast.day_of_the_week`
					// and `start_time`, in JST), which `scheduleTime` turns into the
					// dates the schedule page groups by day. The same response holds
					// the record itself, so no per-title follow-up is needed.
					const now = new Date();
					const season = seasonName(now.getMonth());
					const raw = await fetchJson<unknown>(
						`${MAL_API_PATH}/anime/season/${now.getFullYear()}/${season}?sort=anime_num_list_users&limit=100&fields=${MAL_LIST_FIELDS}`,
						9000,
						'application/json',
						malHeaders()
					);
					const rows = malNodes(unwrap<unknown>(raw));
					const weekly = rows
						.map((row): MalSchedule | null => {
							const malId = row.mal_id ?? row.id;
							const day = row.broadcast?.day_of_the_week;
							const time = row.broadcast?.start_time;
							if (!malId || !day || !time) return null;
							return {
								mal_id: malId,
								episode: 1,
								broadcast: { day, time },
								record: malToMalAnime(row)
							};
						})
						.filter((row): row is MalSchedule => !!row);
					return weekly.length ? weekly : null;
				}
			});
		}
	}
	return (await first(sources)) ?? [];
}

/* ---------------- episodes ---------------- */

interface MirrorEpisodeRow {
	title?: string | null;
	synopsis?: string | null;
	aired?: { from?: string } | string | null;
	images?: { jpg?: { image_url?: string } } | null;
}

/** Fill a complete 1..total list, overlaying whatever the source knew. */
function fillEpisodes(rows: EpisodeAsset[], total: number | null): EpisodeAsset[] {
	const byNumber = new Map(rows.map((row) => [row.number, row]));
	const count = Math.max(total ?? 0, rows.length);
	if (!count) return [];
	return Array.from({ length: count }, (_, i) => {
		const number = i + 1;
		return byNumber.get(number) ?? { number, title: null, image: null, description: null, releaseDate: null };
	});
}

/** Jikan/Tenrai episode pages (100 entries at a time). */
async function fetchMirrorEpisodes(
	baseUrl: string,
	malId: number,
	sfw: boolean
): Promise<EpisodeAsset[]> {
	const rows: EpisodeAsset[] = [];
	for (let page = 1; page <= 4; page++) {
		const query = [sfw ? 'sfw-strict' : '', page > 1 ? `page=${page}` : '']
			.filter(Boolean)
			.join('&');
		const raw = await fetchJson<{
			data?: MirrorEpisodeRow[];
			pagination?: { has_next_page?: boolean };
		}>(`${baseUrl}/anime/${malId}/episodes${query ? `?${query}` : ''}`, 6500);
		const pageRows = raw?.data ?? [];
		for (const row of pageRows) {
			// Handle aired date - can be object with 'from' or ISO string
			let releaseDate: string | null = null;
			if (row.aired) {
				if (typeof row.aired === 'string') {
					releaseDate = row.aired.split('T')[0]; // YYYY-MM-DD
				} else if (row.aired.from) {
					releaseDate = row.aired.from.split('T')[0];
				}
			}
			rows.push({
				number: rows.length + 1,
				title: row.title ?? null,
				image: row.images?.jpg?.image_url ?? null,
				description: row.synopsis ?? null,
				releaseDate
			});
		}
		if (!raw?.pagination?.has_next_page || !pageRows.length) break;
	}
	return rows;
}

/** Kitsu episode pages (20 entries at a time). */
async function fetchKitsuEpisodeRows(kitsuId: number): Promise<EpisodeAsset[]> {
	const raw = await fetchJson<{ data?: KitsuResource[] }>(
		`${KITSU_URL}/anime/${kitsuId}/episodes?page[limit]=20&sort=number`,
		6500,
		KITSU_ACCEPT
	);
	return (raw?.data ?? [])
		.map((row, i) => ({
			number: Number(row.attributes?.number) || i + 1,
			title: row.attributes?.canonicalTitle ?? null,
			image: row.attributes?.thumbnail?.original ?? row.attributes?.thumbnail?.large ?? null
		}))
		.filter((row) => Number.isFinite(row.number) && row.number > 0);
}

/**
 * Episode list for a title.
 *
 * ani.zip has titles and thumbnails and is tried first (it is the richest and
 * cheapest source); when it fails the configured mirrors are walked one by
 * one. A title with no episode data still gets a synthesised 1..N list from
 * its episode count, so navigation is never empty.
 */
export async function fallbackEpisodes(
	anime: Pick<Anime, 'id' | 'malId' | 'episodes'>
): Promise<EpisodeAsset[]> {
	return meta(
		`episodes:${anime.id}`,
		META_EPISODES_TTL,
		async () => {
			const zip = await getAniZip(anime.id).catch(() => null);
			const zipEpisodes = zip
				? Object.values(zip.episodes).sort((a, b) => a.number - b.number)
				: [];
			if (zipEpisodes.length) return zipEpisodes;

			const total = anime.episodes ?? zip?.episodeCount ?? null;
			const malId = anime.malId ?? idMap[`al:${anime.id}`] ?? null;
			const attempts: Array<Attempt<EpisodeAsset[]>> = [];

			for (const letter of SOURCE_ORDER) {
				if (letter === 'j' && malId) {
					attempts.push({
						ns: 'jikan',
						run: async () => {
							const rows = await fetchMirrorEpisodes(JIKAN_URL, malId, false);
							return rows.length ? fillEpisodes(rows, total) : null;
						}
					});
				}
				if (letter === 't' && malId) {
					attempts.push({
						ns: 'tenrai',
						run: async () => {
							const rows = await fetchMirrorEpisodes(TENRAI_URL, malId, true);
							return rows.length ? fillEpisodes(rows, total) : null;
						}
					});
				}
				if (letter === 'k') {
					attempts.push({
						ns: 'kitsu',
						run: async () => {
							const kitsuId = zip?.mappings?.kitsu_id ?? (await kitsuIdFor(anime.id));
							if (!kitsuId) return null;
							const rows = await fetchKitsuEpisodeRows(kitsuId);
							return rows.length ? fillEpisodes(rows, total) : null;
						}
					});
				}
			}

			const rows = await first(attempts);
			if (rows) return rows;
			return fillEpisodes([], total);
		},
		(value) => value.length > 0
	);
}

/* ---------------- detail sections ---------------- */

export interface DetailPatch {
	characters?: NonNullable<Anime['characters']>;
	relations?: NonNullable<Anime['relations']>;
	recommendations?: NonNullable<Anime['recommendations']>;
	trailer?: string | null;
}

type RelatedCard = NonNullable<Anime['relations']>[number];

interface CardInput {
	mal_id?: number;
	kitsu_id?: number;
	title?: string;
	cover?: string | null;
	score?: number | null;
	relation?: string | null;
}

function stubAnime(
	id: number,
	title: string,
	cover: string | null,
	malId: number | null,
	score: number | null
): Anime {
	return {
		id,
		malId,
		title: { romaji: title, english: null, native: null },
		display: title,
		banner: null,
		cover: cover ?? '',
		color: null,
		description: '',
		genres: [],
		tags: [],
		score,
		popularity: 0,
		favorites: 0,
		status: 'UNKNOWN',
		format: null,
		season: null,
		seasonYear: null,
		episodes: null,
		duration: null,
		studio: null,
		startDate: null,
		nextAiring: null,
		isAdult: false
	};
}

function relatedCard(input: CardInput, id: number): RelatedCard {
	const title = input.title?.trim() || `Anime #${input.mal_id ?? input.kitsu_id ?? id}`;
	return {
		id,
		relationType: (input.relation ?? 'RELATED').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
		title,
		cover: input.cover ?? null,
		score: input.score ?? null,
		anime: stubAnime(id, title, input.cover ?? null, input.mal_id ?? null, input.score ?? null)
	};
}

function asRecommendations(cards: RelatedCard[]): NonNullable<Anime['recommendations']> {
	return cards.map((card) => ({
		id: card.id,
		title: card.title,
		cover: card.cover,
		score: card.score,
		anime: card.anime
	}));
}

/** Resolve MyAnimeList-keyed cards to AniList ids (ani.zip bridges). */
async function cardsFromMal(inputs: CardInput[], limit = 8): Promise<RelatedCard[]> {
	const picked = inputs.filter((entry) => entry.mal_id).slice(0, limit);
	if (!picked.length) return [];
	const ids = await Promise.all(
		picked.map((entry) => anilistIdFor(entry.mal_id!).catch(() => null))
	);
	const cards: RelatedCard[] = [];
	picked.forEach((entry, i) => {
		const id = ids[i];
		if (id) cards.push(relatedCard(entry, id));
	});
	return cards;
}

/** Resolve Kitsu-keyed cards to AniList ids. */
async function cardsFromKitsu(inputs: CardInput[], limit = 8): Promise<RelatedCard[]> {
	const picked = inputs.filter((entry) => entry.kitsu_id).slice(0, limit);
	if (!picked.length) return [];
	const ids = await Promise.all(
		picked.map((entry) => anilistIdForKitsu(entry.kitsu_id!).catch(() => null))
	);
	const cards: RelatedCard[] = [];
	picked.forEach((entry, i) => {
		const id = ids[i];
		if (id) cards.push(relatedCard(entry, id));
	});
	return cards;
}

function youtubeId(trailer?: MalAnime['trailer']): string | null {
	if (trailer?.youtube_id) return trailer.youtube_id;
	const match = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/i.exec(
		trailer?.embed_url ?? trailer?.url ?? ''
	);
	return match?.[1] ?? null;
}

interface MirrorCharacterRow {
	role?: string | null;
	character?: {
		name?: string | null;
		images?: { jpg?: { image_url?: string } };
	} | null;
	voice_actors?: Array<{
		person?: { name?: string | null; images?: { jpg?: { image_url?: string } } };
	}>;
}

interface MirrorRecommendationRow {
	entry?: {
		mal_id?: number;
		title?: string;
		images?: { jpg?: { image_url?: string; large_image_url?: string } };
	};
}

/** Detail sections from Jikan / Tenrai (same shape). */
async function mirrorDetail(
	malId: number,
	baseUrl: string,
	sfw: boolean
): Promise<DetailPatch | null> {
	const flag = sfw ? '?sfw-strict' : '';
	const [charsRaw, recsRaw, baseRaw] = await Promise.all([
		fetchJson<{ data?: MirrorCharacterRow[] }>(
			`${baseUrl}/anime/${malId}/characters${flag}`,
			6500
		),
		fetchJson<{ data?: MirrorRecommendationRow[] }>(
			`${baseUrl}/anime/${malId}/recommendations${flag}`,
			6500
		),
		fetchJson<{ data?: MalAnime }>(`${baseUrl}/anime/${malId}${flag}`, 6500)
	]);
	const record = unwrap<MalAnime>(baseRaw);
	if (!charsRaw && !recsRaw && !record) return null;

	const characters = (charsRaw?.data ?? [])
		.map((row) => ({
			name: (row.character?.name ?? '').trim(),
			role: row.role ?? null,
			image: row.character?.images?.jpg?.image_url ?? null,
			voiceActors: (row.voice_actors ?? []).slice(0, 3).map((voice) => ({
				name: (voice.person?.name ?? '').trim(),
				image: voice.person?.images?.jpg?.image_url ?? null
			}))
		}))
		.filter((character) => character.name)
		.slice(0, 12);

	const relationInputs: CardInput[] = [];
	for (const group of record?.relations ?? []) {
		for (const entry of group.entry ?? []) {
			if (!entry.mal_id) continue;
			if (entry.type && entry.type.toLowerCase() !== 'anime') continue;
			relationInputs.push({
				mal_id: entry.mal_id,
				title: entry.name,
				relation: group.relation
			});
		}
	}
	const recommendationInputs = (recsRaw?.data ?? [])
		.map((row) => row.entry)
		.filter(
			(entry): entry is NonNullable<MirrorRecommendationRow['entry']> => !!entry?.mal_id
		)
		.map((entry) => ({
			mal_id: entry.mal_id,
			title: entry.title,
			cover: entry.images?.jpg?.large_image_url ?? entry.images?.jpg?.image_url ?? null
		}));

	const relations = await cardsFromMal(relationInputs);
	const recommendations = asRecommendations(await cardsFromMal(recommendationInputs));
	const trailer = youtubeId(record?.trailer);

	if (!characters.length && !relations.length && !recommendations.length && !trailer) {
		return null;
	}
	return { characters, relations, recommendations, trailer };
}

/** Detail sections from Kitsu (relationships, castings, trailer). */
async function kitsuDetail(kitsuId: number): Promise<DetailPatch | null> {
	const [relationsRaw, castRaw, base] = await Promise.all([
		fetchJson<{ data?: KitsuResource[]; included?: KitsuResource[] }>(
			`${KITSU_URL}/anime/${kitsuId}/media-relationships?include=destination&page[limit]=12`,
			6500,
			KITSU_ACCEPT
		),
		fetchJson<{ data?: KitsuResource[]; included?: KitsuResource[] }>(
			`${KITSU_URL}/anime/${kitsuId}/castings?include=character,person&page[limit]=12`,
			6500,
			KITSU_ACCEPT
		),
		fetchKitsuAnime(kitsuId)
	]);
	if (!relationsRaw && !castRaw && !base) return null;

	const included = [...(relationsRaw?.included ?? []), ...(castRaw?.included ?? [])];
	const findIncluded = (link?: { data?: { id?: string; type?: string } | null }) => {
		const id = link?.data?.id;
		const type = link?.data?.type;
		if (!id) return undefined;
		return included.find((row) => row.id === id && (!type || row.type === type));
	};

	const relationInputs: CardInput[] = [];
	for (const row of relationsRaw?.data ?? []) {
		const destination = findIncluded(row.relationships?.destination);
		const destinationId = Number(destination?.id);
		if (!Number.isFinite(destinationId) || destinationId <= 0) continue;
		relationInputs.push({
			kitsu_id: destinationId,
			title: destination?.attributes?.canonicalTitle,
			cover:
				destination?.attributes?.posterImage?.large ??
				destination?.attributes?.posterImage?.original ??
				null,
			relation: row.attributes?.role ?? null
		});
	}

	const characters = (castRaw?.data ?? [])
		.map((row) => {
			const character = findIncluded(row.relationships?.character);
			const person = findIncluded(row.relationships?.person);
			return {
				name: (character?.attributes?.name ?? '').trim(),
				role: row.attributes?.role ?? null,
				image:
					character?.attributes?.image?.original ??
					character?.attributes?.image?.large ??
					null,
				voiceActors: person
					? [
							{
								name: (person.attributes?.name ?? '').trim(),
								image:
									person.attributes?.image?.original ??
									person.attributes?.image?.large ??
									null
							}
						]
					: []
			};
		})
		.filter((character) => character.name)
		.slice(0, 12);

	const relations = await cardsFromKitsu(relationInputs);
	const trailer = youtubeId(base?.trailer);
	if (!characters.length && !relations.length && !trailer) return null;
	return { characters, relations, recommendations: [], trailer };
}

/** Detail sections from MyAnimeList (relations + recommendations). */
async function malDetail(malId: number): Promise<DetailPatch | null> {
	const raw = await fetchMalRecord(malId);
	if (!raw) return null;

	const relationInputs: CardInput[] = [];
	for (const row of raw.related_anime ?? []) {
		const id = row.node?.id ?? (typeof row.entry === 'number' ? row.entry : undefined);
		if (!id) continue;
		relationInputs.push({
			mal_id: id,
			title: row.node?.title,
			cover:
				row.node?.main_picture?.original ??
				row.node?.main_picture?.large ??
				row.node?.main_picture?.medium ??
				null,
			relation: row.relation_type ?? row.relation ?? null
		});
	}

	const recommendationInputs: CardInput[] = [];
	for (const row of raw.recommendations ?? []) {
		if (row.node?.id) {
			recommendationInputs.push({
				mal_id: row.node.id,
				title: row.node.title,
				cover:
					row.node.main_picture?.original ??
					row.node.main_picture?.large ??
					row.node.main_picture?.medium ??
					null
			});
		}
		for (const entry of row.entry ?? []) {
			if (entry?.mal_id) recommendationInputs.push({ mal_id: entry.mal_id });
		}
	}

	const relations = await cardsFromMal(relationInputs);
	const recommendations = asRecommendations(await cardsFromMal(recommendationInputs));
	if (!relations.length && !recommendations.length) return null;
	return { relations, recommendations };
}

/**
 * Characters, relations, recommendations and trailer for a title.
 *
 * AniList returns these with its own detail query; when it is unavailable the
 * mirrors are walked in the configured order, one at a time. The patch is
 * cached once and applied to the already-rendered page.
 */
export async function fallbackDetail(base: Anime): Promise<DetailPatch> {
	return meta(
		`detail:${base.id}`,
		META_DETAIL_TTL,
		async () => {
			const malId = base.malId ?? (await malIdFor(base.id));
			const kitsuId = sourceEnabled('k')
				? (idMap[`al-kitsu:${base.id}`] ?? (await kitsuIdFor(base.id)))
				: null;

			const attempts: Array<Attempt<DetailPatch>> = [];
			for (const letter of SOURCE_ORDER) {
				if (letter === 'j' && malId) {
					attempts.push({ ns: 'jikan', run: () => mirrorDetail(malId, JIKAN_URL, false) });
				}
				if (letter === 't' && malId) {
					attempts.push({ ns: 'tenrai', run: () => mirrorDetail(malId, TENRAI_URL, true) });
				}
				if (letter === 'k' && kitsuId) {
					attempts.push({ ns: 'kitsu', run: () => kitsuDetail(kitsuId) });
				}
				if (letter === 'm' && malId) {
					attempts.push({ ns: 'mal', run: () => malDetail(malId) });
				}
			}

			// Sections are merged in the configured order rather than stopping at
			// the first response. A source that only carries relations (MAL) is
			// still authoritative for that section, while later sources fill the
			// characters/trailer/recommendations it does not have.
			const merged: DetailPatch = {};
			for (const attempt of attempts) {
				if (sourceDown(attempt.ns)) continue;
				try {
					const patch = await attempt.run();
					if (!patch) continue;
					if (!merged.characters?.length && patch.characters?.length) {
						merged.characters = patch.characters;
					}
					if (!merged.relations?.length && patch.relations?.length) {
						merged.relations = patch.relations;
					}
					if (!merged.recommendations?.length && patch.recommendations?.length) {
						merged.recommendations = patch.recommendations;
					}
					if (!merged.trailer && patch.trailer) merged.trailer = patch.trailer;
					if (
						merged.trailer &&
						merged.characters?.length &&
						merged.relations?.length &&
						merged.recommendations?.length
					) {
						break;
					}
				} catch {
					/* keep walking the ordered sources */
				}
			}
			return merged;
		},
		(patch) =>
			!!(
				patch.trailer ||
				patch.characters?.length ||
				patch.relations?.length ||
				patch.recommendations?.length
			)
	);
}
