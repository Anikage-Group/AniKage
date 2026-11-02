import type { Anime, ScheduleEntry } from '$lib/types';
import { ANILIST_GRAPHQL, sourceEnabled, sourceIsFirst } from '$lib/config';
import {
	fallbackAnime,
	fallbackList,
	fallbackSchedule,
	fallbackSearch,
	rememberAnime,
	type FallbackFilters
} from '$lib/services/fallback';
import { cacheSet, cached } from '$lib/services/cache';

/**
 * Anikage data layer — live AniList GraphQL.
 * No mock data: every view hydrates from these calls.
 */

const ANILIST_ENDPOINT = ANILIST_GRAPHQL;

const MEDIA_FIELDS = `
	id
	idMal
	status
	 format
 episodes
	duration
 season
 seasonYear
 averageScore
	popularity
	favourites
	isAdult
	description(asHtml: false)
	title { romaji english native }
	coverImage { extraLarge large color }
	bannerImage
	genres
	tags { name }
 studios(isMain: true) { nodes { name } }
 startDate { year month day }
	nextAiringEpisode { episode airingAt }
`;

interface RawMedia {
	id: number;
	idMal: number | null;
	status: string | null;
	format: string | null;
	episodes: number | null;
	duration: number | null;
	season: string | null;
	seasonYear: number | null;
	averageScore: number | null;
	popularity: number | null;
	favourites: number | null;
	isAdult?: boolean;
	description: string | null;
	title: { romaji: string | null; english: string | null; native: string | null };
	coverImage: { extraLarge: string; large: string; color: string | null };
	bannerImage: string | null;
	genres: string[];
	tags?: { name: string }[];
	studios?: { nodes: { name: string }[] };
	startDate?: { year: number | null; month: number | null; day: number | null };
	nextAiringEpisode: { episode: number; airingAt: number } | null;
}

function clean(s: string | null | undefined): string {
	return (s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
}

function toAnime(raw: RawMedia): Anime {
	const romaji = clean(raw.title.romaji);
	const english = clean(raw.title.english) || null;
	return {
		id: raw.id,
		malId: raw.idMal ?? null,
		title: {
			romaji,
			english,
			native: clean(raw.title.native) || null
		},
		display: english || romaji,
		banner: raw.bannerImage ?? null,
		cover: raw.coverImage.extraLarge || raw.coverImage.large,
		color: raw.coverImage.color ?? null,
		description: clean(raw.description),
		genres: raw.genres ?? [],
		tags: (raw.tags ?? []).map((t) => t.name),
		score: raw.averageScore ?? null,
		popularity: raw.popularity ?? 0,
		favorites: raw.favourites ?? 0,
		status: raw.status ?? 'UNKNOWN',
		format: raw.format ?? null,
		season: raw.season ?? null,
		seasonYear: raw.seasonYear ?? null,
		episodes: raw.episodes ?? null,
		duration: raw.duration ?? null,
		studio: raw.studios?.nodes?.[0]?.name ?? null,
		startDate: formatStart(raw.startDate),
		nextAiring: raw.nextAiringEpisode ?? null,
		isAdult: raw.isAdult ?? false
	};
}

function formatStart(d?: { year: number | null; month: number | null; day: number | null }): string | null {
	if (!d?.year) return null;
	const mm = String(d.month ?? 1).padStart(2, '0');
	const dd = String(d.day ?? 1).padStart(2, '0');
	return `${d.year}-${mm}-${dd}`;
}

/**
 * AniList response cache.
 *
 * Every query is remembered for three hours (in the shared cache, which also
 * persists it to localStorage), so a page reload — or a return visit — reuses
 * the previous answers instead of hammering AniList. That is also what keeps
 * the 429 rate limiter at bay.
 */
const ANILIST_TTL = 1000 * 60 * 60 * 3; // 3 hours
const ANILIST_NS = 'anilist';

/** Deterministic cache key: variable key order can never change the hash. */
function cacheKey(query: string, variables: Record<string, unknown>): string {
	const keys = Object.keys(variables).sort();
	const stable: Record<string, unknown> = {};
	for (const k of keys) stable[k] = variables[k];
	return query + JSON.stringify(stable);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** AniList throttles bursts with HTTP 429 (which browsers surface as a CORS
 *  error, since the rate-limit response carries no CORS headers). Retry with
 *  backoff instead of failing the whole view. */
const RETRY_DELAYS = [900, 2400, 5000];

/**
 * When AniList looks unreachable, remember it for a minute.
 *
 * Without this every query would burn the full retry budget (and the mirrors
 * would only take over ~8s later) — with it the fallback sources answer on
 * the very next request.
 */
const DOWN_MS = 60_000;
let anilistDownUntil = 0;

export function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
	// `cached` shares one in-flight request per key, so a burst of identical
	// queries (rapid filter changes) only reaches AniList once.
	return cached<T>(ANILIST_NS, cacheKey(query, variables), ANILIST_TTL, () =>
		runQuery<T>(query, variables)
	);
}

async function runQuery<T>(
	query: string,
	variables: Record<string, unknown>
): Promise<T> {
	// AniList was unreachable a moment ago — let the mirrors answer at once.
	if (Date.now() < anilistDownUntil) {
		throw new Error('AniList is unavailable.');
	}

	let lastStatus = 0;
	for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
		let res: Response;
		try {
			res = await fetch(ANILIST_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ query, variables })
			});
		} catch (e) {
			// Network/CORS failure: the host is unreachable (or a 429 is hidden
			// behind the CORS error). One short retry, then the mirrors take over.
			if (attempt < 1) {
				await sleep(RETRY_DELAYS[0]);
				continue;
			}
			anilistDownUntil = Date.now() + DOWN_MS;
			throw new Error(e instanceof Error ? e.message : 'AniList is unreachable.');
		}

		lastStatus = res.status;

		// 429 = throttled (browsers hide the body behind a CORS failure).
		// 5xx = transient upstream error. Both are worth retrying.
		if (res.status === 429 || res.status >= 500) {
			if (attempt < RETRY_DELAYS.length) {
				await sleep(RETRY_DELAYS[attempt]);
				continue;
			}
			anilistDownUntil = Date.now() + DOWN_MS;
			if (res.status === 429) {
				throw new Error('AniList is rate-limiting right now — tap retry in a few seconds.');
			}
			throw new Error(`AniList is unavailable (${res.status}).`);
		}

		if (!res.ok) {
			// 403 = AniList switched its API off. Nothing to retry.
			if (res.status === 403) anilistDownUntil = Date.now() + DOWN_MS;
			throw new Error(`AniList request failed (${res.status}).`);
		}

		const json = (await res.json()) as {
			data?: T;
			errors?: { message?: string; status?: number }[];
		};
		if (json.errors?.length) {
			const error = json.errors[0];
			// AniList can report its rate limit as a GraphQL error with HTTP 200.
			if (error?.status === 429 || /too many requests|rate.?limit/i.test(error?.message ?? '')) {
				anilistDownUntil = Date.now() + DOWN_MS;
				throw new Error('AniList is rate-limiting right now — tap retry in a minute.');
			}
			throw new Error(error?.message ?? 'AniList GraphQL error.');
		}

		if (typeof console !== 'undefined') console.info('[anikage] metadata source → AniList');
		return json.data as T;
	}

	throw new Error(`AniList request failed (${lastStatus || 'network'}).`);
}

async function pageMedia(
	vars: Record<string, unknown>,
	extra = ''
): Promise<{ list: Anime[]; total: number }> {
	const data = await gql<{
		Page: { media: RawMedia[]; pageInfo: { total: number } };
	}>(
		`query ($page: Int, $perPage: Int, $sort: [MediaSort], $status_in: [MediaStatus], $season: MediaSeason, $seasonYear: Int, $search: String, $isAdult: Boolean, $genre_in: [String], $tag_in: [String], $format_in: [MediaFormat], $countryOfOrigin: CountryCode, $startDate_greater: FuzzyDateInt, $startDate_lesser: FuzzyDateInt) {
			Page(page: $page, perPage: $perPage) {
				pageInfo { total }
				media(type: ANIME, sort: $sort, status_in: $status_in, season: $season, seasonYear: $seasonYear, search: $search, isAdult: $isAdult, genre_in: $genre_in, tag_in: $tag_in, format_in: $format_in, countryOfOrigin: $countryOfOrigin, startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser) {
					${MEDIA_FIELDS}
					${extra}
				}
			}
		}`,
		vars
	);
	return { list: data.Page.media.map(toAnime), total: data.Page.pageInfo.total };
}

export function currentSeason(): { season: string; year: number } {
	const now = new Date();
	const y = now.getFullYear();
	const m = now.getMonth();
	const season = m <= 2 ? 'WINTER' : m <= 5 ? 'SPRING' : m <= 8 ? 'SUMMER' : 'FALL';
	return { season, year: y };
}

/* ---------------- Queries ---------------- */

/**
 * Run an AniList query, falling back to the mirror sources when AniList is
 * unavailable.
 *
 * AniList has switched its API off more than once ("severe stability
 * issues"), and without a fallback every view in the app goes blank. The
 * mirrors speak MyAnimeList's shape; ani.zip translates the ids so the app
 * keeps using AniList ids everywhere.
 */
async function withFallbackList(
	primary: () => Promise<{ list: Anime[]; total: number }>,
	fallback: () => Promise<Anime[]>
): Promise<{ list: Anime[]; total: number }> {
	// AniList is not first: the ordered mirror cascade answers. AniList is only
	// touched afterwards if that cascade returned nothing and AniList is enabled.
	if (!sourceIsFirst('a')) {
		let fallbackError: unknown = null;
		try {
			const list = await fallback();
			if (list.length) return { list, total: list.length };
		} catch (e) {
			fallbackError = e;
		}
		if (sourceEnabled('a')) {
			try {
				return await primary();
			} catch {
				/* fall through to the last error */
			}
		}
		if (fallbackError) throw fallbackError;
		return { list: [], total: 0 };
	}
	try {
		return await primary();
	} catch (e) {
		try {
			const list = await fallback();
			if (list.length) return { list, total: list.length };
		} catch {
			/* the mirrors are down too — surface the original error */
		}
		throw e;
	}
}

export function getPopularThisSeason(page = 1, perPage = 18) {
	const { season, year } = currentSeason();
	return withFallbackList(
		() => pageMedia({ page, perPage, season, seasonYear: year, sort: ['POPULARITY_DESC'] }),
		() => fallbackList('seasonal', perPage)
	);
}

export function getTrending(page = 1, perPage = 18) {
	return withFallbackList(
		() => pageMedia({ page, perPage, sort: ['TRENDING_DESC'] }),
		// The mirrors' airing list is what belongs in Trending Now and in the
		// hero banner; their all-time popularity list goes to Top Airing.
		() => fallbackList('trending', perPage, {}, { swapTrendingAiring: true })
	);
}

export function getTopAiring(page = 1, perPage = 18) {
	return withFallbackList(
		() => pageMedia({ page, perPage, status_in: ['RELEASING'], sort: ['SCORE_DESC'] }),
		() => fallbackList('airing', perPage, {}, { swapTrendingAiring: true })
	);
}

export function getRecentlyUpdated(page = 1, perPage = 18) {
	return withFallbackList(
		() => pageMedia({ page, perPage, sort: ['UPDATED_AT_DESC'] }),
		() => fallbackList('updated', perPage)
	);
}

export function getTop10(range: 'today' | 'week' | 'month' = 'today') {
	const sort =
		range === 'today' ? ['TRENDING_DESC'] : range === 'week' ? ['POPULARITY_DESC'] : ['FAVOURITES_DESC'];
	// The mirrors have no ranking endpoints, so each range uses a different
	// rail — otherwise all three tabs would show the same ten titles.
	const kind = range === 'today' ? 'airing' : range === 'week' ? 'trending' : 'seasonal';
	return withFallbackList(
		() => pageMedia({ page: 1, perPage: 10, sort, status_in: ['RELEASING'] }),
		() => fallbackList(kind, 10)
	);
}

export function searchAnime(query: string, page = 1, perPage = 20) {
	if (!query.trim()) return Promise.resolve({ list: [] as Anime[], total: 0 });
	return withFallbackList(
		() => pageMedia({ page, perPage, search: query, sort: ['SEARCH_MATCH'] }),
		() => fallbackSearch(query, perPage)
	);
}

export async function getAnimeById(id: number): Promise<Anime> {
	// A non-AniList source is listed first: walk the ordered cascade before
	// even considering AniList. AniList only answers if it is also enabled and
	// every earlier source failed to resolve the title.
	if (!sourceIsFirst('a')) {
		const alt = await fallbackAnime(id).catch(() => null);
		if (alt) return alt;
		if (!sourceEnabled('a')) throw new Error('No metadata source available.');
		try {
			const anime = await getAnimeByIdFromAniList(id);
			rememberAnime(anime);
			return anime;
		} catch {
			throw new Error('No metadata source available.');
		}
	}
	try {
		const anime = await getAnimeByIdFromAniList(id);
		// Keep a copy for the offline index and the outage cache.
		rememberAnime(anime);
		return anime;
	} catch (e) {
		const alt = await fallbackAnime(id).catch(() => null);
		if (alt) return alt;
		throw e;
	}
}

async function getAnimeByIdFromAniList(id: number): Promise<Anime> {
	const data = await gql<{ Media: RawMedia & {
		trailer?: { id: string | null; site: string | null } | null;
		characters?: {
			edges: {
				role: string;
				node: { name: { full: string }; image: { large: string | null } };
				voiceActors: { name: { full: string }; image: { large: string | null } }[];
			}[];
		};
		relations?: { edges: { relationType: string; node: RawMedia & { type?: string } }[] };
		recommendations?: {
			nodes: { mediaRecommendation: (RawMedia & { type?: string }) | null }[];
		};
	} }>(
		`query ($id: Int) {
			Media(id: $id, type: ANIME) {
				${MEDIA_FIELDS}
				trailer { id site }
				characters(sort: [ROLE, RELEVANCE], perPage: 12) {
					edges {
						role
						node { name { full } image { large } }
						voiceActors(sort: RELEVANCE) {
							name { full }
							image { large }
						}
					}
				}
				relations {
					edges { relationType node { type ${MEDIA_FIELDS} } }
				}
				recommendations(perPage: 12, sort: RATING_DESC) {
					nodes { mediaRecommendation { type ${MEDIA_FIELDS} } }
				}
			}
		}`,
		{ id }
	);
	const m = data.Media;
	const base = toAnime(m);
	base.trailer = m.trailer?.site === 'youtube' ? (m.trailer.id ?? null) : null;
	base.characters = (m.characters?.edges ?? []).map((e) => ({
		name: e.node.name.full,
		role: e.role ?? null,
		image: e.node.image?.large ?? null,
		voiceActors: (e.voiceActors ?? []).map((v) => ({
			name: v.name.full,
			image: v.image?.large ?? null
		}))
	}));
	// Only anime entries — manga / novel adaptations are filtered out.
	base.relations = (m.relations?.edges ?? [])
		.filter((e) => e.node && e.node.type === 'ANIME')
		.map((e) => ({
			id: e.node.id,
			relationType: e.relationType,
			title: (e.node.title?.english || e.node.title?.romaji || '') as string,
			cover: e.node.coverImage?.extraLarge || e.node.coverImage?.large || null,
			score: e.node.averageScore ?? null,
			anime: toAnime(e.node)
		}));
	base.recommendations = (m.recommendations?.nodes ?? [])
		.filter((n) => n.mediaRecommendation && n.mediaRecommendation.type === 'ANIME')
		.map((n) => {
			const r = n.mediaRecommendation!;
			return {
				id: r.id,
				title: (r.title?.english || r.title?.romaji || '') as string,
				cover: r.coverImage?.extraLarge || r.coverImage?.large || null,
				score: r.averageScore ?? null,
				anime: toAnime(r)
			};
		});
	return base;
}

export interface CatalogFilters {
	search?: string;
	/** Multi-select filters. Empty array / undefined = no filter. */
	genre?: string[];
	tags?: string[];
	format?: string[];
	status?: string[];
	season?: string[];
	years?: number[];
	country?: string | null;
	includeAdult?: boolean;
	sort?: string;
	page?: number;
	perPage?: number;
}

const COUNTRY_MAP: Record<string, string> = {
	Japan: 'JP',
	China: 'CN',
	'South Korea': 'KR',
	Taiwan: 'TW'
};

export async function getCatalog(
	f: CatalogFilters
): Promise<{ list: Anime[]; total: number }> {
	const vars: Record<string, unknown> = {
		page: f.page ?? 1,
		perPage: f.perPage ?? 40,
		search: f.search || undefined,
		sort: [f.search ? 'SEARCH_MATCH' : (f.sort ?? 'TRENDING_DESC')],
		// AniList breaks the query when `isAdult` is sent as an explicit null
		// (or true) — it returns zero results for every search. The variable is
		// therefore only sent when adult titles must be excluded; otherwise it
		// is omitted and AniList's default (include everything) applies.
		isAdult: f.includeAdult ? undefined : false,
		genre_in: f.genre?.length ? f.genre : undefined,
		tag_in: f.tags?.length ? f.tags : undefined,
		format_in: f.format?.length ? f.format : undefined,
		status_in: f.status?.length ? f.status : undefined,
		// Page.media accepts a single `season` (there is no `season_in`).
		season: f.season?.length ? f.season[0] : undefined,
		countryOfOrigin: f.country ? (COUNTRY_MAP[f.country] ?? f.country) : undefined
	};
	if (f.years?.length) {
		// AniList's FuzzyDateInt is YYYYMMDD, not a Unix timestamp.
		const ys = [...f.years].sort((a, b) => a - b);
		vars.startDate_greater = ys[0] * 10000 + 101; // Jan 1 of the earliest year
		vars.startDate_lesser = ys[ys.length - 1] * 10000 + 1231; // Dec 31 of the latest year
	}

	// The catalogue is the one view that must never error: a search page with
	// an error state is a dead end. AniList is tried first; when it is off the
	// mirrors answer directly, and an empty answer is a valid "no results".
	const perPage = f.perPage ?? 40;
	const mirrorFilters: FallbackFilters = {
		genre: f.genre,
		tags: f.tags,
		format: f.format,
		status: f.status,
		season: f.season,
		years: f.years,
		includeAdult: f.includeAdult,
		sort: f.sort
	};
	if (sourceIsFirst('a')) {
		try {
			return await pageMedia(vars);
		} catch {
			/* fall through to the ordered mirror cascade */
		}
	}
	let list: Anime[] = [];
	try {
		list = f.search?.trim()
			? await fallbackSearch(f.search, perPage, mirrorFilters)
			: await fallbackList('trending', perPage, mirrorFilters);
	} catch {
		/* AniList may still be able to answer below */
	}
	if (list.length) return { list, total: list.length };

	// AniList was listed after another source; it acts as the next fallback
	// only when the sources before it produced nothing.
	if (!sourceIsFirst('a') && sourceEnabled('a')) {
		try {
			return await pageMedia(vars);
		} catch {
			/* both the cascade and AniList are unavailable */
		}
	}
	return { list: [], total: 0 };
}

export const GENRES = [
	'Action',
	'Adventure',
	'Comedy',
	'Drama',
	'Fantasy',
	'Horror',
	'Mystery',
	'Psychological',
	'Romance',
	'Sci-Fi',
	'Slice of Life',
	'Sports',
	'Supernatural',
	'Thriller'
];

export const TAGS = [
	'Action',
	'Adventure',
	'Comedy',
	'Drama',
	'Fantasy',
	'Ecchi',
	'Harem',
	'School',
	'Magic',
	'Martial Arts',
	'Mecha',
	'Music',
	'Historical',
	'Psychological',
	'Romance',
	'Sci-Fi',
	'Slice of Life',
	'Supernatural',
	'Sports',
	'Thriller',
	'Vampire',
	'Zombies',
	'Post-Apocalyptic',
	'Time Travel'
];

export const FORMATS = [
	{ id: 'TV', label: 'TV' },
	{ id: 'TV_SHORT', label: 'TV Short' },
	{ id: 'MOVIE', label: 'Movie' },
	{ id: 'SPECIAL', label: 'Special' },
	{ id: 'OVA', label: 'OVA' },
	{ id: 'ONA', label: 'ONA' },
	{ id: 'MUSIC', label: 'Music' }
];

export const STATUSES = [
	{ id: 'RELEASING', label: 'Releasing' },
	{ id: 'FINISHED', label: 'Finished' },
	{ id: 'NOT_YET_RELEASED', label: 'Upcoming' },
	{ id: 'CANCELLED', label: 'Cancelled' },
	{ id: 'HIATUS', label: 'Hiatus' }
];

export const SEASONS = [
	{ id: 'WINTER', label: 'Winter' },
	{ id: 'SPRING', label: 'Spring' },
	{ id: 'SUMMER', label: 'Summer' },
	{ id: 'FALL', label: 'Fall' }
];

export const COUNTRIES = ['Japan', 'China', 'South Korea', 'Taiwan'];

/* ---------------- Weekly schedule ---------------- */

const DAY_KEYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** Returns the Monday-based start timestamp (local) of the current week. */
export function weekStart(from = new Date()): number {
	const d = new Date(from);
	const day = d.getDay(); // 0 Sun .. 6 Sat
	const diff = day === 0 ? -6 : 1 - day;
	d.setDate(d.getDate() + diff);
	d.setHours(0, 0, 0, 0);
	return d.getTime() / 1000;
}

/** The calendar date for a day of the current week, e.g. "20 Oct". */
export function dayDate(key: DayKey, from = new Date()): string {
	const monday = new Date(weekStart(from) * 1000);
	const offset = DAY_KEYS.indexOf(key);
	monday.setDate(monday.getDate() + offset);
	return monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Day-of-month only — the narrow variant used by the day strip on phones. */
export function dayDateNumber(key: DayKey, from = new Date()): string {
	const monday = new Date(weekStart(from) * 1000);
	const offset = DAY_KEYS.indexOf(key);
	monday.setDate(monday.getDate() + offset);
	return String(monday.getDate());
}

/** Airing schedule for a given week (Monday 00:00 → next Monday 00:00).
 *  AniList caps `airingSchedules` at 50 entries per Page, so we page through
 *  until a short page signals the week is fully covered. */
const SCHEDULE_PAGE_SIZE = 50;

export async function getWeekSchedule(weekOffset = 0): Promise<Map<string, ScheduleEntry[]>> {
	const start = weekStart() + weekOffset * 7 * 24 * 3600;
	const end = start + 7 * 24 * 3600;

	const rows: { airingAt: number; episode: number; media: RawMedia }[] = [];
	// Hard stop well above any realistic week so we can never loop forever.
	const MAX_PAGES = 20;

	// AniList is not first: the ordered cascade answers the current week.
	// For other weeks only AniList has data, so it is used only if enabled.
	if (!sourceIsFirst('a')) {
		if (weekOffset === 0) {
			const alt = await fallbackSchedule().catch(() => []);
			if (alt.length) return groupByDay(alt);
		}
		if (!sourceEnabled('a')) {
			throw new Error(
				weekOffset === 0 ? 'Schedule unavailable.' : 'Schedule unavailable for other weeks.'
			);
		}
	}

	try {
		for (let page = 1; page <= MAX_PAGES; page++) {
			const data = await gql<{
				Page: {
					airingSchedules: {
						airingAt: number;
						episode: number;
						media: RawMedia;
					}[];
				};
			}>(
				`query ($page: Int, $perPage: Int, $start: Int, $end: Int) {
					Page(page: $page, perPage: $perPage) {
						airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
							airingAt
							episode
							media { ${MEDIA_FIELDS} }
						}
					}
				}`,
				{ page, perPage: SCHEDULE_PAGE_SIZE, start, end }
			);

			const batch = data.Page?.airingSchedules ?? [];
			rows.push(...batch);
			if (batch.length < SCHEDULE_PAGE_SIZE) break;
		}
	} catch (e) {
		// AniList is down — the mirrors carry their own (current-week) schedule.
		if (weekOffset !== 0) throw e;
		const alt = await fallbackSchedule().catch(() => []);
		if (!alt.length) throw e;
		return groupByDay(alt);
	}

	return groupByDay(
		rows
			.filter((s) => !!s.media)
			.map((s) => ({
				anime: toAnime(s.media),
				episode: s.episode,
				airingAt: s.airingAt
			}))
	);
}

/** Bucket schedule entries into the Monday-first day map the UI expects. */
function groupByDay(entries: ScheduleEntry[]): Map<string, ScheduleEntry[]> {
	const map = new Map<string, ScheduleEntry[]>();
	for (const key of DAY_KEYS) map.set(key, []);
	for (const entry of entries) {
		const d = new Date(entry.airingAt * 1000);
		const key = DAY_KEYS[(d.getDay() + 6) % 7];
		map.get(key)?.push(entry);
	}
	return map;
}

export function dayKeyOf(date = new Date()): DayKey {
	return DAY_KEYS[(date.getDay() + 6) % 7];
}

export const DAY_LABELS: Record<DayKey, string> = {
	MONDAY: 'Mon',
	TUESDAY: 'Tue',
	WEDNESDAY: 'Wed',
	THURSDAY: 'Thu',
	FRIDAY: 'Fri',
	SATURDAY: 'Sat',
	SUNDAY: 'Sun'
};
