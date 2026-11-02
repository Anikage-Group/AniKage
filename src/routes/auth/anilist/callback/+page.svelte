<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { exchangeCode, fetchViewer, importWatchlist } from '$lib/services/anilistOAuth';
	import { updateSetting } from '$lib/stores/settings';
	import { resetProvider } from '$lib/stores/sync';
	import { toast } from '$lib/stores/toast';
	import { lang, t } from '$lib/stores/i18n';

	let error = '';

	$: status = t('completingSignIn', $lang);

	onMount(async () => {
		const params = $page.url.searchParams;
		// AniList reports refusals (denied consent, invalid client…) on the
		// callback itself — surface that instead of a generic failure.
		const oauthError = params.get('error');
		if (oauthError) {
			error = params.get('error_description') || oauthError;
			return;
		}
		const code = params.get('code');
		if (!code) {
			error = t('noAuthCode', $lang);
			return;
		}
		try {
			const token = await exchangeCode(code);
			updateSetting('anilistToken', token);
			// Never reuse another account's snapshot or pending deletes.
			resetProvider('anilist');
			await fetchViewer();
			const n = await importWatchlist();
			toast(`Signed in — imported ${n} titles`, true);
			goto('/home');
		} catch (e) {
			error = e instanceof Error ? e.message : t('signInFailed', $lang);
		}
	});
</script>

<svelte:head><title>{t('anilistSignIn', $lang)} — Anikage</title></svelte:head>

<div class="grid min-h-[60vh] place-items-center px-4">
	<div class="hairline max-w-sm rounded-xl bg-surface/40 p-8 text-center">
		{#if error}
			<p class="text-sm font-semibold text-red-400">{error}</p>
			<a href="/settings" class="mt-4 inline-block text-sm text-accent underline">{t('backToSettings', $lang)}</a>
		{:else}
			<div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			<p class="mt-4 text-sm text-muted">{status}</p>
		{/if}
	</div>
</div>
