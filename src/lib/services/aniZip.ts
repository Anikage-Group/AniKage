import type { AniZipResult, EpisodeAsset } from '$lib/types';
import { ANIZIP_URL } from '$lib/config';
import { cached } from '$lib/services/cache';

/**
 * ani.zip asset service — episode thumbnails, titles, banners.
 * Base URL comes from config (PUBLIC_ANIZIP_URL) — never hardcoded here.
 * Real endpoint (verified): {ANIZIP_URL}/mappings?anilist_id={id}
 *
 * Response shape:
 * {
 *   titles: { en?, 'x-jat'?, ja?, ... },
 *   images: [{ coverType: 'Banner' | 'Poster' | 'Fanart', url }],
 *   episodes: { "1": { title: { en?, 'x-jat'?, ja? }, image?, overview? }, ... },
 *   episodeCount, specialCount, mappings
 * }
 */

interface RawAniZip {
	titles?: Record<string, string>;
	images?: { coverType?: string; url?: string }[];
	episodes?: Record<
		string,
		{ image?: string; title?: Record<string, string> | string | null; overview?: string; airDate?: string }
	>;
	episodeCount?: number;
	/** Cross-database ids — used to reach the MyAnimeList-based fallbacks. */
	mappings?: {
		anilist_id?: number | null;
		mal_id?: number | null;
		kitsu_id?: number | null;
		thetvdb_id?: number | null;
		anidb_id?: number | null;
		type?: string | null;
	};
}

/**
 * AniList → ani.zip record cache.
 *
 * These documents carry whole episode lists, so they are the heaviest payload
 * the app caches: 24 hours, and only a handful are persisted (see the
 * namespace caps in cache.ts). `cached` also folds concurrent lookups of the
 * same title into one request.
 */
const ANIZIP_TTL = 1000 * 60 * 60 * 24;
const ANIZIP_NS = 'anizip';

function pickTitle(t: Record<string, string> | string | null | undefined): string | null {
	if (!t) return null;
	if (typeof t === 'string') return t;
	return t.en ?? t['x-jat'] ?? t.ja ?? Object.values(t)[0] ?? null;
}

export function getAniZip(anilistId: number): Promise<AniZipResult> {
	return cached(ANIZIP_NS, `anilist:v2:${anilistId}`, ANIZIP_TTL, async () =>
		buildResult(await fetchMappings(`anilist_id=${anilistId}`))
	);
}

/**
 * The same record, looked up by MyAnimeList id.
 *
 * The fallback sources (Tenrai, Jikan) are keyed by MAL id, so this is the
 * bridge that keeps AniList ids as the app's internal identifiers.
 */
export function getAniZipByMal(malId: number): Promise<AniZipResult> {
	return cached(ANIZIP_NS, `mal:v2:${malId}`, ANIZIP_TTL, async () =>
		buildResult(await fetchMappings(`mal_id=${malId}`))
	);
}

/**
 * The same record, looked up by Kitsu id.
 *
 * Kitsu is the third fallback source, so this is the second bridge between
 * the app's AniList ids and the ids the mirrors use.
 */
export function getAniZipByKitsu(kitsuId: number): Promise<AniZipResult> {
	return cached(ANIZIP_NS, `kitsu:v2:${kitsuId}`, ANIZIP_TTL, async () =>
		buildResult(await fetchMappings(`kitsu_id=${kitsuId}`))
	);
}

/** Fetch a mapping document from ani.zip. */
async function fetchMappings(query: string): Promise<RawAniZip> {
	const res = await fetch(`${ANIZIP_URL}/mappings?${query}`);
	if (!res.ok) throw new Error(`ani.zip failed (${res.status})`);
	return (await res.json()) as RawAniZip;
}

/** Turn a raw ani.zip document into the normalised result. */
function buildResult(raw: RawAniZip): AniZipResult {
	const episodes: Record<string, EpisodeAsset> = {};
	for (const [k, v] of Object.entries(raw.episodes ?? {})) {
		// Skip specials / extras keyed like "S1", "S2" — keep the main season only.
		if (!/^\d+$/.test(k)) continue;
		episodes[k] = {
			number: Number(k),
			title: pickTitle(v?.title),
			image: v?.image ?? null,
			description: v?.overview ?? null,
			releaseDate: v?.airDate ?? null
		};
	}

	const images = raw.images ?? [];
	// The TVDB "Banner" is a thin 758x140 logo strip - far too small to use as
	// a full-width hero. The "Fanart" is the 1920x1080 backdrop and is the
	// right asset for a banner, so prefer it and keep the strip as a last resort.
	const banner =
		images.find((i) => i.coverType === 'Fanart')?.url ??
		images.find((i) => i.coverType === 'Banner')?.url ??
		null;
	const poster = images.find((i) => i.coverType === 'Poster')?.url ?? null;
	// ani.zip lists transparent title art as `coverType: 'Clearlogo'`.
	const clearlogo = images.find((i) => i.coverType === 'Clearlogo')?.url ?? null;
	const episodeCount = Number(raw.episodeCount) || 0;

	// Upcoming/unreleased titles return an empty episodes map but a valid episodeCount.
	// Synthesise numbered episodes so the UI still lists them.
	if (Object.keys(episodes).length === 0 && episodeCount > 0) {
		for (let i = 1; i <= episodeCount; i++) {
			episodes[String(i)] = { number: i, title: null, image: null, description: null, releaseDate: null };
		}
	}

	return {
		pictures: images.map((i) => i.url).filter((u): u is string => !!u),
		coverImage: poster,
		bannerImage: banner,
		clearlogo,
		episodes,
		episodeCount,
		mappings: raw.mappings ?? null,
		titles: raw.titles ?? {}
	};
}

/**
 * Banner image for a title.
 *
 * The API banner wins; ani.zip is only the last resort (the same rule as
 * posters — artwork from the metadata source is preferred everywhere).
 */
export async function getBanner(anilistId: number, fallback: string | null): Promise<string | null> {
	try {
		const zip = await getAniZip(anilistId);
		return fallback ?? zip.bannerImage;
	} catch {
		return fallback;
	}
}
