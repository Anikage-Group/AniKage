<script lang="ts">
	import { lang, t } from '$lib/stores/i18n';
	import { PROJECT_LINKS } from '$lib/config';
	import Logo from '$lib/components/brand/Logo.svelte';

	/** Site links, followed by the public project endpoints. */
	const links = [
		{ href: '/', key: 'lander', external: false },
		{ href: '/home', key: 'home', external: false },
		{ href: '/watchlist', key: 'watchlist', external: false },
		{ href: '/schedule', key: 'schedule', external: false },
		{ href: '/continue', key: 'continueWatching', external: false },
		{ href: '/settings', key: 'settings', external: false },
		{ href: '/terms', key: 'terms', external: false },
		{ href: PROJECT_LINKS.sourceCode, key: 'sourceCode', external: true },
		{ href: PROJECT_LINKS.api, key: 'api', external: true }
	];

	const year = new Date().getFullYear();
</script>

<footer class="mt-16 border-t border-line/50 bg-surface/30">
	<div class="mx-auto max-w-[1600px] px-4 py-12 sm:px-6">
		<!-- Logo and links share one row; the description spans the full width -->
		<div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
			<a href="/" class="flex items-center">
				<Logo height={32} />
			</a>

			<nav aria-label="Footer">
				<ul class="flex flex-wrap gap-x-6 gap-y-2">
					{#each links as l (l.key)}
						<li>
							<a
								href={l.href}
								target={l.external ? '_blank' : undefined}
								rel={l.external ? 'noopener noreferrer' : undefined}
								class="text-sm text-ink/80 transition-colors hover:text-accent"
							>
								{t(l.key, $lang)}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</div>

		<p class="mt-5 text-sm leading-relaxed text-muted">
			{t('footTagline', $lang)}
		</p>

		<div class="mt-10 flex flex-col gap-3 border-t border-line/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-xs text-muted">
				© {year} Anikage. {t('footCredit', $lang)}
			</p>
			<p class="text-xs text-muted/70">
				{t('footDisclaimer', $lang)}
			</p>
		</div>
	</div>
</footer>
