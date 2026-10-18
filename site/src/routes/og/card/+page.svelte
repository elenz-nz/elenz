<script lang="ts">
	// The site's link-preview image, drawn from the live week for analysis/site_card_png.py to photograph as
	// static/og/elenz.png. Not linked from anywhere and kept out of search engines.
	import { onMount } from 'svelte';
	import SiteCard from '#lib/site/SiteCard.svelte';

	let D = $state<any>(null);
	onMount(async () => {
		D = await (await fetch('/data/tracker.json', { cache: 'no-cache' })).json();
	});
</script>

<svelte:head>
	<title>Preview card · ELENZ</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="card-page">{#if D}<SiteCard {D} />{/if}</div>

<style>
	.card-page { width: 1200px; height: 630px; overflow: hidden; }
</style>
