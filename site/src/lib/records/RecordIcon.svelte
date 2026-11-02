<script lang="ts">
	// A small picture of what a record is about, for the "Heading for a record" tiles on /records (owner's call,
	// 30 Oct 2026: simple, almost buttons, a bit of fun): a bolt for demand, a leaf for the renewable share, a chimney
	// for fossil plant, a drop for hydro, a turbine for wind, a sun for solar, a dollar for prices, arrows for HVDC.
	// Drawn in currentColor on a 24 x 24 grid, so the tile sets the colour (the record's own token).
	let { id }: { id: string } = $props();

	const kind = $derived(
		id.startsWith('demand') ? 'bolt'
		: id.startsWith('ren') ? 'leaf'
		: id.startsWith('fossil') || id.startsWith('huntly') ? 'chimney'
		: id.startsWith('hydro') ? 'drop'
		: id.startsWith('wind') ? 'turbine'
		: id.startsWith('solar') || id.startsWith('roof') ? 'sun'
		: id === 'gap_max' ? 'gap'
		: id.startsWith('price') || id.startsWith('low_price') ? 'dollar'
		: id === 'hvdc_n_max' ? 'north'
		: id === 'hvdc_s_max' ? 'south'
		: 'bolt'
	);
</script>

<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
	{#if kind === 'bolt'}
		<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z" fill="currentColor" fill-opacity="0.18" />
	{:else if kind === 'leaf'}
		<path d="M19.5 4.5C10 4.5 5 9 5 15c0 2 .7 3.5 1.5 4.5 7.5 0 13-4.5 13-15z" fill="currentColor" fill-opacity="0.18" /><path d="M4 20.5c3-4.5 6.5-8 11-10.5" />
	{:else if kind === 'chimney'}
		<path d="M4 20.5V12l5 3v-3l5 3V6.5h4v14z" fill="currentColor" fill-opacity="0.18" /><path d="M16 4c0-1.2 1-1.6 2-1.6M3 20.5h18" />
	{:else if kind === 'drop'}
		<path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.5 6-11z" fill="currentColor" fill-opacity="0.18" /><path d="M9 15a3 3 0 0 0 3 3" />
	{:else if kind === 'turbine'}
		<circle cx="12" cy="9" r="1.6" fill="currentColor" /><path d="M12 9V2.8M12 9l5.4 3.1M12 9l-5.4 3.1M11 21.5l.6-11h.8l.6 11z" /><path d="M8 21.5h8" />
	{:else if kind === 'sun'}
		<circle cx="12" cy="12" r="4.2" fill="currentColor" fill-opacity="0.18" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
	{:else if kind === 'dollar'}
		<path d="M16 7.5c-.6-1.5-2.1-2.4-4-2.4-2.4 0-4 1.3-4 3.1 0 4.3 8.2 2.5 8.2 7 0 1.9-1.8 3.3-4.2 3.3-2.1 0-3.8-1-4.4-2.6M12 2.8v2.3M12 18.5v2.7" />
	{:else if kind === 'gap'}
		<path d="M4 8h13l-3-3M20 16H7l3 3" />
	{:else if kind === 'north'}
		<path d="M12 21V4M6 10l6-6 6 6" />
	{:else}
		<path d="M12 3v17M6 14l6 6 6-6" />
	{/if}
</svg>
