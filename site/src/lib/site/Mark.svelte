<script lang="ts">
	// the Elenz mark: four stacked bars, a tiny generation chart (geothermal, hydro, wind, solar)
	let { size = 32 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
	<rect x="3" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect x="3" y="9" width="5" height="7" rx="1" fill="var(--f-hydro)" />
	<rect x="9.5" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect x="9.5" y="5" width="5" height="11" rx="1" fill="var(--f-hydro)" />
	<rect x="16" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect x="16" y="8" width="5" height="8" rx="1" fill="var(--f-hydro)" />
	<rect x="16" y="4" width="5" height="3" rx="1" fill="var(--f-wind)" />
	<rect x="22.5" y="17" width="5" height="10" rx="1" fill="var(--f-geo)" />
	<rect x="22.5" y="11" width="5" height="5" rx="1" fill="var(--f-hydro)" />
	<rect x="22.5" y="6" width="5" height="4" rx="1" fill="var(--f-solar)" />
</svg>
