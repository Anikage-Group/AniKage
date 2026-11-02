<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		Activity,
		Calendar,
		Home,
		Library,
		LayoutDashboard,
		MonitorPlay,
		RefreshCw,
		Search,
		Smartphone
	} from 'lucide-svelte';
	import Logo from '$lib/components/brand/Logo.svelte';
	import { getTrending, getTopAiring, getPopularThisSeason } from '$lib/services/anilist';
	import type { Anime } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';

	/**
	 * Lander — the first thing you see when the site opens.
	 *
	 * A full-bleed marketing page: the brand, a search field and the copy
	 * that explains what AniKage is, with a hand of posters sliding past.
	 * The app itself lives at /home.
	 */

	let query = '';

	function search(e: SubmitEvent) {
		e.preventDefault();
		const q = query.trim();
		// An empty field still opens the catalog.
		goto(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
	}

	/* ---------------- the poster rows ---------------- */
	let rowA: Anime[] = [];
	let rowB: Anime[] = [];

	onMount(async () => {
		try {
			const [trending, top, seasonal] = await Promise.all([
				getTrending(1, 10),
				getTopAiring(1, 10),
				getPopularThisSeason(1, 10)
			]);
			const seen = new Set<number>();
			const unique = trending.list
				.concat(top.list, seasonal.list)
				.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
			// Shuffle so every visit deals a different set of posters.
			const shuffled = unique.sort(() => Math.random() - 0.5);
			const half = Math.ceil(shuffled.length / 2);
			rowA = shuffled.slice(0, half);
			rowB = shuffled.slice(half);
		} catch {
			rowA = [];
			rowB = [];
		}
	});

	/* ---------------- copy ---------------- */
	const intro =
		'Anime is not just about stories drawn with pen strokes; it’s a gateway to worlds full of emotions and creativity. From intense battles to unforgettable romantic moments, anime has become an essential part of entertainment for millions of people. With its growing popularity, the number of free anime streaming platforms continues to rise. If you’re looking for a reliable and enjoyable place to stream anime for free, AniKage is here for you.';

	const whatIs =
		'AniKage is a free anime streaming site where you can watch anime in HD quality with both subbed and dubbed options, all without the hassle of registration or payment.';

	const whyChoose =
		'Before creating AniKage, we thoroughly explored numerous other free anime sites and learned from their strengths and weaknesses. We kept only the best features and eliminated all the drawbacks, combining them into our AniKage platform. That’s why we’re so confident in claiming to be the best site for anime streaming. Experience it yourself and see the difference!';

	const features = [
		{
			icon: Library,
			title: 'Content Library',
			text: 'We offer an extensive collection of anime, spanning from 1980s classics to the latest releases. Each title includes English subtitles, with many also available in dubbed versions for your convenience.'
		},
		{
			icon: MonitorPlay,
			title: 'Quality / Resolution',
			text: 'All anime on AniKage is available in the best possible resolution. With our quality setting feature, you can adjust the resolution to match your Internet speed.'
		},
		{
			icon: Activity,
			title: 'Streaming experience',
			text: 'Compared to other sites, AniKage offers faster loading speeds and a completely buffer-free experience for seamless watching.'
		},
		{
			icon: RefreshCw,
			title: 'Updates',
			text: 'Our library is updated daily, even hourly, to ensure the latest episodes and titles are available as soon as possible.'
		},
		{
			icon: LayoutDashboard,
			title: 'User Interface',
			text: 'Our user-friendly UI and UX design make navigation a breeze for everyone. Use the search box for specific titles or browse categories.'
		},
		{
			icon: Smartphone,
			title: 'Device Compatibility',
			text: 'AniKage works seamlessly on both mobile and desktop devices. For the best experience, we recommend using a desktop.'
		}
	];
</script>

<svelte:head>
	<title>Anikage — The Best Site to Watch Anime Online for Free</title>
	<meta
		name="description"
		content="AniKage is a free anime streaming site — watch anime in HD with subbed and dubbed options, no registration, no payment."
	/>
</svelte:head>

<!-- Full-page background -->
<div class="fixed inset-0 -z-10 overflow-hidden">
	<img src="/bg.png" alt="" class="h-full w-full object-cover" />
	<!-- Solid overlays keep the copy readable over the artwork. -->
	<div class="absolute inset-0 bg-bg/60"></div>
	<div class="absolute inset-0 bg-bg/30"></div>
</div>

<div class="relative">
	<!-- ================= Hero ================= -->
	<section class="mx-auto flex min-h-[78vh] max-w-5xl flex-col items-center justify-center px-4 pb-16 pt-24 text-center sm:px-6">
		<a
			href="/home"
			class="inline-block transition-transform duration-200 active:scale-95"
			in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(0) }}
		>
			<Logo height={104} />
		</a>

		<!-- Search -->
		<form
			on:submit={search}
			class="mt-10 w-full max-w-xl"
			in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(1) }}
		>
			<div
				class="flex items-center gap-3 rounded-xl border border-line/60 bg-bg/70 px-4 py-3 backdrop-blur-md transition-colors focus-within:border-accent/50"
			>
				<Search size={18} class="shrink-0 text-muted" />
				<input
					bind:value={query}
					type="search"
					placeholder={t('searchAnime', $lang)}
					aria-label={t('searchAnime', $lang)}
					class="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none"
				/>
				<button
					type="submit"
					class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:shadow-glow-sm active:scale-95"
				>
					<Search size={13} />
					{t('search', $lang)}
				</button>
			</div>
		</form>

		<div
			class="mt-6 flex flex-wrap items-center justify-center gap-2"
			in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(2) }}
		>
			<a
				href="/home"
				class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:shadow-glow active:scale-95"
			>
				<Home size={15} /> {t('home', $lang)}
			</a>
			<a
				href="/schedule"
				class="flex items-center gap-2 rounded-md border border-line/60 bg-bg/60 px-4 py-2 text-sm font-medium text-muted backdrop-blur-md transition-colors hover:border-accent/40 hover:text-ink active:scale-95"
			>
				<Calendar size={15} /> {t('schedule', $lang)}
			</a>
		</div>
	</section>

	<!-- ================= Poster rows ================= -->
	<section class="relative py-10" aria-hidden="true">
		<!-- Padding absorbs the tilt so no card is clipped at the edges. -->
		<div class="fan-viewport py-14 sm:py-16">
			<!-- Upper row: drifts to the left, tilted slightly anticlockwise -->
			<div class="-rotate-[2deg]">
				<div class="fan-row fan-row-left">
					{#if rowA.length === 0}
						{#each Array(8) as _}
							<div class="shimmer-bg h-56 w-40 shrink-0 rounded-lg sm:h-64 sm:w-44"></div>
						{/each}
					{:else}
						{#each [...rowA, ...rowA] as a, i (a.id + '-' + i)}
							<a
								href={`/anime/${a.id}`}
								tabindex="-1"
								class="fan-card group relative h-56 w-40 shrink-0 overflow-hidden rounded-lg border border-line/50 shadow-xl sm:h-64 sm:w-44"
							>
								{#if a.cover}
									<img
										src={a.cover}
										alt={a.display}
										loading="lazy"
										class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
									/>
								{/if}
							</a>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Lower row: drifts to the right, tilted the other way -->
			<div class="mt-8 rotate-[2deg]">
				<div class="fan-row fan-row-right">
					{#if rowB.length === 0}
						{#each Array(8) as _}
							<div class="shimmer-bg h-56 w-40 shrink-0 rounded-lg sm:h-64 sm:w-44"></div>
						{/each}
					{:else}
						{#each [...rowB, ...rowB] as a, i (a.id + '-' + i)}
							<a
								href={`/anime/${a.id}`}
								tabindex="-1"
								class="fan-card group relative h-56 w-40 shrink-0 overflow-hidden rounded-lg border border-line/50 shadow-xl sm:h-64 sm:w-44"
							>
								{#if a.cover}
									<img
										src={a.cover}
										alt={a.display}
										loading="lazy"
										class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
									/>
								{/if}
							</a>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- ================= The headline + intro ================= -->
	<section class="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
		<h1
			class="font-display text-4xl font-bold leading-[1.06] tracking-tight text-ink sm:text-6xl"
			in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(0) }}
		>
			The best site to watch anime online
			<span class="text-accent text-glow">for free</span>
		</h1>

		<p
			class="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-muted sm:text-base"
			in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(1) }}
		>
			{intro}
		</p>
	</section>

	<!-- ================= 1. What is AniKage ================= -->
	<section class="mx-auto max-w-3xl px-4 py-14 sm:px-6" id="what">
		<p class="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent">01</p>
		<h2 class="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
			What is AniKage?
		</h2>
		<p class="mt-4 text-sm leading-relaxed text-muted sm:text-base">{whatIs}</p>
	</section>

	<!-- ================= 2. Why choose AniKage ================= -->
	<section class="mx-auto max-w-3xl px-4 py-10 sm:px-6" id="why">
		<p class="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent">02</p>
		<h2 class="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
			Why choose AniKage?
		</h2>
		<p class="mt-4 text-sm leading-relaxed text-muted sm:text-base">{whyChoose}</p>
	</section>

	<!-- ================= Feature grid ================= -->
	<section class="mx-auto max-w-5xl px-4 py-14 sm:px-6">
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each features as f, i (f.title)}
				<article
					class="hairline group rounded-xl bg-bg/60 p-5 backdrop-blur-md transition-all duration-300 hover:border-accent/40 hover:shadow-glow-sm"
					in:fly={{ y: 18, duration: 420, delay: i * 70 }}
				>
					<span
						class="grid h-10 w-10 place-items-center rounded-md border border-accent/25 bg-accent/10 text-accent"
					>
						<svelte:component this={f.icon} size={18} />
					</span>
					<h3 class="mt-4 font-display text-sm font-semibold text-ink">{f.title}</h3>
					<p class="mt-1.5 text-xs leading-relaxed text-muted">{f.text}</p>
				</article>
			{/each}
		</div>
	</section>

	<!-- ================= Closing note ================= -->
	<section class="mx-auto max-w-3xl px-4 pb-28 pt-6 text-center sm:px-6">
		<h2 class="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
			Experience it yourself and see the difference
		</h2>
		<p class="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
			Thousands of titles, subbed and dubbed, in HD — and nothing to sign up for.
		</p>
	</section>
</div>
