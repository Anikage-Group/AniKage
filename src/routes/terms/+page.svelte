<script lang="ts">
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import { lang, t } from '$lib/stores/i18n';

	interface Clause {
		title: string;
		body: string[];
		list?: string[];
	}

	const clauses: Clause[] = [
		{
			title: '1. Terms',
			body: [
				'By accessing this Website, you are agreeing to be bound by these Website Terms and Conditions of Use and agree that you are responsible for the agreement with any applicable local laws. If you disagree with any of these terms, you are prohibited from accessing this site. The materials contained in this Website are protected by copyright and trademark law.'
			]
		},
		{
			title: '2. Use License',
			body: [
				'Permission is granted to temporarily download one copy of the materials on AniKage for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:'
			],
			list: [
				'modify or copy the materials;',
				'use the materials for any commercial purpose or for any public display;',
				'attempt to reverse engineer any software contained on AniKage Website;',
				'remove any copyright or other proprietary notations from the materials; or',
				'transferring the materials to another person or "mirror" the materials on any other server.'
			]
		},
		{
			title: '3. Disclaimer',
			body: [
				'All the materials on AniKage are provided "as is". AniKage makes no warranties, may it be expressed or implied, therefore negates all other warranties. Furthermore, AniKage does not make any representations concerning the accuracy or reliability of the use of the materials on its Website or otherwise relating to such materials or any sites linked to this Website.'
			]
		},
		{
			title: '4. Limitations',
			body: [
				'AniKage or its suppliers will not be hold accountable for any damages that will arise with the use or inability to use the materials on AniKage’s Website, even if AniKage or an authorize representative of this Website has been notified, orally or written, of the possibility of such damage. Some jurisdiction does not allow limitations on implied warranties or limitations of liability for incidental damages, these limitations may not apply to you.'
			]
		},
		{
			title: '5. Revisions and Errata',
			body: [
				'The materials appearing on AniKage may include technical, typographical, or photographic errors. AniKage will not promise that any of the materials in this Website are accurate, complete, or current. AniKage may change the materials contained on its Website at any time without notice. AniKage does not make any commitment to update the materials.'
			]
		},
		{
			title: '6. Links',
			body: [
				'AniKage has not reviewed all of the sites linked to its Website and is not responsible for the contents of any such linked site. The presence of any link does not imply endorsement by AniKage of the site. The use of any linked website is at the user’s own risk.'
			]
		},
		{
			title: '7. Site Terms of Use Modifications',
			body: [
				'AniKage may revise these Terms of Use for its Website at any time without prior notice. By using this Website, you are agreeing to be bound by the current version of these Terms and Conditions of Use.'
			]
		}
	];
</script>

<svelte:head>
	<title>{t('terms', $lang)} — Anikage</title>
	<meta
		name="description"
		content="AniKage Website Terms and Conditions of Use — license, disclaimer, limitations and revisions."
	/>
</svelte:head>

<div class="relative">
	<Ambient />
	<div class="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
		<h1 class="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
			{t('terms', $lang)}
		</h1>
		<p class="mt-2 text-xs text-muted">AniKage — Website Terms and Conditions of Use</p>

		<div class="mt-10 space-y-10">
			{#each clauses as clause (clause.title)}
				<section>
					<h2 class="font-display text-lg font-semibold tracking-tight text-ink">
						{clause.title}
					</h2>
					{#each clause.body as p (p)}
						<p class="mt-3 text-sm leading-relaxed text-muted">{p}</p>
					{/each}
					{#if clause.list}
						<ul class="mt-3 grid gap-2">
							{#each clause.list as item (item)}
								<li class="flex gap-2.5 text-sm leading-relaxed text-muted">
									<span class="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent"></span>
									<span>{item}</span>
								</li>
							{/each}
						</ul>
						<p class="mt-4 text-sm leading-relaxed text-muted">
							This will let AniKage to terminate upon violations of any of these restrictions. Upon
							termination, your viewing right will also be terminated and you should destroy any
							downloaded materials in your possession whether it is printed or electronic format.
						</p>
					{/if}
				</section>
			{/each}
		</div>
	</div>
</div>
