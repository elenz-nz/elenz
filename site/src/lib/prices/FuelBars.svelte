<script lang="ts">
	// Price captured by fuel: one bar per fuel, with the generation-weighted average of all of them as a dashed line.
	import { money } from './data.js';

	type Row = { f: { k: string; name: string; tok: string }; mwh: number; price: number };
	let { rows, avg }: { rows: Row[]; avg: number } = $props();

	const top = $derived(Math.max(avg * 1.25, ...rows.map((r) => r.price), 10));
	const pct = (v: number) => `${Math.max(0, (100 * v) / top).toFixed(2)}%`;
	const energy = (mwh: number) => (mwh >= 1e6 ? `${(mwh / 1e6).toFixed(1)} TWh` : mwh >= 1e3 ? `${(mwh / 1e3).toFixed(mwh >= 1e5 ? 0 : 1)} GWh` : `${Math.round(mwh)} MWh`);
</script>

<div class="fb">
	<div class="rows">
		<div class="avg" style="left: calc(var(--lw) + (100% - var(--lw) - var(--rw)) * {Math.min(1, avg / top)})">
			<span>Average {money(avg)}</span>
		</div>
		{#each rows as r (r.f.k)}
			<div class="row" title="{r.f.name}: {money(r.price)}/MWh on {energy(r.mwh)}">
				<span class="nm">{r.f.name}</span>
				<span class="track"><span class="bar" style="width: {pct(r.price)}; background: var({r.f.tok})"></span></span>
				<span class="v">{money(r.price)}</span>
				<span class="p">{avg > 0 ? Math.round((100 * r.price) / avg) + '%' : ''}</span>
			</div>
		{/each}
	</div>
	<table class="vh">
		<caption>Price captured by fuel, $/MWh</caption>
		<thead><tr><th>Fuel</th><th>$/MWh</th><th>Energy</th></tr></thead>
		<tbody>{#each rows as r}<tr><td>{r.f.name}</td><td>{money(r.price)}</td><td>{energy(r.mwh)}</td></tr>{/each}</tbody>
	</table>
</div>

<style>
	.fb { --lw: 118px; --rw: 104px; }
	.rows { position: relative; display: grid; gap: 7px; padding-top: 20px; }
	.row { display: grid; grid-template-columns: var(--lw) 1fr 58px 46px; align-items: center; column-gap: 0; font-size: 0.84rem; }
	.nm { color: var(--ink-2); padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.track { height: 16px; position: relative; }
	.bar { position: absolute; inset: 0 auto 0 0; border-radius: 2px; }
	.v, .p { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	.p { color: var(--muted); font-size: 0.78rem; }
	.avg { position: absolute; top: 18px; bottom: 0; width: 0; border-left: 1.5px dashed var(--ink-2); z-index: 1; pointer-events: none; }
	.avg span { position: absolute; top: -19px; transform: translateX(-50%); white-space: nowrap; font-size: 0.72rem; font-family: var(--font-data); color: var(--ink-2); }
	.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
