<script lang="ts">
	// For each row (a year), two 100% bars split into the same bands: the share of time spent in each band, and the
	// share of money earned in it. Bands run from cheap (blue) to dear (orange, then red); the middle bands are paler
	// (mixed with a fixed light grey, so they stay pale in dark mode too).
	//   <TimeMoney rows={[{ name: '2024', time: [...], money: [...] }]} bands={['Under $50', ...]} total={(r) => '$8.6bn'} />
	import Tip from './Tip.svelte';
	import Legend from './Legend.svelte';
	import { num } from './util';

	type Row = { name: string; time: number[]; money: number[]; total: number };   // money in $bn, total $bn
	let { rows, bands, label = 'Year' }: { rows: Row[]; bands: string[]; label?: string } = $props();

	// colours from the site's fuel tokens, so they follow light and dark mode
	const FILLS = [
		'var(--f-hydro)',
		'color-mix(in oklab, var(--f-hydro) 50%, #bcc5c8)',
		'color-mix(in oklab, var(--f-gas) 50%, #cbc2b8)',
		'var(--f-gas)',
		'var(--f-diesel)',
	];
	let w = $state(680);
	const narrow = $derived(w < 520);
	const m = $derived({ l: narrow ? 92 : 108, r: narrow ? 8 : 62 });
	const pw = $derived(Math.max(100, w - m.l - m.r));
	const barH = 13, gap = 3, rowGap = 14;
	const rowH = barH * 2 + gap + rowGap;
	const height = $derived(rows.length * rowH + 22);
	const pct = (v: number[]) => { const s = v.reduce((a, q) => a + q, 0); return v.map((q) => (s ? (100 * q) / s : 0)); };
	const segs = (v: number[]) => { let acc = 0; return pct(v).map((p, j) => { const s = { x: (acc / 100) * pw, w: (p / 100) * pw, p, j }; acc += p; return s; }); };

	let hi = $state<{ r: number; kind: 'time' | 'money'; j: number } | null>(null);
	let tip = $state({ x: 0, y: 0 });
</script>

<div class="ch" bind:clientWidth={w} style={FILLS.map((f, j) => `--c${j}: ${f}`).join(';')}>
	<Legend items={bands.map((b, j) => ({ name: b, tok: '--c' + j }))} />
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label="Share of time and of money in each price band, by {label.toLowerCase()}">
			<g transform="translate({m.l},8)">
				{#each [0, 25, 50, 75, 100] as t}
					<line class="ch-grid" x1={(t / 100) * pw} x2={(t / 100) * pw} y1="-4" y2={rows.length * rowH - rowGap + 4} />
					<text class="ch-tick" x={(t / 100) * pw} y={rows.length * rowH - rowGap + 18} text-anchor="middle">{t}%</text>
				{/each}
				{#each rows as r, i}
					{@const y0 = i * rowH}
					<text class="ch-rowlabel tm-year" x={-m.l} y={y0 + barH + gap / 2} dy="0.32em">{r.name}</text>
					<text class="ch-tick" x="-6" y={y0 + barH / 2} dy="0.32em" text-anchor="end">time</text>
					<text class="ch-tick" x="-6" y={y0 + barH + gap + barH / 2} dy="0.32em" text-anchor="end">money</text>
					{#each ['time', 'money'] as const as kind, k}
						{#each segs(r[kind]) as s}
							{#if s.w > 0.3}
								<rect x={s.x + (s.j ? 1 : 0)} y={y0 + k * (barH + gap)} width={Math.max(0.5, s.w - (s.j ? 1 : 0))} height={barH} rx="2"
									style="fill: var(--c{s.j})" class:dim={hi !== null && !(hi.r === i && hi.j === s.j)}
									role="presentation"
									onpointerenter={(e) => { hi = { r: i, kind, j: s.j }; tip = { x: m.l + s.x + s.w / 2, y: e.offsetY - 10 }; }}
									onpointerleave={() => (hi = null)} />
							{/if}
						{/each}
					{/each}
					{#if !narrow}<text class="ch-val" x={pw + 8} y={y0 + barH + gap + barH / 2} dy="0.32em">${r.total.toFixed(1)}bn</text>{/if}
				{/each}
			</g>
		</svg>
		{#if hi}
			{@const r = rows[hi.r]}
			<Tip x={tip.x} y={tip.y} {w} title="{r.name}: {bands[hi.j]}" rows={[
				{ tok: '--c' + hi.j, name: 'of the time', value: `${pct(r.time)[hi.j].toFixed(1)}%` },
				{ name: 'of the money', value: `${pct(r.money)[hi.j].toFixed(1)}%`, strong: true },
				{ name: 'earned', value: `$${num(r.money[hi.j] * 1000)}m` },
			]} />
		{/if}
	</div>
	<details class="ch-data">
		<summary>Data table</summary>
		<table>
			<thead><tr><th>{label}</th>{#each bands as b}<th class="n">{b}: time</th><th class="n">money</th>{/each}<th class="n">Total</th></tr></thead>
			<tbody>
				{#each rows as r}
					<tr><td>{r.name}</td>{#each bands as _, j}<td class="n">{pct(r.time)[j].toFixed(1)}%</td><td class="n">${num(r.money[j] * 1000)}m</td>{/each}<td class="n">${r.total.toFixed(2)}bn</td></tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	.tm-year { font-weight: 700; fill: var(--ink); }
</style>
