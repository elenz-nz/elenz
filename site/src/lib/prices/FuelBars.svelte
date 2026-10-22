<script lang="ts">
	// Price captured by fuel: one bar per fuel, with the generation-weighted average of all of them as a dashed line.
	// Battery charging (f.charging) is the price batteries paid: a hatched bar under the battery's, not in the average.
	// Hovering a row (or tapping it, on touch screens) shows its energy and what it earned or paid in the line below.
	import { money } from './data.js';

	type Row = { f: { k: string; name: string; tok: string; charging?: boolean }; mwh: number; price: number };
	let { rows, avg }: { rows: Row[]; avg: number } = $props();

	const top = $derived(Math.max(avg * 1.25, ...rows.map((r) => r.price), 10));
	const pct = (v: number) => `${Math.max(0, (100 * v) / top).toFixed(2)}%`;
	let sel = $state<string | null>(null);
	const cur = $derived(rows.find((r) => r.f.k === sel) ?? null);
	const dollars = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}b` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}m` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);
	const energy = (mwh: number) => (mwh >= 1e6 ? `${(mwh / 1e6).toFixed(1)} TWh` : mwh >= 1e3 ? `${(mwh / 1e3).toFixed(mwh >= 1e5 ? 0 : 1)} GWh` : `${Math.round(mwh)} MWh`);
</script>

<div class="fb">
	<div class="rows">
		<div class="avg" style="left: calc(var(--lw) + (100% - var(--lw) - var(--rw)) * {Math.min(1, avg / top)})">
			<span>Average {money(avg)}</span>
		</div>
		{#each rows as r (r.f.k)}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the table below carries the same figures) -->
			<div class="row" class:chg={r.f.charging} class:on={sel === r.f.k}
				onpointerenter={(e) => { if (e.pointerType === 'mouse') sel = r.f.k; }}
				onpointerleave={(e) => { if (e.pointerType === 'mouse' && sel === r.f.k) sel = null; }}
				onclick={() => (sel = sel === r.f.k ? null : r.f.k)}>
				<span class="nm">{r.f.name}</span>
				<span class="track"><span class="bar" style="width: {pct(r.price)}; --c: var({r.f.tok})"></span></span>
				<span class="v">{money(r.price)}</span>
				<span class="p">{avg > 0 ? Math.round((100 * r.price) / avg) + '%' : ''}</span>
			</div>
		{/each}
	</div>
	<p class="read" aria-live="polite">
		{#if cur}<strong>{cur.f.name}</strong> · {energy(cur.mwh)} {cur.f.charging ? 'charged' : 'generated'} · {dollars(cur.mwh * cur.price)} {cur.f.charging ? 'paid' : 'earned'} · {money(cur.price)}/MWh{/if}
	</p>
	<table class="vh">
		<caption>Price captured by fuel, $/MWh</caption>
		<thead><tr><th>Fuel</th><th>$/MWh</th><th>Energy</th></tr></thead>
		<tbody>{#each rows as r}<tr><td>{r.f.name}</td><td>{money(r.price)}</td><td>{energy(r.mwh)}</td></tr>{/each}</tbody>
	</table>
</div>

<style>
	.fb { --lw: 140px; --rw: 104px; }
	.rows { position: relative; display: grid; gap: 7px; padding-top: 20px; }
	.row { cursor: default; border-radius: 3px; display: grid; grid-template-columns: var(--lw) 1fr 58px 46px; align-items: center; column-gap: 0; font-size: 0.84rem; }
	.nm { color: var(--ink-2); padding-right: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.track { display: block; height: 16px; position: relative; }
	.bar { position: absolute; inset: 0 auto 0 0; height: 100%; border-radius: 2px; background: var(--c); }
	/* charging: the battery's colour, hatched and outlined, as HVDC leaving is drawn on the Generation tab */
	.chg .bar { background: repeating-linear-gradient(135deg, var(--c) 0 2px, transparent 2px 5px); box-shadow: inset 0 0 0 1px var(--c); }
	.v, .p { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	.p { color: var(--muted); font-size: 0.78rem; }
	.avg { position: absolute; top: 18px; bottom: 0; width: 0; border-left: 1.5px dashed var(--ink-2); z-index: 1; pointer-events: none; }
	.avg span { position: absolute; top: -19px; transform: translateX(-50%); white-space: nowrap; font-size: 0.72rem; font-family: var(--font-data); color: var(--ink-2); }
	.row.on .nm { color: var(--ink); }
	.row.on { background: color-mix(in srgb, var(--ink) 7%, transparent); }
	.read { min-height: 1.3em; margin: 10px 0 0; font-size: 0.78rem; color: var(--ink-2); font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	.read strong { font-family: var(--font-ui); font-weight: 600; color: var(--ink); }
	.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
