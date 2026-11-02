<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { Keyboard, X } from 'lucide-svelte';
	import { lang, t } from '$lib/stores/i18n';

	/** Keyboard shortcuts overlay for the watch page. */
	export let open = false;

	const dispatch = createEventDispatcher<{ close: void }>();

	const KEYS: { keys: string[]; key: string }[] = [
		{ keys: ['Space', 'K'], key: 'kPlayPause' },
		{ keys: ['←'], key: 'kSeekBack' },
		{ keys: ['→'], key: 'kSeekFwd' },
		{ keys: ['S'], key: 'kSkipNow' },
		{ keys: ['J'], key: 'kPrevEp' },
		{ keys: ['L'], key: 'kNextEp' },
		{ keys: ['T'], key: 'kTheater' },
		{ keys: ['D'], key: 'kLightMode' },
		{ keys: ['A'], key: 'kAutoplay' },
		{ keys: ['N'], key: 'kAutoNext' },
		{ keys: ['P'], key: 'kSwitchServers' },
		{ keys: ['Esc'], key: 'kCloseOverlays' }
	];
</script>

<svelte:window
	on:keydown={(e) => {
		if (open && e.key === 'Escape') dispatch('close');
	}}
/>

{#if open}
	<div class="fixed inset-0 z-[110] flex items-center justify-center p-4">
		<div
			transition:fade={{ duration: 200 }}
			class="absolute inset-0 bg-black/70 backdrop-blur-sm"
			aria-hidden="true"
		></div>

		<div
			transition:scale={{ duration: 180, start: 0.96 }}
			class="glass-strong hairline relative w-full max-w-md rounded-xl p-5 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={t('keyboardShortcuts', $lang)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-ink">
					<Keyboard size={15} class="text-accent" /> {t('keyboardShortcuts', $lang)}
				</h2>
				<button
					on:click={() => dispatch('close')}
					class="rounded-md p-1.5 text-muted transition hover:text-ink active:scale-95"
					aria-label={t('close', $lang)}
				>
					<X size={17} />
				</button>
			</div>

			<ul class="space-y-1">
				{#each KEYS as k (k.key)}
					<li class="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 odd:bg-surface/30">
						<span class="text-sm text-muted">{t(k.key, $lang)}</span>
						<span class="flex shrink-0 items-center gap-1">
							{#each k.keys as key (key)}
								<kbd class="rounded border border-line/60 bg-surface2/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink">
									{key}
								</kbd>
							{/each}
						</span>
					</li>
				{/each}
			</ul>

			<p class="mt-4 text-[11px] leading-relaxed text-muted/70">
				{t('kSkipNote', $lang)}
			</p>
		</div>
	</div>
{/if}
