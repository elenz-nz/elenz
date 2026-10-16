<script lang="ts">
	// The parts of a series at the end of each part: every part in order, this one marked, with previous/next links.
	// Parts a reader can't open yet (drafts, or scheduled for a later date) are listed without a link.
	import { longDate, scheduled } from './registry';
	type Part = { slug: string; title: string; part?: number; date: string; draft?: boolean; open: boolean };
	let { name, dek, parts, current, prev, next }: {
		name: string; dek: string; parts: Part[]; current: string;
		prev?: { slug: string; title: string }; next?: { slug: string; title: string };
	} = $props();
</script>

<nav class="sn" aria-label="{name}: all parts">
	<p class="sn-kicker">Series</p>
	<p class="sn-name">{name}</p>
	<p class="sn-dek">{dek}</p>
	<ol>
		{#each parts as p (p.slug)}
			<li class:here={p.slug === current}>
				<span class="sn-n">{p.part}</span>
				{#if p.slug === current}<span class="sn-t" aria-current="page">{p.title}</span>
				{:else if p.open}<a class="sn-t" href="/articles/{p.slug}">{p.title}</a>
				{:else}<span class="sn-t soon">{p.title}<small>{scheduled(p) ? ` · ${longDate(p.date)}` : ' · coming soon'}</small></span>{/if}
			</li>
		{/each}
	</ol>
	{#if prev || next}
		<div class="sn-step">
			{#if prev}<a class="prev" href="/articles/{prev.slug}"><small>Previous</small>{prev.title}</a>{:else}<span></span>{/if}
			{#if next}<a class="next" href="/articles/{next.slug}"><small>Next</small>{next.title}</a>{/if}
		</div>
	{/if}
</nav>

<style>
	.sn { margin: 28px 0 4px; padding: 16px 18px 18px; background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--accent); border-radius: 4px; display: grid; gap: 6px; max-width: 74ch; }
	.sn p { margin: 0; }
	.sn-kicker { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
	.sn-name { font-weight: 700; font-size: 1.05rem; color: var(--ink); }
	.sn-dek { font-size: 0.86rem; color: var(--ink-2); }
	ol { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; }
	li { display: grid; grid-template-columns: 26px 1fr; align-items: baseline; padding: 5px 8px; border-radius: 4px; font-size: 0.92rem; }
	li.here { background: var(--accent-soft); }
	.sn-n { font-family: var(--font-data); font-size: 0.8rem; color: var(--muted); }
	li.here .sn-n, li.here .sn-t { color: var(--ink); font-weight: 650; }
	a.sn-t { color: var(--ink); text-decoration: none; }
	a.sn-t:hover { color: var(--accent); text-decoration: underline; }
	.soon { color: var(--muted); }
	.soon small { font-size: 0.78rem; }
	.sn-step { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
	.sn-step a { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 4px; color: var(--ink); text-decoration: none; font-weight: 600; font-size: 0.9rem; }
	.sn-step a:hover { border-color: var(--accent); color: var(--accent); }
	.sn-step small { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
	.sn-step .next { text-align: right; grid-column: 2; }
	@media (max-width: 520px) { .sn-step { grid-template-columns: 1fr; } .sn-step .next { grid-column: 1; } }
</style>
