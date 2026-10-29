<script lang="ts">
	// Prerendered to build/404.html. Cloudflare serves it, with status 404, for any address that has no file
	// (`assets.not_found_handling` in wrangler.jsonc), so a mistyped address gets this page, not a blank one. noindex,
	// and not in the sitemap. The page itself: src/lib/site/NotFound.svelte.
	import NotFound from '#lib/site/NotFound.svelte';
</script>

<svelte:head>
	<title>Page not found · ELENZ</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<NotFound />
