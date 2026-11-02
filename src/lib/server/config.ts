import { env } from '$env/dynamic/private';

/**
 * Server-only secrets. Never import this module from client code — only from
 * `+server.ts` endpoints or other server-only files under `src/lib/server`.
 */
export const ANILIST_CLIENT_SECRET: string = env.ANILIST_CLIENT_SECRET ?? '';

/**
 * MyAnimeList OAuth client secret.
 *
 * MyAnimeList's token endpoint expects the secret even for PKCE clients, and it
 * must never reach the browser — the exchange happens in /api/mal/token.
 */
export const MAL_CLIENT_SECRET: string = env.MAL_CLIENT_SECRET ?? '';
