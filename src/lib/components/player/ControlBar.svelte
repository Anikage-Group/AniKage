<script lang="ts" context="module">
	export type ToggleKey = 'autoplay' | 'autoNext' | 'skipIntro' | 'skipOutro';
</script>

<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import {
		FastForward,
		Keyboard,
		Lightbulb,
		Maximize2,
		Minimize2,
		Pause,
		Play,
		Repeat,
		Rewind,
		SkipBack,
		SkipForward
	} from 'lucide-svelte';
	import { lang, t } from '$lib/stores/i18n';

	/**
	 * Quick-action row directly under the player.
	 * Settings-backed toggles are fully controlled by the host page.
	 */
	export let hasPrev = false;
	export let hasNext = false;
	export let theater = false;
	export let light = false;
	export let autoplay = true;
	export let autoNext = true;
	export let autoSkipIntro = false;
	export let autoSkipOutro = false;
	export let saved = false;

	const dispatch = createEventDispatcher<{
		prev: void;
		next: void;
		theater: void;
		light: void;
		shortcuts: void;
		toggle: { key: ToggleKey; value: boolean };
	}>();

	const base =
		'flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all duration-150 active:scale-95';
	const on = 'border-accent/50 bg-accent/10 text-accent shadow-glow-sm';
	const off = 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink';
	/** Icon-only layout when the row would otherwise overflow. */
	const baseIcon = base.replace('px-3', 'px-2.5');

	function flip(key: ToggleKey, value: boolean) {
		dispatch('toggle', { key, value: !value });
	}

	/* ---------- overflow detection: collapse to icons when tight ---------- */
	let row: HTMLDivElement;
	let labels = true;
	let measureRaf = 0;
	let lastAvail = -1;

	/**
	 * If the labelled row overflows horizontally, drop the text labels and show
	 * icons only. Re-expands when there is comfortable room again.
	 */
	function measure() {
		if (!row) return;
		const avail = row.clientWidth;
		if (labels) {
			// `scrollWidth` reflects the natural (labelled) content width.
			if (row.scrollWidth > avail + 1) labels = false;
		} else {
			// Need headroom before re-adding labels to avoid oscillation.
			if (lastAvail !== -1 && avail > lastAvail + 80) labels = true;
		}
		lastAvail = avail;
	}

	function scheduleMeasure() {
		if (typeof requestAnimationFrame !== 'function') return;
		if (measureRaf) cancelAnimationFrame(measureRaf);
		measureRaf = requestAnimationFrame(() => {
			measureRaf = 0;
			measure();
		});
	}

	onMount(() => {
		measure();
		const ro = new ResizeObserver(scheduleMeasure);
		if (row) ro.observe(row);
		return () => {
			ro.disconnect();
			if (measureRaf) cancelAnimationFrame(measureRaf);
		};
	});

	// Re-measure whenever toggles/slot content change the row's width.
	$: if (
		row &&
		(hasPrev ||
			hasNext ||
			saved ||
			theater ||
			light ||
			autoplay ||
			autoNext ||
			autoSkipIntro ||
			autoSkipOutro)
	)
		scheduleMeasure();
</script>

<div
	bind:this={row}
	class="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-0.5"
>
	<button
		on:click={() => dispatch('prev')}
		disabled={!hasPrev}
		class="{labels ? base : baseIcon} {hasPrev ? off : 'border-line/40 bg-surface/20 text-muted/40'} disabled:cursor-not-allowed disabled:opacity-40"
		title={t('tPrevTip', $lang)}
	>
		<SkipBack size={14} />{#if labels} {t('prev', $lang)}{/if}
	</button>
	<button
		on:click={() => dispatch('next')}
		disabled={!hasNext}
		class="{labels ? base : baseIcon} {hasNext ? off : 'border-line/40 bg-surface/20 text-muted/40'} disabled:cursor-not-allowed disabled:opacity-40"
		title={t('tNextTip', $lang)}
	>
		{#if labels}{t('next', $lang)} {/if}<SkipForward size={14} />
	</button>

	<span class="mx-1 h-5 w-px shrink-0 bg-line/50" aria-hidden="true"></span>

	<button
		on:click={() => dispatch('theater')}
		class="{labels ? base : baseIcon} {theater ? on : off}"
		title={t('tTheaterTip', $lang)}
	>
		{#if theater}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
		{#if labels}{theater ? t('exitTheater', $lang) : t('theater', $lang)}{/if}
	</button>
	<button on:click={() => dispatch('light')} class="{labels ? base : baseIcon} {light ? on : off}" title={t('tLightTip', $lang)}>
		<Lightbulb size={14} />{#if labels} {t('ctrlLight', $lang)}{/if}
	</button>
	<button on:click={() => dispatch('shortcuts')} class="{labels ? base : baseIcon} {off}" title={t('tKeysTip', $lang)}>
		<Keyboard size={14} />{#if labels} {t('keys', $lang)}{/if}
	</button>

	<span class="mx-1 h-5 w-px shrink-0 bg-line/50" aria-hidden="true"></span>

	<button on:click={() => flip('autoplay', autoplay)} class="{labels ? base : baseIcon} {autoplay ? on : off}" title={t('tAutoplayTip', $lang)}>
		{#if autoplay}<Pause size={14} />{:else}<Play size={14} fill="currentColor" />{/if}
		{#if labels} {t('autoplay', $lang)}{/if}
	</button>
	<button on:click={() => flip('autoNext', autoNext)} class="{labels ? base : baseIcon} {autoNext ? on : off}" title={t('tAutoNextTip', $lang)}>
		<Repeat size={14} />{#if labels} {t('autoNext', $lang)}{/if}
	</button>
	<button
		on:click={() => flip('skipIntro', autoSkipIntro)}
		class="{labels ? base : baseIcon} {autoSkipIntro ? on : off}"
		title={t('tSkipIntroTip', $lang)}
	>
		<FastForward size={14} />{#if labels} {t('skipIntro', $lang)}{/if}
	</button>
	<button
		on:click={() => flip('skipOutro', autoSkipOutro)}
		class="{labels ? base : baseIcon} {autoSkipOutro ? on : off}"
		title={t('tSkipOutroTip', $lang)}
	>
		<Rewind size={14} />{#if labels} {t('skipOutro', $lang)}{/if}
	</button>

	<!-- Host injects the watchlist trigger here -->
	<span class="contents" title={saved ? t('cInWatchlist', $lang) : t('cNotInWatchlist', $lang)}>
		<slot name="end" />
	</span>
</div>
