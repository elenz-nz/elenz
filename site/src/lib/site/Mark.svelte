<script lang="ts">
	// the Elenz mark: four stacked bars, a tiny generation chart (geothermal, hydro, wind, solar)
	// grow: the bars rise into place, column by column (the landing page)
	let { size = 32, grow = false }: { size?: number; grow?: boolean } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" class:grow>
	<rect style="--d:0.00s" x="3" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect style="--d:0.00s" x="3" y="9" width="5" height="7" rx="1" fill="var(--f-hydro)" />
	<rect style="--d:0.09s" x="9.5" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect style="--d:0.09s" x="9.5" y="5" width="5" height="11" rx="1" fill="var(--f-hydro)" />
	<rect style="--d:0.18s" x="16" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect style="--d:0.18s" x="16" y="8" width="5" height="8" rx="1" fill="var(--f-hydro)" />
	<rect style="--d:0.18s" x="16" y="4" width="5" height="3" rx="1" fill="var(--f-wind)" />
	<rect style="--d:0.27s" x="22.5" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect style="--d:0.27s" x="22.5" y="11" width="5" height="5" rx="1" fill="var(--f-hydro)" />
	<rect style="--d:0.27s" x="22.5" y="6" width="5" height="4" rx="1" fill="var(--f-solar)" />
</svg>

<style>
	.grow rect { transform-box: fill-box; transform-origin: 50% 100%; animation: up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) var(--d) both; }
	@keyframes up { from { transform: scaleY(0); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .grow rect { animation: none; } }
</style>
