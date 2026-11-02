<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	// the two typefaces, bundled with the site (no requests to Google): Schibsted Grotesk for text, IBM Plex Mono for figures
	import '@fontsource/schibsted-grotesk/400.css';
	import '@fontsource/schibsted-grotesk/500.css';
	import '@fontsource/schibsted-grotesk/600.css';
	import '@fontsource/schibsted-grotesk/700.css';
	import '@fontsource/schibsted-grotesk/800.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import '#lib/tracker/tracker.css';
	import { page } from '$app/state';
	import { SITE_URL } from '#lib/site/viewurl.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	// the scrollbar's width as --sbw, so the masthead can span the window less the scrollbar on every page and its links
	// stay put between reading pages and the full-width ones (owner's call HOME-01, 31 Oct 2026; tracker.css)
	$effect(() => {
		const root = document.documentElement;
		const set = () => root.style.setProperty('--sbw', `${Math.max(0, innerWidth - root.clientWidth)}px`);
		const ro = new ResizeObserver(set);
		ro.observe(root);
		set();
		return () => ro.disconnect();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- one address per page for search engines: elenz.co.nz, never www. or workers.dev, and no view settings -->
	<link rel="canonical" href={SITE_URL + page.url.pathname} />
</svelte:head>

{@render children()}
