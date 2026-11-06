<script lang="ts">
	// A method page's References section: the reports and documents it cites, from the registry, then the code and
	// evidence files it describes (the topic's `code`).
	import { REPO, refsFor, topic } from './registry.js';
	let { slug }: { slug: string } = $props();
	const refs = $derived(refsFor(slug));
	const code = $derived(topic(slug)?.code ?? []);
</script>

{#if refs.length}
	<section class="mt-data" aria-labelledby="references">
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
{#if code.length}
	<p class="note">Code and evidence: {#each code as c, i (c)}{i ? ', ' : ''}<a href={REPO + c}><code>{c}</code></a>{/each}.</p>
{/if}
