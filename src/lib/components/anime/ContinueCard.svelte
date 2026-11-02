<script lang="ts">
	import { fade } from 'svelte/transition';
	import { Play, X } from 'lucide-svelte';
	import type { ProgressEntry } from '$lib/types';
	import { removeProgress } from '$lib/stores/history';
	import { formatDuration, timeAgo } from '$lib/utils/format';
	import { lang, t, tf } from '$lib/stores/i18n';

	export let entry: ProgressEntry;

	$: pct = Math.round(entry.progress * 100);
	// Older entries predate `duration`; derive the total from the stored ratio
	// so the overlay stays meaningful without any invented data.
	$: total = entry.duration ?? (entry.position && entry.progress > 0 ? entry.position / entry.progress : 0);
	$: watched = entry.position ?? (total > 0 ? entry.progress * total : 0);
</script>

<div
	transition:fade
	class="group relative w-full shrink-0 overflow-hidden rounded-lg bg-surface/20 transition-all duration-300 hover:bg-surface/40"
>
	<a
		href={`/watch/${entry.id}/${entry.episode}`}
		class="block"
		aria-label={tf('resumeEpisode', { title: entry.display, n: entry.episode }, $lang)}
	>
		<div class="relative aspect-video w-full overflow-hidden bg-surface2">
			{#if entry.banner || entry.cover}
				<img
					src={entry.banner ?? entry.cover}
					alt=""
					loading="lazy"
					class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
				/>
			{/if}

			<!-- centered play on hover -->
			<span
				class="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/35 group-hover:opacity-100"
			>
				<span
					class="grid h-12 w-12 place-items-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur-sm active:scale-90"
				>
					<Play size={20} fill="currentColor" />
				</span>
			</span>

			<!-- episode badge over the artwork -->
			<span
				class="absolute left-2 top-2 rounded border border-accent/30 bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent backdrop-blur-sm"
			>
				EP {entry.episode}
			</span>

			<!-- watched / total time over the artwork -->
			{#if total > 0}
				<span
					class="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm"
				>
					{formatDuration(watched)} / {formatDuration(total)}
				</span>
			{/if}

			<!-- progress bar pinned to bottom of the image -->
			<div class="absolute inset-x-0 bottom-0 h-1 bg-black/40">
				<div class="h-full bg-accent" style="width:{pct}%;"></div>
			</div>
		</div>

		<div class="p-2">
			<p class="truncate text-xs font-semibold text-ink">{entry.display}</p>
			<p class="mt-0.5 flex items-center gap-2 text-[10px] text-muted/70">
				{#if entry.episodeTitle}
					<span class="truncate">{entry.episodeTitle}</span>
				{/if}
				<span class="ml-auto shrink-0">{timeAgo(entry.updatedAt)}</span>
			</p>
		</div>
	</a>

	<button
		on:click={() => removeProgress(entry.id)}
		class="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-black/60 text-white opacity-100 backdrop-blur-md transition-opacity md:opacity-0 md:group-hover:opacity-100"
		aria-label={t('removeFromContinue', $lang)}
	>
		<X size={13} />
	</button>
</div>
