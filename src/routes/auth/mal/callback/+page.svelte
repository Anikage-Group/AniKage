<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { exchangeMalCode, fetchMalViewer } from '$lib/services/malOAuth';
	import { resetProvider } from '$lib/stores/sync';
	import { toast } from '$lib/stores/toast';
	import { lang, t } from '$lib/stores/i18n';

	let status = 'Signing in with MyAnimeList…';
	let error = '';

	onMount(async () => {
		const params = $page.url.searchParams;
		const oauthError = params.get('error');
		if (oauthError) {
			error = params.get('error_description') || oauthError;
			return;
		}
		const code = params.get('code');
		if (!code) {
			error = 'MyAnimeList did not return an authorization code.';
			return;
		}
		try {
			const token = await exchangeMalCode(code, params.get('state') ?? '');
			await fetchMalViewer(token);
			// Never reuse another account's snapshot or pending deletes.
			resetProvider('mal');
			toast('Signed in with MyAnimeList', true);
			goto('/settings');
		} catch (e) {
			error = e instanceof Error ? e.message : 'MyAnimeList sign-in failed.';
		}
	});
</script>

<svelte:head><title>MyAnimeList Sign-in — Anikage</title></svelte:head>

<div class="grid min-h-[60vh] place-items-center px-4">
	<div class="hairline max-w-sm rounded-xl bg-surface/40 p-8 text-center">
		{#if error}
			<p class="text-sm font-semibold text-red-400">{error}</p>
			<a href="/settings" class="mt-4 inline-block text-sm text-accent underline">
				{t('backToSettings', $lang)}
			</a>
		{:else}
			<div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			<p class="mt-4 text-sm text-muted">{status}</p>
		{/if}
	</div>
</div>
