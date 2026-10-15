<script lang="ts">
	// A chart, table or image with a caption and its data source.
	//   <Figure caption="Haywards price, 9 August 2021" source="EMI final energy prices">…chart…</Figure>
	import type { Snippet } from 'svelte';
	let { caption = '', source = '', wide = false, children }: { caption?: string; source?: string; wide?: boolean; children: Snippet } = $props();
</script>

<figure class:wide>
	<div class="f-body">{@render children()}</div>
	{#if caption || source}
		<figcaption>
			{#if caption}<span>{caption}</span>{/if}
			{#if source}<small>Source: {source}</small>{/if}
		</figcaption>
	{/if}
</figure>

<style>
	figure { margin: 6px 0; display: grid; gap: 8px; }
	.f-body { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 12px; overflow-x: auto; }
	figcaption { display: grid; gap: 2px; font-size: 0.84rem; color: var(--ink-2); max-width: 74ch; }
	figcaption small { color: var(--muted); font-size: 0.76rem; }
</style>
