<script lang="ts">
	// A row of headline figures for the top of an article.
	//   <Stats items={[{ label: 'Peak demand', value: '7,421', unit: 'MW', note: '6 Aug, 7:30 am', tok: '--accent' }]} />
	type Item = { label: string; value: string; unit?: string; note?: string; tok?: string };
	let { items }: { items: Item[] } = $props();
</script>

<dl class="a-stats">
	{#each items as it}
		<div style="--c: var({it.tok ?? '--accent'})">
			<dt>{it.label}</dt>
			<dd><span class="sv">{it.value}</span>{#if it.unit}<small>{it.unit}</small>{/if}</dd>
			{#if it.note}<dd class="note">{it.note}</dd>{/if}
		</div>
	{/each}
</dl>

<style>
	.a-stats { margin: 4px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
	.a-stats > div { background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--c); border-radius: 4px; padding: 10px 12px 11px; display: grid; gap: 2px; align-content: start; }
	dt { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
	dd { margin: 0; }
	.sv { font-size: 1.65rem; font-weight: 650; letter-spacing: -0.02em; color: var(--ink); line-height: 1.15; }
	small { font-size: 0.82rem; color: var(--muted); margin-left: 4px; font-weight: 500; }
	.note { font-size: 0.78rem; color: var(--ink-2); line-height: 1.35; }
</style>
