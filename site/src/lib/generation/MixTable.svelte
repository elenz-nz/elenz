<script lang="ts">
	// The mix by fuel over the range: energy, share, change on the same dates a year earlier, average and peak MW,
	// and capacity factor (energy over installed capacity, capacity.json). From mixRows() in ./data.js.
	type Row = { f: { k: string; name: string; tok: string; hatch?: number; tag?: string; ren?: number }; e: number; ep: number; share: number; avg: number; peak: number; cf: number };
	type Mix = { rows: Row[]; tot: number; totPrev: number; avg: number; peak: number; ren: number; renShare: number; renSharePrev: number };
	let { mix, prevLabel }: { mix: Mix; prevLabel: string | null } = $props();

	const big = $derived(mix.tot >= 1e7);   // over 10,000 GWh: TWh
	const unit = $derived(big ? 'TWh' : 'GWh');
	const energy = (mwh: number) => { const v = mwh / (big ? 1e6 : 1e3); return v >= 100 ? Math.round(v).toLocaleString('en-NZ') : v.toFixed(v >= 10 ? 1 : 2); };
	const mw = (v: number) => (v === v ? Math.round(v).toLocaleString('en-NZ') : '–');
	const pct = (v: number) => (v !== v ? '–' : v < 0.0005 ? '<0.1%' : `${(100 * v).toFixed(1)}%`);
	const cf = (v: number) => (v !== v ? '–' : `${Math.round(100 * v)}%`);
	const change = (now: number, then: number) => {
		if (!(then > 0.5)) return now > 0.5 ? { text: 'new', cls: 'flat' } : { text: '–', cls: 'flat' };
		const d = (100 * (now - then)) / then;
		if (d >= 900) return { text: `×${Math.round(now / then).toLocaleString('en-NZ')}`, cls: '' };   // ten times or more: a multiple reads better
		return { text: (Math.abs(d) < 0.5 ? '±0' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(0)) + '%', cls: Math.abs(d) < 0.5 ? 'flat' : '' };
	};
	const pts = (now: number, then: number) => {
		if (!(then === then && now === now)) return '–';
		const d = 100 * (now - then);
		return (Math.abs(d) < 0.05 ? '±0.0' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1)) + ' pts';
	};
	const tc = $derived(change(mix.tot, mix.totPrev));
	const showPeak = $derived(mix.peak === mix.peak);
	const showPrev = $derived(prevLabel !== null);
	const maxShare = $derived(Math.max(...mix.rows.map((r) => r.share), 0.01));
</script>

<div class="scroll">
	<table class="mixt">
		<thead>
			<tr>
				<th scope="col">Fuel</th>
				<th scope="col" class="n">{unit}</th>
				<th scope="col" class="n">Share</th>
				{#if showPrev}<th scope="col" class="n" title="Change in energy on the same dates a year earlier">vs {prevLabel}</th>{/if}
				<th scope="col" class="n" title="Average output over the range">Avg MW</th>
				{#if showPeak}<th scope="col" class="n" title="Highest single interval">Peak MW</th>{/if}
				<th scope="col" class="n" title="Average output over installed capacity">Cap. factor</th>
			</tr>
		</thead>
		<tbody>
			{#each mix.rows as r (r.f.k)}
				{@const ch = change(r.e, r.ep)}
				<tr>
					<td><span class="nm"><span class="sw" class:hatch={r.f.hatch} style="--c: var({r.f.tok})"></span>{r.f.name}{#if r.f.tag}<span class="tag">{r.f.tag}</span>{/if}</span></td>
					<td class="n">{energy(r.e)}</td>
					<td class="n"><span class="bar" style="width: {Math.max(1, (36 * r.share) / maxShare)}px; background: var({r.f.tok})"></span>{pct(r.share)}</td>
					{#if showPrev}<td class="n {ch.cls}">{ch.text}</td>{/if}
					<td class="n">{mw(r.avg)}</td>
					{#if showPeak}<td class="n">{mw(r.peak)}</td>{/if}
					<td class="n">{cf(r.cf)}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr>
				<td>Total</td><td class="n">{energy(mix.tot)}</td><td class="n">100%</td>
				{#if showPrev}<td class="n {tc.cls}">{tc.text}</td>{/if}
				<td class="n">{mw(mix.avg)}</td>{#if showPeak}<td class="n">{mw(mix.peak)}</td>{/if}<td></td>
			</tr>
			<tr class="ren">
				<td>Renewable</td><td class="n">{energy(mix.ren)}</td><td class="n">{pct(mix.renShare)}</td>
				{#if showPrev}<td class="n" title="Change in renewable share, percentage points">{pts(mix.renShare, mix.renSharePrev)}</td>{/if}
				<td></td>{#if showPeak}<td></td>{/if}<td></td>
			</tr>
		</tfoot>
	</table>
</div>

<style>
	.scroll { overflow-x: auto; }
	.mixt { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
	th { text-align: left; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; padding: 0 0 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
	th:first-child { padding-left: 0; }
	td { padding: 5px 0 5px 8px; border-bottom: 1px solid var(--grid); white-space: nowrap; }
	td:first-child { padding-left: 0; }
	.nm { display: inline-flex; align-items: center; gap: 7px; }
	.n { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	tfoot td { border-bottom: 0; border-top: 1px solid var(--line); font-weight: 600; padding-top: 7px; }
	tfoot tr.ren td { border-top: 0; font-weight: 500; color: var(--ink-2); padding-top: 3px; }
	.sw { width: 11px; height: 11px; border-radius: 3px; background: var(--c); flex: none; }
	.sw.hatch { background: repeating-linear-gradient(135deg, var(--c) 0 2px, transparent 2px 4px); box-shadow: inset 0 0 0 1px var(--c); }
	.tag { font-size: 0.68rem; color: var(--muted); letter-spacing: 0.04em; }
	.bar { display: inline-block; height: 6px; border-radius: 1px; vertical-align: 1px; margin-right: 6px; opacity: 0.85; }
	.flat { color: var(--muted); }
</style>
