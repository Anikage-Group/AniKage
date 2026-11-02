<script lang="ts">
	import { onMount } from 'svelte';
	import { Clock } from 'lucide-svelte';
	import type { AiringEpisode } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';

	export let airing: AiringEpisode | null = null;

	let now = Date.now();

	onMount(() => {
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	function two(n: number): string {
		return String(n).padStart(2, '0');
	}

	$: target = airing ? airing.airingAt * 1000 : 0;
	$: remaining = Math.max(0, target - now);
	$: totalSeconds = Math.floor(remaining / 1000);
	$: days = Math.floor(totalSeconds / 86400);
	$: hours = Math.floor((totalSeconds % 86400) / 3600);
	$: minutes = Math.floor((totalSeconds % 3600) / 60);
	$: seconds = totalSeconds % 60;

	$: locale = $lang === 'jp' ? 'ja-JP' : 'en-US';
	$: airDate = target
		? new Date(target).toLocaleDateString(locale, {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			})
		: '';
	$: airTime = target
		? new Date(target).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
		: '';
</script>

{#if airing}
	<p
		class="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2 text-xs text-muted"
		aria-live="off"
	>
		<Clock size={12} class="shrink-0 text-accent" aria-hidden="true" />
		{#if remaining > 0}
			<span>EP {airing.episode} {t('airingIn', $lang)}</span>
			<span class="font-semibold tabular-nums text-ink">
				{days > 0 ? `${days}d ` : ''}{two(hours)}h {two(minutes)}m {two(seconds)}s
			</span>
			<span>{t('airingOn', $lang)}</span>
			<span class="text-ink">{airDate}</span>
			<span>{t('airingAt', $lang)}</span>
			<span class="text-ink">{airTime}</span>
		{:else}
			<span>EP {airing.episode} {t('airingNow', $lang)}</span>
			<span>{t('airingOn', $lang)}</span>
			<span class="text-ink">{airDate}</span>
			<span>{t('airingAt', $lang)}</span>
			<span class="text-ink">{airTime}</span>
		{/if}
	</p>
{/if}
