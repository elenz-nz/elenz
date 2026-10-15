<script lang="ts">
	// A glimpse of Articles for the landing page: the newest published article, then the next two.
	import { listed, longDate } from '#lib/articles/registry.js';

	let {}: { D?: any; now?: any } = $props();
	const [first, ...rest] = listed;
</script>

<div class="art-peek">
	{#if first}
		<p class="meta"><span class="kind">{first.kind}</span>{longDate(first.date)}</p>
		<p class="title">{first.title}</p>
		<p class="dek">{first.dek}</p>
		{#if rest.length}
			<ul>
				{#each rest.slice(0, 2) as a}<li><span class="kind">{a.kind}</span>{a.title}</li>{/each}
			</ul>
		{/if}
	{:else}
		<p class="dek">No articles yet.</p>
	{/if}
</div>

<style>
	.art-peek { display: grid; gap: 8px; padding: 6px 4px; text-align: left; }
	p { margin: 0; }
	.meta { font-size: 0.74rem; color: var(--muted); display: flex; gap: 10px; align-items: baseline; }
	.kind { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent); margin-right: 8px; }
	.title { font-size: 1.25rem; font-weight: 750; letter-spacing: -0.01em; line-height: 1.2; color: var(--ink); }
	.dek { font-size: 0.88rem; line-height: 1.5; color: var(--ink-2); }
	ul { list-style: none; margin: 4px 0 0; padding: 8px 0 0; border-top: 1px solid var(--grid); display: grid; gap: 6px; font-size: 0.86rem; color: var(--ink); }
</style>
