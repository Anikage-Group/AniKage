<script lang="ts">
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';
	import {
		Bookmark,
		Calendar,
		Globe,
		Home,
		LogOut,
		Palette,
		Play,
		RefreshCw,
		Search,
		Settings as SettingsIcon,
		User
	} from 'lucide-svelte';
	import { settings } from '$lib/stores/settings';
	import { lang, t } from '$lib/stores/i18n';
	import { toast } from '$lib/stores/toast';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import ThemeDrawer from '$lib/components/layout/ThemeDrawer.svelte';
	import LanguageDrawer from '$lib/components/layout/LanguageDrawer.svelte';
	import { startLogin, syncAnilistWatchlist, logout } from '$lib/services/anilistOAuth';
	import { startMalLogin, malLogout, syncMalWatchlist } from '$lib/services/malOAuth';

	export let onSearch: () => void;

	$: path = $page.url.pathname;
	$: anilistOn = !!$settings.anilistToken;
	$: malOn = !!$settings.malToken;
	// AniList wins when both providers are connected.
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

	let sheetOpen = false;
	let themeOpen = false;
	let langOpen = false;
	let syncing = false;
	let malSyncing = false;

	// Bottom-bar items: home + search + schedule; everything else lives in the profile drawer.
	const items = [
		{ href: '/home', key: 'home', icon: Home },
		{ key: 'search', key2: 'search', icon: Search },
		{ href: '/schedule', key: 'schedule', icon: Calendar }
	];

	function isActive(it: (typeof items)[number]) {
		if ('href' in it && it.href) {
			return it.href === '/' ? path === '/' : path.startsWith(it.href);
		}
		return false;
	}

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
</script>

<nav
	class="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line/60 bg-bg/80 px-2 py-1.5 shadow-2xl backdrop-blur-2xl md:hidden"
>
	{#each items as it (it.key)}
		{#if 'key2' in it && it.key2 === 'search'}
			<button
				on:click={onSearch}
				class="mnav-item relative flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-muted transition-colors duration-200 active:scale-95"
			>
				<Search size={19} strokeWidth={1.9} />
				<span class="text-[10px] font-medium tracking-wide">{t(it.key, $lang)}</span>
			</button>
		{:else}
			<a
				href={it.href}
				class="mnav-item relative flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors duration-200 {isActive(
					it
				)
					? 'text-accent'
					: 'text-muted'}"
			>
				<svelte:component this={it.icon} size={19} strokeWidth={isActive(it) ? 2.4 : 1.9} />
				<span class="text-[10px] font-medium tracking-wide">{t(it.key, $lang)}</span>
				{#if isActive(it)}
					<span class="mnav-line" aria-hidden="true"></span>
				{/if}
			</a>
		{/if}
	{/each}

	<!-- Profile — opens sheet with all remaining options -->
	<button
		on:click={() => (sheetOpen = true)}
		class="mnav-item relative flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-muted transition-colors duration-200 active:scale-95"
		aria-label={t('profileMore', $lang)}
	>
		<User size={19} strokeWidth={1.9} />
		<span class="text-[10px] font-medium tracking-wide">{t('profile', $lang)}</span>
	</button>
</nav>

<!-- Profile drawer: every option not in the top nav -->
<BottomSheet open={sheetOpen} title={t('profileMenu', $lang)} on:close={() => (sheetOpen = false)}>
	<div class="mb-3 flex items-center gap-3">
		<span
			class="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-accent/30 bg-accent/10 text-accent"
		>
			{#if accountAvatar}
				<img
					src={accountAvatar}
					alt={accountHandle || t('profile', $lang)}
					class="h-full w-full object-cover"
					referrerpolicy="no-referrer"
				/>
			{:else}
				<User size={18} />
			{/if}
		</span>
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-ink">{accountHandle || t('guest', $lang)}</p>
			<p class="text-[11px] text-muted">{accountStatus}</p>
		</div>
	</div>

	<div class="grid gap-1">
		<a
			href="/continue"
			on:click={() => (sheetOpen = false)}
			class="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-ink active:bg-surface/60"
		>
			<Play size={17} class="text-accent" /> {t('continueWatching', $lang)}
		</a>
		<a
			href="/watchlist"
			on:click={() => (sheetOpen = false)}
			class="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-ink active:bg-surface/60"
		>
			<Bookmark size={17} class="text-accent" /> {t('watchlist', $lang)}
		</a>
		<a
			href="/search"
			on:click={() => (sheetOpen = false)}
			class="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-ink active:bg-surface/60"
		>
			<Search size={17} class="text-accent" /> {t('searchCatalog', $lang)}
		</a>
		<a
			href="/settings"
			on:click={() => (sheetOpen = false)}
			class="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-ink active:bg-surface/60"
		>
			<SettingsIcon size={17} class="text-accent" /> {t('settings', $lang)}
		</a>
		<button
			on:click={() => {
				sheetOpen = false;
				themeOpen = true;
			}}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-ink active:bg-surface/60"
		>
			<Palette size={17} class="text-accent" /> {t('appearance', $lang)}
		</button>
		<button
			on:click={() => {
				sheetOpen = false;
				langOpen = true;
			}}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-ink active:bg-surface/60"
		>
			<Globe size={17} class="text-accent" /> {t('siteLanguage', $lang)}
		</button>
	</div>

	<div class="my-3 h-px bg-line/50"></div>

	{#if anilistOn}
		<button
			on:click={onSync}
			disabled={syncing}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-ink active:bg-surface/60 disabled:opacity-50"
		>
			<RefreshCw size={17} class={syncing ? 'animate-spin text-accent' : 'text-accent'} />
			{syncing ? t('syncing', $lang) : t('syncAnilist', $lang)}
		</button>
		<button
			on:click={() => {
				logout();
				sheetOpen = false;
				toast('Signed out of AniList', true);
			}}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-ink active:bg-surface/60"
		>
			<LogOut size={17} class="text-red-400" /> {t('signOutAniList', $lang)}
		</button>
	{/if}
	{#if malOn}
		<button
			on:click={onMalSync}
			disabled={malSyncing}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-ink active:bg-surface/60 disabled:opacity-50"
		>
			<RefreshCw size={17} class={malSyncing ? 'animate-spin text-accent' : 'text-accent'} />
			{malSyncing ? t('syncing', $lang) : t('syncMal', $lang)}
		</button>
		<button
			on:click={() => {
				malLogout();
				sheetOpen = false;
				toast('Signed out of MyAnimeList', true);
			}}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-ink active:bg-surface/60"
		>
			<LogOut size={17} class="text-red-400" /> {t('signOutMal', $lang)}
		</button>
	{/if}
	{#if !anilistOn}
		<button
			on:click={() => {
				sheetOpen = false;
				startLogin();
			}}
			class="flex w-full items-center justify-center gap-2 rounded-lg bg-accent/15 px-3 py-3 text-sm font-medium text-accent active:bg-accent/25"
		>
			<User size={16} /> {t('signInAniList', $lang)}
		</button>
	{/if}
	{#if !malOn}
		<button
			on:click={() => {
				sheetOpen = false;
				void startMalLogin().catch((e) =>
					toast(e instanceof Error ? e.message : 'MyAnimeList sign-in failed', false)
				);
			}}
			class="flex w-full items-center justify-center gap-2 rounded-lg bg-surface/60 px-3 py-3 text-sm font-medium text-ink active:bg-surface/80"
		>
			<User size={16} /> {t('signInMal', $lang)}
		</button>
	{/if}
</BottomSheet>

<!-- Colour theme drawer -->
<ThemeDrawer open={themeOpen} on:close={() => (themeOpen = false)} />

<!-- Language drawer -->
<LanguageDrawer open={langOpen} on:close={() => (langOpen = false)} />
