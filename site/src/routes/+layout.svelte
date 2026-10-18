<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '#lib/tracker/tracker.css';
	import { page } from '$app/state';
	import { SITE_URL } from '#lib/site/viewurl.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- one address per page for search engines: elenz.co.nz, never www. or workers.dev, and no view settings -->
	<link rel="canonical" href={SITE_URL + page.url.pathname} />
</svelte:head>

{@render children()}
