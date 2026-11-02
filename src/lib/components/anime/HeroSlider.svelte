<script lang="ts">
    import { onMount } from 'svelte';
    import { cubicOut } from 'svelte/easing';
    import { fade } from 'svelte/transition';
    import { ChevronLeft, ChevronRight, Play, Info, Star } from 'lucide-svelte';
    import type { Anime } from '$lib/types';
    import { formatScore } from '$lib/utils/format';
    import WatchlistMenu from './WatchlistMenu.svelte';
    import { getAniZip } from '$lib/services/aniZip';
    import { trimTransparentLogo } from '$lib/utils/logo';
    import { lang, t, titleFor } from '$lib/stores/i18n';

    /**
     * Home hero banner.
     *
     * Two animated units, each entering with an `in:` transition only (never an
     * exit), so an outgoing unit is fully removed before the incoming one mounts.
     *   1. the clearlogo (cropped to its visible bounds) + the anime name
     *   2. the text area (meta row + synopsis + action buttons)
     *
     * Layout: mobile shows the vertical POSTER art in a taller frame with the copy
     * centre-aligned; md+ shows the wide banner art, left-aligned.
     */
    export let items: Anime[] = [];
    export let loading = false;

    function heroEnter(node: Element, { duration = 520 }: { duration?: number } = {}) {
        return {
            duration,
            easing: cubicOut,
            css: (t: number) => `opacity:${t};transform:translateY(${(1 - t) * 28}px);`
        };
    }

    interface HeroArt {
        logo: string | null;
        /** Cropped data URL of the clearlogo (transparent margins removed). */
        trimmed: string | null;
        /** Wide backdrop used when the metadata record has no banner (e.g. MAL). */
        banner: string | null;
    }

    let index = 0;
    let timer: ReturnType<typeof setInterval>;

    const DURATION = 7000;

    /* ---------- ani.zip artwork (clearlogo + a wide backdrop when the record has no banner) ---------- */

    let art = new Map<number, HeroArt>();

    async function ensureArt(a: Anime | undefined) {
        if (!a || art.has(a.id)) return;
        // Reserve the slot immediately so the same id isn't fetched twice.
        art.set(a.id, { logo: null, trimmed: null, banner: null });
        art = art;
        try {
            const zip = await getAniZip(a.id);
            const logo = zip.clearlogo;
            const trimmed = logo ? await trimTransparentLogo(logo) : null;
            // MAL records carry no banner at all, and a portrait poster
            // stretched across the hero is what looked low quality. ani.zip's
            // 1920x1080 fanart fills that gap; a real source banner still wins.
            art.set(a.id, { logo, trimmed, banner: zip.bannerImage });
        } catch {
            art.set(a.id, { logo: null, trimmed: null, banner: null });
        }
        art = art;
    }

    function dropLogo(id: number) {
        const entry = art.get(id);
        if (!entry || (!entry.logo && !entry.trimmed)) return;
        art.set(id, { ...entry, logo: null, trimmed: null });
        art = art;
    }

    /* ---------- slide state ---------- */

    function go(i: number) {
        if (!items.length) return;
        index = (i + items.length) % items.length;
        restart();
    }

    function next() {
        if (!items.length) return;
        index = (index + 1) % items.length;
    }

    function prev() {
        if (!items.length) return;
        index = (index - 1 + items.length) % items.length;
    }

    function restart() {
        clearInterval(timer);
        // While a menu (e.g. the watchlist popover) is open the banner must
        // hold still — otherwise the slide changes under the user's cursor.
        if (items.length > 1 && !paused) timer = setInterval(next, DURATION);
    }

    /** Set while an overlay menu is open; the auto-advance is suspended. */
    let paused = false;

    function pause() {
        paused = true;
        clearInterval(timer);
    }

    function resume() {
        paused = false;
        restart();
    }

    $: if (items.length && index >= items.length) index = 0;
    $: if (items.length) restart();

    onMount(() => () => clearInterval(timer));

    $: current = items[index];$: currentArt = current ? art.get(current.id) : undefined;
    $: heroLogo = currentArt?.trimmed ?? currentArt?.logo ?? null;
    // Mobile: vertical poster art. md+: wide banner (poster only if no banner).
    $: heroBg = current ? (current.banner ?? currentArt?.banner ?? current.cover) : '';

    // Warm the current slide + its neighbour so the artwork is ready on swap.
    $: if (current) {
        ensureArt(current);
        ensureArt(items[(index + 1) % items.length]);
    }

    /* ---------- touch swipe ---------- */
    let touchX: number | null = null;
    function onTouchStart(e: TouchEvent) {
        touchX = e.changedTouches[0].clientX;
    }
    function onTouchEnd(e: TouchEvent) {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 48) {
            if (dx < 0) next();
            else prev();
            restart();
        }
        touchX = null;
    }

    /* ---------- mouse drag swipe (desktop) ---------- */
    let downX: number | null = null;
    function onPointerDown(e: MouseEvent) {
        downX = e.clientX;
    }
    function onPointerUp(e: MouseEvent) {
        if (downX == null) return;
        const dx = e.clientX - downX;
        if (Math.abs(dx) > 60) {
            if (dx < 0) next();
            else prev();
            restart();
        }
        downX = null;
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
    class="relative -mt-16 mb-10 h-[86vh] min-h-[560px] max-h-[860px] w-full cursor-grab overflow-hidden select-none md:-mt-[76px] md:h-[72vh] md:min-h-[460px] md:max-h-[780px]"
    in:fade={{ duration: 420 }}
    on:touchstart={onTouchStart}
    on:touchend={onTouchEnd}
    on:mousedown={onPointerDown}
    on:mouseup={onPointerUp}
    aria-label={t('featuredAnime', $lang)}
>
    {#if loading}
        <div class="shimmer-bg absolute inset-0"></div>
    {:else if current}
        <!-- Backdrop: poster on mobile (portrait), banner on md+. The metadata
             banner wins; a record without one (MAL) uses ani.zip's wide fanart
             rather than stretching its portrait poster.
             Keyed by the slide so the Ken Burns zoom restarts on every rotation —
             otherwise the animation has already finished (fill: forwards) and
             the image stays stretched instead of animating again. -->
        <div class="absolute inset-0">
            {#key `bg-${current.id}`}
                <img
                    src={current.cover}
                    alt=""
                    draggable="false"
                    class="h-full w-full object-cover object-center md:hidden"
                />
                <img
                    src={heroBg}
                    alt=""
                    draggable="false"
                    class="kenburns hidden h-full w-full object-cover object-center md:block"
                />
            {/key}
        </div>

        <!-- Combined Gradients Overlay -->
        <div class="hero-overlay absolute inset-0 pointer-events-none"></div>

        <!-- Content -->
        <div class="absolute inset-x-0 bottom-0 z-10">
            <div class="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
                <!-- Unit 1: clearlogo (or text title) + anime name -->
                {#key `t-${current.id}`}
                    <div
                        in:heroEnter
                        class="mx-auto flex min-h-[8rem] max-w-2xl flex-col items-center justify-end text-center md:mx-0 md:min-h-[11rem] md:max-w-3xl md:items-start md:text-left"
                    >
                        {#if heroLogo}
                            <img
                                src={heroLogo}
                                alt={titleFor(current, $lang)}
                                draggable="false"
                                on:error={() => dropLogo(current.id)}
                                class="max-h-24 w-auto max-w-[280px] object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.8)] sm:max-h-28 sm:max-w-[360px] md:max-h-32 md:max-w-[460px]"
                            />
                            <!-- Anime name below the clearlogo (max 3 lines) -->
                            <p
                                class="mt-3 line-clamp-3 font-display text-sm font-semibold tracking-wide text-ink/85 sm:text-base"
                            >
                                {titleFor(current, $lang)}
                            </p>
                        {:else}
                            <h1
                                class="line-clamp-3 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl md:text-5xl"
                            >
                                {titleFor(current, $lang)}
                            </h1>
                        {/if}
                    </div>
                {/key}

                <!-- Unit 2: the whole text area (meta + synopsis + actions) -->
                {#key `c-${current.id}`}
                    <div in:heroEnter class="mx-auto max-w-2xl text-center md:mx-0 md:max-w-3xl md:text-left">
                        <!-- meta row -->
                        <div
                            class="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-ink/80 md:justify-start"
                        >
                            {#if current.score}
                                <span class="flex items-center gap-1 font-semibold text-amber-300">
                                    <Star size={12} fill="currentColor" /> {formatScore(current.score)}
                                </span>
                            {/if}
                            {#if current.format}<span>{current.format}</span>{/if}
                            {#if current.seasonYear}<span>{current.seasonYear}</span>{/if}
                            {#if current.episodes}<span>{current.episodes} {t('eps', $lang)}</span>{/if}
                            {#each current.genres.slice(0, 3) as g (g)}
                                <span class="rounded border border-ink/25 px-1.5 py-0.5 text-[10px] font-medium text-ink/90">
                                    {g}
                                </span>
                            {/each}
                        </div>

                        <!-- synopsis -->
                        <p
                            class="mx-auto mt-3 line-clamp-2 min-h-[2.5rem] max-w-xl text-sm leading-relaxed text-ink/75 sm:line-clamp-3 md:mx-0"
                        >
                            {current.description || t('synopsisUnavailable', $lang)}
                        </p>

                        <!-- actions -->
                        <div class="mt-6 flex flex-wrap items-center justify-center gap-6 md:justify-start">
                            <a
                                href={`/watch/${current.id}/1`}
                                class="group inline-flex w-full items-center justify-center pb-1 text-base font-semibold text-ink active:scale-95 md:w-auto md:justify-start"
                            >
                                <span class="relative inline-flex items-center gap-2">
                                    <Play size={19} fill="currentColor" class="text-accent" />
                                    {t('watchNow', $lang)}
                                    <span
                                        class="absolute inset-x-0 -bottom-1 h-0.5 bg-accent transition-all duration-200 group-hover:h-1"
                                        style="box-shadow: 0 0 12px color-mix(in srgb, var(--c-accent) 70%, transparent);"
                                    ></span>
                                </span>
                            </a>

                            <WatchlistMenu variant="hero" anime={current} on:open={pause} on:close={resume} />

                            <a
                                href={`/anime/${current.id}`}
                                class="group relative inline-flex items-center gap-2 pb-1 text-sm font-medium text-ink/80 transition-colors hover:text-ink active:scale-95"
                            >
                                <Info size={16} />
                                {t('details', $lang)}
                                <span
                                    class="absolute inset-x-0 -bottom-0.5 h-px bg-accent opacity-60 transition-opacity group-hover:opacity-100"
                                ></span>
                            </a>
                        </div>
                    </div>
                {/key}
            </div>
        </div>

        <!-- Prev / next controls, top-right -->
        {#if items.length > 1}
            <div class="absolute right-4 top-20 z-20 flex items-center gap-2 md:right-6 md:top-24">
                <button
                    on:click={() => go(index - 1)}
                    class="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition hover:border-accent/50 hover:text-accent active:scale-95"
                    aria-label={t('previousSlide', $lang)}
                >
                    <ChevronLeft size={18} />
                </button>
                <button
                    on:click={() => go(index + 1)}
                    class="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition hover:border-accent/50 hover:text-accent active:scale-95"
                    aria-label={t('nextSlide', $lang)}
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        {/if}

        <!-- Dot indicators (centered on mobile) -->
        {#if items.length > 1}
            <div
                class="absolute inset-x-0 bottom-5 z-10 flex justify-center gap-1.5 px-4 md:inset-x-auto md:right-5 md:max-w-[60%] md:flex-wrap md:justify-end"
            >
                {#each items as _, i (i)}
                    <button
                        on:click={() => go(i)}
                        class="h-0.5 rounded-full transition-all duration-300 {i === index
                            ? 'w-8 bg-accent'
                            : 'w-3 bg-ink/30 hover:bg-ink/60'}"
                        style={i === index ? 'box-shadow: 0 0 10px color-mix(in srgb, var(--c-accent) 80%, transparent);' : ''}
                        aria-label={`Slide ${i + 1}`}
                    ></button>
                {/each}
            </div>
        {/if}
    {:else}
        <div class="shimmer-bg absolute inset-0"></div>
    {/if}
</section>

<style>
    /* Mobile: Vertical Gradient (0 opacity for top 50%, transitions to background color at the bottom) */
    .hero-overlay {
        background: linear-gradient(
            to bottom,
            color-mix(in srgb, var(--c-bg) 0%, transparent) 0%,
            color-mix(in srgb, var(--c-bg) 0%, transparent) 50%,
            var(--c-bg) 100%
        );
    }

    /* Desktop (md+): Combined Vertical (75%) and Horizontal (55%) Gradients */
    @media (min-width: 768px) {
        .hero-overlay {
            background: 
                linear-gradient(
                    to bottom,
                    color-mix(in srgb, var(--c-bg) 0%, transparent) 0%,
                    color-mix(in srgb, var(--c-bg) 0%, transparent) 75%,
                    var(--c-bg) 100%
                ),
                linear-gradient(
                    to right,
                    var(--c-bg) 0%,
                    color-mix(in srgb, var(--c-bg) 70%, transparent) 25%,
                    color-mix(in srgb, var(--c-bg) 0%, transparent) 55%,
                    color-mix(in srgb, var(--c-bg) 0%, transparent) 100%
                );
        }
    }
</style>