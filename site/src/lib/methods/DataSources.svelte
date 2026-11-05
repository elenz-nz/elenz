<script lang="ts">
	// The datasets behind a method page, from the registry, so a dataset is described once. `roles` (a page written to
	// the standard structure) says what each does on that page, in the page's order: { id: [role, what it does here] }.
	// Without it the box lists every dataset with the page's slug in `topics`, under its own "Data used" heading.
	import { SOURCES, sourceHref, sourcesFor } from './registry.js';
	let { slug, roles }: { slug: string; roles?: Record<string, [string, string]> } = $props();
	const used = $derived(roles ? Object.keys(roles).map((id) => SOURCES.find((s) => s.id === id)!) : sourcesFor(slug));
</script>

{#if used.length}
	<section class="mt-data" aria-labelledby={roles ? 'data-sources' : 'mt-data-h'}>
		{#if !roles}<h2 id="mt-data-h">Data used</h2>{/if}
		<ul>
			{#each used as s (s.id)}
				<li>
					<span class="nm"><a href={sourceHref(s.id)}>{s.name}</a>{#if s.check}<span class="chk">Check</span>{/if}<small>{s.publisher}</small></span>
					<span class="use">{#if roles}<b>{roles[s.id][0]}.</b> {roles[s.id][1]}{:else}{s.use}{/if}<small>{s.period} · {s.fresh}</small></span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
