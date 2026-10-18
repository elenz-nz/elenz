<script lang="ts">
	// Link-preview tags (LinkedIn, Facebook, Slack, X ...) for a page: og:title, og:description, og:url, og:image and
	// the large-image card. Put it inside the page's <svelte:head>, after its <title> and description. The image is
	// the site's own card (static/og/elenz.png, made by analysis/site_card_png.py) unless the page has its own.
	// The Worker rewrites og:title and og:url on the tracker's pages for a linked view (worker/index.js).
	// The build checks every public page has these (scripts/check-previews.js).
	// The site's card is 2400 x 1260 (article covers 1200 x 630), and each page asks for it at its own address
	// (?p=<page>): LinkedIn keeps one copy per image address, and with one address shared by every page it served some
	// pages a small thumbnail of it.
	import { SITE_URL } from '#lib/site/viewurl.js';

	let { title, description, path, image, alt = "ELENZ: New Zealand's electricity, live", type = 'website' }:
		{ title: string; description: string; path: string; image?: string; alt?: string; type?: string } = $props();
	const page = $derived(path.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home');
	const src = $derived(image ?? `/og/elenz.png?p=${page}`);
	const [w, h] = $derived(image ? [1200, 630] : [2400, 1260]);
</script>

<meta property="og:type" content={type} />
<meta property="og:site_name" content="ELENZ" />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content="{SITE_URL}{path}" />
<meta property="og:image" content="{SITE_URL}{src}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content={String(w)} />
<meta property="og:image:height" content={String(h)} />
<meta property="og:image:alt" content={alt} />
<meta name="twitter:card" content="summary_large_image" />
