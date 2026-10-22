<script lang="ts">
	// "What this estimate is good for": a short table at the top of each estimate's method page, so it's clear what the
	// figure can and can't carry. level: 'good' | 'ok' | 'care' | 'no'.
	type Row = { use: string; level: 'good' | 'ok' | 'care' | 'no'; verdict: string; why?: string };
	let { rows, caption = '' }: { rows: Row[]; caption?: string } = $props();
	const WORD = { good: 'Credible', ok: 'Useful', care: 'Indicative', no: 'Not suitable' };
</script>

<div class="tbl good-for">
	<table>
		<thead><tr><th>Use</th><th>How far to trust it</th></tr></thead>
		<tbody>
			{#each rows as r (r.use)}
				<tr>
					<td>{r.use}</td>
					<td><span class="lvl {r.level}">{WORD[r.level]}</span> {r.verdict}{#if r.why}{' '}<span class="why">{r.why}</span>{/if}</td>
				</tr>
			{/each}
		</tbody>
		{#if caption}<caption>{caption}</caption>{/if}
	</table>
</div>

<style>
	.good-for td:first-child { width: 38%; font-weight: 500; color: var(--ink); }
	.lvl { display: inline-block; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; border-radius: 3px; padding: 1px 6px; margin-right: 4px; white-space: nowrap; }
	.lvl.good { background: color-mix(in srgb, var(--g-ren, #1d7656) 18%, transparent); color: var(--ink); }
	.lvl.ok { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); }
	.lvl.care { background: color-mix(in srgb, #d49a64 30%, transparent); color: var(--ink); }
	.lvl.no { background: var(--grid); color: var(--ink-2); }
	.why { color: var(--muted); }
</style>
