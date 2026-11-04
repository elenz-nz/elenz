<script lang="ts">
	// A crop of a real page, in the page's own light or dark colours, for /guide and the method pages. The pictures are
	// in static/guide, made by analysis/guide_shots.py, which also writes shots.json (each one's size, so the page
	// doesn't jump as they load). A method page shows one only where it talks about that part of the site (test
	// report DOC-03, 3 Nov 2026).
	import SIZES from './shots.json';
	let { name, alt, caption }: { name: string; alt: string; caption: string } = $props();
	const size = $derived((SIZES as Record<string, number[]>)[name]);
</script>

<figure class="shot">
	<img class="on-light" src="/guide/{name}-light.webp" {alt} width={size[0]} height={size[1]} loading="lazy" />
	<img class="on-dark" src="/guide/{name}-dark.webp" {alt} width={size[0]} height={size[1]} loading="lazy" />
	<figcaption>{caption}</figcaption>
</figure>

<style>
	.shot { margin: 4px 0 8px; min-width: 0; }
	.shot img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; }
	.shot figcaption { margin-top: 5px; font-size: 0.8rem; color: var(--muted); line-height: 1.4; }
	.on-dark { display: none !important; }
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .on-dark { display: block !important; }
		:global(:root:not([data-theme='light'])) .on-light { display: none !important; }
	}
	:global(:root[data-theme='dark']) .on-dark { display: block !important; }
	:global(:root[data-theme='dark']) .on-light { display: none !important; }
</style>
