<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { Play, Sparkles, Layers, Compass, Trophy } from 'lucide-svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import GlowButton from '$lib/components/ui/GlowButton.svelte';
	import { getTrending } from '$lib/services/anilist';
	import type { Anime } from '$lib/types';

	let preview: Anime[] = [];
	let loading = true;

	onMount(async () => {
		try {
			const { list } = await getTrending(1, 12);
			preview = list;
		} catch {
			preview = [];
		} finally {
			loading = false;
		}
	});

	const headline = 'Shadow your watchlist.'.split(' ');

	const features = [
		{
			icon: Play,
			title: 'Cinematic player',
			text: 'Multi-server embeds with sub/dub tracks and skip-intro detection.'
		},
		{
			icon: Layers,
			title: 'Episode intelligence',
			text: 'Three browse modes: tiles, titles, and detailed synopsis lists.'
		},
		{
			icon: Compass,
			title: 'Weekly schedule',
			text: 'Live countdowns synced to your timezone for every airing.'
		},
		{
			icon: Trophy,
			title: 'Top 10 rankings',
			text: 'Daily, weekly and monthly leaderboards from live data.'
		}
	];
</script>

<svelte:head>
	<title>Anikage — Cinematic Anime Streaming</title>
</svelte:head>

<div class="relative overflow-hidden">
	<Ambient intensity={0.28} />

	<!-- Hero -->
	<section class="relative mx-auto max-w-[1600px] px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
		<div class="mx-auto max-w-3xl text-center">
			<p
				in:fly={{ y: 14, duration: 500 }}
				class="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent"
			>
				<Sparkles size={12} /> Anikage
			</p>

			<h1 class="font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-6xl">
				{#each headline as word, i (i)}
					<span in:fly={{ y: 26, duration: 600, delay: 120 + i * 90 }} class="inline-block">
						{#if i === headline.length - 1}
							<span class="text-accent text-glow">{word}</span>
						{:else}
							{word}&nbsp;
						{/if}
					</span>
				{/each}
			</h1>

			<p
				in:fly={{ y: 18, duration: 500, delay: 420 }}
				class="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted"
			>
				A darkroom-grade streaming experience — live AniList data, multi-server players, weekly
				countdowns and a theme engine tuned for late-night sessions.
			</p>

			<div in:fly={{ y: 18, duration: 500, delay: 520 }} class="mt-9 flex items-center justify-center gap-8">
				<GlowButton href="/home" size="lg">
					<Play size={18} fill="currentColor" /> Start watching
				</GlowButton>
				<GlowButton href="/search" variant="underline" size="lg">Browse catalog</GlowButton>
			</div>
		</div>

		<!-- Preview carousel -->
		<div class="mt-16">
			<div class="no-scrollbar flex gap-4 overflow-x-auto pb-4 mask-fade-x">
				{#if loading}
					{#each Array(8) as _}
						<div class="shimmer-bg h-64 w-44 shrink-0 rounded-md"></div>
					{/each}
				{:else}
					{#each preview as a, i (a.id)}
						<a
							href={`/anime/${a.id}`}
							in:fade={{ duration: 400, delay: i * 60 }}
							class="group relative h-64 w-44 shrink-0 overflow-hidden rounded-md border border-line/50 transition-all duration-300 hover:border-accent/40 hover:shadow-glow-sm"
						>
							{#if a.cover}
								<img
									src={a.cover}
									alt={a.display}
									loading="lazy"
									class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
								/>
							{/if}
							<div class="absolute inset-0 bg-black/55"></div>
							<p class="absolute inset-x-0 bottom-0 p-3 text-xs font-semibold leading-tight text-white">
								{a.display}
							</p>
						</a>
					{/each}
				{/if}
			</div>
		</div>
	</section>

	<!-- Link into the app -->
	<section class="mx-auto max-w-[1600px] px-4 pb-8 sm:px-6">
		<div class="hairline flex flex-col items-center gap-4 rounded-2xl bg-surface/30 px-6 py-8 text-center backdrop-blur-md sm:flex-row sm:justify-between sm:text-left">
			<div>
				<h2 class="font-display text-lg font-semibold text-ink">Ready to dive in?</h2>
				<p class="mt-1 text-sm text-muted">Open the app — trending, schedule and your watchlist await.</p>
			</div>
			<GlowButton href="/home" size="lg"><Play size={17} fill="currentColor" /> Enter Anikage</GlowButton>
		</div>
	</section>

	<!-- Features -->
	<section class="mx-auto max-w-[1600px] px-4 pb-24 sm:px-6">
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each features as f, i (f.title)}
				<div
					in:fly={{ y: 20, duration: 500, delay: i * 90 }}
					class="hairline group rounded-xl bg-surface/30 p-5 backdrop-blur-md transition-all duration-300 hover:border-accent/40 hover:shadow-glow-sm"
				>
					<span class="grid h-10 w-10 place-items-center rounded-md border border-accent/25 bg-accent/10 text-accent">
						<svelte:component this={f.icon} size={18} />
					</span>
					<h3 class="mt-4 font-display text-sm font-semibold text-ink">{f.title}</h3>
					<p class="mt-1.5 text-xs leading-relaxed text-muted">{f.text}</p>
				</div>
			{/each}
		</div>
	</section>
</div>
