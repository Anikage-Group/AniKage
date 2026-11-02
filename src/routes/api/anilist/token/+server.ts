import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ANILIST_CLIENT_ID, ANILIST_REDIRECT_URI, ANILIST_TOKEN_URL, ANILIST_CALLBACK_PATH } from '$lib/config';
import { ANILIST_CLIENT_SECRET } from '$lib/server/config';

/**
 * Server-side OAuth code → token exchange. Keeps the client secret off the
 * browser. POST { code, redirect_uri? } and receives { access_token, ... }.
 *
 * The redirect URI the browser actually used is sent along: during development
 * the site runs on several origins (localhost, a LAN IP on a phone) and the
 * callback has to come back to the origin that started the login. If AniList
 * rejects that URI, the exchange is retried with the registered one.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		code?: string;
		redirect_uri?: string;
	};
	const code = body.code ?? '';
	if (!code) return json({ error: 'Missing code' }, { status: 400 });
	if (!ANILIST_CLIENT_SECRET) {
		return json({ error: 'Server missing ANILIST_CLIENT_SECRET' }, { status: 500 });
	}

	// Only ever accept a redirect URI that points back at our callback path.
	const requested =
		typeof body.redirect_uri === 'string' && body.redirect_uri.endsWith(ANILIST_CALLBACK_PATH)
			? body.redirect_uri
			: '';
	const candidates = [requested, ANILIST_REDIRECT_URI].filter(
		(v, i, a) => !!v && a.indexOf(v) === i
	);

	let lastError = 'Token exchange failed';
	let lastStatus = 400;

	for (const redirectUri of candidates) {
		const form = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: ANILIST_CLIENT_ID,
			client_secret: ANILIST_CLIENT_SECRET
		});

		let res: Response;
		try {
			res = await fetch(ANILIST_TOKEN_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
				body: form
			});
		} catch {
			return json({ error: 'Could not reach AniList' }, { status: 502 });
		}

		// AniList answers with JSON; a non-JSON body means we hit the wrong
		// endpoint (or a proxy) and there is no useful error to forward.
		const data = (await res.json().catch(() => null)) as
			| { access_token?: string; error?: string; message?: string; error_description?: string; hint?: string }
			| null;

		if (res.ok && data?.access_token) return json(data);

		if (!data) {
			return json(
				{ error: `Unexpected response from AniList (HTTP ${res.status})` },
				{ status: 502 }
			);
		}

		lastError = data.error_description ?? data.message ?? data.error ?? 'Token exchange failed';
		if (data.hint && !lastError.includes(data.hint)) lastError = `${lastError} (${data.hint})`;
		lastStatus = res.status || 400;

		// "invalid_client" means this redirect URI was not accepted — retry with
		// the next candidate (the one registered in the AniList app).
		if (data.error !== 'invalid_client') break;
	}

	return json({ error: lastError }, { status: lastStatus });
};
