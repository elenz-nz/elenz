<script lang="ts">
	// The Generation tab under the charts: a share of generation over the range against the same dates a year
	// earlier; dispatchable headroom; the mix by fuel with capacity factors; and the last 30 days by time of day. Each card says what it
	// covers (#lib/site/Context.svelte), since the page's controls are far above. The tracker passes its view through
	// its `view` hook (src/lib/tracker/tracker.js): the window, the model it was drawn from and its history store.
	// Data shaping in ./data.js.
	import { onMount, untrack } from 'svelte';
	import TimeChart from '#lib/prices/TimeChart.svelte';
	import { timeTicks, niceTicks } from '#lib/prices/data.js';
	import Context from '#lib/site/Context.svelte';
	import { rangeName, span, RES as RES_ } from '#lib/site/context.js';
	import { nzOffset } from '#lib/tracker/series.js';
	import PopButton from '#lib/site/PopButton.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import GenHeat from './GenHeat.svelte';
	import MixTable from './MixTable.svelte';
	import { METRICS, METRIC, YEAR, LEVELS, shares, atInterval, windowOf, alignYearAgo, shareOver, heatRows, heatMonthRows, capacityAt, mixRows, headroom, headroomAt, loadOffered } from './data.js';
	import { heatWindow, heatSource } from '#lib/site/heat.js';
	import { FUELS } from '#lib/tracker/fuels.js';

	type View = { region: string; range: string; label: string; days: number | null; int: string; kind: string; end: number | null; from: number; to: number; M: any; live: any; history: any };
	let { v }: { v: View | null } = $props();

	const RES: Record<string, string> = RES_;
	const FIRST = Date.UTC(1997, 6, 31, 12);   // history starts 1 Aug 1997 (NZ)
	const DAY = 864e5;
	let metric = $state('ren'), heatMetric = $state('ren'), compare = $state(true);
	let near = $state(false);   // on screen or nearly: only then load the extra history (a year earlier, 30 days)
	let box = $state<HTMLElement>();
	let hover = $state(-1);
	let popped = $state<string | null>(null);   // a card enlarged over the page: 'share', 'room', 'mix' or 'heat'
	const pop = (id: string) => (popped = popped === id ? null : id);
	let prev = $state.raw<any>(null), prevFor = '';   // the window a year earlier
	let heatSrc = $state.raw<any>(null), heatFor = '';
	let heatScaled = $state(false);   // the heat map's colours scaled to the rows shown rather than fixed

	onMount(() => {
		try {
			const s = JSON.parse(localStorage.getItem('elenz-gen-lower') || 'null');
			if (s && METRIC[s.metric]) metric = s.metric;
			if (s && METRIC[s.heat]) heatMetric = s.heat;
			if (s?.heatScaled) heatScaled = true;
			if (s && s.compare === false) compare = false;
			if (s && s.hydro === false) withHydro = false;
			if (s && (s.room === 'levels' || s.room === 'fuel')) roomView = s.room;
			if (s && ['I', 'O', 'C'].includes(s.basis)) roomBasis = s.basis;
		} catch { /* storage blocked: defaults */ }
		const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near = true; io.disconnect(); } }, { rootMargin: '600px 0px' });
		if (box) io.observe(box);
		return () => io.disconnect();
	});
	function save() {
		try { localStorage.setItem('elenz-gen-lower', JSON.stringify({ metric, heat: heatMetric, heatScaled, compare, hydro: withHydro, room: roomView, basis: roomBasis })); } catch { /* storage blocked */ }
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
	// TimeChart drops labels that would overlap on a narrow screen
	const xTicks = $derived(curI && curI.n ? timeTicks(curI.t[0], curI.t[curI.n - 1]) : []);
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

	// ---------- dispatchable headroom ----------
	// hydro, thermal and battery capacity not generating, at three levels: installed, offered, and offered under
	// $1,000/MWh (ingest/offered.py). Levels: the three totals as nested areas; By fuel: one level stacked by fuel.
	// Where a chart point spans more data than it shows, the levels are the lowest within each point.
	const FUEL: Record<string, any> = Object.fromEntries(FUELS.map((f) => [f.k, f]));
	const ROOM_NAME: Record<string, string> = { hydro: 'Hydro', gas: 'Gas', coal: 'Coal/gas', diesel: 'Diesel', batt: 'Battery' };
	const LEVEL_NAME: Record<string, string> = { I: 'Installed', O: 'Offered', C: 'Offered under $1,000' };
	const LEVEL_SHORT: Record<string, string> = { I: 'installed', O: 'offered', C: 'under $1,000' };
	const LEVEL_TOK: Record<string, string> = { I: '--muted', O: '--accent', C: '--accent' };
	let withHydro = $state(true);
	let roomView = $state<'levels' | 'fuel'>('levels');
	let roomBasis = $state<'I' | 'O' | 'C'>('O');
	// thermal and batteries at the bottom of the fuel stack, read from zero; hydro on top
	const ROOM_ORDER = ['gas', 'coal', 'diesel', 'batt', 'hydro'];
	const roomFuels = $derived(ROOM_ORDER.filter((k) => withHydro || k !== 'hydro'));
	// offered data comes in two shapes (days.json for daily views, month files otherwise) and arrives after the view
	// changes, so it's tagged with the shape it was loaded for and used only while the view still wants that shape
	// (switching 1Y/All to a shorter range otherwise handed daily data to the half-hourly code, which threw)
	let offLoaded = $state.raw<{ daily: boolean; data: any } | null>(null), offFor = '';
	$effect(() => {
		const w = v, ok = near;
		untrack(() => {
			if (!w || !ok) return;
			const daily = w.kind === 'day', key = `${daily}|${daily ? '' : `${w.from}|${w.to}`}`;
			if (key === offFor) return;
			offFor = key;
			loadOffered(daily, w.from, w.to).then((d) => { if (offFor === key) offLoaded = { daily, data: d }; });
		});
	});
	const offData = $derived(v && offLoaded && offLoaded.daily === (v.kind === 'day') ? offLoaded.data : null);
	type Level = { by: Record<string, Float64Array>; tot: Float64Array; low: Float64Array; any?: boolean };
	const roomRaw = $derived<Record<string, Level> | null>(cur && v ? headroom(cur, v.region, v.kind === 'day', roomFuels, offData) : null);
	const roomAt = $derived<Record<string, Level> | null>(roomRaw && cur && curI ? Object.fromEntries(LEVELS.map((L: string) => [L, headroomAt(roomRaw[L], cur, curI)])) : null);
	const coarse = $derived(!!v && !!cur && !!curI && (v.kind === 'day' || curI.n < cur.n));
	const hasOffers = $derived(!!roomRaw && !!roomRaw.O.any);
	const levelsShown = $derived(LEVELS.filter((L: string) => L === 'I' || hasOffers));
	// each level's series on the chart: its lowest within each point where points are coarse (and the data has it)
	const lowOK = (L: string) => !!roomAt && roomAt[L].low.some((x: number) => x === x);
	const levelVals = $derived<Record<string, Float64Array>>(roomAt ? Object.fromEntries(LEVELS.map((L: string) => [L, coarse && lowOK(L) ? roomAt[L].low : roomAt[L].tot])) : {});
	const avgOnly = $derived(coarse && levelsShown.some((L: string) => !lowOK(L)));   // daily history without each day's lowest
	// offers come the day after: shade the newest points that have none yet
	// the EA's offer records start on 1 Jan 2013 (and hold nothing reliable before Dec 2012), so on a range reaching
	// further back the offered levels start part way along while installed capacity covers it all: say so plainly
	const OFF_FIRST = Date.UTC(2012, 11, 31, 11);   // midnight starting 1 Jan 2013, NZ time
	const offLate = $derived(!!v && v.from < OFF_FIRST - 864e5 && (roomView === 'levels' || roomBasis !== 'I'));
	const offGap = $derived.by((): [number, number][] => {
		const o = levelVals.O;
		if (!o || !hasOffers) return [];
		let last = -1;
		for (let i = 0; i < o.length; i++) if (o[i] === o[i]) last = i;
		return last >= 0 && last < o.length - 1 ? [[last + 1, o.length]] : [];
	});
	const fuelRoom = $derived(roomAt ? roomAt[roomBasis] : null);
	const fuelHasLow = $derived(!!fuelRoom && coarse && fuelRoom.low.some((x: number) => x === x));
	const roomLayers = $derived.by(() => {
		if (!roomAt || !curI) return [];
		const out: any[] = [];
		if (roomView === 'levels') {
			for (const L of levelsShown) {
				out.push({ kind: 'area', values: levelVals[L], tok: LEVEL_TOK[L], opacity: L === 'I' ? 0.16 : L === 'O' ? 0.2 : 0.42 });
				out.push({ kind: 'line', values: levelVals[L], tok: LEVEL_TOK[L], width: L === 'C' ? 1.7 : 1.2, dash: L === 'O' ? '5 3' : '' });
			}
			return out;
		}
		if (!fuelRoom) return out;
		let lo = new Float64Array(curI.n);
		for (const k of roomFuels) {
			const hi = lo.map((x: number, i: number) => x + (fuelRoom.by[k][i] === fuelRoom.by[k][i] ? fuelRoom.by[k][i] : 0));
			out.push({ kind: 'band', lo, hi, tok: FUEL[k].tok, opacity: 0.8 });
			lo = hi;
		}
		if (fuelHasLow) out.push({ kind: 'line', values: fuelRoom.low, tok: '--ink', width: 1.3 });
		return out;
	});
	const roomScale = $derived.by(() => {
		let hi = 0;
		const scan = (a: ArrayLike<number> | undefined) => { if (a) for (let i = 0; i < a.length; i++) if (a[i] > hi) hi = a[i]; };
		if (roomView === 'levels') for (const L of levelsShown) scan(levelVals[L]);
		else if (fuelRoom) scan(fuelRoom.tot);
		const ticks = niceTicks(0, Math.max(hi * 1.05, 100), 4);
		return { f: (x: number) => x, lo: 0, hi: Math.max(hi, ticks[ticks.length - 1] ?? hi), ticks };
	});
	// each level's tightest point over the data (each day's lowest where the data has it, else the daily average)
	const tightOf = (L: string) => {
		if (!roomRaw || !cur || !curI) return null;
		const R = roomRaw[L], useLow = v?.kind !== 'day' || R.low.some((x: number) => x === x);
		const a = useLow ? R.low : R.tot;
		let j = -1;
		for (let i = 0; i < a.length; i++) if (a[i] === a[i] && (j < 0 || a[i] < a[j])) j = i;
		if (j < 0) return null;
		const t = cur.t[j];
		let ci = 0;
		while (ci + 1 < curI.n && curI.t[ci + 1] <= t) ci++;
		return { v: a[j], t, ci, avgDay: !useLow };
	};
	const tight = $derived<Record<string, any>>(roomRaw ? Object.fromEntries(LEVELS.map((L: string) => [L, tightOf(L)])) : {});
	const markL = $derived(roomView === 'levels' ? (tight.C ? 'C' : 'I') : roomBasis);
	const mw = (x: number) => (x === x ? `${Math.round(x).toLocaleString('en-NZ')} MW` : '–');
	const dayName = (t: number) => { const d = new Date(t + nzOffset(t)); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
	const whenOf = (x: any) => (!x ? '' : v?.kind === 'day' ? dayName(x.t) : (() => { const d = new Date(x.t + nzOffset(x.t)), h = d.getUTCHours(); return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} ${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; })());
	const lowWord = $derived(v ? ({ '30m': 'half-hour', '1d': 'day', '1w': 'week', '1mo': 'month', '1yr': 'year' } as Record<string, string>)[v.int] ?? 'point' : 'point');
	let roomHover = $state(-1);

	// ---------- the heat map: follows the range (#lib/site/heat.js): by day up to a year, by month on All ----------
	$effect(() => {
		const w = v, ok = near;
		untrack(() => {
			if (!w || !ok || !w.live) return;
			const hw = heatWindow(w.from, w.to);
			const key = `${hw.kind}|${hw.from}|${hw.to}|${w.live.t[w.live.n - 1]}`;
			if (key === heatFor) return;
			heatFor = key;
			heatSource(hw, w.history, w.live).then((src) => { if (heatFor === key) heatSrc = src; });
		});
	});
	const hm = $derived(METRIC[heatMetric]);
	const rows = $derived(heatSrc && v ? (heatSrc.kind === 'months'
		? heatMonthRows(heatSrc.tod, v.region, heatMetric, heatSrc.from, heatSrc.to, v.int === '1yr')
		: heatRows(heatSrc.seg, v.region, heatMetric)) : []);
	// a fuel's colours on a fixed scale up to its installed capacity now, so years compare; or scaled to the rows shown
	// (the top band starts at 80% of capacity for half-hours, 60% for monthly averages, which smooth out the peaks)
	const heatCap = $derived(heatMetric === 'ren' || !v ? 0 : capacityAt(heatMetric, v.region, v.live.t[v.live.n - 1]));
	const heatHi = $derived(heatScaled || !heatCap ? null : heatCap * (heatSrc?.kind === 'months' ? 0.6 : 0.8));
	const heatByMonth = $derived(heatSrc?.kind === 'months');

	// ---------- mix table ----------
	const mix = $derived(cur && v ? mixRows(cur, v.region, v.from, v.to, canCompare ? prev : null, v.kind !== 'day') : null);

	// ---------- what each card covers ----------
	const rangeChip = $derived(v ? rangeName(v.label, v.end, v.days) : '');
	const dates = $derived(v ? span(v.from, v.to) : '');
	// short ranges show at least the last week; otherwise the heat map covers what the charts above do
	const heatChip = $derived(v && heatSrc ? (heatSrc.kind === 'days' && heatSrc.from < v.from - 6e4 ? (v.end == null ? 'Last 7 days' : rangeName('7 days', v.end, 7)) : rangeChip) : rangeChip);
</script>

<svelte:window onkeydown={(e) => { if (popped && e.key === 'Escape') popped = null; }} />

<div class="lower" bind:this={box}>
	<section class="card" class:popped={popped === 'share'} aria-label="{m.title} share of generation over the range">
		<div class="card-head">
			<div>
				<div class="ttl-row"><h2>{metric === 'ren' ? 'Renewable share' : `${m.title} share`}</h2><InfoTip>{#if canCompare}Dashed: the same dates a year earlier (365 days before){v && v.int === '5m' ? ', half-hourly' : ''}.{:else if v && v.days == null}No comparison on the full history.{:else}The year before is outside the history.{/if}
			{#if m.note}{m.title}: {m.note}.{/if}
			<a href="/methods/groupings#renewable">How shares are worked out</a></InfoTip></div>
				<Context range={rangeChip} items={[dates, v ? `${RES[v.int]}, % of generation` : '']} />
			</div>
			<div class="tools">
				<div class="seg" role="group" aria-label="Series for the share chart">
					{#each METRICS as x}<button type="button" aria-pressed={metric === x.k} onclick={() => { metric = x.k; save(); }}>{x.label}</button>{/each}
				</div>
				{#if canCompare}
					<button type="button" class="tog" aria-pressed={compare} onclick={() => { compare = !compare; save(); }}><i aria-hidden="true"></i>{prevYear ? `Same dates in ${prevYear}` : 'The year before'}</button>
				{/if}
				<PopButton open={popped === 'share'} name="share chart" onclick={() => pop('share')} />
			</div>
		</div>
		<p class="readout" aria-live="polite">
			{#if hover >= 0 && curI && hover < curI.n}
				<span>{pointName(curI.t[hover])}</span> <b>{pc(curPct[hover])}</b>
				{#if ghost && ghost[hover] === ghost[hover]}<span class="was">· {prevYear ?? 'a year before'}: <b>{pc(ghost[hover])}</b></span>{/if}
			{:else}
				<span>Average</span> <b>{pc(avgNow)}</b>
				{#if compare && avgPrev === avgPrev}<span class="was">· {prevPhrase} <b>{pc(avgPrev)}</b></span>{/if}
			{/if}
		</p>
		{#if curI && curI.n > 1}
			<TimeChart t={curI.t} t0={curI.t[0]} t1={curI.t[curI.n - 1]} height={popped === 'share' ? Math.round(Math.min(560, Math.max(260, (typeof window === 'undefined' ? 800 : window.innerHeight) * 0.55))) : 210} y={yScale} fmt={(x: number) => `${x}%`} {layers} {xTicks} showX bind:hover
				label="{m.title} share of generation{ghost ? ', with the same dates a year earlier as a dashed line' : ''}" onleave={() => (hover = -1)} />
		{:else}
			<p class="empty">Loading…</p>
		{/if}
	</section>

	<section class="card" class:popped={popped === 'room'} aria-label="Spare dispatchable capacity over the range">
		<div class="card-head">
			<div>
				<div class="ttl-row"><h2>Spare dispatchable capacity</h2><InfoTip>Dispatchable capacity not generating{withHydro ? '' : ', hydro left out'}: installed, offered, and offered under $1,000/MWh.
			{v && v.region !== 'NZ' ? 'One island only: the HVDC link isn’t counted. ' : ''}{avgOnly ? 'Daily averages where history doesn’t yet keep each day’s lowest. ' : ''}{!hasOffers ? 'No offers loaded for these dates yet. ' : ''}<a href="/methods/capacity#headroom">How it's worked out</a></InfoTip></div>
				<Context range={rangeChip} items={[dates, v ? `${RES[v.int]}, MW not generating` : '', coarse && roomView === 'levels' && !avgOnly ? `lowest in each ${lowWord}` : '']} />
			</div>
			<div class="tools">
				<div class="seg" role="group" aria-label="Headroom view">
					<button type="button" aria-pressed={roomView === 'levels'} onclick={() => { roomView = 'levels'; save(); }}>Levels</button>
					<button type="button" aria-pressed={roomView === 'fuel'} onclick={() => { roomView = 'fuel'; save(); }}>By fuel</button>
				</div>
				<!-- always in the layout (hidden in the Levels view), so switching views doesn't move the other controls -->
				<div class="seg" class:held={roomView !== 'fuel'} role="group" aria-label="Level to show by fuel" aria-hidden={roomView !== 'fuel'} inert={roomView !== 'fuel'}>
					{#each levelsShown as L}<button type="button" aria-pressed={roomBasis === L} onclick={() => { roomBasis = L as any; save(); }}>{L === 'C' ? 'Under $1,000' : LEVEL_NAME[L]}</button>{/each}
				</div>
				<button type="button" class="tog box" aria-pressed={withHydro} onclick={() => { withHydro = !withHydro; save(); }}><i aria-hidden="true"></i>Include hydro</button>
				<PopButton open={popped === 'room'} name="headroom chart" onclick={() => pop('room')} />
			</div>
		</div>
		{#if offLate}
			<p class="off-note" role="note"><b>Offers start in January 2013.</b> The EA’s records of what generators offered begin on 1 January 2013, so {roomView === 'levels' ? 'the Offered and Under $1,000 lines start' : 'this level starts'} there, partway through this range. Installed capacity covers the whole range.</p>
		{/if}
		<p class="readout" aria-live="polite">
			{#if roomHover >= 0 && roomAt && curI && roomHover < curI.n}
				<span>{pointName(curI.t[roomHover])}</span>
				{#if roomView === 'levels'}
					{#each levelsShown as L}<span class="was"> · {LEVEL_SHORT[L]}</span> <b>{mw(levelVals[L][roomHover])}</b>{/each}
				{:else if fuelRoom}
					<b>{mw(fuelRoom.tot[roomHover])}</b>{#if fuelHasLow && fuelRoom.low[roomHover] === fuelRoom.low[roomHover]}<span class="was"> · lowest <b>{mw(fuelRoom.low[roomHover])}</b></span>{/if}
					<span class="parts">{#each roomFuels as k}{#if fuelRoom.by[k][roomHover] >= 0.5}<span><i style="background: var({FUEL[k].tok})"></i>{ROOM_NAME[k]} {Math.round(fuelRoom.by[k][roomHover]).toLocaleString('en-NZ')}</span>{/if}{/each}</span>
				{/if}
			{:else if roomView === 'levels' && tight.I}
				<span>Lowest</span>
				{#each [...levelsShown].reverse() as L, i}{#if tight[L]}<span class="was">{i ? ' · ' : ' '}{LEVEL_SHORT[L]}</span> <b>{mw(tight[L].v)}</b>{#if L === markL}{' '}<span class="was">({tight[L].avgDay ? 'daily average, ' : ''}{whenOf(tight[L])})</span>{/if}{/if}{/each}
			{:else if roomView === 'fuel' && tight[roomBasis]}
				<span>{tight[roomBasis].avgDay ? 'Lowest day (average)' : 'Lowest'}</span> <b>{mw(tight[roomBasis].v)}</b> <span class="was">{whenOf(tight[roomBasis])}</span>
			{/if}
		</p>
		{#if curI && curI.n > 1 && roomAt}
			<TimeChart t={curI.t} t0={curI.t[0]} t1={curI.t[curI.n - 1]} height={popped === 'room' ? Math.round(Math.min(560, Math.max(260, (typeof window === 'undefined' ? 800 : window.innerHeight) * 0.55))) : 210} y={roomScale} fmt={(x: number) => x.toLocaleString('en-NZ')} layers={roomLayers} {xTicks} showX bind:hover={roomHover}
				shade={roomView === 'levels' || roomBasis !== 'I' ? offGap : []}
				note={tight[markL] && !tight[markL].avgDay ? { i: tight[markL].ci, v: roomView === 'levels' ? levelVals[markL][tight[markL].ci] : (fuelHasLow ? fuelRoom!.low[tight[markL].ci] : fuelRoom!.tot[tight[markL].ci]), text: `Lowest ${mw(tight[markL].v)}`, tok: LEVEL_TOK[markL] } : null}
				label={roomView === 'levels' ? `Dispatchable capacity not generating: ${levelsShown.map((L: string) => LEVEL_NAME[L].toLowerCase()).join(', ')}` : `${LEVEL_NAME[roomBasis]} capacity not generating, by fuel`} onleave={() => (roomHover = -1)} />
			<div class="legend">
				{#if roomView === 'levels'}
					{#each levelsShown as L}<span><i class="lv lv-{L}"></i>{LEVEL_NAME[L]}</span>{/each}
				{:else}
					{#each roomFuels as k}<span><i style="background: var({FUEL[k].tok})"></i>{ROOM_NAME[k]}</span>{/each}
					{#if fuelHasLow}<span><i class="ln"></i>Lowest in each {lowWord}</span>{/if}
				{/if}
				{#if offGap.length && (roomView === 'levels' || roomBasis !== 'I')}<span><i class="gap"></i>Offers not published yet</span>{/if}
			</div>
		{:else}
			<p class="empty">Loading…</p>
		{/if}
	</section>

	<div class="row2">
		<section class="card" class:popped={popped === 'mix'} aria-label="Generation by fuel over the range">
			<div class="card-head">
				<div>
					<div class="ttl-row"><h2>Mix by fuel</h2><InfoTip>Energy over the range{v && v.kind === 'day' ? ' (peaks need half-hourly data, so long ranges leave them out)' : ''}{canCompare && prev ? '; “vs” is the change in energy on the same dates a year earlier' : ''}.
				<a href="/methods/capacity#use">How capacity factors are worked out</a></InfoTip></div>
					<Context range={rangeChip} items={[dates, canCompare && prev ? `against ${prevYear ? 'the ' : ''}${prevPhrase}` : '']} />
				</div>
				<PopButton open={popped === 'mix'} name="mix table" onclick={() => pop('mix')} />
			</div>
			{#if mix}
				<MixTable {mix} prevLabel={canCompare && prev ? (prevYear ?? 'year before') : null} />
			{:else}
				<p class="empty">Loading…</p>
			{/if}
		</section>

		<section class="card" class:popped={popped === 'heat'} style={popped === 'heat' ? '--rh: 15px' : ''} aria-label="{hm.title} by time of day over the range">
			<div class="card-head">
				<div>
					<div class="ttl-row"><h2>{heatMetric === 'ren' ? 'Renewable share' : hm.title} by time of day</h2><InfoTip>{heatByMonth ? 'One row per ' + (v?.int === '1yr' ? 'year' : 'month') + ': the average of each half-hour.' : rows.length > 40 ? 'One row per day; scroll for earlier days.' : 'One row per day.'}
				{heatMetric === 'ren' ? 'Brown marks the half-hours that leaned on thermal plant, usually still evenings at the peak.' : heatScaled ? 'Colours fitted to what’s shown: darker means more.' : `Colours on a fixed scale set by today’s installed ${hm.title.toLowerCase()} capacity${heatCap ? ` (${Math.round(heatCap).toLocaleString('en-NZ')} MW)` : ''}, so earlier years look paler where less was built.`}</InfoTip></div>
					<Context range={heatChip} items={[heatSrc ? span(heatSrc.kind === 'days' && heatSrc.seg?.n ? heatSrc.seg.t[0] : heatSrc.from, heatSrc.to) : '',
						(heatByMonth ? (v?.int === '1yr' ? 'yearly' : 'monthly') + ' average of each half-hour' : 'each half-hour') + (heatMetric === 'ren' ? ', % of generation' : ', MW')]} />
				</div>
				<div class="tools">
					<div class="seg" role="group" aria-label="Series for the heat map">
						{#each METRICS as x}<button type="button" aria-pressed={heatMetric === x.k} onclick={() => { heatMetric = x.k; save(); }}>{x.label}</button>{/each}
					</div>
					{#if heatMetric !== 'ren'}
						<button type="button" class="tog box scale" aria-pressed={heatScaled} title={heatScaled ? 'Colours fitted to the rows shown' : 'Colours on a fixed scale (installed capacity now), so different years compare'} onclick={() => { heatScaled = !heatScaled; save(); }}><i aria-hidden="true"></i>Scale to this view</button>
					{/if}
					<PopButton open={popped === 'heat'} name="time of day chart" onclick={() => pop('heat')} />
				</div>
			</div>
			{#if rows.length}
				<GenHeat {rows} metric={heatMetric} tok={hm.tok} hi={heatHi} label="{hm.title} for each half-hour, {heatByMonth ? 'by month' : 'by day'}" />
			{:else}
				<p class="empty">Loading…</p>
			{/if}
		</section>
	</div>
</div>
{#if popped}<button type="button" class="pop-backdrop" aria-label="Close the enlarged card" onclick={() => (popped = null)}></button>{/if}

<style>
	.lower { display: grid; gap: 14px; margin-top: 14px; }
	.card { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 14px; display: grid; gap: 10px; min-width: 0; }
	/* the enlarge button sits in the card's top right corner (PopButton, .pop-btn in tracker.css), clear of the tools */
	.card:not(.popped) { position: relative; }
	.card-head { padding-right: 28px; }
	.card > :global(*) { min-width: 0; }
	.card h2 { font-size: 0.86rem; font-weight: 600; margin: 0; }
	.card-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; align-items: flex-start; }
	.tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.lower :global(.seg) { flex-wrap: wrap; }
	.held { visibility: hidden; }
	.tog { display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 0.78rem; color: var(--ink-2); background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 2px 10px; min-height: 30px; cursor: pointer; }
	.tog i { width: 20px; height: 0; border-top: 2px dashed var(--muted); display: inline-block; }
	.tog[aria-pressed='false'] { opacity: 0.6; }
	.tog[aria-pressed='false'] i { border-top-style: dotted; }
	.tog.box i { width: 10px; height: 10px; border: 1.5px solid var(--f-hydro); border-radius: 2px; background: var(--f-hydro); }
	.tog.scale i { border-color: var(--accent); background: var(--accent); }
	.tog.box[aria-pressed='false'] i { background: none; }
	.readout { margin: 0; font-size: 0.8rem; color: var(--ink-2); min-height: 1.3em; }
	.readout b { font-family: var(--font-data); font-weight: 500; color: var(--ink); }
	.note { margin: 0; color: var(--muted); font-size: 0.76rem; }
	.legend, .parts { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.76rem; color: var(--ink-2); }
	.parts { display: inline-flex; margin-left: 10px; font-family: var(--font-data); }
	.legend span, .parts span { display: inline-flex; align-items: center; gap: 5px; }
	.legend i, .parts i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; opacity: 0.85; }
	.legend i.ln { height: 0; border-top: 1.5px solid var(--ink); border-radius: 0; width: 16px; }
	.legend i.lv { width: 16px; border-radius: 1px; opacity: 1; }
	.legend i.lv-I { background: color-mix(in srgb, var(--muted) 16%, transparent); border-top: 1.5px solid var(--muted); }
	.legend i.lv-O { background: color-mix(in srgb, var(--accent) 20%, transparent); border-top: 1.5px dashed var(--accent); }
	.legend i.lv-C { background: color-mix(in srgb, var(--accent) 42%, transparent); border-top: 2px solid var(--accent); }
	.legend i.gap { background: var(--warn-bg); }
	.off-note { margin: 0; padding: 7px 10px; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 4px 4px 0; font-size: 0.8rem; color: var(--ink-2); }
	.off-note b { color: var(--ink); }
	.empty { color: var(--muted); font-size: 0.86rem; padding: 18px 10px; margin: 0; }
	.row2 { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px 18px; align-items: start; }
	@media (max-width: 900px) { .row2 { grid-template-columns: minmax(0, 1fr); } }
	/* big screens: the four cards in two even columns, split down the centre (share and headroom, then the mix and the
	   heat map; .row2 steps aside so its cards join the same grid) */
	@media (min-width: 1600px) {
		.lower { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px 18px; align-items: start; }
		.row2 { display: contents; }
	}
</style>
