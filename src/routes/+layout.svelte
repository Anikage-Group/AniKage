<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import Header from '$lib/components/layout/Header.svelte';
	import MobileNav from '$lib/components/layout/MobileNav.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import CommandPalette from '$lib/components/layout/CommandPalette.svelte';
	import Toasts from '$lib/components/layout/Toasts.svelte';
	import LoadingBar from '$lib/components/layout/LoadingBar.svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import { setOg } from '$lib/utils/og';

	let paletteOpen = false;

	/** The lander is a standalone page — no top bar, bottom bar or footer. */
	$: bare = $page.url.pathname === '/';

	// Every page starts from the site-wide card; pages that have their own
	// artwork (anime, episode) replace it once their data arrives.
	beforeNavigate(() => setOg({}));

	onMount(() => {
		// Turn the static fallback tags into absolute URLs for link previews.
		setOg({});

		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				paletteOpen = !paletteOpen;
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function onPaletteNav(e: CustomEvent<string>) {
		goto(e.detail);
	}
</script>

<div class="relative min-h-screen">
	<Ambient />

	<div class="relative z-10">
		{#if !bare}
			<Header onSearch={() => (paletteOpen = true)} />
		{/if}
		<main class={bare ? '' : 'pb-28 md:pb-8'}>
			<slot />
		</main>
		{#if !bare}
			<Footer />
		{/if}
	</div>

	{#if !bare}
		<MobileNav onSearch={() => (paletteOpen = true)} />
	{/if}
	<CommandPalette
		open={paletteOpen}
		on:close={() => (paletteOpen = false)}
		on:navigate={onPaletteNav}
	/>
	<Toasts />
	<LoadingBar />
</div>
