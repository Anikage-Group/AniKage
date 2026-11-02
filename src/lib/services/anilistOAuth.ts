import { get } from 'svelte/store';
import { settings, updateSetting } from '$lib/stores/settings';
import { watchlist, addToWatchlist, setWatchStatus, removeFromWatchlist } from '$lib/stores/watchlist';
import { markWatched, progress as progressStore } from '$lib/stores/history';
import {
	ANILIST_AUTH_URL,
	ANILIST_CLIENT_ID,
	ANILIST_GRAPHQL,
	ANILIST_CALLBACK_PATH,
	anilistRedirectUri
} from '$lib/config';
import {
	clearResolvedTombstones,
	clearTombstone,
	forgetRemoteId,
	getRemoteIds,
	getTombstones,
	hasTombstone,
	rememberRemoteId,
	replaceRemoteIds,
	resetProvider
} from '$lib/stores/sync';
import type { WatchStatus, WatchlistEntry } from '$lib/types';

/**
 * AniList OAuth (Authorization Code) client + watchlist sync.
 * Token lives in localStorage via the settings store; the secret is only ever
 * used by the /api/anilist/token server route.
 */

/** Where the redirect URI used for this login is remembered between the
 *  authorize request and the callback (sessionStorage is per-origin). */
const REDIRECT_KEY = 'anikage:anilist-redirect';

function rememberRedirect(uri: string): void {
	try {
		sessionStorage.setItem(REDIRECT_KEY, uri);
	} catch {
		/* private mode / storage disabled */
	}
}

function recallRedirect(): string {
	try {
		return sessionStorage.getItem(REDIRECT_KEY) || anilistRedirectUri();
	} catch {
		return anilistRedirectUri();
	}
}

/** Redirect the browser to AniList's consent screen. */
export function startLogin(): void {
	// Use the origin the user is on right now, so the callback comes back to
	// this device instead of a fixed (possibly unreachable) host.
	const redirect = anilistRedirectUri();
	rememberRedirect(redirect);
	const params = new URLSearchParams({
		client_id: ANILIST_CLIENT_ID,
		redirect_uri: redirect,
		response_type: 'code'
	});
	location.href = `${ANILIST_AUTH_URL}?${params}`;
}

/** Exchange an authorization code for an access token (via our server route). */
export async function exchangeCode(code: string): Promise<string> {
	const res = await fetch('/api/anilist/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code, redirect_uri: recallRedirect() })
	});
	const data = await res.json();
	if (!res.ok || !data.access_token) throw new Error(data.error ?? 'Token exchange failed');
	return data.access_token as string;
}

const RATE_LIMIT_FALLBACK_MS = 60_000;
let rateLimitedUntil = 0;

/** AniList rejected a request because the user's request budget is spent. */
export class AnilistRateLimitError extends Error {
	constructor(waitMs: number) {
		const seconds = Math.max(1, Math.ceil(waitMs / 1000));
		super(`AniList is rate-limiting sync requests. Please try again in ${seconds}s.`);
		this.name = 'AnilistRateLimitError';
	}
}

export function isAnilistRateLimit(error: unknown): boolean {
	return error instanceof AnilistRateLimitError;
}

/** Respect AniList's reset/retry headers when it tells us how long to wait. */
function rateLimitWait(res: Response): number {
	const retryAfter = Number(res.headers.get('retry-after'));
	if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;

	const reset = Number(res.headers.get('x-ratelimit-reset'));
	if (Number.isFinite(reset) && reset > 0) {
		// AniList sends this as a Unix timestamp in seconds.
		const wait = (reset > 1e12 ? reset : reset * 1000) - Date.now();
		if (wait > 0) return Math.min(wait, 5 * 60_000);
	}
	return RATE_LIMIT_FALLBACK_MS;
}

/** Authenticated GraphQL helper — attaches the stored bearer token. */
async function agql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
	const token = get(settings).anilistToken;
	if (!token) throw new Error('Not signed in to AniList.');

	const wait = rateLimitedUntil - Date.now();
	if (wait > 0) throw new AnilistRateLimitError(wait);

	const res = await fetch(ANILIST_GRAPHQL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({ query, variables })
	});
	const json = (await res.json().catch(() => ({}))) as {
		data?: T;
		errors?: { message?: string; status?: number }[];
	};
	const gqlError = json.errors?.[0];
	// AniList sometimes returns its rate limit as a GraphQL error (HTTP 200),
	// so inspect both the status code and the error payload.
	const limited =
		res.status === 429 ||
		gqlError?.status === 429 ||
		/too many requests|rate.?limit/i.test(gqlError?.message ?? '');
	if (limited) {
		const waitMs = rateLimitWait(res);
		rateLimitedUntil = Date.now() + waitMs;
		throw new AnilistRateLimitError(waitMs);
	}
	if (res.status === 401 || res.status === 403) {
		throw new Error('Your AniList session expired — sign in again.');
	}
	if (!res.ok) throw new Error(`AniList request failed (${res.status}).`);
	if (json.errors?.length) throw new Error(gqlError?.message ?? 'AniList request failed.');
	if (json.data === undefined || json.data === null) {
		throw new Error('AniList returned an empty response.');
	}
	return json.data;
}

export interface Viewer {
	id: number;
	name: string;
	avatar: string | null;
}

/** Fetch the signed-in AniList viewer, persisting id + handle. */
export async function fetchViewer(): Promise<Viewer> {
	const data = await agql<{ Viewer: { id: number; name: string; avatar?: { large?: string } } }>(
		`query { Viewer { id name avatar { large } } }`
	);
	const v = data.Viewer;
	updateSetting('anilistUserId', v.id);
	updateSetting('anilistHandle', v.name);
	updateSetting('anilistAvatar', v.avatar?.large ?? '');
	return { id: v.id, name: v.name, avatar: v.avatar?.large ?? null };
}

/** Public profile URL of the signed-in user. */
export function anilistProfileUrl(handle = get(settings).anilistHandle): string {
	return handle ? `https://anilist.co/user/${encodeURIComponent(handle)}` : 'https://anilist.co';
}

/** Counts of the user's AniList anime list, grouped by status. */
export interface AccountStats {
	total: number;
	watching: number;
	completed: number;
	planned: number;
	dropped: number;
	paused: number;
	rewatching: number;
}

/** Read the signed-in user's AniList list sizes (shown on the settings page). */
export async function fetchAccountStats(): Promise<AccountStats> {
	const storedId = get(settings).anilistUserId;
	const userId = storedId ?? (await fetchViewer()).id;
	const data = await agql<{
		MediaListCollection: { lists: { status: string; entries: { id: number }[] }[] } | null;
	}>(
		`query ($userId: Int) {
			MediaListCollection(userId: $userId, type: ANIME) {
				lists { status entries { id } }
			}
		}`,
		{ userId }
	);
	const stats: AccountStats = {
		total: 0,
		watching: 0,
		completed: 0,
		planned: 0,
		dropped: 0,
		paused: 0,
		rewatching: 0
	};
	for (const list of data.MediaListCollection?.lists ?? []) {
		const n = list.entries.length;
		stats.total += n;
		switch (list.status) {
			case 'CURRENT':
				stats.watching += n;
				break;
			case 'COMPLETED':
				stats.completed += n;
				break;
			case 'PLANNING':
				stats.planned += n;
				break;
			case 'DROPPED':
				stats.dropped += n;
				break;
			case 'PAUSED':
				stats.paused += n;
				break;
			case 'REPEATING':
				stats.rewatching += n;
				break;
		}
	}
	return stats;
}

const STATUS_MAP: Record<WatchStatus, string> = {
	watching: 'CURRENT',
	completed: 'COMPLETED',
	planned: 'PLANNING',
	rewatching: 'REPEATING',
	dropped: 'DROPPED',
	paused: 'PAUSED'
};
const REV_STATUS_MAP: Record<string, WatchStatus> = {
	CURRENT: 'watching',
	COMPLETED: 'completed',
	PLANNING: 'planned',
	REPEATING: 'rewatching',
	DROPPED: 'dropped',
	PAUSED: 'paused'
};

/** One row from MediaListCollection used by imports and sync reconciliation. */
interface AnilistListEntry {
	mediaId: number;
	status: string;
	progress: number;
	/** The user's own rating for the entry — a plain Float, not an object. */
	score: number | null;
	media: {
		id: number;
		idMal: number | null;
		title: { romaji: string; english: string | null };
		coverImage: { extraLarge: string };
		bannerImage: string | null;
		genres: string[];
		averageScore: number | null;
		episodes: number | null;
	} | null;
}

/** Download the signed-in user's complete AniList anime list. */
async function fetchAnilistList(): Promise<AnilistListEntry[]> {
	// AniList requires an explicit user id for MediaListCollection — fall back
	// to the viewer's own id when the stored one is missing.
	const storedId = get(settings).anilistUserId;
	const userId = storedId ?? (await fetchViewer()).id;

	const data = await agql<{
		MediaListCollection: { lists: { status: string; entries: AnilistListEntry[] }[] } | null;
	}>(
		`query ($userId: Int) {
			MediaListCollection(userId: $userId, type: ANIME) {
				lists { status entries {
					mediaId status progress
					score
					media { id idMal title { romaji english } coverImage { extraLarge } bannerImage genres averageScore episodes }
				} }
			}
		}`,
		{ userId }
	);
	const rows: AnilistListEntry[] = [];
	for (const list of data.MediaListCollection?.lists ?? []) {
		rows.push(...list.entries);
	}
	return rows;
}

/**
 * Merge remote rows into the local list.
 *
 * `skip` contains ids the user deleted locally (pending deletes or deletes
 * that just succeeded), so a failed remote delete cannot re-import them.
 */
function applyAnilistRows(
	rows: AnilistListEntry[],
	skip: Set<number> = new Set()
): { imported: number; remoteIds: Set<number> } {
	const local = get(watchlist);
	const remoteIds = new Set<number>();
	let imported = 0;

	for (const e of rows) {
		const m = e.media;
		if (!m) continue;
		remoteIds.add(m.id);
		if (skip.has(m.id)) continue;

		const status = REV_STATUS_MAP[e.status] ?? 'planned';
		// Count only titles that are new locally; status/progress updates on an
		// existing entry are still applied.
		if (!local[m.id]) imported++;
		const entry: WatchlistEntry = {
			id: m.id,
			malId: m.idMal,
			display: m.title.english || m.title.romaji,
			cover: m.coverImage.extraLarge,
			banner: m.bannerImage,
			status,
			genres: m.genres ?? [],
			score: m.averageScore,
			totalEpisodes: m.episodes,
			addedAt: Date.now()
		};
		addToWatchlist(entry, status);
		// Mirror AniList progress locally so Continue Watching and "watched"
		// state stay in step after import/sync.
		if (e.progress && e.progress > 0) {
			const total = m.episodes ?? null;
			for (let ep = 1; ep <= e.progress; ep++) {
				markWatched(m.id, ep, total);
			}
			if (total != null && e.progress >= total && status !== 'completed') {
				setWatchStatus(m.id, 'completed');
			}
		}
	}
	return { imported, remoteIds };
}

/** Pull the authenticated user's AniList anime list into the local watchlist. */
export async function importWatchlist(): Promise<number> {
	const rows = await fetchAnilistList();
	const { imported, remoteIds } = applyAnilistRows(rows);
	replaceRemoteIds('anilist', remoteIds);
	return imported;
}

/** Push a single local entry to AniList (create or update the list entry). */
export async function pushEntry(id: number, status: WatchStatus, progress?: number): Promise<void> {
	const token = get(settings).anilistToken;
	if (!token) return;
	const vars: Record<string, unknown> = {
		mediaId: id,
		status: STATUS_MAP[status]
	};
	if (progress != null) vars.progress = progress;
	await agql(
		`mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
			SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) { id status }
		}`,
		vars
	);
	rememberRemoteId('anilist', id);
}

/**
 * Remove an entry from the remote AniList list.
 *
 * DeleteMediaListEntry expects the list-entry id, not the media id, so resolve
 * it first. A missing entry is already in the desired state.
 */
export async function deleteEntry(mediaId: number): Promise<void> {
	const token = get(settings).anilistToken;
	if (!token) return;
	const data = await agql<{ Media: { mediaListEntry: { id: number } | null } | null }>(
		`query ($mediaId: Int) { Media(id: $mediaId) { mediaListEntry { id } } }`,
		{ mediaId }
	);
	const entryId = data.Media?.mediaListEntry?.id;
	if (!entryId) return;
	await agql(`mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`, {
		id: entryId
	});
	forgetRemoteId('anilist', mediaId);
}

/**
 * Push how many episodes the user has watched to AniList.
 *
 * AniList tracks progress as a count of finished episodes, so the episode
 * that just got watched becomes the new progress value. The last episode of
 * a show flips the entry to COMPLETED.
 */
export async function pushProgress(
	id: number,
	ep: number,
	completed = false
): Promise<void> {
	const token = get(settings).anilistToken;
	if (!token) return;
	await agql(
		`mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
			SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) { id status progress }
		}`,
		{ mediaId: id, status: completed ? 'COMPLETED' : 'CURRENT', progress: Math.max(1, ep) }
	);
	rememberRemoteId('anilist', id);
}

export interface AnilistPushSummary {
	pushed: number;
	failed: number;
	firstError: unknown;
}

/** Push the local watchlist to AniList (status + progress). */
export async function syncToAnilist(): Promise<AnilistPushSummary> {
	if (!get(settings).anilistToken) throw new Error('Not signed in to AniList.');
	const entries = Object.values(get(watchlist));
	if (!entries.length) return { pushed: 0, failed: 0, firstError: null };

	const progress = get(progressStore);
	let pushed = 0;
	let failed = 0;
	let firstError: unknown = null;
	for (const e of entries) {
		try {
			// A pending delete wins over a stale local entry. Re-adding through the
			// UI clears the tombstone before this runs.
			if (hasTombstone('anilist', e.id)) continue;
			// Marking a show completed clears its resume progress, so fall back
			// to the known episode count instead of sending no progress at all.
			const episode =
				progress[e.id]?.episode ??
				(e.status === 'completed' && e.totalEpisodes ? e.totalEpisodes : undefined);
			await pushEntry(e.id, e.status, episode);
			pushed++;
		} catch (error) {
			failed++;
			firstError ??= error;
			// Once AniList starts throttling, every following write would fail
			// too. Stop immediately and tell the user what got through.
			if (isAnilistRateLimit(error)) break;
		}
	}
	if (isAnilistRateLimit(firstError)) {
		throw new Error(
			`AniList rate limit reached after ${pushed} of ${entries.length} entries. Please try again in a minute.`
		);
	}
	if (!pushed && firstError) {
		throw firstError instanceof Error ? firstError : new Error('AniList sync failed.');
	}
	return { pushed, failed, firstError };
}

export interface AnilistWatchlistSyncResult {
	imported: number;
	pushed: number;
	/** Local entries removed because they disappeared from AniList. */
	removed: number;
	/** Remote entries deleted because they were removed locally. */
	deleted: number;
	failed: number;
	error?: string;
}

/**
 * One-button, two-way sync.
 *
 * 1. Retry any deletes that failed while the user was adding/removing titles.
 * 2. Read AniList before pushing so a remote deletion is not recreated.
 * 3. Remove local entries deleted on AniList and delete remote entries deleted
 *    locally, using the previous sync snapshot to distinguish the two.
 * 4. Upload the surviving local statuses/progress.
 * 5. Pull the final remote list back, skipping pending deletions.
 */
export async function syncAnilistWatchlist(): Promise<AnilistWatchlistSyncResult> {
	if (!get(settings).anilistToken) throw new Error('Not signed in to AniList.');

	const before = getRemoteIds('anilist');
	const pendingDeletes = getTombstones('anilist');
	const failures: string[] = [];
	let deleted = 0;
	const deletedIds = new Set<number>();

	// Retry deletes that previously failed before looking at the remote list.
	for (const id of pendingDeletes.keys()) {
		try {
			await deleteEntry(id);
			clearTombstone('anilist', id);
			forgetRemoteId('anilist', id);
			deletedIds.add(id);
			deleted++;
		} catch (e) {
			failures.push(e instanceof Error ? e.message : 'AniList delete failed.');
		}
	}

	// Read the remote list BEFORE pushing. Otherwise an entry the user deleted
	// on AniList would be recreated by the push and the deletion would be lost.
	const beforeRows = await fetchAnilistList();
	const beforeIds = new Set<number>();
	for (const row of beforeRows) if (row.media?.id) beforeIds.add(row.media.id);

	// Remote deletion → remove the local mirror. Only ids that were present at
	// the last sync are trusted, so a title added locally but never pushed is
	// not mistaken for a remote deletion.
	let removed = 0;
	for (const id of before) {
		if (!beforeIds.has(id) && get(watchlist)[id]) {
			removeFromWatchlist(id);
			removed++;
		}
	}

	// Local deletion → delete the remote copy if it survived. (Tombstones were
	// retried above; this also covers deletions made before tombstones existed.)
	for (const id of before) {
		if (!beforeIds.has(id) || get(watchlist)[id] || hasTombstone('anilist', id)) continue;
		try {
			await deleteEntry(id);
			beforeIds.delete(id);
			deletedIds.add(id);
			forgetRemoteId('anilist', id);
			deleted++;
		} catch (e) {
			failures.push(e instanceof Error ? e.message : 'AniList delete failed.');
		}
	}

	// Push the surviving local entries after deletion reconciliation.
	const push = await syncToAnilist();

	// Final read picks up titles that were just pushed and anything added on
	// AniList since the first read.
	const rows = await fetchAnilistList();
	const remoteIds = new Set<number>();
	for (const row of rows) if (row.media?.id) remoteIds.add(row.media.id);

	const skip = new Set<number>(deletedIds);
	for (const id of getTombstones('anilist').keys()) skip.add(id);
	const applied = applyAnilistRows(rows, skip);

	replaceRemoteIds('anilist', remoteIds);
	clearResolvedTombstones('anilist', remoteIds);

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

export function logout(): void {
	updateSetting('anilistToken', '');
	updateSetting('anilistUserId', null);
	updateSetting('anilistHandle', '');
	updateSetting('anilistAvatar', '');
	resetProvider('anilist');
}

export function isLoggedIn(): boolean {
	return !!get(settings).anilistToken;
}

export { ANILIST_CALLBACK_PATH };
