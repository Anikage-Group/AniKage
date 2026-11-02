import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAL_API_URL, MAL_CLIENT_ID } from '$lib/config';

/**
 * Same-origin proxy for the MyAnimeList API.
 *
 * api.myanimelist.net returns no `Access-Control-Allow-Origin` header, and
 * every request needs a custom `X-MAL-CLIENT-ID` header — which makes the
 * browser send a preflight that MAL never answers. Direct calls therefore fail
 * with a CORS error before any data is read.
 *
 * The browser talks to `/api/mal/...` instead; this route forwards the request
 * server-side, adds the public client id, and passes a signed-in user's bearer
 * token through untouched (the token never leaves this origin otherwise).
 *
 * `PUBLIC_MAL_API_URL` stays the single definition of the upstream base.
 */

/** Only these API areas are proxied; anything else is a 404. */
const ALLOWED = /^(anime|manga|users)(\/|$)/;

export const GET: RequestHandler = async ({ params, url, request, fetch, setHeaders }) => {
	const path = (params.path ?? '').replace(/^\/+/, '');
	if (!ALLOWED.test(path)) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	if (!MAL_CLIENT_ID) {
		return json({ error: 'PUBLIC_MAL_CLIENT_ID is not configured' }, { status: 500 });
	}

	const headers: Record<string, string> = {
		Accept: 'application/json',
		// The client id is public (it is shipped to every browser anyway), but
		// MAL will not answer without it.
		'X-MAL-CLIENT-ID': MAL_CLIENT_ID
	};
	const authorization = request.headers.get('authorization');
	if (authorization) headers.Authorization = authorization;

	try {
		const res = await fetch(`${MAL_API_URL}/${path}${url.search}`, { headers });
		const body = await res.text();
		// Answers are cached in the browser (see services/cache.ts), not here.
		setHeaders({ 'cache-control': 'no-store' });
		return new Response(body, {
			status: res.status,
			headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
		});
	} catch {
		return json({ error: 'Could not reach MyAnimeList' }, { status: 502 });
	}
};

export const POST: RequestHandler = async ({ params, url, request, fetch, setHeaders }) => {
	const path = (params.path ?? '').replace(/^\/+/, '');
	if (!ALLOWED.test(path)) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	if (!MAL_CLIENT_ID) {
		return json({ error: 'PUBLIC_MAL_CLIENT_ID is not configured' }, { status: 500 });
	}

	const headers: Record<string, string> = {
		Accept: 'application/json',
		'X-MAL-CLIENT-ID': MAL_CLIENT_ID,
		'Content-Type': request.headers.get('content-type') ?? 'application/x-www-form-urlencoded'
	};
	const authorization = request.headers.get('authorization');
	if (authorization) headers.Authorization = authorization;

	try {
		const body = await request.text();
		const res = await fetch(`${MAL_API_URL}/${path}${url.search}`, { method: 'POST', headers, body });
		const responseBody = await res.text();
		setHeaders({ 'cache-control': 'no-store' });
		return new Response(responseBody, {
			status: res.status,
			headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
		});
	} catch {
		return json({ error: 'Could not reach MyAnimeList' }, { status: 502 });
	}
};

export const PATCH: RequestHandler = async ({ params, url, request, fetch, setHeaders }) => {
	const path = (params.path ?? '').replace(/^\/+/, '');
	if (!ALLOWED.test(path)) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	if (!MAL_CLIENT_ID) {
		return json({ error: 'PUBLIC_MAL_CLIENT_ID is not configured' }, { status: 500 });
	}

	const headers: Record<string, string> = {
		Accept: 'application/json',
		'X-MAL-CLIENT-ID': MAL_CLIENT_ID,
		'Content-Type': request.headers.get('content-type') ?? 'application/x-www-form-urlencoded'
	};
	const authorization = request.headers.get('authorization');
	if (authorization) headers.Authorization = authorization;

	try {
		const body = await request.text();
		const res = await fetch(`${MAL_API_URL}/${path}${url.search}`, { method: 'PATCH', headers, body });
		const responseBody = await res.text();
		setHeaders({ 'cache-control': 'no-store' });
		return new Response(responseBody, {
			status: res.status,
			headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
		});
	} catch {
		return json({ error: 'Could not reach MyAnimeList' }, { status: 502 });
	}
};

export const DELETE: RequestHandler = async ({ params, url, request, fetch, setHeaders }) => {
	const path = (params.path ?? '').replace(/^\/+/, '');
	if (!ALLOWED.test(path)) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	if (!MAL_CLIENT_ID) {
		return json({ error: 'PUBLIC_MAL_CLIENT_ID is not configured' }, { status: 500 });
	}

	const headers: Record<string, string> = {
		Accept: 'application/json',
		'X-MAL-CLIENT-ID': MAL_CLIENT_ID
	};
	const authorization = request.headers.get('authorization');
	if (authorization) headers.Authorization = authorization;

	try {
		const res = await fetch(`${MAL_API_URL}/${path}${url.search}`, { method: 'DELETE', headers });
		const responseBody = await res.text();
		setHeaders({ 'cache-control': 'no-store' });
		return new Response(responseBody, {
			status: res.status,
			headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
		});
	} catch {
		return json({ error: 'Could not reach MyAnimeList' }, { status: 502 });
	}
};
