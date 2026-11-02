<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	import { portal } from '$lib/utils/portal';
	import { hexToHsv, hsvToHex, normalizeHex } from '$lib/utils/color';

	export let value = '#FFFFFF';
	export let label = 'Colour';

	const dispatch = createEventDispatcher<{ change: string }>();

	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let popover: HTMLDivElement;
	let wheel: HTMLDivElement;
	let valueTrack: HTMLDivElement;

	let open = false;
	let draggingWheel = false;
	let draggingValue = false;
	let lastInput = '';
	let h = 0;
	let s = 1;
	let v = 1;
	let hexDraft = value;
	let popWidth = 268;
	let popPos = { top: 0, left: 0 };

	function syncFromHex(next: string): void {
		const normalized = normalizeHex(next);
		if (!normalized) return;
		const hsv = hexToHsv(normalized);
		if (!hsv) return;
		h = hsv.h;
		s = hsv.s;
		v = hsv.v;
		hexDraft = normalized;
		lastInput = next;
	}

	syncFromHex(value);

	$: if (!draggingWheel && !draggingValue && value !== lastInput) syncFromHex(value);
	$: currentHex = hsvToHex({ h, s, v });
	$: pureHex = hsvToHex({ h, s, v: 1 });

	function emit(): void {
		const hex = hsvToHex({ h, s, v });
		hexDraft = hex;
		dispatch('change', hex);
	}

	function updateWheel(e: PointerEvent): void {
		if (!wheel) return;
		const rect = wheel.getBoundingClientRect();
		const radius = rect.width / 2;
		if (!radius) return;
		const dx = e.clientX - (rect.left + radius);
		const dy = e.clientY - (rect.top + radius);
		const distance = Math.min(Math.hypot(dx, dy), radius);
		h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
		s = distance / radius;
		emit();
	}

	function startWheel(e: PointerEvent): void {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		draggingWheel = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		updateWheel(e);
	}

	function moveWheel(e: PointerEvent): void {
		if (draggingWheel) updateWheel(e);
	}

	function endWheel(e: PointerEvent): void {
		draggingWheel = false;
		const target = e.currentTarget as HTMLElement | null;
		if (target?.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
	}

	function onWheelKeydown(e: KeyboardEvent): void {
		let nextH = h;
		let nextS = s;
		switch (e.key) {
			case 'ArrowLeft':
				nextH = (h - 4 + 360) % 360;
				break;
			case 'ArrowRight':
				nextH = (h + 4) % 360;
				break;
			case 'ArrowUp':
				nextS = Math.min(1, s + 0.04);
				break;
			case 'ArrowDown':
				nextS = Math.max(0, s - 0.04);
				break;
			default:
				return;
		}
		e.preventDefault();
		h = nextH;
		s = nextS;
		emit();
	}

	function updateValue(e: PointerEvent): void {
		if (!valueTrack) return;
		const rect = valueTrack.getBoundingClientRect();
		if (!rect.width) return;
		v = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		emit();
	}

	function startValue(e: PointerEvent): void {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		draggingValue = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		updateValue(e);
	}

	function moveValue(e: PointerEvent): void {
		if (draggingValue) updateValue(e);
	}

	function endValue(e: PointerEvent): void {
		draggingValue = false;
		const target = e.currentTarget as HTMLElement | null;
		if (target?.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
	}

	function onValueKeydown(e: KeyboardEvent): void {
		let next = v;
		switch (e.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				next = Math.max(0, v - 0.02);
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				next = Math.min(1, v + 0.02);
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = 1;
				break;
			default:
				return;
		}
		e.preventDefault();
		v = next;
		emit();
	}

	function commitHex(): void {
		const normalized = normalizeHex(hexDraft);
		if (!normalized) {
			hexDraft = currentHex;
			return;
		}
		const hsv = hexToHsv(normalized);
		if (!hsv) {
			hexDraft = currentHex;
			return;
		}
		h = hsv.h;
		s = hsv.s;
		v = hsv.v;
		hexDraft = normalized;
		dispatch('change', normalized);
	}

	async function place(): Promise<void> {
		await tick();
		if (!trigger || !popover) return;
		const rect = trigger.getBoundingClientRect();
		const width = Math.min(268, window.innerWidth - 16);
		const height = popover.offsetHeight || 320;
		const gap = 8;
		const left = Math.min(
			Math.max(8, rect.left + rect.width / 2 - width / 2),
			window.innerWidth - width - 8
		);
		let top = rect.bottom + gap;
		if (top + height > window.innerHeight - 8) {
			top = Math.max(8, rect.top - gap - height);
		}
		popWidth = width;
		popPos = { top, left };
	}

	async function togglePicker(): Promise<void> {
		if (open) {
			open = false;
			return;
		}
		const rect = trigger.getBoundingClientRect();
		const width = Math.min(268, window.innerWidth - 16);
		popPos = {
			top: rect.bottom + 8,
			left: Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
		};
		popWidth = width;
		open = true;
		await place();
	}

	function onWindowPointerDown(e: PointerEvent): void {
		if (!open) return;
		const target = e.target as Node | null;
		if (!target) return;
		if (root?.contains(target) || popover?.contains(target)) return;
		open = false;
	}

	function onWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window
	on:pointerdown={onWindowPointerDown}
	on:keydown={onWindowKeydown}
	on:scroll={() => open && place()}
	on:resize={() => open && place()}
/>

<div bind:this={root} class="relative">
	<button
		bind:this={trigger}
		type="button"
		on:click={togglePicker}
		class="flex w-full items-center gap-2 rounded-lg border border-line/40 bg-surface/40 px-2.5 py-2 text-left transition hover:border-accent/40 active:scale-[0.98]"
		aria-label={`${label}: ${currentHex}`}
		aria-haspopup="dialog"
		aria-expanded={open}
	>
		<span
			class="h-8 w-8 shrink-0 rounded-full border border-line/60 shadow-inner"
			style={`background-color: ${currentHex}`}
			aria-hidden="true"
		></span>
		<span class="min-w-0">
			<span class="block truncate text-[11px] font-medium text-ink">{label}</span>
			<span class="block text-[10px] uppercase text-muted">{currentHex}</span>
		</span>
	</button>
</div>

{#if open}
	<div
		bind:this={popover}
		use:portal
		class="fixed z-[160] rounded-xl border border-line/60 bg-surface p-3 shadow-2xl"
		style={`top: ${popPos.top}px; left: ${popPos.left}px; width: ${popWidth}px;`}
		role="dialog"
		aria-label={`${label} picker`}
	>
		<div class="mb-3 flex items-center justify-between gap-3">
			<p class="min-w-0 truncate text-xs font-semibold text-ink">{label}</p>
			<span class="font-mono text-[10px] uppercase text-muted">{currentHex}</span>
		</div>

		<!-- Hue/saturation wheel. The white radial overlay turns the hue ring
		     into a saturation field; value is controlled by the bar below. -->
		<div
			bind:this={wheel}
			role="slider"
			tabindex="0"
			aria-label="Hue and saturation"
			aria-valuemin={0}
			aria-valuemax={360}
			aria-valuenow={Math.round(h)}
			aria-valuetext={`Hue ${Math.round(h)} degrees, ${Math.round(s * 100)} percent saturation`}
			on:pointerdown={startWheel}
			on:pointermove={moveWheel}
			on:pointerup={endWheel}
			on:pointercancel={endWheel}
			on:keydown={onWheelKeydown}
			class="relative mx-auto aspect-square w-full max-w-[188px] touch-none cursor-crosshair rounded-full border border-line/60 shadow-inner"
			style="background: radial-gradient(circle at center, #ffffff 0%, rgba(255, 255, 255, 0) 70%), conic-gradient(from 90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);"
		>
			<span
				class="pointer-events-none absolute inset-0 rounded-full bg-black"
				style={`opacity: ${1 - v};`}
				aria-hidden="true"
			></span>
			<span
				class="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
				style={`left: ${50 + Math.cos((h * Math.PI) / 180) * s * 50}%; top: ${50 + Math.sin((h * Math.PI) / 180) * s * 50}%; background-color: ${currentHex};`}
				aria-hidden="true"
			></span>
		</div>

		<!-- Brightness/value slider -->
		<div
			bind:this={valueTrack}
			role="slider"
			tabindex="0"
			aria-label="Brightness"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(v * 100)}
			aria-valuetext={`${Math.round(v * 100)} percent brightness`}
			on:pointerdown={startValue}
			on:pointermove={moveValue}
			on:pointerup={endValue}
			on:pointercancel={endValue}
			on:keydown={onValueKeydown}
			class="relative mt-4 h-4 w-full touch-none cursor-pointer rounded-full border border-line/50"
			style={`background: linear-gradient(90deg, #000000 0%, ${pureHex} 100%);`}
		>
			<span
				class="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
				style={`left: ${v * 100}%; background-color: ${currentHex};`}
				aria-hidden="true"
			></span>
		</div>

		<div class="mt-4 flex items-center gap-2">
			<label class="min-w-0 flex-1">
				<span class="sr-only">{label} hex value</span>
				<input
					type="text"
					value={hexDraft}
					maxlength="7"
					spellcheck="false"
					autocomplete="off"
					on:input={(e) => (hexDraft = e.currentTarget.value)}
					on:change={commitHex}
					on:blur={commitHex}
					on:keydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							commitHex();
						}
					}}
					class="w-full rounded-md border border-line/60 bg-bg/40 px-2.5 py-1.5 font-mono text-xs uppercase text-ink outline-none transition focus:border-accent/60"
				/>
			</label>
			<span
				class="h-8 w-8 shrink-0 rounded-md border border-line/60"
				style={`background-color: ${currentHex};`}
				aria-hidden="true"
			></span>
		</div>
	</div>
{/if}
