import { env } from '$env/dynamic/public';

/**
 * Central runtime config. The Anikage API base URL lives ONLY here (sourced
 * from the PUBLIC_API_URL env var) — no other module should hardcode it.
 *
 * This module is browser-safe: it must never import `$env/dynamic/private`.
 * Server-only secrets live in `src/lib/server/config.ts`.
 */
export const API_URL: string = (env.PUBLIC_API_URL ?? 'https://api.anikage.workers.dev').replace(
	/\/+$/,
	''
);

/** Third-party ani.zip artwork/episode-metadata host (separate from the Anikage worker). */
export const ANIZIP_URL: string = (env.PUBLIC_ANIZIP_URL ?? 'https://api.ani.zip').replace(
	/\/+$/,
	''
);

export const ANILIST_CLIENT_ID: string = env.PUBLIC_ANILIST_CLIENT_ID ?? '';

export const SITE_URL: string = (
	env.PUBLIC_SITE_URL ?? (typeof location !== 'undefined' ? location.origin : '')
).replace(/\/+$/, '');

/**
 * Public project links shown in the footer.
 *
 * Both values are environment-defined: the API link always follows the same
 * `PUBLIC_API_URL` used for data calls, while the repository link is supplied
 * by `PUBLIC_SOURCE_CODE_URL` so a fork can point at its own source.
 */
export const PROJECT_LINKS = {
	sourceCode: env.PUBLIC_SOURCE_CODE_URL ?? 'https://github.com/anikage',
	api: API_URL
} as const;

/** AniList OAuth authorize endpoint. */
export const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
/** AniList OAuth token endpoint (server-side exchange). */
export const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
/** Canonical OAuth callback path handled by src/routes/auth/anilist/callback. */
export const ANILIST_CALLBACK_PATH = '/auth/anilist/callback';
export const ANILIST_REDIRECT_URI = `${SITE_URL}${ANILIST_CALLBACK_PATH}`;

/**
 * OAuth redirect URI for the origin the browser is currently on.
 *
 * The site is reached from several origins during development (localhost, and
 * a LAN IP when testing on a phone). A fixed redirect URI sends the phone back
 * to its own empty `localhost`, which 404s. Following the current origin keeps
 * the callback on the device that started the login.
 */
export function anilistRedirectUri(): string {
	if (typeof location !== 'undefined' && location.origin) {
		return `${location.origin}${ANILIST_CALLBACK_PATH}`;
	}
	return ANILIST_REDIRECT_URI;
}

/** Public AniList GraphQL endpoint. */
export const ANILIST_GRAPHQL: string = env.PUBLIC_ANILIST_URL ?? 'https://graphql.anilist.co';

/**
 * Fallback metadata sources, used while AniList is unavailable.
 * Tenrai and Jikan both serve MyAnimeList-shaped records.
 */
export const TENRAI_URL: string = env.PUBLIC_TENRAI_URL ?? 'https://api.tenrai.dev/v1';
export const JIKAN_URL: string = env.PUBLIC_JIKAN_URL ?? 'https://api.jikan.moe/v4';
export const KITSU_URL: string = env.PUBLIC_KITSU_URL ?? 'https://kitsu.io/api/edge';

/** The official MyAnimeList API and its OAuth endpoints. */
export const MAL_API_URL: string = env.PUBLIC_MAL_API_URL ?? 'https://api.myanimelist.net/v2';

/**
 * Same-origin path the MyAnimeList API is reached through.
 *
 * api.myanimelist.net sends no `Access-Control-Allow-Origin`, and every call
 * carries a custom `X-MAL-CLIENT-ID` header, so the browser's preflight fails
 * with a CORS error. Browser code therefore calls `/api/mal/...` and the server
 * route forwards it to `MAL_API_URL` (adding the client id itself).
 */
export const MAL_API_PATH = '/api/mal';

export const MAL_AUTH_URL: string = env.PUBLIC_MAL_AUTH_URL ?? 'https://myanimelist.net/v1/oauth2/authorize';
export const MAL_TOKEN_URL: string = env.PUBLIC_MAL_TOKEN_URL ?? 'https://myanimelist.net/v1/oauth2/token';
export const MAL_CLIENT_ID: string = env.PUBLIC_MAL_CLIENT_ID ?? '';

/** Canonical MyAnimeList OAuth callback path. */
export const MAL_CALLBACK_PATH = '/auth/mal/callback';
export const MAL_REDIRECT_URI = `${SITE_URL}${MAL_CALLBACK_PATH}`;

/** MyAnimeList redirect URI for the origin the browser is currently on. */
export function malRedirectUri(): string {
	if (typeof location !== 'undefined' && location.origin) {
		return `${location.origin}${MAL_CALLBACK_PATH}`;
	}
	return MAL_REDIRECT_URI;
}

/**
 * Which metadata sources to use, in order.
 *
 * Letters: `a` = AniList, `j` = Jikan, `t` = Tenrai, `k` = Kitsu,
 * `m` = MyAnimeList.
 * The order is honoured everywhere, so `PUBLIC_SOURCE_ORDER=j` means Jikan is
 * the only source that is ever queried.
 */
export const SOURCE_ORDER: string[] = (env.PUBLIC_SOURCE_ORDER ?? 'a,j,t,k')
	.split(',')
	.map((s) => s.trim().toLowerCase())
	.filter((s) => 'ajtkm'.includes(s) && s.length === 1);

/** Whether a source letter is enabled in `PUBLIC_SOURCE_ORDER`. */
export function sourceEnabled(letter: string): boolean {
	return SOURCE_ORDER.includes(letter);
}

/**
 * Whether a source is the primary (first) entry in `PUBLIC_SOURCE_ORDER`.
 *
 * Availability alone is not enough: when MyAnimeList is listed first, AniList
 * must not answer, even though it is also enabled. Every primary path checks
 * this instead of `sourceEnabled`.
 */
export function sourceIsFirst(letter: string): boolean {
	return SOURCE_ORDER[0] === letter;
}
