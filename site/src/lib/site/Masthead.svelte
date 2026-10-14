<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	// the tracker's masthead carries the page's h1; other pages use their own heading
	let { heading = false }: { heading?: boolean } = $props();

	// light/dark: follows the device until the reader picks one, which is remembered (app.html applies it before paint)
	const KEY = 'elenz-theme';
	let dark = $state(false);
	const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
	onMount(() => {
		const set = document.documentElement.dataset.theme;
		dark = set ? set === 'dark' : systemDark();
		const mq = matchMedia('(prefers-color-scheme: dark)');
		const follow = () => { if (!document.documentElement.dataset.theme) dark = mq.matches; };
		mq.addEventListener('change', follow);
		return () => mq.removeEventListener('change', follow);
	});
	function toggleTheme() {
		dark = !dark;
		document.documentElement.dataset.theme = dark ? 'dark' : 'light';
		try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* storage blocked: applies to this visit only */ }
	}
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
	<div class="mast-r">
		<nav class="pages" aria-label="Pages">
			<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Now</a>
			<a href="/tracker" aria-current={page.url.pathname.startsWith('/tracker') ? 'page' : undefined}>Tracker</a>
			<a href="/about" aria-current={page.url.pathname.startsWith('/about') ? 'page' : undefined}>About</a>
		</nav>
		<button type="button" class="info-btn theme-btn" onclick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
			{#if dark}
				<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M4.2 15.8l1.7-1.7M14.1 5.9l1.7-1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
			{:else}
				<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
			{/if}
		</button>
	</div>
</header>
