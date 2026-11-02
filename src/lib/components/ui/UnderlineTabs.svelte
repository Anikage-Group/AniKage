<script lang="ts">
	import { spring } from 'svelte/motion';
	import { onMount, createEventDispatcher } from 'svelte';

	export let items: { id: string; label: string }[] = [];
	export let active = items[0]?.id ?? '';
	export let accentBorder = true;

	const dispatch = createEventDispatcher<{ select: string }>();

	// Spring-driven underline track.
	const x = spring(0, { stiffness: 0.28, damping: 0.32 });
	const w = spring(0, { stiffness: 0.28, damping: 0.32 });

	let bar: HTMLElement;
	let bounds: Record<string, { x: number; w: number }> = {};

	export function measure() {
		if (!bar) return;
		bounds = {};
		for (const it of items) {
			const el = bar.querySelector<HTMLElement>(`[data-tab="${it.id}"]`);
			if (el) {
				bounds[it.id] = { x: el.offsetLeft, w: el.offsetWidth };
			}
		}
		const b = bounds[active];
		if (b) {
			x.set(b.x);
			w.set(b.w);
		}
	}

	onMount(() => {
		measure();
		const ro = new ResizeObserver(() => measure());
		if (bar) ro.observe(bar);
		window.addEventListener('resize', measure);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

	$: if (active && bounds[active]) {
		x.set(bounds[active].x);
		w.set(bounds[active].w);
	}

	function select(id: string) {
		active = id;
		if (bounds[id]) {
			x.set(bounds[id].x);
			w.set(bounds[id].w);
		}
		dispatch('select', id);
	}
</script>

<div bind:this={bar} class="relative flex items-center gap-6 border-b border-line/50">
	{#each items as it (it.id)}
		<button
			data-tab={it.id}
			on:click={() => select(it.id)}
			class="relative whitespace-nowrap pb-2.5 text-sm font-medium tracking-wide transition-colors duration-200 {active === it.id
				? 'text-ink'
				: 'text-muted hover:text-ink'}"
		>
			{it.label}
		</button>
	{/each}

	<!-- animated underline track -->
	<span
		class="pointer-events-none absolute -bottom-px h-0.5 rounded-full"
		class:bg-accent={accentBorder}
		style="transform: translateX({$x}px); width: {$w}px; box-shadow: 0 0 12px color-mix(in srgb, var(--c-accent) 60%, transparent);"
		aria-hidden="true"
	></span>
</div>
