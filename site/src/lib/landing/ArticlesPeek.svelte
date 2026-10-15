<script lang="ts">
	// A glimpse of Articles for the landing page: the newest article's cover image (its title if it has none).
	import { listed } from '#lib/articles/registry.js';

	let {}: { D?: any; now?: any } = $props();
	const first = listed[0];
</script>

<div class="art-peek">
	{#if first?.image}
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
	.title { margin: 0; font-size: 1.25rem; font-weight: 750; letter-spacing: -0.01em; line-height: 1.2; color: var(--ink); }
</style>
