<script lang="ts">
	// A method page's Data sources section: the datasets it uses, in the page's order, from ROLES (what each does on this
	// page) and SOURCES (what the dataset is), so a dataset is described once.
	import { ROLES } from './roles.js';
	import { sourceHref, sourceOf } from './registry.js';
	let { slug }: { slug: string } = $props();
	const used = $derived(Object.entries(ROLES[slug] ?? {}).map(([id, [role, what]]) => ({ s: sourceOf(id), role, what })));
</script>

<section class="mt-data" aria-labelledby="data-sources">
	<ul>
		{#each used as { s, role, what } (s.id)}
			<li>
				<span class="nm"><a href={sourceHref(s.id)}>{s.name}</a>{#if s.check}<span class="chk">Check</span>{/if}<small>{s.publisher}</small></span>
				<span class="use"><b>{role}.</b> {what}<small>{s.period} {s.fresh}</small></span>
			</li>
		{/each}
	</ul>
</section>
