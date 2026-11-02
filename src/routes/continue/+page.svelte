<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Clock } from 'lucide-svelte';
	import ContinueCard from '$lib/components/anime/ContinueCard.svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import { progress, continueList } from '$lib/stores/history';
	import { lang, t } from '$lib/stores/i18n';

	$: items = continueList($progress);
</script>

<svelte:head>
	<title>{t('continueWatching', $lang)} — Anikage</title>
</svelte:head>

<div class="relative">
	<Ambient intensity={0.14} />
	<div class="relative z-10 mx-auto max-w-[1600px] px-4 pt-8 sm:px-6">
		<div class="mb-8">
			<h1 class="font-display text-2xl font-bold tracking-tight text-ink">{t('continueWatching', $lang)}</h1>
			<p class="mt-1 flex items-center gap-1.5 text-xs text-muted">
				<Clock size={12} /> {t('continueSubtitle', $lang)}
			</p>
		</div>

		{#if items.length === 0}
			<div class="hairline rounded-xl bg-surface/30 py-20 text-center backdrop-blur-md">
				<p class="text-sm text-muted">{t('nothingInProgress', $lang)}</p>
				<a href="/home" class="mt-4 inline-flex items-center gap-1.5 pb-0.5 text-sm font-semibold text-accent">
					{t('browseAnime', $lang)} <span class="h-px w-6 bg-accent"></span>
				</a>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" transition:fade>
				{#each items as entry (entry.id)}
					<ContinueCard {entry} />
				{/each}
			</div>
		{/if}
	</div>
</div>
