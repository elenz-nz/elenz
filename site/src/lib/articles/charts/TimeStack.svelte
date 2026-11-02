<script lang="ts">
	import { tapAway, leaveFor } from './tap.js';
	// Generation stacked by fuel over a few days, demand as a line on top, and an optional second panel (price)
	// on its own axis underneath. One crosshair drives both panels and the readout.
	import Tip from './Tip.svelte';
	import Legend from './Legend.svelte';
	import { linear, ticks, nice, num, compact } from './util';

	type Layer = { name: string; tok: string; values: number[] };
	type Panel = { name: string; tok: string; values: number[]; unit: string; fmt: (v: number) => string; height?: number };
	let {
		t0, step, layers, line, panel = undefined, height = 300, unit = 'MW', labelEvery = 1, ymax = undefined, pmax = undefined,
	}: { t0: number; step: number; layers: Layer[]; line: { name: string; tok: string; values: number[] }; panel?: Panel; height?: number; unit?: string;
		labelEvery?: number;   // label every nth day (a month of days needs 3 or more)
		ymax?: number; pmax?: number;   // fixed tops for the stack and the panel, to put two charts on the same scales
	} = $props();
	const half = $derived(Math.round(43200000 / step));   // steps in half a day, to centre each day's label

	let w = $state(680);
	const m = { l: 46, r: 10, t: 24, b: 8 };
	const gap = 34;
	const n = $derived(line.values.length);
	const pw = $derived(Math.max(100, w - m.l - m.r));
	const ph = $derived(height - m.t - m.b);
	const qh = $derived(panel ? (panel.height ?? 110) : 0);
	const H = $derived(m.t + ph + (panel ? gap + qh : 0) + 26);

	const x = $derived(linear(0, n - 1, 0, pw));
	const cum = $derived.by(() => {
		const out: number[][] = [];
		let acc = new Array(n).fill(0);
		for (const L of layers) { acc = acc.map((a, i) => a + Math.max(0, L.values[i])); out.push(acc); }
		return out;
	});
	const top = $derived(Math.max(...line.values, ...cum[cum.length - 1]));
	const ext = $derived(nice(0, ymax ?? top, 5));
	const y = $derived(linear(ext[0], ext[1], ph, 0));
	const yt = $derived(ticks(ext[0], ext[1], 5));
	const area = (lo: number[] | null, hi: number[]) => {
		let d = hi.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
		for (let i = n - 1; i >= 0; i--) d += `L${x(i).toFixed(1)},${y(lo ? lo[i] : 0).toFixed(1)}`;
		return d + 'Z';
	};
	const edge = (v: number[]) => v.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(q).toFixed(1)}`).join('');

	const pext = $derived(panel ? nice(Math.min(0, ...panel.values), pmax ?? Math.max(...panel.values), 3) : [0, 1]);
	const py = $derived(linear(pext[0], pext[1], qh, 0));
	const pt = $derived(panel ? ticks(pext[0], pext[1], 3) : []);

	// day boundaries in NZ time, for the x axis
	const DAY = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric' });
	const TIME = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
	const HOUR = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' });
	const hourAt = (i: number) => Number(HOUR.format(new Date(t0 + i * step)));
	const days = $derived(Array.from({ length: n }, (_, i) => i).filter((i) => hourAt(i) === 0 && (i === 0 || hourAt(i - 1) !== 0)));

	let hi = $state(-1);
	let tipY = $state(0);
	function move(e: PointerEvent) {
		hi = Math.max(0, Math.min(n - 1, Math.round(((e.offsetX - m.l) / pw) * (n - 1))));
		tipY = Math.min(e.offsetY - 20, m.t + ph - 60);
	}
	const rows = $derived(hi < 0 ? [] : [
		{ tok: line.tok, name: line.name, value: `${num(line.values[hi])} ${unit}`, strong: true },
		...(panel ? [{ tok: panel.tok, name: panel.name, value: panel.fmt(panel.values[hi]) }] : []),
		...[...layers].reverse().filter((L) => L.values[hi] > 0.5).map((L) => ({ tok: L.tok, name: L.name, value: `${num(L.values[hi])} ${unit}` })),
	]);
</script>

<div class="ch" bind:clientWidth={w} use:tapAway={() => (hi = -1)}>
	<Legend items={[...layers.map((L) => ({ name: L.name, tok: L.tok })), { name: line.name, tok: line.tok, kind: 'line' as const }]} />
	<div class="ch-plot">
		<svg width={w} height={H} role="img" aria-label="{line.name} and generation by fuel{panel ? `, with ${panel.name.toLowerCase()}` : ''}">
			<g transform="translate({m.l},{m.t})">
				<text class="ch-unit" x={-m.l} y={-12}>{unit}</text>
				{#each yt as t}
					<line class="ch-grid" x1="0" x2={pw} y1={y(t)} y2={y(t)} />
					<text class="ch-tick" x="-8" y={y(t)} dy="0.32em" text-anchor="end">{compact(t)}</text>
				{/each}
				{#each layers as L, j}
					<path d={area(j ? cum[j - 1] : null, cum[j])} class="ch-area" style="fill: var({L.tok})" />
				{/each}
				{#each layers as L, j}<path d={edge(cum[j])} class="ch-seam" />{/each}
				<path d={edge(line.values)} class="ch-line" style="stroke: var({line.tok})" />
				{#each days as i}<line class="ch-day" x1={x(i)} x2={x(i)} y1="0" y2={ph} />{/each}

				{#if panel}
					<g transform="translate(0,{ph + gap})">
						<text class="ch-unit" x={-m.l} y={-10}>{panel.unit}</text>
						{#each pt as t}
							<line class="ch-grid" class:zero={t === 0} x1="0" x2={pw} y1={py(t)} y2={py(t)} />
							<text class="ch-tick" x="-8" y={py(t)} dy="0.32em" text-anchor="end">{compact(t)}</text>
						{/each}
						<path d={panel.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${py(v).toFixed(1)}`).join('')} class="ch-line" style="stroke: var({panel.tok})" />
						{#each days as i}<line class="ch-day" x1={x(i)} x2={x(i)} y1="0" y2={qh} />{/each}
					</g>
				{/if}
				{#each days.filter((_, j) => j % labelEvery === 0) as i}
					<text class="ch-tick" x={x(Math.min(n - 1, i + half))} y={ph + (panel ? gap + qh : 0) + 18} text-anchor="middle">{DAY.format(new Date(t0 + i * step))}</text>
				{/each}
				{#if hi >= 0}
					<line class="ch-cross" x1={x(hi)} x2={x(hi)} y1="0" y2={ph + (panel ? gap + qh : 0)} />
					<circle class="ch-dot" cx={x(hi)} cy={y(line.values[hi])} r="4" style="fill: var({line.tok})" />
					{#if panel}<circle class="ch-dot" cx={x(hi)} cy={ph + gap + py(panel.values[hi])} r="4" style="fill: var({panel.tok})" />{/if}
				{/if}
				<rect class="ch-hit" x="0" y="0" width={pw} height={ph + (panel ? gap + qh : 0)} onpointermove={move} onpointerdown={move} onpointerleave={leaveFor(() => (hi = -1))} role="presentation" />
			</g>
		</svg>
		{#if hi >= 0}<Tip x={m.l + x(hi)} y={Math.max(0, tipY)} {w} title={TIME.format(new Date(t0 + hi * step)).replace(/\b(AM|PM)\b/g, (s) => s.toLowerCase())} {rows} />{/if}
	</div>
</div>
