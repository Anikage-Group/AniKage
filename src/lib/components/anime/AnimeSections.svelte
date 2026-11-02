<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import type { Anime } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';
	import UnderlineTabs from '$lib/components/ui/UnderlineTabs.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RailRow from '$lib/components/anime/RailRow.svelte';
	import { REVEAL_DURATION, REVEAL_Y, revealDelay } from '$lib/utils/reveal';

	/**
	 * One combined details section for the anime page.
	 *
	 * Trailer, related seasons, recommendations and the cast (characters with
	 * their voice actors) all live behind a single tab bar so the page stays
	 * short. On desktop the tabs are a slider strip; on mobile the same tabs
	 * are picked from a bottom-sheet drawer.
	 */
	export let anime: Anime;
	/** Stagger position of this section in the page's entrance cascade. */
	export let reveal = 0;

	type TabId = 'trailer' | 'related' | 'recommendations' | 'cast';

	let active: TabId = 'trailer';
	let drawerOpen = false;

	$: tabs = [
		...(anime.trailer ? [{ id: 'trailer' as TabId, label: t('trailer', $lang) }] : []),
		...(anime.relations?.length ? [{ id: 'related' as TabId, label: t('related', $lang) }] : []),
		...(anime.recommendations?.length
			? [{ id: 'recommendations' as TabId, label: t('recommendations', $lang) }]
			: []),
		...(anime.characters?.length ? [{ id: 'cast' as TabId, label: t('cast', $lang) }] : [])
	];

	// Keep the selection valid when the available tabs change.
	$: if (tabs.length && !tabs.some((x) => x.id === active)) active = tabs[0].id;

	$: activeLabel = tabs.find((x) => x.id === active)?.label ?? '';

	/** Relation type ("SEQUEL", "PREQUEL"…) shown under each related card. */
	$: relationMeta = Object.fromEntries(
		(anime.relations ?? []).map((r) => [r.id, r.relationType.replace('_', ' ')])
	);

	function pick(id: TabId) {
		active = id;
		drawerOpen = false;
	}
</script>

{#if tabs.length}
	<section
		class="mt-10"
		in:fly={{ y: REVEAL_Y, duration: REVEAL_DURATION, delay: revealDelay(reveal) }}
	>
		<!-- Desktop: slider tabs -->
		<div class="hidden sm:block">
			<UnderlineTabs items={tabs} bind:active />
		</div>

		<!-- Mobile: drawer selector -->
		<div class="sm:hidden">
			<button
				on:click={() => (drawerOpen = true)}
				class="flex w-full items-center justify-between gap-2 rounded-md border border-line/60 bg-surface/40 px-4 py-2.5 text-sm font-medium text-ink transition-all duration-150 hover:border-accent/40 active:scale-[0.98]"
				aria-haspopup="dialog"
				aria-expanded={drawerOpen}
			>
				<span class="flex items-center gap-2">
					<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					{activeLabel}
				</span>
				<ChevronDown size={15} class="shrink-0 text-muted" />
			</button>
		</div>

		<!-- Panel -->
		<div class="mt-5">
			{#key active}
				<div in:fade={{ duration: 200 }}>
					{#if active === 'trailer' && anime.trailer}
						<div
							class="aspect-video w-full max-w-3xl overflow-hidden rounded-xl border border-line/50 bg-black"
						>
							<iframe
								src={`https://www.youtube.com/embed/${anime.trailer}`}
								title="Trailer"
								class="h-full w-full"
								frameborder="0"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								allowfullscreen
							></iframe>
						</div>
					{:else if active === 'related'}
						<!-- Same rail as the home page, with arrow navigation -->
						<RailRow
							title={t('related', $lang)}
							items={anime.relations?.map((r) => r.anime) ?? []}
							meta={relationMeta}
						/>
					{:else if active === 'recommendations'}
						<!-- Same rail as the home page, with arrow navigation -->
						<RailRow
							title={t('recommendations', $lang)}
							items={anime.recommendations?.map((r) => r.anime) ?? []}
						/>
					{:else if active === 'cast'}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each anime.characters ?? [] as c (c.name)}
								<div class="hairline rounded-xl bg-surface/30 p-3">
									<div class="flex items-center gap-3">
										<div class="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface2">
											{#if c.image}
												<img
													src={c.image}
													alt={c.name}
													class="h-full w-full object-cover"
													loading="lazy"
												/>
											{/if}
										</div>
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold text-ink">{c.name}</p>
											{#if c.role}
												<p class="truncate text-[11px] text-muted">{c.role}</p>
											{/if}
										</div>
									</div>

									{#if c.voiceActors?.length}
										<div class="mt-3 space-y-1.5 border-t border-line/40 pt-2.5">
											{#each c.voiceActors as va (va.name)}
												<div class="flex items-center gap-2">
													{#if va.image}
														<img
															src={va.image}
															alt={va.name}
															class="h-6 w-6 shrink-0 rounded-full object-cover"
															loading="lazy"
														/>
													{/if}
													<span class="truncate text-[11px] text-muted">{va.name}</span>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/key}
		</div>
	</section>

	<!-- Mobile drawer: pick a section -->
	<BottomSheet
		open={drawerOpen}
		title={t('browseSections', $lang)}
		on:close={() => (drawerOpen = false)}
	>
		<div class="space-y-1.5">
			{#each tabs as tab (tab.id)}
				<button
					on:click={() => pick(tab.id)}
					class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left text-sm font-medium transition {active === tab.id
						? 'border-accent/50 bg-accent/10 text-accent'
						: 'border-line/50 text-ink active:bg-surface/60'}"
				>
					{tab.label}
					{#if active === tab.id}
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
					{/if}
				</button>
			{/each}
		</div>
	</BottomSheet>
{/if}
