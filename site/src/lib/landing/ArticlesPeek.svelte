<script lang="ts">
	// A glimpse of Articles for the landing page: the newest article's cover image (its title if it has none), in its
	// light version in light mode when the article has one (imageLight).
	import { listed } from '#lib/articles/registry.js';

	let {}: { D?: any; now?: any } = $props();
	const first = listed[0];
</script>

<div class="art-peek">
	{#if first?.image && first.imageLight}
		<img class="for-light" src={first.imageLight} alt={first.title} width="1200" height="630" loading="lazy" />
		<img class="for-dark" src={first.image} alt={first.title} width="1200" height="630" loading="lazy" />
	{:else if first?.image}
		<img src={first.image} alt={first.title} width="1200" height="630" loading="lazy" />
	{:else if first}
		<p class="title">{first.title}</p>
	{:else}
		<p class="title">No articles yet.</p>
	{/if}
</div>

<style>
	.art-peek { display: grid; }
	img { width: 100%; height: auto; border-radius: 4px; display: block; }
	/* the light cover has a hairline edge so it holds its shape on the light page */
	.for-light { outline: 1px solid var(--line); outline-offset: -1px; }
	.for-dark { display: none; }
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .for-light { display: none; }
		:global(:root:not([data-theme='light'])) .for-dark { display: block; }
	}
	:global(:root[data-theme='dark']) .for-light { display: none; }
	:global(:root[data-theme='dark']) .for-dark { display: block; }
	.title { margin: 0; font-size: 1.25rem; font-weight: 750; letter-spacing: -0.01em; line-height: 1.2; color: var(--ink); }
</style>
