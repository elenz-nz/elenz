<script lang="ts">
	// An error while moving between pages in the browser: a link inside the site to an address that doesn't exist
	// (404) gets the not-found page; anything else a short "something went wrong" in the same frame.
	import { page } from '$app/state';
	import NotFound from '#lib/site/NotFound.svelte';
	const missing = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{missing ? 'Page not found' : 'Something went wrong'} · ELENZ</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if missing}
	<NotFound />
{:else}
	<NotFound title="Something went wrong" note="Try reloading the page; if it keeps happening, let us know." />
{/if}
