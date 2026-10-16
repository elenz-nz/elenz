<script lang="ts">
	// One whole split into its parts as a single horizontal bar, each part labelled with its name, value and share.
	// Parts too narrow for a label inside are listed in the key below the bar, which names every part anyway.
	//   <SplitBar parts={[{ name: 'Electricity', value: 156, tok: '--f-hydro' }, …]} fmt={(v) => `${v} c/kWh`} />
	import Tip from './Tip.svelte';
	import { num } from './util';
	type Part = { name: string; value: number; tok: string };
	let { parts, fmt = (v: number) => num(v), totalName = 'Total' }: { parts: Part[]; fmt?: (v: number) => string; totalName?: string } = $props();

	let w = $state(680);
	const total = $derived(parts.reduce((a, p) => a + p.value, 0));
	const segs = $derived.by(() => { let acc = 0; return parts.map((p) => { const s = { ...p, x: (acc / total) * w, sw: (p.value / total) * w, pct: (100 * p.value) / total }; acc += p.value; return s; }); });
	let hi = $state(-1);
</script>

<div class="ch sb" bind:clientWidth={w}>
	<div class="ch-plot">
		<svg width={w} height="44" role="img" aria-label={parts.map((p) => `${p.name} ${fmt(p.value)}`).join(', ')}>
			{#each segs as s, i}
				<rect x={s.x + (i ? 1 : 0)} y="0" width={Math.max(0.5, s.sw - (i ? 1 : 0))} height="44" rx="3" style="fill: var({s.tok})" class:dim={hi >= 0 && hi !== i}
					role="presentation" onpointerenter={() => (hi = i)} onpointerleave={() => (hi = -1)} />
				{#if s.sw > 84}<text x={s.x + 8} y="27" class="sb-in">{s.name}</text>{/if}
			{/each}
		</svg>
		{#if hi >= 0}
			<Tip x={segs[hi].x + segs[hi].sw / 2} y={50} {w} title={segs[hi].name} rows={[{ tok: segs[hi].tok, name: 'per unit', value: fmt(segs[hi].value) }, { name: 'of the total', value: `${segs[hi].pct.toFixed(0)}%` }]} />
		{/if}
	</div>
	<ul class="sb-key">
		{#each segs as s}
			<li><i style="background: var({s.tok})"></i><span class="sb-n">{s.name}</span><b>{fmt(s.value)}</b><span class="sb-p">{s.pct.toFixed(0)}%</span></li>
		{/each}
		<li class="sb-total"><i></i><span class="sb-n">{totalName}</span><b>{fmt(total)}</b><span class="sb-p">100%</span></li>
	</ul>
</div>

<style>
	.sb-in { fill: #fff; font-size: 12px; font-weight: 650; font-family: var(--font-ui); pointer-events: none; }
	.sb-key { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 6px 22px; font-size: 0.84rem; }
	.sb-key li { display: grid; grid-template-columns: 12px 1fr auto 3em; white-space: nowrap; align-items: center; gap: 8px; color: var(--ink-2); }
	.sb-key i { width: 10px; height: 10px; border-radius: 2px; }
	.sb-key b { font-family: var(--font-data); font-weight: 500; color: var(--ink); font-variant-numeric: tabular-nums; }
	.sb-p { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
	.sb-total { font-weight: 650; }
	.sb-total .sb-n { color: var(--ink); }
</style>
