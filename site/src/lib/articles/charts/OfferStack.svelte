<script lang="ts">
	// A supply curve for one trading period: every generator offer, cheapest first, as blocks whose width is the MW
	// offered and whose height is the offer price, coloured by fuel. A vertical line marks the generation that was
	// needed and a horizontal one the price that cleared. Offers above `ymax` are drawn to the top with a marker.
	// Pass the same xmax and ymax to two stacks to compare them on one scale.
	import Tip from './Tip.svelte';
	import Legend from './Legend.svelte';
	import { linear, ticks, num } from './util';

	type Fuel = { k: string; name: string; tok: string };
	let {
		blocks, fuels, load, price, priceName = 'Price', xmax, ymax = 1200, height = 260, title = '',
	}: {
		blocks: [string, number, number][];  // [fuel key, $/MWh, MW], in price order
		fuels: Fuel[]; load: number; price: number; priceName?: string;
		xmax: number; ymax?: number; height?: number; title?: string;
	} = $props();

	let w = $state(680);
	const m = { l: 52, r: 14, t: 26, b: 54 };
	const RIB = 10; // the fuel ribbon under the axis: every MW offered, in its fuel's colour
	const pw = $derived(Math.max(100, w - m.l - m.r));
	const ph = $derived(height - m.t - m.b);
	const x = $derived(linear(0, xmax, 0, pw));
	const y = $derived(linear(0, ymax, ph, 0));
	const xt = $derived(ticks(0, xmax, w < 520 ? 4 : 8));
	const yt = $derived(ticks(0, ymax, 4));
	const F = $derived(Object.fromEntries(fuels.map((f) => [f.k, f])));
	const tok = (k: string) => F[k]?.tok ?? '--muted';
	const fname = (k: string) => F[k]?.name ?? k;
	const dollars = (v: number) => (v < 10 ? `$${v.toFixed(2)}` : `$${num(v)}`) + '/MWh';

	const rows = $derived.by(() => {
		let acc = 0;
		return blocks.map(([f, p, mw]) => { const r = { f, p, mw, x0: acc, x1: acc + mw }; acc += mw; return r; });
	});
	const total = $derived(rows.length ? rows[rows.length - 1].x1 : 0);
	// every block is at least 3px tall, so offers at about $0 still show their fuel along the baseline
	const top = (p: number) => Math.min(y(Math.min(p, ymax)), ph - 3);

	let hi = $state(-1);
	let py = $state(0);
	function move(e: PointerEvent) {
		const mw = ((e.offsetX - m.l) / pw) * xmax;
		hi = rows.findIndex((r) => mw >= r.x0 && mw < r.x1);
		py = e.offsetY - 10;
	}

	// table: MW offered by fuel in price bands
	const BANDS = [[-Infinity, 1, '$1 or less'], [1, 100, '$1–100'], [100, 300, '$100–300'], [300, 1000, '$300–1,000'], [1000, Infinity, 'Over $1,000']] as const;
	const present = $derived(fuels.filter((f) => rows.some((r) => r.f === f.k)));
	const table = $derived(BANDS.map(([lo, hi2, name]) => ({
		name, by: present.map((f) => rows.filter((r) => r.f === f.k && r.p > lo && r.p <= hi2).reduce((a, r) => a + r.mw, 0)),
	})));
</script>

<div class="ch os" bind:clientWidth={w}>
	{#if title}<p class="os-title">{title}</p>{/if}
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label="{title}: offers by price and fuel; {num(load)} MW needed, price {dollars(price)}">
			<g transform="translate({m.l},{m.t})">
				<text class="ch-unit" x={-m.l} y={-12}>$/MWh</text>
				{#each yt as t}
					<line class="ch-grid" class:zero={t === 0} x1="0" x2={pw} y1={y(t)} y2={y(t)} />
					<text class="ch-tick" x="-8" y={y(t)} dy="0.32em" text-anchor="end">{num(t)}</text>
				{/each}
				{#each xt as t}<text class="ch-tick" x={x(t)} y={ph + RIB + 22} text-anchor="middle">{num(t)}</text>{/each}
				<text class="ch-tick" x={pw / 2} y={ph + RIB + 38} text-anchor="middle">MW offered, cheapest first</text>
				{#each rows as r, i}
					{#if x(r.x1) - x(r.x0) > 0.2}
						<rect x={x(r.x0)} y={top(r.p)} width={Math.max(0.6, x(r.x1) - x(r.x0) - (x(r.x1) - x(r.x0) > 3 ? 0.6 : 0))} height={ph - top(r.p)}
							style="fill: var({tok(r.f)})" class:dim={hi >= 0 && hi !== i} />
						<rect x={x(r.x0)} y={ph + 3} width={Math.max(0.6, x(r.x1) - x(r.x0))} height={RIB} style="fill: var({tok(r.f)})" class:dim={hi >= 0 && hi !== i} />
						{#if r.p > ymax}<path class="os-over" d="M{x((r.x0 + r.x1) / 2) - 3},{-3}l3,-5l3,5z" style="fill: var({tok(r.f)})" />{/if}
					{/if}
				{/each}
				<line class="os-load" x1={x(load)} x2={x(load)} y1={-4} y2={ph} />
				<text class="os-lab" x={x(load) + (x(load) > pw * 0.7 ? -6 : 6)} y={10} text-anchor={x(load) > pw * 0.7 ? 'end' : 'start'}>Needed {num(load)} MW</text>
				<line class="os-price" x1="0" x2={pw} y1={y(Math.min(price, ymax))} y2={y(Math.min(price, ymax))} />
				<text class="os-lab" x="6" y={y(Math.min(price, ymax)) - 6}>{priceName} {dollars(price)}</text>
				<rect class="ch-hit" x="0" y="-8" width={pw} height={ph + RIB + 12} onpointermove={move} onpointerleave={() => (hi = -1)} role="presentation" />
			</g>
		</svg>
		{#if hi >= 0}
			{@const r = rows[hi]}
			<Tip x={m.l + x((r.x0 + r.x1) / 2)} y={py} {w} title={fname(r.f)} rows={[
				{ tok: tok(r.f), name: 'offer price', value: dollars(r.p) },
				{ name: 'offered at this price', value: `${num(r.mw)} MW` },
				{ name: 'offered up to here', value: `${num(r.x1)} MW` },
			]} />
		{/if}
	</div>
	<details class="ch-data">
		<summary>Data table</summary>
		<table>
			<thead><tr><th>Offer price</th>{#each present as f}<th class="n">{f.name}</th>{/each}<th class="n">All</th></tr></thead>
			<tbody>
				{#each table as b}<tr><td>{b.name}</td>{#each b.by as v}<td class="n">{num(v)}</td>{/each}<td class="n">{num(b.by.reduce((a, v) => a + v, 0))}</td></tr>{/each}
				<tr><td>All offers</td>{#each present as f, j}<td class="n">{num(table.reduce((a, b) => a + b.by[j], 0))}</td>{/each}<td class="n">{num(total)}</td></tr>
			</tbody>
		</table>
		<p class="os-note">MW offered by fuel in each price band.</p>
	</details>
</div>

<style>
	.os-title { margin: 0 0 4px; font-weight: 600; font-size: 0.86rem; color: var(--ink); }
	.os-load { stroke: var(--ink); stroke-width: 1.5; }
	.os-price { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 4 3; }
	.os-lab { fill: var(--ink); font-size: 11.5px; font-weight: 600; font-family: var(--font-ui); paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
	.dim { opacity: 0.45; }
	.os-note { margin: 4px 0 0; color: var(--muted); font-size: 0.76rem; }
</style>
