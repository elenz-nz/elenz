<script lang="ts">
	// The reports and documents a method page cites, from the registry. `inBody`: the page gives the section its own
	// heading (the standard structure); otherwise the box carries a small "References" title.
	import { refsFor } from './registry.js';
	let { slug, inBody = false }: { slug: string; inBody?: boolean } = $props();
	const refs = $derived(refsFor(slug));
</script>

{#if refs.length}
	<section class="mt-data" aria-labelledby={inBody ? 'references' : 'mt-refs-h'}>
		{#if !inBody}<h2 id="mt-refs-h">References</h2>{/if}
		<ul>
			{#each refs as r (r.id)}
				<li>
					<span class="nm"><a href={r.url} target="_blank" rel="noopener">{r.title}</a><small>{r.by}{r.date ? `, ${r.date}` : ''}</small></span>
					<span class="use">{r.use}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
