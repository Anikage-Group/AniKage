<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Check } from 'lucide-svelte';
	import { THEMES, themeId, setTheme, type ThemeId } from '$lib/stores/theme';
	import { lang, t } from '$lib/stores/i18n';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import ThemeSwatch from '$lib/components/ui/ThemeSwatch.svelte';

	export let open = false;

	const dispatch = createEventDispatcher<{ close: void }>();
	let filter: 'all' | 'dark' | 'light' = 'all';

	$: filtered = THEMES.filter((th) => filter === 'all' || th.mode === filter);

	function pick(id: ThemeId) {
		setTheme(id);
	}
</script>

<!-- Colour theme drawer -->
<BottomSheet open={open} title={t('appearance', $lang)} on:close={() => dispatch('close')}>
	<!-- mode filter -->
	<div class="mb-3 flex gap-2">
		{#each ['all', 'dark', 'light'] as m (m)}
			<button
				on:click={() => (filter = m as typeof filter)}
				class="flex-1 rounded-md border px-3 py-2 text-xs font-medium capitalize transition {filter === m
					? 'border-accent/50 bg-accent/10 text-accent'
					: 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink'}"
			>
				{m === 'all' ? t('allThemes', $lang) : m === 'dark' ? t('dark', $lang) : t('light', $lang)}
			</button>
		{/each}
	</div>

	<div class="space-y-1">
		{#each filtered as th (th.id)}
			<button
				on:click={() => pick(th.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors {$themeId ===
				th.id
					? 'bg-accent/10 text-ink'
					: 'text-muted hover:bg-surface/60 hover:text-ink'}"
			>
				<ThemeSwatch theme={th.id} size="md" />
				<span class="min-w-0 flex-1 truncate">{th.name}</span>
				{#if $themeId === th.id}
					<Check size={13} class="shrink-0 text-accent" />
				{/if}
			</button>
		{/each}
	</div>
</BottomSheet>
