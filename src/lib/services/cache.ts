/**
 * Shared TTL cache for the metadata services.
 *
 * Every source gets its own namespace, so a cached Jikan page can never be
 * mistaken for a Kitsu one. Entries live in memory for the session, are
 * mirrored to localStorage (quota-safe) and expire on their own TTL — that is
 * what keeps AniList's 429 limiter, Jikan's three-requests-a-second cap, Kitsu
 * and MyAnimeList's quotas quiet while a page is being paged through.
 *
 * Sources and their lifetimes (see the services):
 *   anilist  3h   — GraphQL responses, the best data available
 *   jikan    30m  — MyAnimeList mirror
 *   tenrai   30m  — MyAnimeList-compatible mirror
 *   kitsu    1h   — Kitsu
 *   mal      1h   — official MyAnimeList v2 API
 *   anizip   24h  — artwork, episodes and id mappings (rarely change)
 *   meta     varies — assembled views (one entry per request) kept for a
 *            week so an outage can still answer from the last good copy
 *
 * Schedules use a much shorter lifetime (10 minutes) because an airing time
 * that is a few hours stale is simply wrong.
 */

interface Entry {
	/** When the value was stored (ms). */
	t: number;
	/** When it stops being usable (ms). */
	e: number;
	/** The stored value. */
	v: unknown;
}

/** How many entries a namespace keeps when it has no explicit cap. */
const DEFAULT_MAX = 40;

/**
 * Per-namespace caps. ani.zip documents carry whole episode lists, so they are
 * kept to a handful; the query caches can afford many more.
 */
const MAX_BY_NAMESPACE: Record<string, number> = {
	anilist: 60,
	jikan: 24,
	tenrai: 24,
	kitsu: 12,
	mal: 20,
	anizip: 6,
	meta: 60
};

/**
 * How long an expired entry may still be served when every live source fails.
 *
 * Only assembled views (`meta`) are kept this long: they are small, and they
 * are what lets the site open a title or a page of results during a total
 * outage. Raw source payloads (ani.zip documents, Kitsu pages) are dropped as
 * soon as they expire so the quota stays available for fresh answers.
 */
const STALE_MAX = 1000 * 60 * 60 * 24 * 7;

/**
 * Rough ceiling for one namespace in localStorage. Serialised characters are
 * about a byte each here, and the whole origin only gets ~5 MB, so each source
 * keeps itself small and the rest of the app still has room.
 */
const MAX_NAMESPACE_CHARS = 1_400_000;

const PREFIX = 'anikage:cache:';
/** Separates the namespace from the key inside the in-memory map. */
const SEP = '\u0000';

const memory = new Map<string, Entry>();
/** Namespaces already read from localStorage this session. */
const restored = new Set<string>();
/** Namespaces whose in-memory copy differs from storage. */
const dirty = new Set<string>();
/** One in-flight load per key, so a burst of identical reads hits the API once. */
const inflight = new Map<string, Promise<unknown>>();

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function namespaceMax(ns: string): number {
	return MAX_BY_NAMESPACE[ns] ?? DEFAULT_MAX;
}

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		/* private mode / storage disabled */
		return null;
	}
}

function composite(ns: string, key: string): string {
	return ns + SEP + key;
}

/**
 * Storage keys from before the shared cache existed. Their contents are
 * migrated once and the old key is deleted, so the quota is not paid twice.
 */
const LEGACY_KEYS: Record<string, string> = {
	anilist: 'anikage:anilist-cache'
};

/** Load one namespace from localStorage the first time it is touched. */
function restore(ns: string): void {
	if (restored.has(ns)) return;
	restored.add(ns);
	const store = storage();
	if (!store) return;
	try {
		const raw = store.getItem(PREFIX + ns);
		if (raw) {
			const parsed = JSON.parse(raw) as Record<string, Entry>;
			const now = Date.now();
			for (const [key, entry] of Object.entries(parsed)) {
				const fresh = entry && typeof entry.e === 'number' && entry.e > now;
				// Expired assembled views stay around as the outage copy; raw
				// source payloads are dropped the moment they expire.
				const stale = ns === 'meta' && entry && typeof entry.t === 'number' && now - entry.t <= STALE_MAX;
				if (!fresh && !stale) continue;
				memory.set(composite(ns, key), entry);
			}
		}
	} catch {
		/* corrupted storage → start empty */
	}

	// Old per-service cache format: `{ [key]: { t, data } }` with a 3h life.
	const legacyKey = LEGACY_KEYS[ns];
	if (legacyKey) {
		try {
			const raw = store.getItem(legacyKey);
			if (raw) {
				const parsed = JSON.parse(raw) as Record<string, { t?: number; data?: unknown }>;
				const now = Date.now();
				const ttl = 1000 * 60 * 60 * 3;
				let migrated = false;
				for (const [key, entry] of Object.entries(parsed)) {
					if (!entry || typeof entry.t !== 'number') continue;
					if (now - entry.t >= ttl) continue;
					if (memory.has(composite(ns, key))) continue;
					memory.set(composite(ns, key), { t: entry.t, e: entry.t + ttl, v: entry.data });
					migrated = true;
				}
				store.removeItem(legacyKey);
				if (migrated) scheduleSave(ns);
			}
		} catch {
			/* unreadable legacy cache → just drop it */
			try {
				store.removeItem(legacyKey);
			} catch {
				/* ignore */
			}
		}
	}
}

/** Write the changed namespaces back to localStorage, newest entries first. */
function persist(): void {
	const store = storage();
	if (!store) return;

	const grouped = new Map<string, [string, Entry][]>();
	const now = Date.now();
	for (const [key, entry] of memory) {
		const at = key.indexOf(SEP);
		if (at < 0) continue;
		const ns = key.slice(0, at);
		// Expired entries are normally never written back. Assembled views keep
		// one stale copy, because that copy is the outage fallback.
		const fresh = entry.e > now;
		const stale = ns === 'meta' && now - entry.t <= STALE_MAX;
		if (!fresh && !stale) {
			memory.delete(key);
			continue;
		}
		if (!dirty.has(ns)) continue;
		const bucket = grouped.get(ns) ?? [];
		bucket.push([key.slice(at + 1), entry]);
		grouped.set(ns, bucket);
	}

	for (const [ns, entries] of grouped) {
		const cap = namespaceMax(ns);
		let rows = entries.sort((a, b) => a[1].t - b[1].t).slice(-cap);
		// A single Kitsu page (with its included resources) is ~200 KB, so the
		// entry cap alone is not enough to stay inside a 5 MB localStorage.
		let payload = JSON.stringify(Object.fromEntries(rows));
		while (payload.length > MAX_NAMESPACE_CHARS && rows.length > 1) {
			rows = rows.slice(-Math.max(1, Math.ceil(rows.length / 2)));
			payload = JSON.stringify(Object.fromEntries(rows));
		}
		try {
			store.setItem(PREFIX + ns, payload);
		} catch {
			// Out of quota → drop this namespace rather than losing the rest.
			try {
				store.removeItem(PREFIX + ns);
			} catch {
				/* ignore */
			}
		}
		dirty.delete(ns);
	}
}

/** Batched persistence: many reads/writes in a tick cost one storage write. */
function scheduleSave(ns: string): void {
	dirty.add(ns);
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		persist();
	}, 1200);
}

/* ---------------- public API ---------------- */

/** Read a cached value, or `undefined` when it is missing or expired. */
export function cacheGet<T>(ns: string, key: string): T | undefined {
	restore(ns);
	const entry = memory.get(composite(ns, key));
	if (!entry) return undefined;
	if (entry.e <= Date.now()) {
		memory.delete(composite(ns, key));
		return undefined;
	}
	return entry.v as T;
}

/**
 * Read a value even if it has expired (up to {@link STALE_MAX}).
 *
 * Used as the last line of defence: when every live source is down, an old
 * answer is still better than a blank page.
 */
export function cacheGetStale<T>(ns: string, key: string): T | undefined {
	restore(ns);
	const entry = memory.get(composite(ns, key));
	if (!entry) return undefined;
	if (Date.now() - entry.t > STALE_MAX) {
		memory.delete(composite(ns, key));
		return undefined;
	}
	return entry.v as T;
}

/** Store a value for `ttl` milliseconds. */
export function cacheSet<T>(ns: string, key: string, value: T, ttl: number): void {
	const now = Date.now();
	memory.set(composite(ns, key), { t: now, e: now + ttl, v: value });
	// Keep the in-memory map bounded even when nothing is persisted.
	if (memory.size > 600) {
		for (const [k, entry] of memory) {
			if (entry.e <= now) memory.delete(k);
		}
	}
	scheduleSave(ns);
}

/** Forget one value (used when a cached answer turns out to be unusable). */
export function cacheForget(ns: string, key: string): void {
	if (memory.delete(composite(ns, key))) scheduleSave(ns);
}

/**
 * Read through the cache.
 *
 * A hit is returned synchronously (as a resolved promise); a miss runs `load`
 * once and shares that promise with every caller waiting on the same key.
 */
export function cached<T>(ns: string, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
	const hit = cacheGet<T>(ns, key);
	if (hit !== undefined) return Promise.resolve(hit);

	const id = composite(ns, key);
	const pending = inflight.get(id);
	if (pending) return pending as Promise<T>;

	const promise = load()
		.then((value) => {
			// `null`/`undefined` are real answers for some sources; only the
			// caller knows whether to keep them, so they are stored as-is.
			cacheSet(ns, key, value, ttl);
			return value;
		})
		.finally(() => {
			inflight.delete(id);
		});

	inflight.set(id, promise);
	return promise;
}

/**
 * Read through the cache, keeping a stale copy as the outage answer.
 *
 * `load` may return `null` (all sources failed) or an empty value that the
 * caller considers unusable (`usable` decides). In both cases the previous
 * good answer is returned instead of making the view go blank.
 */
export function cachedStale<T>(
	ns: string,
	key: string,
	ttl: number,
	load: () => Promise<T>,
	usable: (value: T) => boolean = (value) => value !== null && value !== undefined
): Promise<T> {
	const hit = cacheGet<T>(ns, key);
	if (hit !== undefined && usable(hit)) return Promise.resolve(hit);

	const id = composite(ns, key);
	const pending = inflight.get(id);
	if (pending) return pending as Promise<T>;

	const promise = load()
		.then((value) => {
			if (usable(value)) {
				cacheSet(ns, key, value, ttl);
				return value;
			}
			const stale = cacheGetStale<T>(ns, key);
			if (stale !== undefined && usable(stale)) return stale;
			return value;
		})
		.catch((error: unknown) => {
			const stale = cacheGetStale<T>(ns, key);
			if (stale !== undefined && usable(stale)) return stale;
			throw error;
		})
		.finally(() => {
			inflight.delete(id);
		});

	inflight.set(id, promise);
	return promise;
}

/** Empty one namespace (or every namespace when omitted). */
export function clearCache(ns?: string): void {
	if (!ns) {
		memory.clear();
		restored.clear();
		dirty.clear();
		const store = storage();
		if (store) {
			try {
				const keys: string[] = [];
				for (let i = 0; i < store.length; i++) {
					const key = store.key(i);
					if (key && (key.startsWith(PREFIX) || Object.values(LEGACY_KEYS).includes(key))) {
						keys.push(key);
					}
				}
				for (const key of keys) store.removeItem(key);
			} catch {
				/* ignore */
			}
		}
		return;
	}
	for (const key of [...memory.keys()]) {
		if (key.startsWith(ns + SEP)) memory.delete(key);
	}
	const store = storage();
	if (store) {
		try {
			store.removeItem(PREFIX + ns);
		} catch {
			/* ignore */
		}
	}
	dirty.delete(ns);
}
