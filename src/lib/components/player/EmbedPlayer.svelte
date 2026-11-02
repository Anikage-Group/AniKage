<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import type { SkipWindow } from '$lib/types';

	/**
	 * EmbedPlayer — cross-origin iframe host speaking the `anikage-player`
	 * postMessage protocol.
	 *
	 * Outbound: { source:'anikage-player-host', type, ...payload }
	 *   types: seek{time} | play | pause | togglePlay | skipIntro | skipOutro
	 *          | setAutoSkipIntro{value} | setAutoSkipOutro{value} | setAutoplay{value}
	 *
	 * Inbound:  data.source === 'anikage-player'
	 *   types: ready{duration} | status{ok,attempt,detail} | play{currentTime}
	 *          | pause{currentTime} | ended{currentTime,duration}
	 *          | time{currentTime,duration,reason} | skipped{segment,auto,to}
	 *
	 * Third-party embeds that don't speak the protocol still play fine —
	 * the skip UI simply stays hidden and the boot spinner times out.
	 */
	export let src = '';
	export let title = 'Anikage player';
	export let intro: SkipWindow | null = null;
	export let outro: SkipWindow | null = null;
	export let autoSkipIntro = false;
	export let autoSkipOutro = false;
	export let autoplay = true;

	interface PlayerMessage {
		source?: string;
		type?: string;
		currentTime?: number;
		duration?: number;
		ok?: boolean;
		attempt?: number;
		detail?: string;
		segment?: string;
		auto?: boolean;
		to?: number;
		reason?: string;
	}

	const dispatch = createEventDispatcher<{
		ready: number;
		play: number;
		pause: number;
		ended: { currentTime: number; duration: number };
		time: { currentTime: number; duration: number; reason: string };
		status: { ok: boolean; attempt: number; detail: string };
		skipped: { segment: string; auto: boolean; to: number };
	}>();

	let iframe: HTMLIFrameElement | null = null;
	/** True once the embedded player has handshaken via `ready`. */
	let protocolReady = false;
	/** Boot spinner — clears on handshake, or after a timeout for dumb embeds. */
	let booting = true;
	let currentTime = 0;
	let duration = 0;
	/** Auto-skip arming: only fire once per pass through a window. */
	let introArmed = true;
	let outroArmed = true;
	let bootTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSrc = '';

	function send(type: string, payload: Record<string, unknown> = {}): void {
		iframe?.contentWindow?.postMessage({ source: 'anikage-player-host', type, ...payload }, '*');
	}

	/* Imperative API for the host page (via bind:this). */
	export function seek(time: number): void {
		send('seek', { time });
	}
	export function play(): void {
		send('play');
	}
	export function pause(): void {
		send('pause');
	}
	export function togglePlay(): void {
		send('togglePlay');
	}
	export function skipIntroSegment(): void {
		introArmed = false;
		send('skipIntro');
	}
	export function skipOutroSegment(): void {
		outroArmed = false;
		send('skipOutro');
	}

	function inWindow(w: SkipWindow | null, t: number): boolean {
		return !!w && t >= w.start && t <= w.end;
	}

	/** Reset handshake/skip state whenever the stream URL changes. */
	function resetFor(s: string): void {
		if (s === lastSrc) return;
		lastSrc = s;
		protocolReady = false;
		booting = true;
		currentTime = 0;
		duration = 0;
		introArmed = true;
		outroArmed = true;
		if (bootTimer) clearTimeout(bootTimer);
		bootTimer = setTimeout(() => (booting = false), 4500);
	}
	$: resetFor(src);

	function onMessage(e: MessageEvent): void {
		const d = e.data as PlayerMessage | null;
		if (!d || d.source !== 'anikage-player') return;

		switch (d.type) {
			case 'ready': {
				protocolReady = true;
				booting = false;
				duration = Number(d.duration) || 0;
				// Push current prefs so the iframe starts in sync.
				send('setAutoSkipIntro', { value: autoSkipIntro });
				send('setAutoSkipOutro', { value: autoSkipOutro });
				send('setAutoplay', { value: autoplay });
				dispatch('ready', duration);
				break;
			}
			case 'status': {
				dispatch('status', {
					ok: !!d.ok,
					attempt: Number(d.attempt) || 0,
					detail: String(d.detail ?? '')
				});
				break;
			}
			case 'play': {
				currentTime = Number(d.currentTime) || 0;
				dispatch('play', currentTime);
				break;
			}
			case 'pause': {
				currentTime = Number(d.currentTime) || 0;
				dispatch('pause', currentTime);
				break;
			}
			case 'ended': {
				currentTime = Number(d.currentTime) || 0;
				duration = Number(d.duration) || duration;
				dispatch('ended', { currentTime, duration });
				break;
			}
			case 'time': {
				currentTime = Number(d.currentTime) || 0;
				duration = Number(d.duration) || duration;
				booting = false;
				// Auto-skip: fire once per pass through a window.
				if (introArmed && autoSkipIntro && inWindow(intro, currentTime)) {
					introArmed = false;
					send('skipIntro');
				} else if (outroArmed && autoSkipOutro && inWindow(outro, currentTime)) {
					outroArmed = false;
					send('skipOutro');
				}
				if (!inWindow(intro, currentTime)) introArmed = true;
				if (!inWindow(outro, currentTime)) outroArmed = true;
				dispatch('time', {
					currentTime,
					duration,
					reason: String(d.reason ?? '')
				});
				break;
			}
			case 'skipped': {
				const segment = String(d.segment ?? '');
				if (segment === 'intro') introArmed = false;
				if (segment === 'outro') outroArmed = false;
				if (Number.isFinite(Number(d.to))) currentTime = Number(d.to) || currentTime;
				dispatch('skipped', { segment, auto: !!d.auto, to: Number(d.to) || 0 });
				break;
			}
		}
	}

	/* Keep the iframe in sync when toggles flip mid-playback (no reload). */
	$: if (protocolReady) send('setAutoSkipIntro', { value: autoSkipIntro });
	$: if (protocolReady) send('setAutoSkipOutro', { value: autoSkipOutro });
	$: if (protocolReady) send('setAutoplay', { value: autoplay });

	$: introVisible = protocolReady && inWindow(intro, currentTime);
	$: outroVisible = protocolReady && !introVisible && inWindow(outro, currentTime);
	// Retained so auto-skip state changes still trigger reactivity; the skip UI
	// itself lives in the embedded player's own control bar.
	$: void introVisible;
	$: void outroVisible;

	onDestroy(() => {
		if (bootTimer) clearTimeout(bootTimer);
	});
</script>

<svelte:window on:message={onMessage} />

<div class="relative h-full w-full bg-black">
	<iframe
		bind:this={iframe}
		{src}
		{title}
		class="absolute inset-0 h-full w-full border-0"
		allowfullscreen
		allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
		referrerpolicy="origin"
	></iframe>
</div>
