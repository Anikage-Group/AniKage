import type { DownloadEntry, SkipWindow, StreamCategory, StreamData, StreamSource } from '$lib/types';

/**
 * Anikage worker stream service.
 *
 * Requests go through the same-origin proxy at `/api/stream/[id]/[ep]`, which
 * forwards to the worker (PUBLIC_API_URL) server-side. That keeps the worker
 * URL in config only and avoids browser CORS stalls on the worker host.
 *
 * Real response shape:
 * {
 *   anilistId, malId, episode, title, player,
 *   skip:   { exist: bool, intro: "47,137", outro: "1343,1431" },
 *   servers: {
 *     "h-sub": { "Provider · Name": "https://…" },
 *     "s-sub": { … }, "dub": { … },
 *     "e-sub": { … }, "e-dub": { … },
 *     "v-sub": { … }, "v-dub": { … }
 *   },
 *   downloads: [ { server, label, url } ],
 *   providers: { … }
 * }
 *
 * Loading pipeline guarantees:
 *   1. ONE network request per episode — concurrent callers share the same
 *      in-flight promise (no request storms from prefetch + user navigation).
 *   2. A request can never hang forever — every fetch is bounded by a timeout
 *      and surfaces as a typed error instead of an endless spinner.
 *   3. A caller can walk away — passing an AbortSignal rejects only that
 *      caller; the shared request keeps running for everybody else.
 *   4. A late response can never clobber newer state — callers compare a
 *      request token before committing the result.
 */

/** How long a resolved episode's server list stays cached. */
const CACHE_TTL = 5 * 60 * 1000;

/** A request that hangs longer than this is aborted so the UI can never spin forever. */
const REQUEST_TIMEOUT = 30_000;

export type StreamErrorCode =
	| 'offline'
	| 'timeout'
	| 'not-found'
	| 'server'
	| 'invalid'
	| 'aborted';

/** Typed failure so the UI can react per reason instead of showing one blob. */
export class StreamError extends Error {
	readonly code: StreamErrorCode;
	constructor(code: StreamErrorCode, message: string) {
		super(message);
		this.code = code;
		this.name = 'StreamError';
	}
}

/** True when the failure was caused by the caller walking away. */
export function isAbortError(e: unknown): boolean {
	return e instanceof StreamError && e.code === 'aborted';
}

/* -------------------------------------------------------------------------- */
/* Response parsing                                                            */
/* -------------------------------------------------------------------------- */

/** Flatten a { label: url } map into StreamSource[]. */
function mapToSources(input: unknown): StreamSource[] {
	if (!input) return [];
	const out: StreamSource[] = [];

	if (Array.isArray(input)) {
		input.forEach((item, i) => {
			if (typeof item === 'string' && item.startsWith('http')) {
				out.push({ label: `Server ${i + 1}`, url: item });
			} else if (item && typeof item === 'object') {
				const o = item as Record<string, unknown>;
				const url = String(o.url ?? o.link ?? o.src ?? '');
				if (url.startsWith('http')) out.push({ label: String(o.label ?? o.name ?? `Server ${i + 1}`), url });
			}
		});
	} else if (typeof input === 'object') {
		for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
			if (typeof v === 'string' && v.startsWith('http')) {
				out.push({ label: k, url: v });
			} else if (v && typeof v === 'object') {
				const o = v as Record<string, unknown>;
				const url = String(o.url ?? o.link ?? o.src ?? '');
				if (url.startsWith('http')) out.push({ label: k, url });
			}
		}
	}

	return out;
}

/** Parse "47,137" | "47-137" | [47,137] | {start,end} into a SkipWindow. */
function parseSkip(input: unknown): SkipWindow | null {
	if (input == null || input === false) return null;

	if (typeof input === 'string') {
		const parts = input.split(/[,;-]/).map((s) => Number(s.trim()));
		if (parts.length >= 2 && parts.every(Number.isFinite) && parts[1] > parts[0]) {
			return { start: parts[0], end: parts[1] };
		}
		return null;
	}

	if (Array.isArray(input) && input.length >= 2) {
		const [a, b] = input.map(Number);
		if (Number.isFinite(a) && Number.isFinite(b) && b > a) return { start: a, end: b };
		return null;
	}

	if (typeof input === 'object') {
		const o = input as Record<string, unknown>;
		const start = Number(o.start ?? o.from ?? o.begin ?? NaN);
		const end = Number(o.end ?? o.to ?? o.finish ?? NaN);
		if (Number.isFinite(start) && Number.isFinite(end) && end > start) return { start, end };
	}

	return null;
}

function parseDownloads(input: unknown): DownloadEntry[] {
	if (!Array.isArray(input)) return [];
	const out: DownloadEntry[] = [];
	for (const item of input) {
		if (!item || typeof item !== 'object') continue;
		const o = item as Record<string, unknown>;
		const url = String(o.url ?? o.link ?? '');
		if (!url.startsWith('http')) continue;
		const server = o.server ? String(o.server) : '';
		const label = String(o.label ?? o.name ?? 'Download');
		const entry: DownloadEntry = { label: server ? `${label} · ${server}` : label, url };
		if (o.quality) entry.quality = String(o.quality);
		out.push(entry);
	}
	return out;
}

/** Turn a raw worker payload into the normalized shape the app uses. */
function normalize(raw: Record<string, unknown>): StreamData {
	const srv = (raw.servers ?? {}) as Record<string, unknown>;

	// Keep each provider category separate so the selector can show them grouped.
	const groups: Record<StreamCategory, StreamSource[]> = {
		'h-sub': mapToSources(srv['h-sub']),
		's-sub': mapToSources(srv['s-sub']),
		'dub': mapToSources(srv['dub']),
		'e-sub': mapToSources(srv['e-sub']),
		'e-dub': mapToSources(srv['e-dub']),
		'v-sub': mapToSources(srv['v-sub']),
		'v-dub': mapToSources(srv['v-dub'])
	};

	const skipRaw = (raw.skip ?? {}) as Record<string, unknown>;

	return {
		groups,
		skip: {
			intro: parseSkip(skipRaw.intro ?? skipRaw.opening ?? skipRaw.op),
			outro: parseSkip(skipRaw.outro ?? skipRaw.ending ?? skipRaw.ed)
		},
		downloads: parseDownloads(raw.downloads ?? raw.download ?? raw.dl)
	};
}

/* -------------------------------------------------------------------------- */
/* Request pipeline                                                            */
/* -------------------------------------------------------------------------- */

interface CacheEntry {
	data: StreamData;
	at: number;
}

/** Resolved data, keyed by episode. */
const cache = new Map<string, CacheEntry>();

/** In-flight requests, keyed by episode — shared by every concurrent caller. */
const inflight = new Map<string, Promise<StreamData>>();

function cacheKey(anilistId: number, epNo: number): string {
	return `${anilistId}:${epNo}`;
}

/** Perform the actual network round-trip (one per episode at a time). */
async function request(anilistId: number, epNo: number, key: string): Promise<StreamData> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);

	try {
		let res: Response;
		try {
			// Same-origin proxy — no cross-origin handshake, so the request
			// can never stall the way a direct worker fetch can.
			res = await fetch(`/api/stream/${anilistId}/${epNo}`, { signal: ctrl.signal });
		} catch {
			if (ctrl.signal.aborted) {
				throw new StreamError('timeout', 'Server list took too long to load. Try again.');
			}
			throw new StreamError('offline', 'Stream service unreachable. Check your connection.');
		}

		if (!res.ok) {
			if (res.status === 404) {
				throw new StreamError('not-found', 'No streams indexed for this episode yet.');
			}
			if (res.status === 504) {
				throw new StreamError('timeout', 'Server list took too long to load. Try again.');
			}
			throw new StreamError('server', `Stream service failed (${res.status}).`);
		}

		let raw: Record<string, unknown>;
		try {
			raw = (await res.json()) as Record<string, unknown>;
		} catch {
			throw new StreamError('invalid', 'Invalid stream data received.');
		}

		const data = normalize(raw);
		cache.set(key, { data, at: Date.now() });
		return data;
	} finally {
		clearTimeout(timer);
	}
}

/** Reject only this caller when they abort; the shared request keeps running. */
function withSignal<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(new StreamError('aborted', 'Request cancelled.'));
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new StreamError('aborted', 'Request cancelled.'));
		signal.addEventListener('abort', onAbort, { once: true });
		p.then(
			(v) => {
				signal.removeEventListener('abort', onAbort);
				resolve(v);
			},
			(e) => {
				signal.removeEventListener('abort', onAbort);
				reject(e);
			}
		);
	});
}

export interface StreamOptions {
	/** Bypass the cache and refetch from the worker. */
	force?: boolean;
	/** Cancel this caller's wait without cancelling the shared request. */
	signal?: AbortSignal;
}

export function getStream(
	anilistId: number,
	epNo: number,
	opts: StreamOptions = {}
): Promise<StreamData> {
	const key = cacheKey(anilistId, epNo);

	if (opts.force) {
		cache.delete(key);
	} else {
		const hit = cache.get(key);
		if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.data);
	}

	// Reuse the in-flight request so a prefetch + a navigation never double up.
	let p = inflight.get(key);
	if (!p) {
		p = request(anilistId, epNo, key);
		inflight.set(key, p);
		// Drop the entry once it settles so failures can be retried.
		p.catch(() => {}).then(() => {
			if (inflight.get(key) === p) inflight.delete(key);
		});
	}

	return opts.signal ? withSignal(p, opts.signal) : p;
}

/** Drop one episode from the cache (used by the manual retry). */
export function invalidateStream(anilistId: number, epNo: number): void {
	cache.delete(cacheKey(anilistId, epNo));
}

/** Drop every cached episode. */
export function clearStreamCache(): void {
	cache.clear();
}

/** Warm the stream cache for an episode (e.g. the next one) so it loads instantly. */
export function prefetchStream(anilistId: number, epNo: number): void {
	if (epNo < 1) return;
	getStream(anilistId, epNo).catch(() => {});
}
