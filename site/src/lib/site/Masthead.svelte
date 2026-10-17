<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Mark from './Mark.svelte';
	import { ARTICLES_PUBLIC } from '#lib/articles/registry.js';

	// the tracker's masthead carries the page's h1; other pages use their own heading
	// the landing page shows the mark large in its own hero, so its masthead is just the navigation
	let { heading = false, brand = true }: { heading?: boolean; brand?: boolean } = $props();

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

<div class="mast-wrap">
<!-- BETA NOTE: remove when the site is announced, with `.beta-note` in tracker.css (see CLAUDE.md, "Beta note") -->
<p class="beta-note"><strong>Beta</strong><span>Elenz is still being tested<span class="bn-more">, so some figures and pages may change</span>.</span><a href="mailto:hello@elenz.co.nz?subject=Elenz%20feedback">Send feedback</a></p>
<header class="masthead" class:bare={!brand}>
	{#if brand}
	<div class="brand">
		<Mark size={32} />
		<div>
			<a class="home" href="/"><svelte:element this={heading ? 'h1' : 'p'} class="name">Elenz</svelte:element></a>
			<p>New Zealand's electricity</p>
		</div>
	</div>
	{/if}
	<div class="mast-r">
		<nav class="pages" aria-label="Pages">
			<a href="/now" aria-current={page.url.pathname.startsWith('/now') ? 'page' : undefined}>Now</a>
			<a href="/tracker" aria-current={page.url.pathname.startsWith('/tracker') ? 'page' : undefined}>Tracker</a>
			<a href="/records" aria-current={page.url.pathname.startsWith('/records') ? 'page' : undefined}>Records</a>
			{#if ARTICLES_PUBLIC}<a href="/articles" aria-current={page.url.pathname.startsWith('/articles') ? 'page' : undefined}>Articles</a>{/if}
			<a href="/about" aria-current={page.url.pathname.startsWith('/about') || page.url.pathname.startsWith('/methods') ? 'page' : undefined}>About</a>
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
</div>
