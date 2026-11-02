<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { MessageSquare } from 'lucide-svelte';
	import { themeId, customTheme } from '$lib/stores/theme';
	import { lang, t } from '$lib/stores/i18n';
	import { portal } from '$lib/utils/portal';
	import { createDrawerDrag } from '$lib/utils/drawer';
	import { lockScroll, unlockScroll } from '$lib/utils/scrollLock';
	import { cssColorToRgb, rgbString } from '$lib/utils/color';

	/**
	 * The Anime Community official comment widget.
	 * https://theanimecommunity.com/embed.js
	 *
	 * Mechanism (verified against the live embed script):
	 *  1. window.theAnimeCommunityConfig = { MAL_ID: "<mal id>" }
	 *  2. load embed.js (deferred, once per page)
	 *  3. the script mounts an auto-resizing iframe into
	 *     #anime-community-comment-section
	 *
	 * Exactly one container may exist in the DOM at a time, so this component
	 * renders either the desktop inline embed or the mobile bottom drawer —
	 * never both.
	 */
	export let anilistId: number;
	export let malId: number | null = null;
	export let title = '';
	/**
	 * Episode number for per-episode discussion threads.
	 * The widget classifies a series-wide thread as episode/chapter `0`; a
	 * positive number opens that episode's own thread.
	 */
	export let episode: number | null = null;
	/** Render the inline embed on desktop widths. */
	export let inline = true;
	/** Render the floating trigger that opens the mobile bottom drawer. */
	export let showMobileTrigger = false;

	const SCRIPT_ID = 'anime-community-script';
	const CONTAINER_ID = 'anime-community-comment-section';

	interface WidgetConfig {
		MAL_ID: string;
		episodeChapterNumber: string;
		removeBorder: string;
		colorScheme: Record<string, string>;
	}

	/**
	 * Resolve a site theme token to a concrete rgb() string.
	 *
	 * The comment widget lives in a cross-origin iframe, so it cannot read the
	 * host page's CSS custom properties. Hand it the resolved value instead.
	 */
	function themeColor(name: string, fallback: string): string {
		const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		const rgb = cssColorToRgb(raw);
		return rgb ? rgbString(rgb) : fallback;
	}

	let drawerOpen = false;
	let loading = true;
	let ready = false;

	/** Pull-up-to-fullscreen state for the mobile drawer. */
	let fullscreen = false;

	/** The drawer element — the shared drag helper moves it. */
	let drawer: HTMLDivElement;

	const drag = createDrawerDrag(
		() => drawer ?? null,
		{
			onClose: () => (drawerOpen = false),
			onExpand: () => (fullscreen = true),
			onCollapse: () => (fullscreen = false),
			isExpanded: () => fullscreen
		}
	);

	let isDesktop = true;
	let wired = new WeakSet<Element>();
	/** Watches the container for the iframe the embed script inserts. */
	let containerObserver: MutationObserver | null = null;

	function checkViewport() {
		isDesktop = window.matchMedia('(min-width: 768px)').matches;
	}

	/** Attach a load listener to the widget iframe so the skeleton can fade. */
	function watchContainer() {
		const container = document.getElementById(CONTAINER_ID);
		if (!container) return;
		const wire = (iframe: Element) => {
			if (wired.has(iframe)) return;
			wired.add(iframe);
			iframe.addEventListener('load', () => {
				loading = false;
			});
		};
		container.querySelectorAll('iframe').forEach(wire);
		containerObserver?.disconnect();
		containerObserver = new MutationObserver(() =>
			container.querySelectorAll('iframe').forEach(wire)
		);
		containerObserver.observe(container, { childList: true, subtree: true });
	}

	/** (Re)mount the widget into the currently rendered container. */
	async function mount() {
		await tick();
		const container = document.getElementById(CONTAINER_ID);
		if (!container) {
			// Drawer closed on mobile → nothing to mount into right now.
			return;
		}
		loading = true;
		const w = window as unknown as {
			theAnimeCommunityConfig?: WidgetConfig;
			theAnimeCommunity?: { reload: () => void };
		};
		// Match the widget to the active site theme. Values are resolved to
		// concrete colours because CSS variables do not cross the iframe
		// boundary. `backgroundColor` also lets the widget pick its light/dark
		// colour scheme automatically (it tests the background luminance).
		w.theAnimeCommunityConfig = {
			// Comment sections are classified by MAL ID + episode chapter.
			MAL_ID: String(malId ?? anilistId),
			episodeChapterNumber: String(episode ?? 0),
			// The widget draws its own outermost border; the docs' opt-out keeps
			// the section flush with the card around it.
			removeBorder: 'true',
			colorScheme: {
				primaryColor: themeColor('--c-accent', 'rgb(255, 104, 0)'),
				backgroundColor: themeColor('--c-surface', 'rgb(35, 35, 35)'),
				dropDownTextColor: themeColor('--c-ink', 'rgb(245, 245, 245)'),
				strongTextColor: themeColor('--c-ink', 'rgb(245, 245, 245)'),
				primaryTextColor: themeColor('--c-ink', 'rgb(245, 245, 245)'),
				secondaryTextColor: themeColor('--c-muted', 'rgb(145, 145, 145)'),
				iconColor: themeColor('--c-muted', 'rgb(145, 145, 145)'),
				accentColor: themeColor('--c-accent', 'rgb(60, 60, 60)')
			}
		};

		if (w.theAnimeCommunity?.reload) {
			w.theAnimeCommunity.reload();
		} else if (!document.getElementById(SCRIPT_ID)) {
			const s = document.createElement('script');
			s.src = 'https://theanimecommunity.com/embed.js';
			s.id = SCRIPT_ID;
			s.defer = true;
			document.body.appendChild(s);
		}
		watchContainer();
		// Safety: never leave the skeleton up if the widget never signals load.
		setTimeout(() => (loading = false), 6000);
	}

	onMount(() => {
		ready = true;
		checkViewport();
		window.addEventListener('resize', checkViewport);
		return () => {
			window.removeEventListener('resize', checkViewport);
			containerObserver?.disconnect();
		};
	});

	// Re-mount whenever the container location can change (drawer open/close,
	// viewport crossing the mobile/desktop boundary), the episode changes, or
	// the theme changes. `$themeId` is read here so the reactive block re-runs
	// on every theme switch and the iframe receives the new colour scheme.
	$: if (ready && (drawerOpen || isDesktop)) {
		void $themeId;
		void $customTheme;
		void episode;
		mount();
	}

	// The page underneath must not scroll while the drawer is up.
	$: if (drawerOpen) {
		lockScroll();
	} else {
		unlockScroll();
	}
</script>

{#if inline && isDesktop}
	<div class="overflow-hidden rounded-xl bg-surface">
		<div class="flex items-center justify-between border-b border-line/50 px-4 py-3">
			<p class="flex items-center gap-2 text-sm font-semibold text-ink">
				<MessageSquare size={15} class="text-accent" /> {t('communityDiscussion', $lang)}
			</p>
		</div>
		<div class="relative min-h-[220px] bg-surface px-1 pb-1 pt-2">
			{#if loading}
				<div transition:fade={{ duration: 200 }} class="shimmer-bg absolute inset-2 rounded-md"></div>
			{/if}
			<div id={CONTAINER_ID}></div>
		</div>
	</div>
{/if}

{#if showMobileTrigger && !isDesktop}
	<!-- Sits just above the bottom navigation bar -->
	<button
		on:click={() => (drawerOpen = true)}
		class="mb-[4.75rem] flex w-full items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition-all duration-150 active:scale-95"
	>
		<MessageSquare size={15} /> {t('discussion', $lang)}
	</button>
{/if}

{#if drawerOpen && !isDesktop}
	<!-- Portalled to <body>: the page content sits inside a `relative z-10`
	     wrapper, so a drawer rendered in place would be trapped below the
	     bottom navigation bar (which is a sibling of that wrapper). -->
	<div use:portal class="fixed inset-0 z-[70] md:hidden">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute inset-0 bg-black/60 backdrop-blur-sm" on:click={() => (drawerOpen = false)} aria-hidden="true"></div>
		<!-- The pane overlaps the bottom bar and renders on top of it. -->
		<div
			bind:this={drawer}
			transition:slide={{ duration: 320, axis: 'y' }}
			class="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-line/40 transition-[height] duration-300 {fullscreen
				? 'h-[100dvh]'
				: 'h-[82vh]'}"
			style="background-color: var(--c-surface);"	
			role="dialog"
			aria-label={`${t('discussion', $lang)} — ${title}`}
		>
			<!-- Large grab handle: pull up to expand, pull down to dismiss. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				on:pointerdown={drag.onPointerDown}
				on:pointermove={drag.onPointerMove}
				on:pointerup={drag.onPointerUp}
				on:pointercancel={drag.onPointerCancel}
				class="flex h-16 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
				role="presentation"
			>
				<span class="h-1.5 w-16 rounded-full bg-ink/25" aria-hidden="true"></span>
			</div>
			<div class="px-4 pb-3">
				<p class="flex items-center gap-2 text-sm font-semibold text-ink">
					<MessageSquare size={15} class="text-accent" /> {t('discussion', $lang)}
				</p>
			</div>
			<div class="relative min-h-0 flex-1 overflow-y-auto bg-surface px-2 pb-6">
				{#if loading}
					<div transition:fade={{ duration: 200 }} class="shimmer-bg absolute inset-x-2 top-2 h-40 rounded-md"></div>
				{/if}
				<div id={CONTAINER_ID}></div>
			</div>
		</div>
	</div>
{/if}
