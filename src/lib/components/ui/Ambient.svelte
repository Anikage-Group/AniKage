<script lang="ts">
	/**
	 * Ambient overlay — retained for API compatibility but renders a solid,
	 * gradient-free background (no mesh glows) per the flat-background spec.
	 */
	export let intensity = 0.2;
	// Kept for API compatibility with callers; no visual effect (flat background).
	$: void intensity;
</script>

<div class="pointer-events-none fixed inset-0 z-0" aria-hidden="true"></div>
