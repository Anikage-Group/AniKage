<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Bookmark, Check, Trash2 } from 'lucide-svelte';
	import { WATCH_STATUSES, type WatchStatus } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';
	import { portal } from '$lib/utils/portal';

	/**
	 * Watchlist list-select menu. Renders its own trigger button so it can sit
	 * at the end of the player control bar. Selecting a status adds (or moves)
	 * the title; "Remove" drops it from the watchlist entirely.
	 *
	 * The menu itself is rendered as a FIXED popover: the control bar row
	 * scrolls horizontally (`overflow-x-auto`), which would otherwise clip an
	 * absolutely-positioned dropdown so badly that it was unusable.
	 */
	export let saved = false;
	export let status: WatchStatus | null = null;

	const dispatch = createEventDispatcher<{
		select: { status: WatchStatus };
		remove: void;
	}>();

	$: triggerLabel = saved && status ? statusLabel(status) : t('watchlist', $lang);

	function statusLabel(s: WatchStatus): string {
		return WATCH_STATUSES.find((x) => x.id === s)?.label ?? s;
	}

	function pick(s: WatchStatus) {
		close();
		dispatch('select', { status: s });
	}

	function remove() {
		close();
		dispatch('remove');
	}

	let open = false;
	let trigger: HTMLButtonElement;
	let popover: HTMLDivElement;

	/** Fixed-position coordinates so the menu can never be clipped. */
	let pos = { top: 0, right: 0, bottom: 0, width: 208 };

	function measure() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const width = 208;
		const margin = 8;
		const gap = 6;
		const height = 300;

		// Prefer below the trigger; flip above when there is no room.
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

	function close() {
		open = false;
	}

	function onToggle() {
		if (!open) measure();
		open = !open;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	onMount(() => {
		function onDocClick(e: MouseEvent) {
			if (!open) return;
			const target = e.target as Node;
			// The popover lives outside the trigger, so it is checked separately.
			if (trigger?.contains(target) || popover?.contains(target)) return;
			close();
		}
		function reposition() {
			if (open) measure();
		}
		document.addEventListener('click', onDocClick, true);
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		return () => {
			document.removeEventListener('click', onDocClick, true);
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
		};
	});
</script>

<svelte:window on:keydown={onKey} />

<div class="relative shrink-0">
	<button
		bind:this={trigger}
		on:click={onToggle}
		class="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all duration-150 active:scale-95 {saved
			? 'border-accent/50 bg-accent/10 text-accent shadow-glow-sm'
			: 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink'}"
		aria-haspopup="menu"
		aria-expanded={open}
		title={t('watchlist', $lang)}
	>
		<Bookmark size={14} fill={saved ? 'currentColor' : 'none'} />
		{triggerLabel}
	</button>
</div>

{#if open}
	<div
		bind:this={popover}
		use:portal
		transition:fade={{ duration: 140 }}
		class="fixed z-[200] overflow-hidden rounded-xl border border-line/60 bg-bg/95 shadow-2xl backdrop-blur-2xl"
		style="top: {pos.top}px; right: {pos.right}px; width: {pos.width}px; {pos.bottom
			? `bottom: ${pos.bottom}px; max-height: ${pos.bottom - 8}px;`
			: ''}"
		role="menu"
	>
		<p class="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
			{saved ? t('moveToList', $lang) : t('addToList', $lang)}
		</p>
		{#each WATCH_STATUSES as s (s.id)}
			<button
				on:click={() => pick(s.id)}
				class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface/60 {status === s.id
					? 'text-accent'
					: 'text-ink'}"
				role="menuitem"
			>
				{s.label}
				{#if status === s.id}
					<Check size={13} class="shrink-0 text-accent" strokeWidth={3} />
				{/if}
			</button>
		{/each}
		{#if saved}
			<div class="my-1 h-px bg-line/50"></div>
			<button
				on:click={remove}
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface/60 hover:text-red-400"
				role="menuitem"
			>
				<Trash2 size={13} /> {t('removeFromWatchlist', $lang)}
			</button>
		{/if}
	</div>
{/if}
