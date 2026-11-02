<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { createEventDispatcher, onDestroy, tick } from 'svelte';
	import { Search, ArrowRight, ExternalLink } from 'lucide-svelte';
	import { searchAnime } from '$lib/services/anilist';
	import type { Anime } from '$lib/types';
	import { lang, t, titleFor } from '$lib/stores/i18n';

	export let open = false;

	const dispatch = createEventDispatcher<{ close: void; navigate: string }>();

	let query = '';
	let results: Anime[] = [];
	let loading = false;
	let error = '';
	let debounce: ReturnType<typeof setTimeout>;
	let listEl: HTMLElement;
	let inputEl: HTMLInputElement;
	let cursor = 0;

	const quickLinks = [
		{ href: '/search', key: 'search' },
		{ href: '/schedule', key: 'schedule' },
		{ href: '/watchlist', key: 'watchlist' },
		{ href: '/continue', key: 'continueWatching' },
		{ href: '/settings', key: 'settings' }
	];

	// Focus the input the moment the palette opens so typing starts instantly.
	$: if (open) {
		tick().then(() => {
			inputEl?.focus();
			inputEl?.select();
		});
	} else {
		query = '';
	}
	$: {
		clearTimeout(debounce);
		const q = query.trim();
		if (!q) {
			results = [];
			loading = false;
			error = '';
		} else {
			loading = true;
			error = '';
			debounce = setTimeout(async () => {
				try {
					const { list } = await searchAnime(q, 1, 8);
					results = list;
					cursor = 0;
				} catch (e) {
					error = e instanceof Error ? e.message : 'Search failed.';
					results = [];
				} finally {
					loading = false;
				}
			}, 320);
		}
	}

	function go(href: string) {
		dispatch('navigate', href);
		dispatch('close');
	}

	function openAnime(id: number) {
		go(`/anime/${id}`);
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			dispatch('close');
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			cursor = Math.min(cursor + 1, results.length - 1);
			scrollToCursor();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = Math.max(cursor - 1, 0);
			scrollToCursor();
		} else if (e.key === 'Enter') {
			if (results[cursor]) openAnime(results[cursor].id);
		}
	}

	function scrollToCursor() {
		const el = listEl?.querySelectorAll<HTMLElement>('.pal-row')[cursor];
		el?.scrollIntoView({ block: 'nearest' });
	}

	onDestroy(() => clearTimeout(debounce));
</script>

<svelte:window on:keydown={onKey} />

{#if open}
	<div class="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			transition:fade={{ duration: 180 }}
			class="absolute inset-0 bg-black/60 backdrop-blur-sm"
			on:click={() => dispatch('close')}
			aria-hidden="true"
		></div>

		<div
			transition:fly={{ y: -18, duration: 260 }}
			class="relative w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-bg/90 shadow-2xl backdrop-blur-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={t('search', $lang)}
		>
			<div class="flex items-center gap-3 border-b border-line/50 px-4">
				<Search size={17} class="shrink-0 text-accent" />
				<input
					bind:this={inputEl}
					bind:value={query}
					placeholder={t('searchAnime', $lang)}
					class="w-full bg-transparent py-4 text-[15px] text-ink placeholder:text-muted focus:outline-none"
				/>
				{#if loading}
					<span class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent"></span>
				{/if}
				<button
					on:click={() => dispatch('close')}
					class="shrink-0 rounded border border-line/60 px-1.5 py-0.5 text-[10px] font-medium text-muted hover:text-ink"
				>
					ESC
				</button>
			</div>

			<div bind:this={listEl} class="max-h-[52vh] overflow-y-auto p-2">
				{#if !query.trim()}
					<p class="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted">
						{t('quickLinks', $lang)}
					</p>
					{#each quickLinks as q (q.href)}
						<button
							on:click={() => go(q.href)}
							class="pal-row group flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface/60"
						>
							<span class="text-ink">{t(q.key, $lang)}</span>
							<ArrowRight
								size={15}
								class="text-muted opacity-0 transition group-hover:opacity-100"
							/>
						</button>
					{/each}
				{:else if error}
					<p class="px-3 py-6 text-center text-sm text-muted">{error}</p>
				{:else if results.length === 0 && !loading}
					<p class="px-3 py-6 text-center text-sm text-muted">{t('noResultsFor', $lang)} “{query}”.</p>
				{:else}
					{#each results as r, i (r.id)}
						<button
							on:click={() => openAnime(r.id)}
							class="pal-row group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors {i === cursor
								? 'bg-accent/10'
								: 'hover:bg-surface/60'}"
						>
							{#if r.cover}
								<img
									src={r.cover}
									alt=""
									class="h-12 w-9 shrink-0 rounded object-cover"
									loading="lazy"
								/>
							{/if}
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-ink">{titleFor(r, $lang)}</span>
								<span class="block truncate text-[11px] text-muted">
									{r.format ?? 'Anime'} · {r.seasonYear ?? ''} {r.genres.slice(0, 2).join(' · ')}
								</span>
							</span>
							{#if r.score}
								<span class="shrink-0 text-xs font-semibold text-accent">
									{(r.score / 10).toFixed(1)}
								</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<div class="flex items-center gap-4 border-t border-line/50 px-4 py-2 text-[10px] text-muted">
				<span><kbd class="rounded border border-line/60 px-1">↑↓</kbd> {t('navigate', $lang)}</span>
				<span><kbd class="rounded border border-line/60 px-1">↵</kbd> {t('open', $lang)}</span>
				{#if query.trim()}
					<button
						on:click={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
						class="ml-auto flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/25 active:scale-95"
					>
						{t('viewAllResults', $lang)} <ArrowRight size={12} />
					</button>
				{:else}
					<button
						on:click={() => go('/search')}
						class="ml-auto flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/25 active:scale-95"
					>
						<ExternalLink size={12} /> {t('openSearch', $lang)}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
