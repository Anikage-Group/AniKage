import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAL_CALLBACK_PATH, MAL_CLIENT_ID, MAL_REDIRECT_URI, MAL_TOKEN_URL } from '$lib/config';
import { MAL_CLIENT_SECRET } from '$lib/server/config';

/**
 * Server-side MyAnimeList code → token exchange.
 *
 * Mirrors /api/anilist/token: the client secret stays on the server, and the
 * PKCE verifier travels from the browser so the code cannot be replayed by
 * anyone else. POST { code, code_verifier, redirect_uri? }.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		code?: string;
		code_verifier?: string;
		redirect_uri?: string;
	};
	const code = body.code ?? '';
	const verifier = body.code_verifier ?? '';
	if (!code) return json({ error: 'Missing code' }, { status: 400 });
	if (!MAL_CLIENT_ID) {
		return json({ error: 'Server missing PUBLIC_MAL_CLIENT_ID' }, { status: 500 });
	}
	if (!MAL_CLIENT_SECRET) {
		return json({ error: 'Server missing MAL_CLIENT_SECRET' }, { status: 500 });
	}

	// Only ever accept a redirect URI that points back at our callback path.
	const requested =
		typeof body.redirect_uri === 'string' && body.redirect_uri.endsWith(MAL_CALLBACK_PATH)
			? body.redirect_uri
			: '';
	const candidates = [requested, MAL_REDIRECT_URI].filter(
		(v, i, a) => !!v && a.indexOf(v) === i
	);

	let lastError = 'Token exchange failed';
	let lastStatus = 400;

	for (const redirectUri of candidates) {
		const form = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: MAL_CLIENT_ID,
			client_secret: MAL_CLIENT_SECRET,
			code_verifier: verifier
		});

		let res: Response;
		try {
			res = await fetch(MAL_TOKEN_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json'
				},
				body: form
			});
		} catch {
			return json({ error: 'Could not reach MyAnimeList' }, { status: 502 });
		}

		const data = (await res.json().catch(() => null)) as
			| {
					access_token?: string;
					refresh_token?: string;
					expires_in?: number;
					error?: string;
					message?: string;
					error_description?: string;
			  }
			| null;

		if (res.ok && data?.access_token) return json(data);

		if (!data) {
			return json(
				{ error: `Unexpected response from MyAnimeList (HTTP ${res.status})` },
				{ status: 502 }
			);
		}

		lastError = data.error_description ?? data.message ?? data.error ?? 'Token exchange failed';
		lastStatus = res.status || 400;
		if (data.error !== 'invalid_client') break;
	}

	return json({ error: lastError }, { status: lastStatus });
};
