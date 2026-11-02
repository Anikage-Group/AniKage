<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Bookmark, Check, ChevronDown, Trash2 } from 'lucide-svelte';
	import type { Anime, WatchStatus } from '$lib/types';
	import { WATCH_STATUSES } from '$lib/types';
	import {
		watchlist,
		addToWatchlist,
		setWatchStatus
	} from '$lib/stores/watchlist';
	import { toast } from '$lib/stores/toast';
	import {
		notifyLocalSyncIssues,
		removeWatchlistEverywhere,
		syncWatchlistEntry
	} from '$lib/services/watchSync';
	import { lang, t } from '$lib/stores/i18n';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { portal } from '$lib/utils/portal';

	/** The anime this menu manages (entry data for the watchlist store). */
	export let anime: Anime;
	/** 'icon' = small circular bookmark button, 'block' = full-width labelled button,
	 *  'hero' = underlined text action used by the home banner. */
	export let variant: 'icon' | 'block' | 'hero' = 'icon';

	/** Fired when the menu opens / closes so hosts can pause (e.g. the hero slider). */
	const dispatch = createEventDispatcher<{ open: void; close: void }>();

	let open = false;
	let isMobile = false;
	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let popover: HTMLDivElement;

	/**
	 * Fixed-position coordinates for the desktop popover so it never clips on a
	 * card. It flips above the trigger when there is no room below and is
	 * clamped to the viewport, so it can never open off-screen.
	 */
	let pos = { top: 0, right: 0, bottom: 0, width: 208 };

	$: entry = $watchlist[anime.id];
	$: saved = !!entry;

	function measure() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const width = 208;
		const margin = 8;
		const gap = 6;
		const height = 240;

		// Prefer below the trigger; flip above when that would overflow.
		const below = r.bottom + gap;
		const fitsBelow = below + height <= window.innerHeight;

		pos = {
			top: fitsBelow ? below : Math.max(margin, r.top - gap - height),
			right: Math.max(
				margin,
				Math.min(window.innerWidth - width - margin, window.innerWidth - r.right)
			),
			bottom: fitsBelow ? 0 : Math.max(margin, window.innerHeight - (r.top - gap)),
			width
		};
	}

	onMount(() => {
		const mq = window.matchMedia('(max-width: 639px)');
		const sync = () => (isMobile = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	function labelFor(s: WatchStatus): string {
		return WATCH_STATUSES.find((x) => x.id === s)?.label ?? s;
	}

	function entryData() {
		return {
			id: anime.id,
			malId: anime.malId,
			display: anime.display,
			cover: anime.cover,
			banner: anime.banner,
			genres: anime.genres,
			score: anime.score,
			totalEpisodes: anime.episodes
		};
	}

	function close() {
		if (!open) return;
		open = false;
		dispatch('close');
	}

	function onToggle(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!open) {
			measure();
			open = true;
			dispatch('open');
		} else {
			close();
		}
	}

	function onPick(status: WatchStatus, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!entry) {
			const data = entryData();
			addToWatchlist(data, status);
			toast(`Added “${anime.display}” to ${labelFor(status)}`, true);
			void syncWatchlistEntry(data, status).then((report) =>
				notifyLocalSyncIssues(report, 'Saved locally')
			);
		} else if (entry.status === status) {
			toast(`Already in ${labelFor(status)}`);
		} else {
			const data = entryData();
			setWatchStatus(anime.id, status);
			toast(`Moved “${anime.display}” to ${labelFor(status)}`, true);
			void syncWatchlistEntry(data, status).then((report) =>
				notifyLocalSyncIssues(report, 'Saved locally')
			);
		}
		close();
	}

	function onRemove(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		void removeWatchlistEverywhere(anime.id).then((report) =>
			notifyLocalSyncIssues(report, 'Removed locally')
		);
		toast(`Removed “${anime.display}” from watchlist`);
		close();
	}

	onMount(() => {
		function onDocClick(e: MouseEvent) {
			if (!open || isMobile) return;
			const target = e.target as Node;
			// The popover is rendered outside `root`, so it has to be checked
			// separately — otherwise every click on a menu item would close the
			// menu before the item's own handler ran.
			if (root?.contains(target) || popover?.contains(target)) return;
			close();
		}
		function reposition() {
			if (open && !isMobile) measure();
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') close();
		}
		document.addEventListener('click', onDocClick, true);
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('click', onDocClick, true);
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="relative" bind:this={root}>
	{#if variant === 'icon'}
		<button
			bind:this={trigger}
			on:click={onToggle}
			class="grid h-8 w-8 place-items-center rounded-md border border-line/60 bg-surface/75 text-ink backdrop-blur-md transition-all duration-150 hover:border-accent/40 hover:text-accent active:scale-95 {saved
				? 'border-accent/40 text-accent'
				: 'opacity-100'}"
			aria-label={saved ? `${t('watchlist', $lang)}: ${labelFor(entry!.status)}` : t('addToWatchlist', $lang)}
			aria-expanded={open}
		>
			<Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
		</button>
	{:else if variant === 'hero'}
		<button
			bind:this={trigger}
			on:click={onToggle}
			class="group/hero relative inline-flex items-center gap-2 pb-1 text-sm font-medium text-ink/80 transition-colors hover:text-ink active:scale-95"
			aria-label={saved ? `${t('watchlist', $lang)}: ${labelFor(entry!.status)}` : t('addToWatchlist', $lang)}
			aria-expanded={open}
		>
			<Bookmark size={16} fill={saved ? 'currentColor' : 'none'} class={saved ? 'text-accent' : ''} />
			{saved ? labelFor(entry!.status) : t('watchlist', $lang)}
			<span class="absolute inset-x-0 -bottom-0.5 h-px bg-accent opacity-60 transition-opacity group-hover/hero:opacity-100"></span>
		</button>
	{:else}
		<button
			bind:this={trigger}
			on:click={onToggle}
			class="flex w-full items-center justify-between gap-2 rounded-md border border-line/60 bg-surface/40 px-4 py-2.5 text-sm font-medium text-ink transition-all duration-150 hover:border-accent/40 active:scale-95 {saved
				? 'border-accent/50 text-accent'
				: ''}"
			aria-label={saved ? `${t('watchlist', $lang)}: ${labelFor(entry!.status)}` : t('addToWatchlist', $lang)}
			aria-expanded={open}
		>
			<span class="flex items-center gap-2">
				<Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
				{saved ? labelFor(entry!.status) : t('watchlistAdd', $lang)}
			</span>
			<ChevronDown size={14} class="transition-transform duration-150 {open ? 'rotate-180' : ''}" />
		</button>
	{/if}
</div>

<!-- Desktop: fixed-position popover so the card's overflow can never clip it -->
{#if open && !isMobile}
	<div
		bind:this={popover}
		use:portal
		transition:fade={{ duration: 140 }}
		class="fixed z-[200] overflow-hidden rounded-md border border-line/60 bg-surface/95 p-1 shadow-2xl backdrop-blur-xl"
		style="top: {pos.top}px; right: {pos.right}px; width: {pos.width}px; {pos.bottom
			? `bottom: ${pos.bottom}px; max-height: ${pos.bottom - 8}px;`
			: ''}"
		role="menu"
	>
		<p class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
			{t('watchlist', $lang)}
		</p>
		{#each WATCH_STATUSES as s (s.id)}
			<button
				on:click={(e) => onPick(s.id, e)}
				role="menuitem"
				class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 {entry?.status === s.id
					? 'bg-accent/10 text-accent'
					: 'text-ink hover:bg-surface2'}"
			>
				<span class="grid w-4 shrink-0 place-items-center">
					{#if entry?.status === s.id}
						<Check size={13} strokeWidth={3} />
					{/if}
				</span>
				{s.label}
			</button>
		{/each}

		{#if saved}
			<div class="my-1 border-t border-line/50"></div>
			<button
				on:click={onRemove}
				role="menuitem"
				class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-400 transition-colors duration-150 hover:bg-red-500/10"
			>
				<span class="grid w-4 shrink-0 place-items-center">
					<Trash2 size={13} />
				</span>
				{t('removeFromList', $lang)}
			</button>
		{/if}
	</div>
{/if}

<!-- Mobile: watchlist status as a bottom sheet, matching every other drawer menu -->
<BottomSheet open={open && isMobile} title={t('watchlist', $lang)} on:close={() => (open = false)}>
	<div class="space-y-1.5">
		{#each WATCH_STATUSES as s (s.id)}
			<button
				on:click={(e) => onPick(s.id, e)}
				class="flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left text-sm transition {entry?.status ===
				s.id
					? 'border-accent/50 bg-accent/10 text-accent'
					: 'border-line/50 text-ink active:bg-surface/60'}"
			>
				<span class="grid w-4 shrink-0 place-items-center">
					{#if entry?.status === s.id}
						<Check size={14} strokeWidth={3} />
					{/if}
				</span>
				{s.label}
			</button>
		{/each}

		{#if saved}
			<button
				on:click={onRemove}
				class="mt-1 flex w-full items-center gap-3 rounded-md border border-red-500/30 px-3 py-3 text-left text-sm text-red-400 transition active:bg-red-500/10"
			>
				<span class="grid w-4 shrink-0 place-items-center">
					<Trash2 size={14} />
				</span>
				{t('removeFromList', $lang)}
			</button>
		{/if}
	</div>
</BottomSheet>
