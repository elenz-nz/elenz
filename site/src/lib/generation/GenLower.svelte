<script lang="ts">
	// The Generation tab under the charts: a share of generation over the range against the same dates a year
	// earlier; the mix by fuel with capacity factors; and the last 30 days by time of day. Each card says what it
	// covers (#lib/site/Context.svelte), since the page's controls are far above. The tracker passes its view through
	// its `view` hook (src/lib/tracker/tracker.js): the window, the model it was drawn from and its history store.
	// Data shaping in ./data.js.
	import { onMount, untrack } from 'svelte';
	import TimeChart from '#lib/prices/TimeChart.svelte';
	import { timeTicks, niceTicks } from '#lib/prices/data.js';
	import Context from '#lib/site/Context.svelte';
	import { rangeName, span, RES as RES_, REGION_NAME as REGION_ } from '#lib/site/context.js';
	import { nzOffset } from '#lib/tracker/series.js';
	import GenHeat from './GenHeat.svelte';
	import MixTable from './MixTable.svelte';
	import { METRICS, METRIC, YEAR, shares, atInterval, windowOf, alignYearAgo, shareOver, heatRows, mixRows } from './data.js';

	type View = { region: string; range: string; label: string; days: number | null; int: string; kind: string; end: number | null; from: number; to: number; M: any; live: any; history: any };
	let { v }: { v: View | null } = $props();

	const RES: Record<string, string> = RES_, REGION_NAME: Record<string, string> = REGION_;
	const FIRST = Date.UTC(1997, 6, 31, 12);   // history starts 1 Aug 1997 (NZ)
	const DAY = 864e5;
	let metric = $state('ren'), heatMetric = $state('ren'), compare = $state(true);
	let near = $state(false);   // on screen or nearly: only then load the extra history (a year earlier, 30 days)
	let box = $state<HTMLElement>();
	let hover = $state(-1);
	let prev = $state.raw<any>(null), prevFor = '';   // the window a year earlier
	let heatSeg = $state.raw<any>(null), heatFor = '';
	let heatTo = $state(0);

	onMount(() => {
		try {
			const s = JSON.parse(localStorage.getItem('elenz-gen-lower') || 'null');
			if (s && METRIC[s.metric]) metric = s.metric;
			if (s && METRIC[s.heat]) heatMetric = s.heat;
			if (s && s.compare === false) compare = false;
		} catch { /* storage blocked: defaults */ }
		const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near = true; io.disconnect(); } }, { rootMargin: '600px 0px' });
		if (box) io.observe(box);
		return () => io.disconnect();
	});
	function save() {
		try { localStorage.setItem('elenz-gen-lower', JSON.stringify({ metric, heat: heatMetric, compare })); } catch { /* storage blocked */ }
	}

	// ---------- the window and a year before it ----------
	const cur = $derived(v ? windowOf(v.M, v.from, v.to) : null);
	const curI = $derived(cur && v ? atInterval(cur, v.int) : null);
	const canCompare = $derived(!!v && v.days != null && v.from - YEAR >= FIRST);

	$effect(() => {
		const w = v, ok = near && canCompare;
		untrack(() => {
			if (!w || !ok) { prev = null; prevFor = ''; return; }
			const kind = w.kind === 'day' ? 'day' : 'hh', a = w.from - YEAR, b = w.to - YEAR;
			const key = `${kind}|${a}|${b}|${w.live?.t?.[w.live.n - 1]}`;
			if (key === prevFor) return;
			prevFor = key;
			(async () => {
				try {
					if (!w.history.has(kind, a, b)) await w.history.load(kind, a, b);
					if (prevFor !== key) return;
					prev = windowOf(w.history.merged(kind, w.live), a, b);
				} catch { if (prevFor === key) prev = null; }
			})();
		});
	});

	// ---------- the share chart ----------
	const m = $derived(METRIC[metric]);
	const curPct = $derived(curI && v ? shares(curI, v.region, metric).pct : new Float64Array(0));
	const prevI = $derived(prev && v ? atInterval(prev, v.int === '5m' ? '30m' : v.int) : null);
	const ghost = $derived(curI && prevI && v && compare ? alignYearAgo(curI.t, prevI, shares(prevI, v.region, metric).pct) : null);
	const yScale = $derived.by(() => {
		let lo = Infinity, hi = -Infinity;
		const scan = (a: ArrayLike<number> | null) => { if (a) for (let i = 0; i < a.length; i++) { const x = a[i]; if (x === x) { lo = Math.min(lo, x); hi = Math.max(hi, x); } } };
		scan(curPct); scan(ghost);
		if (lo === Infinity) { lo = 0; hi = 100; }
		if (metric === 'ren') { lo = Math.max(0, Math.floor((lo - 2) / 10) * 10); hi = 100; }
		else { lo = 0; hi = Math.max(5, hi * 1.08); }
		const ticks = niceTicks(lo, hi, 4);
		return { f: (x: number) => x, lo, hi: Math.max(hi, ticks[ticks.length - 1] ?? hi), ticks };
	});
	const layers = $derived([
		{ kind: 'area', values: curPct, tok: m.tok, opacity: 0.12 },
		...(ghost ? [{ kind: 'line', values: ghost, tok: '--muted', width: 1.2, dash: '4 3' }] : []),
		{ kind: 'line', values: curPct, tok: m.tok, width: 1.7 },
	]);
	// thinned so labels stay ~80 px apart on a narrow screen
	let chartW = $state(800);
	const xTicks = $derived.by(() => {
		const all = curI && curI.n ? timeTicks(curI.t[0], curI.t[curI.n - 1]) : [];
		const keep = all.filter((x: any) => !x.minor), every = Math.max(1, Math.ceil((keep.length * 80) / Math.max(chartW - 60, 100)));
		return every === 1 ? all : keep.filter((_: any, i: number) => i % every === 0);
	});
	const avgNow = $derived(cur && v ? shareOver(cur, v.region, metric) : NaN);
	const avgPrev = $derived(prev && v ? shareOver(prev, v.region, metric) : NaN);
	const prevYear = $derived.by(() => {
		if (!v) return null;
		const y = (t: number) => new Date(t + nzOffset(t)).getUTCFullYear();
		const a = y(v.from - YEAR), b = y(v.to - 1 - YEAR);
		return a === b ? String(a) : null;   // a window across New Year: "the year before"
	});
	const prevPhrase = $derived(prevYear ? `same dates in ${prevYear}` : 'the year before');

	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	function pointName(t: number) {
		const d = new Date(t + nzOffset(t)), p = { y: d.getUTCFullYear(), mo: d.getUTCMonth(), dd: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
		const day = `${WD[p.wd]} ${p.dd} ${MON[p.mo]}`;
		switch (v?.int) {
			case '1d': return `${day} ${p.y}`;
			case '1w': return `Week of ${p.dd} ${MON[p.mo]} ${p.y}`;
			case '1mo': return `${MON[p.mo]} ${p.y}`;
			case '1yr': return `${p.y}`;
			default: return `${day}, ${p.h % 12 || 12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'am' : 'pm'}`;
		}
	}
	const pc = (x: number) => (x === x ? `${x.toFixed(1)}%` : '–');
	const pts = (a: number, b: number) => { if (!(a === a && b === b)) return ''; const d = a - b; return `${Math.abs(d) < 0.05 ? '±0.0' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1)} pts`; };

	// ---------- the heat map: always the 30 days to the end of the range ----------
	$effect(() => {
		const w = v, ok = near;
		untrack(() => {
			if (!w || !ok || !w.live) return;
			const to = w.end ?? w.live.t[w.live.n - 1] + 1, from = to - 30 * DAY;
			const key = `${from}|${to}|${w.live.t[w.live.n - 1]}`;
			if (key === heatFor) return;
			heatFor = key;
			(async () => {
				let seg;
				try {
					if (!w.history.has('hh', from, to)) await w.history.load('hh', from, to);
					seg = windowOf(w.history.merged('hh', w.live), from, to);
				} catch {
					seg = windowOf(w.live, from, to);   // history not ready: the live week only
				}
				if (heatFor !== key) return;
				heatSeg = seg; heatTo = to;
			})();
		});
	});
	const hm = $derived(METRIC[heatMetric]);
	const rows = $derived(heatSeg && v ? heatRows(heatSeg, v.region, heatMetric) : []);

	// ---------- mix table ----------
	const mix = $derived(cur && v ? mixRows(cur, v.region, v.from, v.to, canCompare ? prev : null, v.kind !== 'day') : null);

	// ---------- what each card covers ----------
	const rangeChip = $derived(v ? rangeName(v.label, v.end, v.days) : '');
	const dates = $derived(v ? span(v.from, v.to) : '');
	const where = $derived(v ? REGION_NAME[v.region] : '');
	const heatChip = $derived(v ? (v.end == null ? 'Last 30 days' : rangeName('30 days', v.end, 30)) : '');
</script>

<div class="lower" bind:this={box}>
	<section class="card" aria-label="{m.title} share of generation over the range">
		<div class="card-head">
			<div>
				<h2>{metric === 'ren' ? 'Renewable share' : `${m.title} share`}</h2>
				<Context range={rangeChip} items={[dates, where, v ? `${RES[v.int]}, % of generation` : '', m.note]} />
			</div>
			<div class="tools">
				<div class="seg" role="group" aria-label="Series for the share chart">
					{#each METRICS as x}<button type="button" aria-pressed={metric === x.k} onclick={() => { metric = x.k; save(); }}>{x.label}</button>{/each}
				</div>
				{#if canCompare}
					<button type="button" class="tog" aria-pressed={compare} onclick={() => { compare = !compare; save(); }}><i aria-hidden="true"></i>{prevYear ? `Same dates in ${prevYear}` : 'The year before'}</button>
				{/if}
			</div>
		</div>
		<p class="readout" aria-live="polite">
			{#if hover >= 0 && curI && hover < curI.n}
				<span>{pointName(curI.t[hover])}</span> <b>{pc(curPct[hover])}</b>
				{#if ghost && ghost[hover] === ghost[hover]}<span class="was">· {prevYear ?? 'a year before'}: <b>{pc(ghost[hover])}</b></span>{/if}
			{:else}
				<span>Average</span> <b>{pc(avgNow)}</b>
				{#if compare && avgPrev === avgPrev}<span class="was">· {prevPhrase} <b>{pc(avgPrev)}</b></span> <span class="delta">{pts(avgNow, avgPrev)}</span>{/if}
			{/if}
		</p>
		{#if curI && curI.n > 1}
			<div bind:clientWidth={chartW}>
			<TimeChart t={curI.t} t0={curI.t[0]} t1={curI.t[curI.n - 1]} height={210} y={yScale} fmt={(x: number) => `${x}%`} {layers} {xTicks} showX bind:hover
				label="{m.title} share of generation{ghost ? ', with the same dates a year earlier as a dashed line' : ''}" onleave={() => (hover = -1)} />
			</div>
		{:else}
			<p class="empty">Loading…</p>
		{/if}
		<p class="note">
			{#if canCompare}Dashed: the same dates a year earlier (365 days before){v && v.int === '5m' ? ', half-hourly' : ''}.{:else if v && v.days == null}No comparison on the full history.{:else}The year before is outside the history.{/if}
			Shares count generation only: battery charging and the HVDC link aren't generation.
		</p>
	</section>

	<div class="row2">
		<section class="card" aria-label="Generation by fuel over the range">
			<div>
				<h2>Mix by fuel</h2>
				<Context range={rangeChip} items={[dates, where, canCompare && prev ? `against ${prevYear ? 'the ' : ''}${prevPhrase}` : '']} />
			</div>
			{#if mix}
				<MixTable {mix} prevLabel={canCompare && prev ? (prevYear ?? 'year before') : null} />
			{:else}
				<p class="empty">Loading…</p>
			{/if}
			<p class="note">
				Energy over the range{v && v.kind === 'day' ? ' (peaks need half-hourly data, so long ranges leave them out)' : ''}{canCompare && prev ? '; “vs” is the change in energy on the same dates a year earlier' : ''}.
				Capacity factor is average output over installed capacity on each day, from <a href="/methods/capacity">each plant's capacity history</a> (embedded solar: the distributed generation registry). Batteries count discharge only.
			</p>
		</section>

		<section class="card" aria-label="{hm.title} by time of day over 30 days">
			<div class="card-head">
				<div>
					<h2>{heatMetric === 'ren' ? 'Renewable share' : hm.title} by time of day</h2>
					<Context range={heatChip} items={[heatTo ? span(heatTo - 30 * DAY, heatTo) : '', where, heatMetric === 'ren' ? 'each half-hour, % of generation' : 'each half-hour, MW']} />
				</div>
				<div class="seg" role="group" aria-label="Series for the heat map">
					{#each METRICS as x}<button type="button" aria-pressed={heatMetric === x.k} onclick={() => { heatMetric = x.k; save(); }}>{x.label}</button>{/each}
				</div>
			</div>
			{#if rows.length}
				<GenHeat {rows} metric={heatMetric} tok={hm.tok} label="{hm.title} for each half-hour of the last 30 days" />
			{:else}
				<p class="empty">Loading…</p>
			{/if}
			<p class="note">Always the 30 days to the end of the selected range. {heatMetric === 'ren' ? 'Brown marks the half-hours that leaned on thermal plant, usually still evenings at the peak.' : 'Darker means more.'}</p>
		</section>
	</div>
</div>

<style>
	.lower { display: grid; gap: 14px; margin-top: 14px; }
	.card { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 14px; display: grid; gap: 10px; min-width: 0; }
	.card > :global(*) { min-width: 0; }
	.card h2 { font-size: 0.86rem; font-weight: 600; margin: 0; }
	.card-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; align-items: flex-start; }
	.tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.lower :global(.seg) { flex-wrap: wrap; }
	.tog { display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 0.78rem; color: var(--ink-2); background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 2px 10px; min-height: 30px; cursor: pointer; }
	.tog i { width: 20px; height: 0; border-top: 2px dashed var(--muted); display: inline-block; }
	.tog[aria-pressed='false'] { opacity: 0.6; }
	.tog[aria-pressed='false'] i { border-top-style: dotted; }
	.readout { margin: 0; font-size: 0.8rem; color: var(--ink-2); min-height: 1.3em; }
	.readout b { font-family: var(--font-data); font-weight: 500; color: var(--ink); }
	.readout .delta { font-family: var(--font-data); color: var(--muted); }
	.note { margin: 0; color: var(--muted); font-size: 0.76rem; }
	.note a { color: inherit; }
	.empty { color: var(--muted); font-size: 0.86rem; padding: 18px 10px; margin: 0; }
	.row2 { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px 18px; align-items: start; }
	@media (max-width: 900px) { .row2 { grid-template-columns: minmax(0, 1fr); } }
</style>
