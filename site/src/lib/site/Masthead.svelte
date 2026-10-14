<script lang="ts">
	import { page } from '$app/state';

	// the tracker's masthead carries the page's h1; other pages use their own heading
	let { heading = false }: { heading?: boolean } = $props();
</script>

<header class="masthead">
	<div class="brand">
		<!-- the mark: four stacked bars, a tiny generation chart (geothermal, hydro, wind, solar) -->
		<svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true">
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
		<div>
			<a class="home" href="/"><svelte:element this={heading ? 'h1' : 'p'} class="name">Elenz</svelte:element></a>
			<p>New Zealand's electricity</p>
		</div>
	</div>
	<nav class="pages" aria-label="Pages">
		<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Tracker</a>
		<a href="/about" aria-current={page.url.pathname.startsWith('/about') ? 'page' : undefined}>About</a>
	</nav>
</header>
