<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Check, Globe } from 'lucide-svelte';
	import { LANGS, lang, t } from '$lib/stores/i18n';
	import { settings, updateSetting } from '$lib/stores/settings';
	import type { Lang } from '$lib/types';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';

	export let open = false;

	const dispatch = createEventDispatcher<{ close: void }>();

	function pick(id: Lang) {
		updateSetting('lang', id);
		dispatch('close');
	}
</script>

<!-- Language drawer -->
<BottomSheet open={open} title={t('siteLanguage', $lang)} on:close={() => dispatch('close')}>
	<div class="space-y-1.5">
		{#each LANGS as l (l.id)}
			<button
				on:click={() => pick(l.id)}
				class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left transition {$settings.lang === l.id
					? 'border-accent/50 bg-accent/10 text-accent'
					: 'border-line/50 text-ink active:bg-surface/60'}"
			>
				<span class="flex items-center gap-3">
					<Globe size={16} class={$settings.lang === l.id ? 'text-accent' : 'text-muted'} />
					<span class="text-sm font-medium">{l.native}</span>
					<span class="text-xs text-muted">{l.id}</span>
				</span>
				{#if $settings.lang === l.id}
					<Check size={15} class="shrink-0 text-accent" strokeWidth={3} />
				{/if}
			</button>
		{/each}
	</div>
</BottomSheet>
