<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { ArrowLeft, House } from 'lucide-svelte';
	import Logo from '$lib/components/brand/Logo.svelte';
	import { lang, t } from '$lib/stores/i18n';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';

	/**
	 * The HTTP status behind the error.
	 *
	 * Router errors (404, 403…) carry their status, but a render-time crash
	 * leaves the status at 200 — treat that as a server error instead.
	 */
	$: status = $page.status && $page.status >= 400 ? $page.status : 500;
	$: detail = $page.error?.message ?? '';

	/** Short, human copy for the status code. */
	$: headline =
		status === 404
			? t('errorNotFound', $lang)
			: status === 403
				? t('errorForbidden', $lang)
				: t('errorGeneric', $lang);

	/** The technical message is only worth showing when it is not the default. */
	$: showDetail = !!detail && detail !== 'Not Found' && !detail.startsWith('Error: ');

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else goto('/');
	}
</script>

<svelte:head>
	<title>{status} — Anikage</title>
</svelte:head>

<div class="relative grid min-h-[72vh] place-items-center px-4 py-16">
	<div class="flex w-full max-w-md flex-col items-center text-center">
		<!-- Brand mark, dead centre -->
		<div
			class="grid place-items-center"
			in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(0) }}
		>
			<Logo height={44} />
		</div>

		<!-- Error code, written big under the logo -->
		<p
			class="mt-7 font-display text-[4.5rem] font-bold leading-none tracking-tighter text-ink sm:text-[6rem]"
			in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(1) }}
		>
			{status}
		</p>

		<p
			class="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted"
			in:fade={{ duration: REVEAL_DURATION, delay: revealDelay(2) }}
		>
			{t('errorCode', $lang)}
		</p>

		<p
			class="mt-5 max-w-sm text-sm leading-relaxed text-muted"
			in:fade={{ duration: REVEAL_DURATION, delay: revealDelay(3) }}
		>
			{headline}
		</p>

		{#if showDetail}
			<p
				class="mt-2 max-w-sm break-words font-mono text-xs text-muted/70"
				in:fade={{ duration: REVEAL_DURATION, delay: revealDelay(4) }}
			>
				{detail}
			</p>
		{/if}

		<div
			class="mt-8 flex flex-wrap items-center justify-center gap-2"
			in:fade={{ duration: REVEAL_DURATION, delay: revealDelay(5) }}
		>
			<button
				on:click={() => goto('/')}
				class="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:shadow-glow active:scale-95"
			>
				<House size={15} /> {t('errorBackHome', $lang)}
			</button>
			<button
				on:click={goBack}
				class="inline-flex items-center gap-2 rounded-md border border-line/60 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent/40 hover:text-accent active:scale-95"
			>
				<ArrowLeft size={15} /> {t('errorGoBack', $lang)}
			</button>
		</div>
	</div>
</div>
