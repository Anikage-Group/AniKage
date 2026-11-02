<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { lang, t } from '$lib/stores/i18n';
	import { portal } from '$lib/utils/portal';
	import { createDrawerDrag } from '$lib/utils/drawer';
	import { lockScroll, unlockScroll } from '$lib/utils/scrollLock';

	export let open = false;
	export let title = '';

	const dispatch = createEventDispatcher<{ close: void }>();

	/** The sheet element — the drag helper moves it. */
	let sheet: HTMLDivElement;
	/** Pulled up past its resting height → full screen. */
	let expanded = false;

	function close() {
		dispatch('close');
	}

	const drag = createDrawerDrag(
		() => sheet ?? null,
		{
			onClose: close,
			onExpand: () => (expanded = true),
			onCollapse: () => (expanded = false),
			isExpanded: () => expanded
		}
	);

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}

	// The page underneath must not scroll while the sheet is up.
	$: if (open) {
		lockScroll();
	} else {
		unlockScroll();
	}

	onMount(() => {
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			unlockScroll();
		};
	});
</script>

{#if open}
	<!-- Portalled to <body> so the sheet is not trapped in the page content's
	     stacking context (which sits below the bottom navigation bar). -->
	<div use:portal class="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
		<!-- backdrop -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute inset-0 bg-black/60 backdrop-blur-sm"
			transition:fade={{ duration: 200 }}
			on:click={close}
			aria-hidden="true"
		></div>

		<!-- sheet: anchored to the very bottom of the page -->
		<div
			bind:this={sheet}
			class="glass-strong relative z-10 flex w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 shadow-2xl sm:w-full sm:max-w-lg sm:rounded-2xl sm:border {expanded
				? 'h-[100dvh]'
				: 'max-h-[86vh] sm:max-h-[88vh]'}"
			transition:slide={{ duration: 320, axis: 'y' }}
			role="dialog"
			aria-modal="true"
			aria-label={title || 'Panel'}
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
				<span class="h-1.5 w-16 rounded-full bg-ink/30" aria-hidden="true"></span>
			</div>

			<div class="px-5 pb-2">
				<h3 class="font-display text-sm font-semibold tracking-wide uppercase text-ink/90">{title}</h3>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
				<slot />
			</div>
		</div>
	</div>
{/if}
