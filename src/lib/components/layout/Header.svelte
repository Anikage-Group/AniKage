<script lang="ts">
	import { page } from '$app/stores';
	import { afterUpdate, onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import {
		Bookmark,
		Calendar,
		Check,
		Command,
		LogOut,
		Palette,
		Play,
		RefreshCw,
		Search,
		Settings as SettingsIcon,
		User
	} from 'lucide-svelte';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	import Logo from '$lib/components/brand/Logo.svelte';
	import ThemeSwatch from '$lib/components/ui/ThemeSwatch.svelte';
	import { THEMES, themeId, setTheme } from '$lib/stores/theme';
	import { settings, updateSetting } from '$lib/stores/settings';
	import { LANGS, lang, t } from '$lib/stores/i18n';
	import type { Lang } from '$lib/types';
	import { toast } from '$lib/stores/toast';
	import { startLogin, syncAnilistWatchlist, logout } from '$lib/services/anilistOAuth';
	import { startMalLogin, malLogout, syncMalWatchlist } from '$lib/services/malOAuth';

	export let onSearch: () => void;

	const nav = [
		{ href: '/search', key: 'search', icon: Search },
		{ href: '/schedule', key: 'schedule', icon: Calendar }
	];

	let profileOpen = false;
	let langOpen = false;
	let themeOpen = false;
	let syncing = false;

	// The wordmark collapses to the theme-coloured favicon as soon as the
	// top-bar contents would spill outside the bar.
	let topbar: HTMLDivElement;
	let logoSlot: HTMLAnchorElement;
	let spacer: HTMLDivElement;
	let compactLogo = false;
	let fullLogoWidth = 0;
	let measureRaf = 0;

	function queueMeasure() {
		if (typeof requestAnimationFrame === 'undefined' || measureRaf) return;
		measureRaf = requestAnimationFrame(() => {
			measureRaf = 0;
			measureTopbar();
		});
	}

	function measureTopbar() {
		if (!topbar) return;
		const logoWidth = logoSlot?.offsetWidth ?? 0;
		if (!compactLogo) fullLogoWidth = logoWidth;

		const available = topbar.clientWidth;
		const used = topbar.scrollWidth;

		if (!compactLogo) {
			if (used > available + 1) compactLogo = true;
		} else if (fullLogoWidth > 0) {
			// Only bring the full wordmark back when it fits with a little
			// breathing room, so the two states cannot flip-flop. The flex
			// spacer inflates scrollWidth when there is free room, so remove it
			// from the projection.
			const spacerWidth = spacer?.offsetWidth ?? 0;
			const projected = used - spacerWidth - logoWidth + fullLogoWidth;
			if (projected <= available - 2) compactLogo = false;
		}
	}

	afterUpdate(queueMeasure);

	onMount(() => {
		const observer = new ResizeObserver(queueMeasure);
		if (topbar) {
			observer.observe(topbar);
			for (const child of Array.from(topbar.children)) observer.observe(child);
		}
		document.fonts?.ready.then(queueMeasure).catch(() => {});
		queueMeasure();
		return () => {
			observer.disconnect();
			if (measureRaf) cancelAnimationFrame(measureRaf);
		};
	});

	function pickTheme(id: string) {
		setTheme(id as never);
		themeOpen = false;
	}

	function setLang(l: Lang) {
		updateSetting('lang', l);
		langOpen = false;
	}

	$: langLabel = LANGS.find((l) => l.id === $settings.lang)?.label ?? 'EN';
	$: anilistOn = !!$settings.anilistToken;
	$: malOn = !!$settings.malToken;
	// When both providers are connected, AniList supplies the visible profile.
	$: accountAvatar = $settings.anilistAvatar || $settings.malAvatar;
	$: accountHandle = $settings.anilistHandle || $settings.malHandle;
	$: accountStatus =
		anilistOn && malOn
			? t('bothConnected', $lang)
			: anilistOn
				? t('anilistConnected', $lang)
				: malOn
					? t('malConnected', $lang)
					: t('notSignedIn', $lang);

	async function onSync() {
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
		} catch (e) {
			toast(e instanceof Error ? e.message : 'AniList sync failed', false);
		} finally {
			syncing = false;
		}
	}

	let malSyncing = false;

	async function onMalSync() {
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

	function closeAll() {
		profileOpen = false;
		langOpen = false;
		themeOpen = false;
	}
</script>

<!-- Top bar is only shown when the mobile bottom bar is hidden (md+). -->
<header class="header-drop sticky top-0 z-50 hidden md:block md:px-4 md:pt-3">
	<div
		class="relative border-b border-line/50 bg-bg/60 text-ink backdrop-blur-2xl supports-[backdrop-filter]:bg-bg/50 md:rounded-2xl md:border md:border-line/60 md:shadow-2xl md:shadow-black/20"
	>
		<div bind:this={topbar} class="mx-auto flex h-16 items-center gap-2 px-4 sm:px-6">
			<!-- Left end: logo, then the nav links -->
			<a
				bind:this={logoSlot}
				href="/home"
				class="group flex shrink-0 items-center"
				aria-label="Anikage"
				title="Anikage"
			>
				{#if compactLogo}
					<span
						class="block h-10 bg-accent"
						style="aspect-ratio: 163 / 180; -webkit-mask: url('/favicon.png') no-repeat center / contain; mask: url('/favicon.png') no-repeat center / contain;"
					></span>
				{:else}
					<Logo height={50} />
				{/if}
			</a>
			<!-- Search trigger -->			
			<button
				on:click={onSearch}
				class="group hidden items-center gap-2 rounded-md border border-line/50 bg-surface/40 px-3 py-1.5 text-sm text-muted transition-all duration-150 hover:border-accent/40 hover:text-ink sm:flex"
			>
				<Search size={15} />
				<span class="hidden lg:inline">{t('searchAnime', $lang)}</span>
				<span class="lg:hidden">{t('searchShort', $lang)}</span>
				<span
					class="ml-6 flex items-center gap-0.5 rounded border border-line/60 px-1.5 py-0.5 text-[10px] font-medium text-muted/80"
				>
					<Command size={10} /> S
				</span>
			</button>


			<div bind:this={spacer} class="flex-1"></div>
			
			<!-- Right end: search, language, theme, account -->
			<div class="flex items-center gap-3">



			<!-- Underline nav (no Home — brand links home) -->
			<nav class="hidden items-center gap-1 md:flex md:ml-4">
				{#each nav as n (n.href)}
					{@const active =
						$page.url.pathname === n.href || $page.url.pathname.startsWith(n.href)}
					<a
						href={n.href}
						class="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors duration-200 {active
							? 'text-ink'
							: 'text-muted hover:text-ink'}"
					>
						<svelte:component this={n.icon} size={14} />
						{t(n.key, $lang)}
						{#if active}
							<span
								transition:slide={{ duration: 240 }}
								class="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
							></span>
						{/if}
					</a>
				{/each}
			</nav>	
			<!-- Language button EN / JP / RO -->
			<div class="relative">
				<Tooltip label={t('siteLanguage', $lang)}>
					<button
						on:click={() => {
							langOpen = !langOpen;
							profileOpen = false;
							themeOpen = false;
						}}
						class="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line/50 bg-surface/40 text-[11px] font-semibold text-muted transition-all duration-150 hover:border-accent/40 hover:text-ink active:scale-95"
						aria-label={t('changeLanguage', $lang)}
					>
						{langLabel}
					</button>
				</Tooltip>
				{#if langOpen}
					<div
						transition:slide={{ duration: 200 }}
						class="absolute right-0 top-full z-[60] mt-2 w-40 overflow-hidden rounded-xl border border-line/60 bg-bg/95 p-1.5 shadow-2xl backdrop-blur-2xl"
					>
						{#each LANGS as l (l.id)}
							<button
								on:click={() => setLang(l.id)}
								class="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors { $settings.lang === l.id
									? 'bg-accent/10 text-ink'
									: 'text-muted hover:bg-surface/60 hover:text-ink'}"
							>
								<span>{l.native}</span>
								<span class="flex items-center gap-1 text-[11px] text-muted">
									{l.label}
									{#if $settings.lang === l.id}
										<Check size={13} class="text-accent" />
									{/if}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Themes button + dropdown -->
			<div class="relative">
				<Tooltip label={t('theme', $lang)}>
					<button
						on:click={() => {
							themeOpen = !themeOpen;
							profileOpen = false;
							langOpen = false;
						}}
						class="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line/50 bg-surface/40 text-muted transition-all duration-150 hover:border-accent/40 hover:text-accent active:scale-95"
						aria-label={t('chooseTheme', $lang)}
						aria-haspopup="menu"
						aria-expanded={themeOpen}
					>
						<Palette size={15} />
					</button>
				</Tooltip>
				{#if themeOpen}
					<div
						transition:slide={{ duration: 200 }}
						class="absolute right-0 top-full z-[60] mt-2 w-56 overflow-hidden rounded-xl border border-line/60 bg-bg/95 p-1.5 shadow-2xl backdrop-blur-2xl"
						role="menu"
					>
						<p
							class="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted"
						>
							{t('theme', $lang)}
						</p>
						{#each THEMES as t (t.id)}
							<button
								on:click={() => pickTheme(t.id)}
								role="menuitem"
								class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors {$themeId ===
								t.id
									? 'bg-accent/10 text-ink'
									: 'text-muted hover:bg-surface/60 hover:text-ink'}"
							>
								<ThemeSwatch theme={t.id} />
								<span class="min-w-0 flex-1 truncate">{t.name}</span>
								{#if $themeId === t.id}
									<Check size={13} class="shrink-0 text-accent" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Profile dropdown -->
			<div class="relative">
				<button
					on:click={() => {
						profileOpen = !profileOpen;
						langOpen = false;
						themeOpen = false;
					}}
					class="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line/60 bg-surface/60 text-muted transition hover:border-accent/40 hover:text-accent active:scale-95"
					aria-label={t('profileMore', $lang)}
					aria-haspopup="menu"
					aria-expanded={profileOpen}
				>
					{#if accountAvatar}
						<img
							src={accountAvatar}
							alt={accountHandle || t('profile', $lang)}
							class="h-full w-full object-cover"
							referrerpolicy="no-referrer"
						/>
					{:else}
						<User size={16} />
					{/if}
				</button>

				{#if profileOpen}
					<div
						transition:slide={{ duration: 220 }}
						class="absolute right-0 top-full z-[60] mt-2 w-72 overflow-hidden rounded-xl border border-line/60 bg-bg/95 p-2 shadow-2xl backdrop-blur-2xl"
						role="menu"
					>
						<!-- account header -->
						<div class="flex items-center gap-3 rounded-md bg-surface/40 p-3">
							<span
								class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-accent/30 bg-accent/10 text-accent"
							>
								{#if accountAvatar}
									<img
										src={accountAvatar}
										alt={accountHandle || t('profile', $lang)}
										class="h-full w-full object-cover"
										referrerpolicy="no-referrer"
									/>
								{:else}
									<User size={17} />
								{/if}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-ink">
									{accountHandle || t('guest', $lang)}
								</p>
								<p class="truncate text-[11px] text-muted">{accountStatus}</p>
							</div>
						</div>

						<div class="my-1.5 h-px bg-line/50"></div>

						<!-- nav items -->
						<div class="grid gap-0.5">
							<a
								href="/continue"
								on:click={closeAll}
								role="menuitem"
								class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink"
							>
								<Play size={15} /> {t('continueWatching', $lang)}
							</a>
							<a
								href="/watchlist"
								on:click={closeAll}
								role="menuitem"
								class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink"
							>
								<Bookmark size={15} /> {t('watchlist', $lang)}
							</a>
							<a
								href="/settings"
								on:click={closeAll}
								role="menuitem"
								class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink"
							>
								<SettingsIcon size={15} /> {t('settings', $lang)}
							</a>
						</div>

						<div class="my-1.5 h-px bg-line/50"></div>

						<!-- Connected providers -->
						{#if anilistOn || malOn}
							<div class="grid gap-0.5">
								{#if anilistOn}
									<button
										on:click={onSync}
										role="menuitem"
										disabled={syncing}
										class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink disabled:opacity-50"
									>
										<RefreshCw size={15} class={syncing ? 'animate-spin' : ''} />
										{syncing ? t('syncing', $lang) : t('syncAnilist', $lang)}
									</button>
									<button
										on:click={() => {
											logout();
											closeAll();
											toast('Signed out of AniList', true);
										}}
										role="menuitem"
										class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-red-400"
									>
										<LogOut size={15} /> {t('signOutAniList', $lang)}
									</button>
								{/if}
								{#if malOn}
									<button
										on:click={onMalSync}
										role="menuitem"
										disabled={malSyncing}
										class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink disabled:opacity-50"
									>
										<RefreshCw size={15} class={malSyncing ? 'animate-spin' : ''} />
										{malSyncing ? t('syncing', $lang) : t('syncMal', $lang)}
									</button>
									<button
										on:click={() => {
											malLogout();
											closeAll();
											toast('Signed out of MyAnimeList', true);
										}}
										role="menuitem"
										class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-red-400"
									>
										<LogOut size={15} /> {t('signOutMal', $lang)}
									</button>
								{/if}
							</div>
						{/if}

						<!-- Providers that can still be connected -->
						{#if !anilistOn || !malOn}
							<div class="grid gap-0.5">
								{#if !anilistOn}
									<button
										on:click={() => {
											closeAll();
											startLogin();
										}}
										role="menuitem"
										class="flex w-full items-center gap-2 rounded-md bg-accent/15 px-2.5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/25 active:scale-[0.98]"
									>
										<User size={15} /> {t('signInAniList', $lang)}
									</button>
								{/if}
								{#if !malOn}
									<button
										on:click={() => {
											closeAll();
											void startMalLogin().catch((e) =>
												toast(e instanceof Error ? e.message : 'MyAnimeList sign-in failed', false)
											);
										}}
										role="menuitem"
										class="flex w-full items-center gap-2 rounded-md bg-surface/60 px-2.5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface/80 active:scale-[0.98]"
									>
										<User size={15} /> {t('signInMal', $lang)}
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
			</div>
		</div>
	</div>

	<!-- click-away -->
	{#if profileOpen || langOpen || themeOpen}
		<button
			class="fixed inset-0 -z-10 cursor-default"
			aria-label={t('closeMenus', $lang)}
			on:click={closeAll}
		></button>
	{/if}
</header>
