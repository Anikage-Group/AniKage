<script lang="ts">
	import { fade } from 'svelte/transition';
	import {
		Check,
		ExternalLink,
		LogOut,
		Moon,
		Palette,
		RefreshCw,
		Settings as SettingsIcon,
		Sun,
		User
	} from 'lucide-svelte';
	import UnderlineTabs from '$lib/components/ui/UnderlineTabs.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import ColorWheel from '$lib/components/ui/ColorWheel.svelte';
	import ThemeSwatch from '$lib/components/ui/ThemeSwatch.svelte';
	import {
		THEMES,
		themeId,
		setTheme,
		customTheme,
		updateCustomTheme,
		resetCustomTheme,
		CUSTOM_COLOR_FIELDS,
		type ThemeColorKey
	} from '$lib/stores/theme';
	import { settings, updateSetting, resetSettings, type Settings } from '$lib/stores/settings';
	import { toast } from '$lib/stores/toast';
	import { LANGS, lang, t } from '$lib/stores/i18n';
	import type { Lang } from '$lib/types';
	import {
		startLogin,
		syncAnilistWatchlist,
		logout,
		isLoggedIn,
		fetchAccountStats,
		anilistProfileUrl,
		type AccountStats
	} from '$lib/services/anilistOAuth';
	import {
		startMalLogin,
		malLogout,
		isMalLoggedIn,
		malProfileUrl,
		syncMalWatchlist
	} from '$lib/services/malOAuth';

	let tab = 'general';
	$: tabs = [
		{ id: 'appearance', label: t('appearance', $lang) },
		{ id: 'general', label: t('general', $lang) },
		{ id: 'account', label: t('account', $lang) }
	];

	let modeFilter: 'all' | 'dark' | 'light' = 'all';
	$: filteredThemes = THEMES.filter((t) => modeFilter === 'all' || t.mode === modeFilter);

	let syncing = false;
	let malSyncing = false;

	/* account details */
	let stats: AccountStats | null = null;
	let statsLoading = false;

	$: statsRows = stats
		? [
				{ label: t('statTotal', $lang), value: stats.total },
				{ label: t('statWatching', $lang), value: stats.watching },
				{ label: t('statCompleted', $lang), value: stats.completed },
				{ label: t('statPlanned', $lang), value: stats.planned },
				...(stats.rewatching ? [{ label: t('statRewatching', $lang), value: stats.rewatching }] : []),
				...(stats.paused ? [{ label: t('statPaused', $lang), value: stats.paused }] : []),
				...(stats.dropped ? [{ label: t('statDropped', $lang), value: stats.dropped }] : [])
			]
		: [];

	/** Read the signed-in user's AniList library sizes. */
	async function loadStats() {
		if (!isLoggedIn() || statsLoading) return;
		statsLoading = true;
		try {
			stats = await fetchAccountStats();
		} catch {
			stats = null;
		} finally {
			statsLoading = false;
		}
	}

	function selectTab(id: string) {
		tab = id;
		if (id === 'account') loadStats();
	}

	function toggle(key: keyof Settings) {
		updateSetting(key, !($settings[key] as boolean) as never);
	}

	async function doAnilistSync() {
		if (syncing) return;
		syncing = true;
		try {
			const result = await syncAnilistWatchlist();
			const details = `${result.imported} imported, ${result.pushed} pushed${result.removed ? `, ${result.removed} removed locally` : ''}${result.deleted ? `, ${result.deleted} deleted remotely` : ''}`;
			if (result.failed) {
				toast(
					`AniList sync finished with ${result.failed} failure(s) — ${details}${result.error ? `: ${result.error}` : ''}`,
					false
				);
			} else {
				toast(`AniList synced — ${details}`, true);
			}
			void loadStats();
		} catch (e) {
			toast(e instanceof Error ? e.message : 'AniList sync failed', false);
		} finally {
			syncing = false;
		}
	}

	async function doMalSync() {
		if (malSyncing) return;
		malSyncing = true;
		try {
			const result = await syncMalWatchlist();
			const details = `${result.imported} imported, ${result.pushed} pushed${result.removed ? `, ${result.removed} removed locally` : ''}${result.deleted ? `, ${result.deleted} deleted remotely` : ''}`;
			if (result.failed) {
				toast(
					`MyAnimeList sync finished with ${result.failed} failure(s) — ${details}${result.error ? `: ${result.error}` : ''}`,
					false
				);
			} else {
				toast(`MyAnimeList synced — ${details}`, true);
			}
		} catch (e) {
			toast(e instanceof Error ? e.message : 'MyAnimeList sync failed', false);
		} finally {
			malSyncing = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings', $lang)} — Anikage</title>
</svelte:head>

<div class="relative">
	<Ambient intensity={0.1} />
	<div class="relative z-10 mx-auto max-w-3xl px-4 pt-8 sm:px-6">
		<h1 class="font-display text-2xl font-bold tracking-tight text-ink">{t('settings', $lang)}</h1>
		<p class="mt-1 text-xs text-muted">{t('preferencesPersist', $lang)}</p>

		<div class="mt-6">
			<UnderlineTabs items={tabs} active={tab} on:select={(e) => selectTab(e.detail)} />
		</div>

		<div class="mt-8 space-y-6" transition:fade>
			{#if tab === 'appearance'}
				<!-- Mode filter -->
				<div class="flex gap-1.5">
					{#each ['all', 'dark', 'light'] as m (m)}
						<button
							on:click={() => (modeFilter = m as typeof modeFilter)}
							class="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition {modeFilter === m
								? 'border-accent/50 bg-accent/10 text-accent'
								: 'border-line/60 text-muted hover:border-accent/30 hover:text-ink'}"
						>
							{#if m === 'dark'}<Moon size={12} />{:else if m === 'light'}<Sun size={12} />{:else}<Palette size={12} />{/if}
							{m === 'all' ? t('allThemes', $lang) : m === 'dark' ? t('dark', $lang) : t('light', $lang)}
						</button>
					{/each}
				</div>

				<!-- Theme cards -->
				<div class="grid gap-3 sm:grid-cols-2">
					{#each filteredThemes as th (th.id)}
						<button
							on:click={() => { setTheme(th.id); toast(`Theme: ${th.name}`, true); }}
							class="group overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.98] {$themeId === th.id
								? 'border-accent/60 bg-accent/10 shadow-glow-sm'
								: 'border-line/50 bg-surface/30 hover:border-accent/30 hover:bg-surface/50'}"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex min-w-0 items-center gap-2.5">
									<ThemeSwatch theme={th.id} size="md" />
									<p class="truncate font-display text-sm font-semibold text-ink">{th.name}</p>
								</div>
								{#if $themeId === th.id}
									<span class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-white">
										<Check size={12} strokeWidth={3} />
									</span>
								{/if}
							</div>
							<div class="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
								{#if th.mode === 'dark'}<Moon size={10} />{:else}<Sun size={10} />{/if}
								{th.mode === 'dark' ? t('dark', $lang) : t('light', $lang)}
							</div>
						</button>
					{/each}
				</div>

				<!-- Custom palette: intentionally only lives in Settings, never the quick picker. -->
				<section class="rounded-xl border border-line/50 bg-surface/30 p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h3 class="flex items-center gap-1.5 text-sm font-semibold text-ink">
								<Palette size={14} class="text-accent" />
								{t('customTheme', $lang)}
								{#if $themeId === 'custom'}
									<span class="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
										{t('active', $lang)}
									</span>
								{/if}
							</h3>
							<p class="mt-0.5 text-xs text-muted">{t('customThemeText', $lang)}</p>
						</div>
						<div class="flex gap-2">
							<button
								on:click={() => { resetCustomTheme(); toast('Custom colors reset', true); }}
								class="rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-ink active:scale-95"
							>
								{t('resetCustomTheme', $lang)}
							</button>
							<button
								on:click={() => { setTheme('custom'); toast('Custom theme applied', true); }}
								class="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:shadow-glow-sm active:scale-95"
							>
								{t('applyCustomTheme', $lang)}
							</button>
						</div>
					</div>

					<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{#each CUSTOM_COLOR_FIELDS as field (field.key)}
							<ColorWheel
								label={field.label}
								value={$customTheme[field.key as ThemeColorKey]}
								on:change={(e) =>
									updateCustomTheme({
										[field.key]: e.detail
									})}
							/>
						{/each}
					</div>
				</section>

			{:else if tab === 'general'}
				<div class="hairline divide-y divide-line/40 rounded-xl bg-surface/30">
					{#each [
						{ key: 'autoNext', label: 'autoPlayNext', text: 'autoPlayNextText' },
						{ key: 'autoNextOnEnd', label: 'autoNextOnEnd', text: 'autoNextOnEndText' },
						{ key: 'autoSkipIntro', label: 'autoSkipIntro', text: 'autoSkipIntroText' },
						{ key: 'autoSkipOutro', label: 'autoSkipOutro', text: 'autoSkipOutroText' },
						{ key: 'hideAdult', label: 'hideAdult', text: 'hideAdultText' }
					] as row (row.key)}
						<button on:click={() => toggle(row.key as keyof Settings)} class="flex w-full items-center justify-between p-4 text-left transition hover:bg-surface/40">
							<span>
								<span class="block text-sm font-medium text-ink">{t(row.label, $lang)}</span>
								<span class="mt-0.5 block text-xs text-muted">{t(row.text, $lang)}</span>
							</span>
							<span class="relative h-5 w-9 shrink-0 rounded-full transition-colors {$settings[row.key as keyof Settings] ? 'bg-accent' : 'bg-line/60'}">
								<span class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all {$settings[row.key as keyof Settings] ? 'left-[18px]' : 'left-0.5'}"></span>
							</span>
						</button>
					{/each}

					<!-- Preferred audio -->
					<div class="p-4">
						<p class="text-sm font-medium text-ink">{t('preferredAudio', $lang)}</p>
						<p class="mt-0.5 text-xs text-muted">{t('preferredAudioText', $lang)}</p>
						<div class="mt-3 flex gap-1.5">
							{#each ['sub', 'dub'] as a (a)}
								<button
									on:click={() => updateSetting('preferredAudio', a as 'sub' | 'dub')}
									class="rounded-md border px-3 py-1.5 text-xs font-medium uppercase transition {$settings.preferredAudio === a
										? 'border-accent/50 bg-accent/10 text-accent'
										: 'border-line/60 text-muted hover:border-accent/30'}"
								>
									{a}
								</button>
							{/each}
						</div>
					</div>

					<!-- Site language -->
					<div class="p-4">
						<p class="text-sm font-medium text-ink">
							{t('siteLanguageLabel', $lang)}
						</p>
						<p class="mt-0.5 text-xs text-muted">{t('siteLanguageText', $lang)}</p>
						<div class="mt-3 flex gap-1.5">
							{#each LANGS as l (l.id)}
								<button
									on:click={() => updateSetting('lang', l.id as Lang)}
									class="rounded-md border px-3 py-1.5 text-xs font-medium transition {$settings.lang === l.id
										? 'border-accent/50 bg-accent/10 text-accent'
										: 'border-line/60 text-muted hover:border-accent/30'}"
								>
									{l.label} · {l.native}
								</button>
							{/each}
						</div>
					</div>

					<!-- Default episode view -->
					<div class="p-4">
						<p class="text-sm font-medium text-ink">{t('defaultEpisodeView', $lang)}</p>
						<div class="mt-3 flex gap-1.5">
							{#each [['tiles', 'tiles'], ['titles', 'titles'], ['detailed', 'thumbnails']] as v (v[0])}
								<button
									on:click={() => updateSetting('episodeView', v[0] as 'tiles' | 'titles' | 'detailed')}
									class="rounded-md border px-3 py-1.5 text-xs font-medium transition {$settings.episodeView === v[0]
										? 'border-accent/50 bg-accent/10 text-accent'
										: 'border-line/60 text-muted hover:border-accent/30'}"
								>
									{t(v[1], $lang)}
								</button>
							{/each}
						</div>
					</div>

					<!-- Default search view -->
					<div class="p-4">
						<p class="text-sm font-medium text-ink">{t('searchView', $lang)}</p>
						<p class="mt-0.5 text-xs text-muted">{t('searchViewText', $lang)}</p>
						<div class="mt-3 flex gap-1.5">
							{#each [['grid', 'gridView'], ['row', 'rowView']] as v (v[0])}
								<button
									on:click={() => updateSetting('searchView', v[0] as 'grid' | 'row')}
									class="rounded-md border px-3 py-1.5 text-xs font-medium transition {$settings.searchView === v[0]
										? 'border-accent/50 bg-accent/10 text-accent'
										: 'border-line/60 text-muted hover:border-accent/30'}"
								>
									{t(v[1], $lang)}
								</button>
							{/each}
						</div>
					</div>

					<!-- Default watchlist view -->
					<div class="p-4">
						<p class="text-sm font-medium text-ink">{t('watchlistView', $lang)}</p>
						<p class="mt-0.5 text-xs text-muted">{t('watchlistViewText', $lang)}</p>
						<div class="mt-3 flex gap-1.5">
							{#each [['grid', 'gridView'], ['row', 'rowView']] as v (v[0])}
								<button
									on:click={() => updateSetting('watchlistView', v[0] as 'grid' | 'row')}
									class="rounded-md border px-3 py-1.5 text-xs font-medium transition {$settings.watchlistView === v[0]
										? 'border-accent/50 bg-accent/10 text-accent'
										: 'border-line/60 text-muted hover:border-accent/30'}"
								>
									{t(v[1], $lang)}
								</button>
							{/each}
						</div>
					</div>

					<div class="p-4">
						<button
							on:click={() => { resetSettings(); toast('Settings reset'); }}
							class="rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent"
						>
							{t('resetAllSettings', $lang)}
						</button>
					</div>
				</div>

			{:else if tab === 'account'}
				<div class="hairline rounded-xl bg-surface/30 p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold text-ink">
						<User size={14} class="text-accent" /> {t('account', $lang)}
					</h3>

					{#if isLoggedIn()}
						<!-- Account details -->
						<div class="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-surface/40 p-4">
							<span
								class="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-accent/30 bg-accent/10 text-accent"
							>
								{#if $settings.anilistAvatar}
									<img
										src={$settings.anilistAvatar}
										alt={$settings.anilistHandle || t('account', $lang)}
										class="h-full w-full object-cover"
										referrerpolicy="no-referrer"
									/>
								{:else}
									<User size={26} />
								{/if}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-base font-semibold text-ink">
									{$settings.anilistHandle || t('connected', $lang)}
								</p>
								<p class="mt-0.5 text-xs text-muted">
									{t('anilistUserId', $lang)}: {$settings.anilistUserId ?? '—'}
								</p>
								<p class="mt-1 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
									<Check size={11} /> {t('connected', $lang)}
								</p>
							</div>
							<a
								href={anilistProfileUrl()}
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent active:scale-95"
							>
								<ExternalLink size={13} /> {t('viewProfile', $lang)}
							</a>
						</div>

						<!-- Library sizes straight from AniList -->
						<div class="mt-5">
							<p class="text-[10px] font-semibold uppercase tracking-widest text-muted">
								{t('listStats', $lang)}
							</p>
							{#if statsLoading && !stats}
								<Skeleton className="mt-3 h-16 w-full" />
							{:else if statsRows.length}
								<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
									{#each statsRows as s (s.label)}
										<div class="rounded-lg border border-line/50 bg-surface/30 px-3 py-2">
											<p class="text-[10px] uppercase tracking-wide text-muted">{s.label}</p>
											<p class="font-display text-lg font-bold text-ink">{s.value}</p>
										</div>
									{/each}
								</div>
							{:else if !statsLoading}
								<p class="mt-2 text-xs text-muted">{t('loadingStats', $lang)}</p>
							{/if}
						</div>

						<p class="mt-5 text-xs leading-relaxed text-muted">
							{t('anilistSyncExplain', $lang)}
						</p>

						<div class="mt-4 flex flex-wrap gap-2">
							<button
								on:click={doAnilistSync}
								disabled={syncing}
								class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:shadow-glow active:scale-95 disabled:opacity-60"
							>
								<RefreshCw size={15} class={syncing ? 'animate-spin' : ''} />
								{syncing ? t('syncing', $lang) : t('syncAnilist', $lang)}
							</button>
							<button
								on:click={() => { logout(); stats = null; toast('Signed out of AniList', true); }}
								class="flex items-center gap-2 rounded-md border border-line/60 px-4 py-2 text-sm font-medium text-muted transition hover:border-red-400/50 hover:text-red-400 active:scale-95"
							>
								<LogOut size={15} /> {t('signOut', $lang)}
							</button>
						</div>
					{:else}
						<p class="mt-3 text-xs leading-relaxed text-muted">
							{t('anilistConnectExplain', $lang)}
						</p>
						<button
							on:click={startLogin}
							class="mt-5 flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:shadow-glow active:scale-95"
						>
							<User size={15} /> {t('signIn', $lang)}
						</button>
					{/if}
				</div>

				<!-- MyAnimeList (official API) -->
				<div class="hairline mt-4 rounded-xl bg-surface/30 p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold text-ink">
						<User size={14} class="text-accent" /> MyAnimeList
					</h3>

					{#if isMalLoggedIn()}
						<div class="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-surface/40 p-4">
							<span
								class="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-accent/30 bg-accent/10 text-accent"
							>
								{#if $settings.malAvatar}
									<img
										src={$settings.malAvatar}
										alt={$settings.malHandle || 'MyAnimeList'}
										class="h-full w-full object-cover"
										referrerpolicy="no-referrer"
									/>
								{:else}
									<User size={26} />
								{/if}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-base font-semibold text-ink">
									{$settings.malHandle || t('connected', $lang)}
								</p>
								<p class="mt-0.5 text-xs text-muted">ID: {$settings.malUserId ?? '—'}</p>
								<p class="mt-1 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
									<Check size={11} /> {t('connected', $lang)}
								</p>
							</div>
							<a
								href={malProfileUrl()}
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-1.5 rounded-md border border-line/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent active:scale-95"
							>
								<ExternalLink size={13} /> {t('viewProfile', $lang)}
							</a>
						</div>
						<p class="mt-5 text-xs leading-relaxed text-muted">
							{t('malSyncExplain', $lang)}
						</p>
						<div class="mt-4 flex flex-wrap gap-2">
							<button
								on:click={doMalSync}
								disabled={malSyncing}
								class="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:shadow-glow active:scale-95 disabled:opacity-60"
							>
								<RefreshCw size={15} class={malSyncing ? 'animate-spin' : ''} />
								{malSyncing ? t('syncing', $lang) : t('syncMal', $lang)}
							</button>
							<button
								on:click={() => { malLogout(); toast('Signed out of MyAnimeList', true); }}
								class="flex items-center gap-2 rounded-md border border-line/60 px-4 py-2 text-sm font-medium text-muted transition hover:border-red-400/50 hover:text-red-400 active:scale-95"
							>
								<LogOut size={15} /> {t('signOut', $lang)}
							</button>
						</div>
					{:else}
						<p class="mt-3 text-xs leading-relaxed text-muted">
							{t('malConnectExplain', $lang)}
						</p>
						<button
							on:click={() => startMalLogin().catch((e) => toast(e.message, false))}
							class="mt-5 flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:shadow-glow active:scale-95"
						>
							<User size={15} /> Sign in with MyAnimeList
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
