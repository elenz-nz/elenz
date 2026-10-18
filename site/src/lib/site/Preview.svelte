<script lang="ts">
	// Link-preview tags (LinkedIn, Facebook, Slack, X ...) for a page: og:title, og:description, og:url, og:image and
	// the large-image card. Put it inside the page's <svelte:head>, after its <title> and description. The image is
	// the site's own card (static/og/elenz.png, made by analysis/site_card_png.py) unless the page has its own.
	// The Worker rewrites og:title and og:url on the tracker's pages for a linked view (worker/index.js).
	// The build checks every public page has these (scripts/check-previews.js).
	import { SITE_URL } from '#lib/site/viewurl.js';

	let { title, description, path, image = '/og/elenz.png', alt = "ELENZ: New Zealand's electricity, live", type = 'website' }:
		{ title: string; description: string; path: string; image?: string; alt?: string; type?: string } = $props();
</script>

<meta property="og:type" content={type} />
<meta property="og:site_name" content="ELENZ" />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content="{SITE_URL}{path}" />
<meta property="og:image" content="{SITE_URL}{image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content={alt} />
<meta name="twitter:card" content="summary_large_image" />
