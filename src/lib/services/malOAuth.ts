import { get } from 'svelte/store';
import { settings, updateSetting } from '$lib/stores/settings';
import {
	watchlist,
	addToWatchlist,
	setWatchlistMalId,
	setWatchStatus,
	removeFromWatchlist
} from '$lib/stores/watchlist';
import { progress as progressStore, watched as watchedStore, markWatched } from '$lib/stores/history';
import { toast } from '$lib/stores/toast';
import { lang, t } from '$lib/stores/i18n';
import { MAL_API_PATH, MAL_AUTH_URL, MAL_CLIENT_ID, malRedirectUri } from '$lib/config';
import { cacheGet, cacheSet } from '$lib/services/cache';
import {
	clearResolvedTombstones,
	clearTombstone,
	forgetRemoteId,
	getRemoteIds,
	getTombstones,
	hasTombstone,
	malStatusRepairNeeded,
	markMalStatusRepaired,
	rememberRemoteId,
	replaceRemoteIds,
	resetProvider
} from '$lib/stores/sync';
import type { WatchStatus, WatchlistEntry } from '$lib/types';
import { anilistIdsForMal, malIdsForAnilist } from '$lib/services/fallback';

/**
 * MyAnimeList API client (the official one) + its OAuth sign-in.
 *
 * Same shape as the AniList client: the token lives in the settings store and
 * only the public client id is exposed. The secret-using token exchange runs
 * in /api/mal/token, exactly like /api/anilist/token.
 */

const PKCE_KEY = 'anikage:mal-pkce';
const REDIRECT_KEY = 'anikage:mal-redirect';

/* ---------------- API ---------------- */

/** Headers every MyAnimeList request needs. */
export function malHeaders(): Record<string, string> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	const clientId = MAL_CLIENT_ID;
	if (clientId) headers['X-MAL-CLIENT-ID'] = clientId;
	return headers;
}

/** How long a MyAnimeList API answer stays usable. */
const MAL_TTL = 60 * 60 * 1000;
const MAL_NS = 'mal';
const MAL_FIELDS = [
	'id',
	'title',
	'main_picture',
	'alternative_titles',
	'start_date',
	'end_date',
	'synopsis',
	'mean',
	'rank',
	'popularity',
	'num_list_users',
	'num_scoring_users',
	'nsfw',
	'media_type',
	'status',
	'genres',
	'num_episodes',
	'start_season',
	'broadcast',
	'source',
	'average_episode_duration',
	'rating',
	'studios',
	'background'
];

/**
 * Fields a list/search request must ask for.
 *
 * MyAnimeList returns only `id`, `title` and `main_picture` by default, which
 * would leave every card without genres, score, episode count — and without
 * `nsfw`, the adult filter cannot work at all.
 */
export const MAL_LIST_FIELDS = MAL_FIELDS.join(',');

/** The same, plus what only a detail view needs. */
export const MAL_DETAIL_FIELDS = [...MAL_FIELDS, 'pictures', 'related_anime', 'recommendations'].join(
	','
);

/** Turn a failed MAL response into a useful error for sync feedback. */
async function malResponseError(res: Response): Promise<Error> {
	const text = await res.text().catch(() => '');
	let detail = '';
	try {
		const body = JSON.parse(text) as { error?: string; message?: string };
		detail = body.error ?? body.message ?? '';
	} catch {
		detail = text.slice(0, 160);
	}
	if (res.status === 401 || detail === 'invalid_token') {
		return new Error('Your MyAnimeList session expired — sign in again.');
	}
	return new Error(
		detail ? `MyAnimeList: ${detail}` : `MyAnimeList request failed (${res.status}).`
	);
}

interface MalGetOptions {
	/** Throw instead of returning null, so sync can report failures. */
	strict?: boolean;
	/** Ignore the cache — required when pulling a list after pushing to it. */
	fresh?: boolean;
}

/**
 * Fetch JSON from the MyAnimeList API, with the client id header.
 *
 * Answers are cached under the `mal` namespace (the same one the fallback
 * lists use), so a title opened twice costs one request. A missing client id
 * or an expired token returns null and is never cached, unless `strict` is set.
 */
async function malGet<T>(
	path: string,
	token = '',
	{ strict = false, fresh = false }: MalGetOptions = {}
): Promise<T | null> {
	// A bearer token must not share a key with an anonymous request.
	const key = `${token ? 'auth' : 'anon'}|${path}`;
	if (!fresh) {
		const hit = cacheGet<T>(MAL_NS, key);
		if (hit !== undefined) return hit;
	}

	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 9000);
		// Same-origin proxy: MAL answers with no CORS headers, so a direct
		// browser request is blocked before it ever returns data.
		const res = await fetch(`${MAL_API_PATH}${path}`, {
			signal: ctrl.signal,
			headers: token ? { ...malHeaders(), Authorization: `Bearer ${token}` } : malHeaders()
		});
		clearTimeout(timer);
		if (!res.ok) {
			if (strict) throw await malResponseError(res);
			return null;
		}
		const data = (await res.json()) as T;
		cacheSet(MAL_NS, key, data, MAL_TTL);
		return data;
	} catch (e) {
		if (strict) throw e instanceof Error ? e : new Error('Could not reach MyAnimeList.');
		return null;
	}
}

/** A MyAnimeList anime record, as the API returns it. */
export interface MalRecord {
	mal_id?: number;
	id?: number;
	title?: string;
	title_english?: string | null;
	title_japanese?: string | null;
	synopsis?: string | null;
	mean?: number;
	media_type?: string;
	status?: string;
	episodes?: number | null;
	duration?: string | null;
	start_date?: string | null;
	end_date?: string | null;
	score?: number;
	popularity?: number;
	members?: number;
	favorites?: number;
	nsfw?: string | null;
	genres?: { id: number; name: string }[];
	studios?: { id: number; name: string }[];
	main_picture?: { large?: string; medium?: string; original?: string };
	pictures?: { large?: string; medium?: string; original?: string }[];
	alternative_titles?: { en?: string; ja?: string; synonyms?: string[] };
	related_anime?: Array<{
		node?: {
			id?: number;
			title?: string;
			main_picture?: { large?: string; medium?: string; original?: string };
		};
		relation_type?: string;
		relation_type_formatted?: string;
		/** Jikan / Tenrai spell the same relation differently. */
		entry?: number | { mal_id?: number };
		relation?: string;
	}>;
	recommendations?: Array<{
		node?: {
			id?: number;
			title?: string;
			main_picture?: { large?: string; medium?: string; original?: string };
		};
		num_recommendations?: number;
		/** Jikan / Tenrai spell the same entry differently. */
		entry?: { mal_id?: number }[];
	}>;
	/* Field names used by the official API (the others come from Jikan/Tenrai). */
	num_episodes?: number;
	num_list_users?: number;
	num_favorites?: number;
	num_scoring_users?: number;
	average_episode_duration?: number;
	start_season?: { year?: number; season?: string };
	broadcast?: { day_of_the_week?: string; start_time?: string };
	rank?: number;
	rating?: string;
	source?: string;
	background?: string | null;
}

/** One record by MAL id. */
export async function fetchMalAnime(malId: number, token = ''): Promise<MalRecord | null> {
	const data = await malGet<MalRecord | { data?: MalRecord }>(
		`/anime/${malId}?fields=${MAL_DETAIL_FIELDS}`,
		token
	);
	if (!data) return null;
	// A list endpoint nests the node under `data`, but the single-anime
	// endpoint answers with the node itself. Accept both shapes.
	if ('data' in data && data.data) return data.data;
	return data as MalRecord;
}

/* ---------------- OAuth ---------------- */

function randomString(length = 64): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Send the user to MyAnimeList's consent screen. */
export async function startMalLogin(): Promise<void> {
	if (!MAL_CLIENT_ID) throw new Error('PUBLIC_MAL_CLIENT_ID is not configured.');
	const verifier = randomString();
	const state = randomString(16);
	const redirect = malRedirectUri();
	try {
		sessionStorage.setItem(PKCE_KEY, verifier);
		sessionStorage.setItem(`${PKCE_KEY}:state`, state);
		sessionStorage.setItem(REDIRECT_KEY, redirect);
	} catch {
		/* storage disabled — the exchange will fail, but the redirect still works */
	}
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: MAL_CLIENT_ID,
		state,
		redirect_uri: redirect,
		// MyAnimeList documents PKCE with the "plain" method only.
		code_challenge: verifier,
		code_challenge_method: 'plain'
	});
	location.href = `${MAL_AUTH_URL}?${params}`;
}

/** Exchange the authorization code for an access token (via our server route). */
export async function exchangeMalCode(code: string, state = ''): Promise<string> {
	const storedState = (() => {
		try {
			return sessionStorage.getItem(`${PKCE_KEY}:state`) ?? '';
		} catch {
			return '';
		}
	})();
	if (storedState && state && storedState !== state) {
		throw new Error('Sign-in state mismatch — please try again.');
	}
	const verifier = (() => {
		try {
			return sessionStorage.getItem(PKCE_KEY) ?? '';
		} catch {
			return '';
		}
	})();
	const redirect = (() => {
		try {
			return sessionStorage.getItem(REDIRECT_KEY) || malRedirectUri();
		} catch {
			return malRedirectUri();
		}
	})();

	const res = await fetch('/api/mal/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirect })
	});
	const data = (await res.json().catch(() => ({}))) as {
		access_token?: string;
		error?: string;
		error_description?: string;
	};
	if (!res.ok || !data.access_token) {
		throw new Error(data.error ?? data.error_description ?? 'MyAnimeList sign-in failed.');
	}
	try {
		sessionStorage.removeItem(PKCE_KEY);
		sessionStorage.removeItem(`${PKCE_KEY}:state`);
		sessionStorage.removeItem(REDIRECT_KEY);
	} catch {
		/* ignore */
	}
	return data.access_token;
}

/** The signed-in MyAnimeList user. */
export interface MalViewer {
	id: number;
	name: string;
	picture: string | null;
}

export async function fetchMalViewer(token: string): Promise<MalViewer | null> {
	const data = await malGet<{ id: number; name: string; picture?: string }>('/users/@me', token);
	if (!data?.id) return null;
	updateSetting('malToken', token);
	updateSetting('malUserId', data.id);
	updateSetting('malHandle', data.name);
	updateSetting('malAvatar', data.picture ?? '');
	return { id: data.id, name: data.name, picture: data.picture ?? null };
}

/** Sign out of MyAnimeList. */
export function malLogout(): void {
	updateSetting('malToken', '');
	updateSetting('malUserId', null);
	updateSetting('malHandle', '');
	updateSetting('malAvatar', '');
	resetProvider('mal');
}

/** Whether a MyAnimeList session is active. */
export function isMalLoggedIn(): boolean {
	return !!get(settings).malToken;
}

/** The signed-in user's MyAnimeList profile page. */
export function malProfileUrl(): string {
	const handle = get(settings).malHandle;
	return handle ? `https://myanimelist.net/profile/${encodeURIComponent(handle)}` : 'https://myanimelist.net';
}

/* ---------------- Watchlist Sync ---------------- */

const MAL_STATUS_MAP: Record<WatchStatus, string> = {
	watching: 'watching',
	completed: 'completed',
	planned: 'plan_to_watch',
	rewatching: 'watching',
	dropped: 'dropped',
	paused: 'on_hold'
};
const REV_MAL_STATUS_MAP: Record<string, WatchStatus> = {
	watching: 'watching',
	completed: 'completed',
	plan_to_watch: 'planned',
	rewatching: 'rewatching',
	dropped: 'dropped',
	on_hold: 'paused'
};

/**
 * Write to the MyAnimeList list API.
 *
 * MAL only accepts PATCH/PUT for list updates, and expects form-encoded
 * fields. Using POST/JSON here makes every push fail silently, which is why
 * sync used to report success without changing anything remotely.
 */
async function malWrite(
	path: string,
	body: Record<string, string | number>,
	token: string
): Promise<void> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 10000);
	const form = new URLSearchParams();
	for (const [key, value] of Object.entries(body)) {
		if (value !== undefined && value !== null) form.set(key, String(value));
	}
	try {
		const res = await fetch(`${MAL_API_PATH}${path}`, {
			method: 'PATCH',
			signal: ctrl.signal,
			headers: {
				...malHeaders(),
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: form.toString()
		});
		if (!res.ok) throw await malResponseError(res);
	} catch (e) {
		if (e instanceof Error) throw e;
		throw new Error('Could not reach MyAnimeList.');
	} finally {
		clearTimeout(timer);
	}
}

interface MalListResponse {
	data: MalListEntry[];
}

function malListStatus(listStatus: MalListEntry['list_status'] | undefined): WatchStatus {
	if (listStatus?.is_rewatching && listStatus.status === 'watching') return 'rewatching';
	return REV_MAL_STATUS_MAP[listStatus?.status ?? ''] ?? 'planned';
}

/**
 * Download the signed-in user's full MAL list.
 *
 * `list_status` must be requested explicitly — without it MAL returns only the
 * anime node, so every entry looks like `plan_to_watch` with 0 progress. The
 * status filter is intentionally omitted: MAL rejects comma-separated values
 * with 400 Bad Request, and without the filter it returns every status.
 */
async function fetchMalList(token: string): Promise<MalListEntry[]> {
	const data = await malGet<MalListResponse>(
		`/users/@me/animelist?fields=${MAL_LIST_FIELDS},list_status&limit=1000`,
		token,
		{ strict: true, fresh: true }
	);
	if (!data?.data) throw new Error('MyAnimeList returned an invalid list response.');
	return data.data;
}

/**
 * Repair statuses that an older sync imported as placeholders.
 *
 * Before `list_status` was requested, every remote entry was stored locally as
 * `planned` with no watched episodes. Pushing that back would wipe the real
 * statuses on MAL, so a local entry that has no watch history and is still
 * `planned` adopts the remote status before the push runs. Entries with local
 * progress or an explicit non-planned status are left alone.
 */
function repairPlaceholderStatuses(rows: MalListEntry[]): void {
	const localByMal = new Map<number, WatchlistEntry>();
	for (const entry of Object.values(get(watchlist))) {
		if (entry.malId) localByMal.set(entry.malId, entry);
	}
	if (!localByMal.size) return;

	const watchedIds = new Set<number>();
	for (const key of Object.keys(get(watchedStore))) {
		const id = Number(key.split(':')[0]);
		if (Number.isFinite(id)) watchedIds.add(id);
	}
	const progress = get(progressStore);

	for (const row of rows) {
		const local = row.node?.id ? localByMal.get(row.node.id) : undefined;
		if (!local || local.status !== 'planned') continue;
		if (watchedIds.has(local.id) || (progress[local.id]?.episode ?? 0) > 0) continue;
		let remoteStatus = malListStatus(row.list_status);
		if (remoteStatus === 'planned' && (row.list_status?.num_episodes_watched ?? 0) > 0) {
			remoteStatus = 'watching';
		}
		if (remoteStatus !== 'planned') setWatchStatus(local.id, remoteStatus);
	}
}

/**
 * Merge remote MAL rows into the local list.
 *
 * `skip` contains MAL ids whose local entries were deleted. They are kept in
 * the remote-id set for retry bookkeeping, but are not imported back.
 */
async function applyMalRows(
	rows: MalListEntry[],
	skip: Set<number> = new Set()
): Promise<{ imported: number; remoteIds: Set<number> }> {
	// Reuse ids we already know locally, then translate the rest in batches.
	// Resolving each MAL entry separately used to exhaust AniList's quota.
	const local = get(watchlist);
	const localByMal = new Map<number, WatchlistEntry>();
	for (const existing of Object.values(local)) {
		if (existing.malId) localByMal.set(existing.malId, existing);
	}
	const remoteIds = new Set<number>();
	const unknownMalIds: number[] = [];
	for (const row of rows) {
		const malId = row.node?.id;
		if (typeof malId !== 'number' || malId <= 0) continue;
		remoteIds.add(malId);
		if (!skip.has(malId) && !localByMal.has(malId)) unknownMalIds.push(malId);
	}
	const mapped = unknownMalIds.length
		? await anilistIdsForMal(unknownMalIds)
		: new Map<number, number>();

	let imported = 0;
	for (const e of rows) {
		const node = e.node;
		if (!node?.id) continue;
		if (skip.has(node.id)) continue;
		const listStatus = e.list_status ?? {};
		const status = malListStatus(listStatus);
		const epsWatched = listStatus.num_episodes_watched ?? 0;
		const malId = node.id;
		const anilistId = localByMal.get(malId)?.id ?? mapped.get(malId);
		if (!anilistId) continue; // Skip entries we can't map to AniList (routes use AniList ids)
		const existed = !!local[anilistId];
		const entry: WatchlistEntry = {
			id: anilistId,
			malId: malId,
			display: node.title_english ?? node.title ?? '',
			cover: node.main_picture?.large ?? node.main_picture?.medium ?? '',
			banner: node.main_picture?.large ?? node.main_picture?.medium ?? null,
			status,
			genres: node.genres?.map((g) => g.name) ?? [],
			score: node.mean ?? null,
			totalEpisodes: node.num_episodes ?? node.episodes ?? null,
			addedAt: Date.now()
		};
		addToWatchlist(entry, status);
		if (!existed) imported++;
		// Mark watched episodes locally (and in progress store)
		if (epsWatched > 0) {
			const total = node.num_episodes ?? node.episodes ?? null;
			for (let ep = 1; ep <= epsWatched; ep++) {
				markWatched(anilistId, ep, total);
			}
			// If all episodes watched, ensure status is completed
			if (total != null && epsWatched >= total && status !== 'completed') {
				setWatchStatus(anilistId, 'completed');
			}
		}
	}
	return { imported, remoteIds };
}

/** Pull the authenticated user's MAL anime list into the local watchlist. */
export async function importMalWatchlist(): Promise<number> {
	const token = get(settings).malToken;
	if (!token) throw new Error('Not signed in to MyAnimeList.');
	const rows = await fetchMalList(token);
	const { imported, remoteIds } = await applyMalRows(rows);
	replaceRemoteIds('mal', remoteIds);
	return imported;
}

interface MalListEntry {
	node: MalRecord;
	list_status: {
		status: string;
		num_episodes_watched: number;
		score: number;
		is_rewatching?: boolean;
	};
}

/** Push a single local entry to MAL (create or update the list entry). */
export async function pushMalEntry(id: number, status: WatchStatus, progress?: number): Promise<void> {
	const token = get(settings).malToken;
	if (!token) throw new Error('Not signed in to MyAnimeList.');
	const malStatus = MAL_STATUS_MAP[status];
	// Never omit `status`: MAL would create the entry as plan_to_watch.
	if (!malStatus) throw new Error(`Unknown watch status: ${String(status)}`);
	const body: Record<string, string | number> = {
		status: malStatus,
		// MAL has no standalone "rewatching" status — it is watching plus this
		// flag. Always write it so moving away from Rewatching clears the flag
		// instead of flipping the entry back on the next import.
		is_rewatching: status === 'rewatching' ? 'true' : 'false'
	};
	if (progress != null) body.num_watched_episodes = progress;
	await malWrite(`/anime/${id}/my_list_status`, body, token);
	rememberRemoteId('mal', id);
}

/** Remove an entry from the remote MAL list. */
export async function deleteMalEntry(id: number): Promise<void> {
	const token = get(settings).malToken;
	if (!token) return;
	await malDelete(`/anime/${id}/my_list_status`, token);
	forgetRemoteId('mal', id);
}

async function malDelete(path: string, token: string): Promise<void> {
	let res: Response;
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 10000);
		try {
			res = await fetch(`${MAL_API_PATH}${path}`, {
				method: 'DELETE',
				signal: ctrl.signal,
				headers: { ...malHeaders(), Authorization: `Bearer ${token}` }
			});
		} finally {
			clearTimeout(timer);
		}
	} catch (e) {
		if (e instanceof Error) throw e;
		throw new Error('Could not reach MyAnimeList.');
	}
	// A missing list entry already matches the desired state.
	if (!res.ok && res.status !== 404) throw await malResponseError(res);
}

/** Push progress to MAL. */
export async function pushMalProgress(
	id: number,
	ep: number,
	completed = false
): Promise<void> {
	const token = get(settings).malToken;
	if (!token) throw new Error('Not signed in to MyAnimeList.');
	await malWrite(
		`/anime/${id}/my_list_status`,
		{
			status: completed ? 'completed' : 'watching',
			num_watched_episodes: Math.max(1, ep),
			// Watching progress leaves rewatch mode, matching the local status
			// update made when the episode is marked watched.
			is_rewatching: 'false'
		},
		token
	);
	rememberRemoteId('mal', id);
}

export interface MalPushSummary {
	pushed: number;
	failed: number;
	firstError: unknown;
}

/** Push the local watchlist to MAL (status + progress). */
export async function syncToMal(): Promise<MalPushSummary> {
	const token = get(settings).malToken;
	if (!token) throw new Error('Not signed in to MyAnimeList.');
	const entries = Object.values(get(watchlist));
	if (!entries.length) return { pushed: 0, failed: 0, firstError: null };

	const progress = get(progressStore);
	const unknownAnilistIds = [
		...new Set(entries.filter((e) => !e.malId).map((e) => e.id))
	];
	const mapped = unknownAnilistIds.length
		? await malIdsForAnilist(unknownAnilistIds)
		: new Map<number, number>();

	let pushed = 0;
	let failed = 0;
	let firstError: unknown = null;
	for (const e of entries) {
		try {
			const malId = e.malId ?? mapped.get(e.id);
			// Never send an AniList id to MAL: it would update a different title.
			if (!malId) continue;
			if (!e.malId) setWatchlistMalId(e.id, malId);
			// A pending delete wins over a stale local entry.
			if (hasTombstone('mal', malId)) continue;
			// Marking a show completed clears its resume progress, so fall back
			// to the known episode count instead of sending 0 watched episodes.
			const episode =
				progress[e.id]?.episode ??
				(e.status === 'completed' && e.totalEpisodes ? e.totalEpisodes : undefined);
			await pushMalEntry(malId, e.status, episode);
			rememberRemoteId('mal', malId);
			pushed++;
		} catch (error) {
			failed++;
			firstError ??= error;
		}
	}
	if (!pushed && firstError) {
		throw firstError instanceof Error ? firstError : new Error('MyAnimeList sync failed.');
	}
	return { pushed, failed, firstError };
}

export interface MalWatchlistSyncResult {
	imported: number;
	pushed: number;
	/** Local entries removed because they disappeared from MyAnimeList. */
	removed: number;
	/** Remote entries deleted because they were removed locally. */
	deleted: number;
	failed: number;
	error?: string;
}

/** Find a local entry by its MAL id. */
function localForMal(malId: number): WatchlistEntry | undefined {
	for (const entry of Object.values(get(watchlist))) {
		if (entry.malId === malId) return entry;
	}
	return undefined;
}

/**
 * One-button, two-way MAL sync.
 *
 * Deletions are reconciled before pushing so an entry deleted on MAL is not
 * recreated, then the local list is uploaded, then the final remote list is
 * pulled back. A snapshot of the last remote list separates remote deletions
 * from titles that only exist locally.
 */
export async function syncMalWatchlist(): Promise<MalWatchlistSyncResult> {
	const token = get(settings).malToken;
	if (!token) throw new Error('Not signed in to MyAnimeList.');

	const before = getRemoteIds('mal');
	const pendingDeletes = getTombstones('mal');
	const failures: string[] = [];
	const deletedIds = new Set<number>();
	let deleted = 0;

	// Retry deletes that previously failed first.
	for (const id of pendingDeletes.keys()) {
		try {
			await deleteMalEntry(id);
			clearTombstone('mal', id);
			forgetRemoteId('mal', id);
			deletedIds.add(id);
			deleted++;
		} catch (e) {
			failures.push(e instanceof Error ? e.message : 'MyAnimeList delete failed.');
		}
	}

	// Read before pushing so a deletion made on MAL is detected.
	const beforeRows = await fetchMalList(token);
	const beforeIds = new Set<number>();
	for (const row of beforeRows) {
		const id = row.node?.id;
		if (typeof id === 'number' && id > 0) beforeIds.add(id);
	}

	// Remote deletion → remove the local mirror.
	let removed = 0;
	for (const id of before) {
		if (beforeIds.has(id)) continue;
		const local = localForMal(id);
		if (local) {
			removeFromWatchlist(local.id);
			removed++;
		}
	}

	// Local deletion → delete the remote copy if it survived.
	for (const id of before) {
		if (!beforeIds.has(id) || localForMal(id) || hasTombstone('mal', id)) continue;
		try {
			await deleteMalEntry(id);
			beforeIds.delete(id);
			deletedIds.add(id);
			forgetRemoteId('mal', id);
			deleted++;
		} catch (e) {
			failures.push(e instanceof Error ? e.message : 'MyAnimeList delete failed.');
		}
	}

	// Run the legacy placeholder repair once. Doing it on every sync would
	// override a deliberate local move to Plan to Watch when an earlier push
	// failed.
	if (malStatusRepairNeeded()) {
		repairPlaceholderStatuses(beforeRows);
		markMalStatusRepaired();
	}
	const push = await syncToMal();

	// Final read includes titles just pushed and any later remote additions.
	const rows = await fetchMalList(token);
	const remoteIds = new Set<number>();
	for (const row of rows) {
		const id = row.node?.id;
		if (typeof id === 'number' && id > 0) remoteIds.add(id);
	}

	const skip = new Set<number>(deletedIds);
	for (const id of getTombstones('mal').keys()) skip.add(id);
	const applied = await applyMalRows(rows, skip);

	replaceRemoteIds('mal', remoteIds);
	clearResolvedTombstones('mal', remoteIds);

	const failed = push.failed + failures.length;
	const first = failures[0] ?? (push.firstError instanceof Error ? push.firstError.message : '');
	return {
		imported: applied.imported,
		pushed: push.pushed,
		removed,
		deleted,
		failed,
		error: first || undefined
	};
}
