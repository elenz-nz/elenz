<script lang="ts">
	// The Prices tab of the tracker: node prices, the island spread and HVDC on one time axis (the live week and 30
	// days), or each period's price range, spread and spikes (12 months and all history); then the price each fuel
	// captured over the range and a heat map of the last 30 days by time of day. Data: #lib/prices/data.js.
	import { onMount, untrack } from 'svelte';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import { fromLayout, historyStore, firstAtOrAfter, slice, nzOffset } from '#lib/tracker/series.js';
	import Masthead from '#lib/site/Masthead.svelte';
	import TrackerTabs from '#lib/site/TrackerTabs.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import TimeChart from '#lib/prices/TimeChart.svelte';
	import FuelBars from '#lib/prices/FuelBars.svelte';
	import HeatMap from '#lib/prices/HeatMap.svelte';
	import {
		NODES, NODE, priceOf, separated, addRevenue, captured, RANGES, INT_LABEL, atInterval, completeDaily, periods,
		heat, priceScale, niceTicks, CAP, money, signedMoney, clock, dayLabel, dateLabel, monthLabel, shortDate, timeTicks, nzParts
	} from '#lib/prices/data.js';

	const DATA_URL = '/data/tracker.json';
	const LIVE_MINUTES = 15;
	const SCALES = [
		{ k: 'spike', label: 'Spike-proof', title: 'Linear to about $100, compressed above, so a spike doesn’t flatten the rest' },
		{ k: 'capped', label: 'Capped', title: `Clipped at $${CAP}; anything higher is marked at the top` },
		{ k: 'linear', label: 'Linear', title: 'Plain linear scale' }
	];

	let meta = $state<any>(null);
	let live = $state<any>(null); // the live week as a segment, with revenue by fuel
	let error = $state('');
	let now = $state(Date.now());
	let region = $state('NZ');
	let range = $state('1d');
	let int = $state('5m');
	let scale = $state('spike');
	let off = $state<string[]>([]); // nodes hidden from the price chart
	let bandKey = $state('HAY');
	let heatKey = $state('HAY');
	let hover = $state(-1);
	let view = $state<any>(null); // what the charts draw (see build below)
	let busy = $state(false);
	let viewError = $state('');
	let heatRows = $state<any[]>([]);
	let heatSeg: any = null;
	let endT = $state<number | null>(null); // end of the window (ms), or null for the latest data
	let heatTo = 0;
	const FIRST = Date.UTC(2020, 8, 10) - 12 * 36e5; // history starts 10 Sep 2020 (NZ)

	const store = historyStore();
	const R = $derived(RANGES[range as keyof typeof RANGES]);
	const age = $derived(meta ? (now - meta.end) / 60000 : 0);
	const isLive = $derived(meta !== null && age < LIVE_MINUTES);

	// ---------- settings: region and range shared with the Generation tab; the rest kept for this page ----------
	function restore() {
		try {
			const v = JSON.parse(localStorage.getItem('elenz-view') || 'null');
			if (v && ['NZ', 'NI', 'SI'].includes(v.region)) region = v.region;
			if (v && v.range in RANGES) range = v.range;
			const p = JSON.parse(localStorage.getItem('elenz-prices') || 'null');
			if (p) {
				if (SCALES.some((s) => s.k === p.scale)) scale = p.scale;
				if (Array.isArray(p.off)) off = p.off.filter((k: string) => k in NODE);
				if (p.band in NODE) bandKey = p.band;
				if (p.heat in NODE) heatKey = p.heat;
				if (p.ints && p.ints[range] && (RANGES as any)[range].ints.includes(p.ints[range])) int = p.ints[range];
				else int = (RANGES as any)[range].def || (RANGES as any)[range].ints[0];
			} else int = (RANGES as any)[range].def || (RANGES as any)[range].ints[0];
		} catch { /* storage blocked: defaults */ }
	}
	let ints: Record<string, string> = {};
	function save() {
		try {
			const v = JSON.parse(localStorage.getItem('elenz-view') || 'null') || {};
			localStorage.setItem('elenz-view', JSON.stringify({ ...v, region, range }));
			ints[range] = int;
			localStorage.setItem('elenz-prices', JSON.stringify({ scale, off, band: bandKey, heat: heatKey, ints }));
		} catch { /* storage blocked */ }
	}
	function pickRange(k: string) {
		range = k;
		const r = (RANGES as any)[k];
		int = ints[k] && r.ints.includes(ints[k]) ? ints[k] : r.def || r.ints[0];
		save();
	}

	// ---------- building the view ----------
	// the points of a segment in (from, to]
	const windowOf = (S: any, from: number, to: number) => slice(S, firstAtOrAfter(S.t, from + 1), firstAtOrAfter(S.t, to + 1));
	const latestT = $derived(live ? live.t[live.n - 1] : 0);
	// a window ending before the live week reaches back past it: the live ranges then come from half-hourly history
	const pastLive = $derived(R.src === 'live' && endT !== null && live && endT - (R.days ?? 0) * 864e5 < live.t[0]);
	const intChoices = $derived(pastLive ? ['30m'] : R.ints);
	const effInt = $derived(intChoices.includes(int) ? int : intChoices[0]);

	let token = 0;
	async function build() {
		if (!live) return;
		const my = ++token;
		const r = (RANGES as any)[range];
		const latest = live.t[live.n - 1];
		const to = r.days == null || endT === null ? latest : Math.min(endT, latest);
		const from = r.days == null ? 0 : to - r.days * 864e5;
		const iv = effInt;
		viewError = '';
		try {
			if (r.src === 'live' && from >= live.t[0] - 1) {
				setView(timeView(atInterval(windowOf(live, from, to), iv)));
			} else if (r.src !== 'day') {
				if (!store.has('hh', from, to)) { busy = true; await store.load('hh', from, to); }
				if (my !== token) return;
				const m = store.merged('hh', live);
				setView(timeView(atInterval(addRevenue(windowOf(m, from, to), undefined, true), iv), m.histEnd));
			} else {
				if (!store.has('day', 0, 0)) { busy = true; await store.load('day', 0, 0); }
				if (my !== token) return;
				const m0 = store.merged('day', live), m = completeDaily(m0, m0.histEnd, live);
				setView(longView(r.days == null ? m : windowOf(m, from, to), m.histEnd));
			}
			if (to !== heatTo) loadHeat(to);
		} catch (e: any) {
			if (my === token) viewError = e.missing ? 'History is still being prepared. Please check back later.' : `History couldn't be loaded. ${e.message}`;
		} finally {
			if (my === token) busy = false;
		}
	}
	function setView(v: any) {
		const keep = view && view.mode === v.mode && hover >= 0 && hover < view.n - 1;
		view = v;
		if (!keep || hover >= v.n) hover = v.n - 1;
	}

	/** Live week and 30 days: node prices, spread and HVDC at each point. */
	function timeView(S: any, histEnd: number | null = null) {
		const n = S.n, hay = S.NI.price, ben = S.SI.price;
		const spread = Float64Array.from(hay, (v: number, i: number) => v - ben[i]);
		const sep: boolean[] = Array.from({ length: n }, (_, i) => separated(hay[i], ben[i]));
		const shade: [number, number][] = [];
		for (let i = 0, a = -1; i <= n; i++) {
			if (i < n && sep[i]) { if (a < 0) a = i; } else if (a >= 0) { shade.push([a, i]); a = -1; }
		}
		const series = NODES.map((nd) => ({ ...nd, values: priceOf(S, nd.k) })).filter((x) => x.values);
		return { mode: 'time', S, n, t: S.t, t0: S.t[0], t1: S.t[n - 1], spread, sep, shade, series, hvdc: S.hvdcN, histEnd };
	}

	/** 12 months and all history: per period (day, week or month). */
	function longView(S: any, histEnd: number) {
		const P = periods(S, effInt);
		return { mode: 'long', S, P, n: P.n, t: P.t, t0: P.t[0], t1: P.t[P.n - 1], histEnd };
	}

	// ---------- derived chart inputs ----------
	const regionNodes = $derived(NODES.filter((nd) => region === 'NZ' || nd.isl === region));
	const shown = $derived(view?.mode === 'time' ? view.series.filter((s: any) => regionNodes.some((r) => r.k === s.k) && !off.includes(s.k)) : []);
	const xTicks = $derived(view ? timeTicks(view.t0, view.t1) : []);

	const priceY = $derived.by(() => {
		if (!view) return null;
		let lo = Infinity, hi = -Infinity;
		const scan = (a: ArrayLike<number>) => { for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } } };
		if (view.mode === 'time') for (const s of shown) scan(s.values);
		else { const I = view.P[bandKey === 'BEN' ? 'SI' : 'NI']; scan(I.pmin); scan(I.pmax); scan(view.P.NI.price); scan(view.P.SI.price); }
		if (lo === Infinity) { lo = 0; hi = 100; }
		return priceScale(scale, lo, hi);
	});
	const priceLayers = $derived.by(() => {
		if (!view) return [];
		if (view.mode === 'time') return shown.map((s: any) => ({ kind: 'line', values: s.values, tok: s.tok, width: NODE[s.k].ref ? 2 : 1.4 }));
		const own = bandKey === 'BEN' ? 'SI' : 'NI', other = own === 'NI' ? 'SI' : 'NI', I = view.P[own];
		const tok = own === 'NI' ? '--p-ni' : '--p-si';
		return [
			{ kind: 'band', lo: I.pmin, hi: I.pmax, tok, opacity: 0.14 },
			{ kind: 'band', lo: I.p10, hi: I.p90, tok, opacity: 0.34 },
			{ kind: 'line', values: view.P[other].price, tok: other === 'NI' ? '--p-ni' : '--p-si', width: 1, dash: '3 3' },
			{ kind: 'line', values: I.price, tok, width: 1.8 }
		];
	});
	// prices above the cap, marked at the top (the highest few, spaced apart)
	const capMarks = $derived.by(() => {
		if (!view || !priceY || !(priceY as any).capped) return [];
		const pts: { i: number; v: number; k: string }[] = [];
		if (view.mode === 'time') for (const s of shown) s.values.forEach((v: number, i: number) => { if (v > CAP) pts.push({ i, v, k: s.k }); });
		else { const I = view.P[bandKey === 'BEN' ? 'SI' : 'NI']; I.pmax.forEach((v: number, i: number) => { if (v > CAP) pts.push({ i, v, k: bandKey }); }); }
		pts.sort((a, b) => b.v - a.v);
		const out: { i: number; label: string }[] = [];
		const gap = Math.max(1, Math.round(view.n / 8));
		for (const p of pts) {
			if (out.length >= 3) break;
			if (out.some((o) => Math.abs(o.i - p.i) < gap)) continue;
			out.push({ i: p.i, label: `${NODE[p.k].name} ${money(p.v)}` });
		}
		return out;
	});
	const spreadSeries = $derived(view ? (view.mode === 'time' ? view.spread : view.P.spread) : new Float64Array(0));
	const spreadY = $derived.by(() => {
		let lo = 0, hi = 0;
		for (const v of spreadSeries) if (v === v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
		const sc = priceScale(scale === 'linear' ? 'linear' : 'spike', lo, Math.max(hi, 20));
		return { ...sc, ticks: sc.ticks.filter((x: number) => x >= lo - 1e-9 || x === 0) };
	});
	const hvdcY = $derived.by(() => {
		const a = view ? (view.mode === 'time' ? view.hvdc : view.P.hvdc) : [];
		let lo = 0, hi = 0;
		for (const v of a) if (v === v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
		const ticks = niceTicks(lo, hi, 4);
		return { f: (v: number) => v, lo: Math.min(lo, ticks[0] ?? 0), hi: Math.max(hi, ticks[ticks.length - 1] ?? 1), ticks };
	});
	const spikeY = $derived.by(() => {
		if (!view || view.mode !== 'long') return null;
		const I = view.P[bandKey === 'BEN' ? 'SI' : 'NI'];
		let hi = 1;
		for (const v of I.n500) hi = Math.max(hi, v);
		const ticks = niceTicks(0, hi, 3);
		return { f: (v: number) => v, lo: 0, hi: Math.max(hi, ticks[ticks.length - 1]), ticks };
	});

	// ---------- summary: at the cursor, and over the range ----------
	const at = $derived(view && hover >= 0 && hover < view.n ? hover : view ? view.n - 1 : -1);
	function whenLabel(i: number) {
		if (!view || i < 0) return '';
		const t = view.t[i];
		if (view.mode === 'time') return effInt === '1d' ? dayLabel(t) : `${clock(t)} ${dayLabel(t)}${endT !== null ? ' ' + nzParts(t).y : ''}`;
		return effInt === '1mo' ? monthLabel(t) : effInt === '1w' ? `Week of ${dateLabel(t)}` : dateLabel(t);
	}
	const mw = (v: number) => `${Math.round(Math.abs(v)).toLocaleString('en-NZ')} MW ${v >= 0 ? 'north' : 'south'}`;
	const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h < 10 ? h.toFixed(1) : Math.round(h)} h`);

	const cursorRows = $derived.by(() => {
		if (!view || at < 0) return [];
		if (view.mode === 'time') {
			const rows: any[] = view.series.filter((s: any) => regionNodes.some((r) => r.k === s.k)).map((s: any) => ({ tok: s.tok, label: NODE[s.k].name, value: money(s.values[at]), dim: off.includes(s.k) }));
			rows.push({ tok: '--o1', label: 'Spread HAY − BEN', value: signedMoney(view.spread[at]) });
			rows.push({ tok: '--f-hvdc', label: 'HVDC', value: mw(view.hvdc[at]) });
			return rows;
		}
		const P = view.P, own = bandKey === 'BEN' ? 'SI' : 'NI', I = P[own];
		return [
			{ tok: '--p-ni', label: 'Haywards, average', value: money(P.NI.price[at]) },
			{ tok: '--p-si', label: 'Benmore, average', value: money(P.SI.price[at]) },
			{ label: `${NODE[bandKey].name}, middle 80%`, value: `${money(I.p10[at])} – ${money(I.p90[at])}` },
			{ label: `${NODE[bandKey].name}, low`, value: money(I.pmin[at]) },
			{ label: `${NODE[bandKey].name}, high`, value: money(I.pmax[at]) },
			{ label: 'Half-hours over $500', value: String(I.n500[at]) },
			{ tok: '--o1', label: 'Spread HAY − BEN', value: signedMoney(P.spread[at]) },
			{ tok: '--f-hvdc', label: 'HVDC, average', value: mw(P.hvdc[at]) }
		];
	});
	const sepNow = $derived(view && view.mode === 'time' && at >= 0 ? view.sep[at] : null);

	// over the whole range: averages, highs and spikes (Haywards and Benmore), and price captured by fuel
	const rangeStats = $derived.by(() => {
		if (!view) return null;
		const S = view.S, wavg = (a: ArrayLike<number>) => { let s = 0, w = 0; for (let i = 0; i < S.n; i++) if (a[i] === a[i]) { s += a[i] * S.h[i]; w += S.h[i]; } return w ? s / w : NaN; };
		const isls = region === 'NZ' ? ['NI', 'SI'] : [region];
		const rows: any[] = [];
		for (const isl of isls) {
			const k = isl === 'NI' ? 'HAY' : 'BEN', p = S[isl].price;
			let hi = -Infinity, hiT = 0, over = 0;
			if (view.mode === 'time') {
				for (let i = 0; i < S.n; i++) { if (p[i] > hi) { hi = p[i]; hiT = S.t[i]; } if (p[i] > 500) over += S.h[i]; }
			} else {
				const I = S[isl];
				for (let i = 0; i < S.n; i++) { if (I.pmax[i] > hi) { hi = I.pmax[i]; hiT = S.t[i]; } over += I.n500[i] / 2; }
			}
			rows.push({ node: NODE[k].name, avg: wavg(p), hi, hiT, over });
		}
		const cap = captured(S, region);
		let sepH = 0, h = 0;
		if (view.mode === 'time') for (let i = 0; i < S.n; i++) { h += S.h[i]; if (view.sep[i]) sepH += S.h[i]; }
		return { rows, cap, sepShare: h ? sepH / h : null, spread: wavg(S.NI.price) - wavg(S.SI.price) };
	});

	// ---------- the heat map: the last 30 days, half-hourly ----------
	/** The heat map: the 30 days to the end of the window. */
	async function loadHeat(to: number) {
		if (!live) return;
		heatTo = to;
		const from = to - 30 * 864e5;
		try {
			if (!store.has('hh', from, to)) await store.load('hh', from, to);
			if (heatTo !== to) return;
			heatSeg = windowOf(store.merged('hh', live), from, to);
		} catch {
			heatSeg = windowOf(live, from, to);   // history not ready: the live week only
		}
		heatRows = heat(heatSeg, heatKey);
	}
	$effect(() => { const k = heatKey; untrack(() => { if (heatSeg) heatRows = heat(heatSeg, k); }); });

	// rebuild when the range, interval or data change
	// (build reads and writes the view, so it runs untracked: only these three trigger it)
	$effect(() => { void range; void int; void live; void endT; untrack(() => build()); });

	// ---------- moving through time: the date box and the arrows ----------
	const canMove = $derived(R.days != null);
	const atLatest = $derived(endT === null || endT >= latestT);
	function step(dir: number) {
		if (!R.days || !live) return;
		const base = endT ?? latestT;
		const next = Math.max(FIRST + R.days * 864e5, base + dir * R.days * 864e5);
		endT = next >= latestT ? null : next;
	}
	const isoDay = (t: number) => { const d = new Date(t + nzOffset(t)); return d.toISOString().slice(0, 10); };
	const dateValue = $derived(live ? isoDay((endT ?? latestT) - 1) : '');
	function pickDate(v: string) {
		if (!v) { endT = null; return; }
		const [y, m, d] = v.split('-').map(Number);
		let t = Date.UTC(y, m - 1, d + 1);         // the end of that NZ day: midnight after it
		t -= nzOffset(t - 12 * 36e5);
		endT = t >= latestT ? null : Math.max(t, FIRST + (R.days ?? 0) * 864e5);
	}

	function keys(e: KeyboardEvent) {
		if (!view) return;
		const step = e.shiftKey ? 10 : 1;
		if (e.key === 'ArrowLeft') { hover = Math.max(0, at - step); e.preventDefault(); }
		else if (e.key === 'ArrowRight') { hover = Math.min(view.n - 1, at + step); e.preventDefault(); }
		else if (e.key === 'Home') { hover = 0; e.preventDefault(); }
		else if (e.key === 'End' || e.key === 'Escape') { hover = view.n - 1; e.preventDefault(); }
	}
	const toggleNode = (k: string) => { off = off.includes(k) ? off.filter((x) => x !== k) : [...off, k]; save(); };

	onMount(() => {
		restore();
		ints[range] = int;
		let due = 0, stamp = 0;
		async function load() {
			const r = await fetch(DATA_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(`The data file returned ${r.status}.`);
			const D = await r.json();
			due = nextDue(D.meta.end);
			if (D.meta.end === stamp) return;
			stamp = D.meta.end;
			meta = D.meta;
			error = '';
			live = addRevenue(fromLayout(D));
		}
		load().catch((e) => (error = `The data couldn't be loaded. ${e.message} Try reloading the page.`));
		const check = () => {
			now = Date.now();
			if (document.visibilityState === 'visible' && Date.now() >= due) load().catch(() => {});
		};
		const poll = setInterval(check, CHECK_EVERY);
		document.addEventListener('visibilitychange', check);
		return () => { clearInterval(poll); document.removeEventListener('visibilitychange', check); };
	});

	const status = $derived(error || (busy ? 'Loading history…' : viewError) || (meta ? '' : 'Loading the latest data…'));
	const fmtTick = (v: number) => (Math.abs(v) >= 1000 ? `$${v / 1000}k` : `$${v}`);
	const fmtSpread = (v: number) => (v === 0 ? '$0' : (v > 0 ? '+' : '−') + fmtTick(Math.abs(v)));
	const fmtMW = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('en-NZ')}k` : String(v));
</script>

<svelte:head>
	<title>Prices · Tracker · ELENZ</title>
	<meta name="description" content="New Zealand wholesale electricity prices at six grid nodes, every 5 minutes: the gap between the islands, HVDC transfer, the price each fuel earned, and price ranges and spikes back to 2020." />
</svelte:head>

<div class="wrap">
	<Masthead heading />
	<TrackerTabs />

	<nav class="toolbar" aria-label="View controls">
		<div class="ctl">
			<label for="p-region" class="vh">Region</label>
			<select class="pick" id="p-region" bind:value={region} onchange={save}>
				<option value="NZ">New Zealand</option>
				<option value="NI">North Island</option>
				<option value="SI">South Island</option>
			</select>
		</div>
		<div class="ctl">
			<span id="p-lb-range">Range</span>
			<div class="seg" role="group" aria-labelledby="p-lb-range">
				{#each Object.entries({ '1d': '1D', '3d': '3D', '7d': '7D', '30d': '30D', '1y': '1Y', all: 'ALL' }) as [k, l]}
					<button type="button" aria-pressed={range === k} title={(RANGES as any)[k].label} onclick={() => pickRange(k)}>{l}</button>
				{/each}
			</div>
		</div>
		<div class="ctl">
			<span id="p-lb-int">Interval</span>
			<div class="seg" role="group" aria-labelledby="p-lb-int">
				{#each intChoices as k}
					<button type="button" aria-pressed={effInt === k} onclick={() => { int = k; save(); }}>{(INT_LABEL as any)[k]}</button>
				{/each}
			</div>
		</div>
		{#if canMove}
			<div class="ctl">
				<label for="p-date">{R.label} ending</label>
				<div class="datebox">
					<input type="date" id="p-date" value={dateValue} min="2020-09-10" max={live ? isoDay(latestT) : undefined}
						title="Shows the selected range ending on this date" onchange={(e) => pickDate((e.currentTarget as HTMLInputElement).value)} />
					{#if !atLatest}<button type="button" onclick={() => (endT = null)}>Latest</button>{/if}
				</div>
			</div>
		{/if}
		<div class="status">
			<span class="tstatus" role="status">{status}</span>
			{#if meta}
				{#if R.src !== 'live' || endT !== null}
					<span class="pill hist" title="Final prices from the EA, then the live week">History</span>
				{:else if isLive}
					<span class="pill live" title="Dispatch prices from the EMI real-time feed, every 5 minutes">Live · {clock(meta.end)}</span>
				{:else}
					<span class="pill stale" title="The newest data is more than {LIVE_MINUTES} minutes old">Delayed · {clock(meta.end)} {dayLabel(meta.end)}</span>
				{/if}
			{/if}
		</div>
	</nav>

	<noscript><p class="notice">The charts need JavaScript turned on.</p></noscript>

	<div class="p-layout">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (the chart panel takes arrow keys to move the cursor) -->
		<section class="charts" tabindex="0" aria-busy={busy} onkeydown={keys}
			aria-label="Price charts on one time axis. Hover, or use the left and right arrow keys, to read a single point; Escape returns to the latest.">
			{#if view && priceY}
				<div class="chart">
					<div class="ch-head">
						{#if view.mode === 'time'}
							<h2>Prices</h2><span class="unit">$/MWh at each node</span>
						{:else}
							<h2>Price range</h2><span class="unit">$/MWh, each {effInt === '1d' ? 'day' : effInt === '1w' ? 'week' : 'month'}'s half-hours</span>
						{/if}
						<div class="legends">
							<div class="seg" role="group" aria-label="Price scale">
								{#each SCALES as s}
									<button type="button" aria-pressed={scale === s.k} title={s.title} onclick={() => { scale = s.k; save(); }}>{s.label}</button>
								{/each}
							</div>
						</div>
					</div>
					<div class="keys">
						{#if view.mode === 'time'}
							{#each view.series.filter((s: any) => regionNodes.some((r) => r.k === s.k)) as s (s.k)}
								<button type="button" class="nk" aria-pressed={!off.includes(s.k)} onclick={() => toggleNode(s.k)} title="{NODE[s.k].node}, {NODE[s.k].place}. Select to show or hide">
									<i style="--c: var({s.tok})"></i>{NODE[s.k].name}
								</button>
							{/each}
							{#if NODES.some((nd) => regionNodes.includes(nd) && !view.series.some((s: any) => s.k === nd.k))}
								<span class="kn">Other nodes from the live feed only</span>
							{/if}
							<span class="lg"><i class="area" style="--c: var(--warn-bg); opacity: 1"></i>Islands priced apart</span>
						{:else}
							<div class="seg" role="group" aria-label="Node for the price range">
								{#each ['HAY', 'BEN'] as k}
									<button type="button" aria-pressed={bandKey === k} onclick={() => { bandKey = k; save(); }}>{NODE[k].name}</button>
								{/each}
							</div>
							<span class="lg"><i class="area" style="--c: var({bandKey === 'BEN' ? '--p-si' : '--p-ni'}); opacity: 0.25"></i>Low to high</span>
							<span class="lg"><i class="area" style="--c: var({bandKey === 'BEN' ? '--p-si' : '--p-ni'}); opacity: 0.55"></i>Middle 80%</span>
							<span class="lg"><i style="--c: var({bandKey === 'BEN' ? '--p-si' : '--p-ni'})"></i>Average</span>
							<span class="lg"><i class="dash" style="--c: var({bandKey === 'BEN' ? '--p-ni' : '--p-si'})"></i>{bandKey === 'BEN' ? 'Haywards' : 'Benmore'} average</span>
						{/if}
					</div>
					<div class="plot-wrap">
						<TimeChart t={view.t} t0={view.t0} t1={view.t1} height={250} y={priceY} fmt={fmtTick} layers={priceLayers}
							shade={view.mode === 'time' ? view.shade : []} marks={capMarks} bind:hover label="Prices at the grid nodes over the range" zero />
						{#if canMove}
							<button type="button" class="arrow prev" aria-label="Previous {R.label}" title="Previous {R.label}" onclick={() => step(-1)}>
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
							<button type="button" class="arrow next" aria-label="Next {R.label}" title="Next {R.label}" disabled={atLatest} onclick={() => step(1)}>
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
						{/if}
					</div>
				</div>

				<div class="chart">
					<div class="ch-head">
						<h2>Island spread</h2><span class="unit">Haywards − Benmore, $/MWh{view.mode === 'long' ? ', average' : ''}</span>
						<div class="legends">
							<span class="lg"><i class="area" style="--c: var(--o1)"></i>North Island dearer</span>
							<span class="lg"><i class="area" style="--c: var(--o2)"></i>South Island dearer</span>
						</div>
					</div>
					<TimeChart t={view.t} t0={view.t0} t1={view.t1} height={120} y={spreadY} fmt={fmtSpread} zero
						layers={view.mode === 'time' ? [{ kind: 'posneg', values: view.spread, pos: '--o1', neg: '--o2' }] : [{ kind: 'bars', values: view.P.spread, tok: '--o1', neg: '--o2', opacity: 0.85 }]}
						shade={view.mode === 'time' ? view.shade : []} bind:hover label="The price gap between Haywards and Benmore" />
				</div>

				{#if view.mode === 'time'}
					<div class="chart">
						<div class="ch-head">
							<h2>HVDC transfer</h2><span class="unit">MW, northward positive</span>
							<div class="legends"><span class="lg"><i class="area" style="--c: var(--f-hvdc)"></i>Benmore ⇄ Haywards</span></div>
						</div>
						<TimeChart t={view.t} t0={view.t0} t1={view.t1} height={140} y={hvdcY} fmt={fmtMW} zero showX {xTicks}
							layers={[{ kind: 'area', values: view.hvdc, tok: '--f-hvdc', opacity: 0.5 }, { kind: 'line', values: view.hvdc, tok: '--f-hvdc', width: 1.3, dot: false }]}
							shade={view.shade} bind:hover label="HVDC transfer between the islands" />
					</div>
				{:else if spikeY}
					<div class="chart">
						<div class="ch-head">
							<h2>Price spikes</h2><span class="unit">half-hours at {NODE[bandKey].name}</span>
							<div class="legends">
								<span class="lg"><i class="area" style="--c: var(--o1); opacity: 0.45"></i>Over $500</span>
								<span class="lg"><i class="area" style="--c: var(--o1)"></i>Over $1,000</span>
							</div>
						</div>
						<TimeChart t={view.t} t0={view.t0} t1={view.t1} height={140} y={spikeY} fmt={(v) => String(v)} showX {xTicks}
							layers={[{ kind: 'bars', values: view.P[bandKey === 'BEN' ? 'SI' : 'NI'].n500, tok: '--o1', opacity: 0.45 }, { kind: 'bars', values: view.P[bandKey === 'BEN' ? 'SI' : 'NI'].n1000, tok: '--o1' }]}
							bind:hover label="Half-hours with prices over $500 and $1,000 in each period" />
					</div>
				{/if}
			{:else}
				<p class="empty">{status || 'Loading…'}</p>
			{/if}
		</section>

		<aside class="summary p-side" aria-label="Prices at the selected time">
			<div>
				<div class="sum-when">{whenLabel(at)}</div>
				<div class="sum-sub">{view?.mode === 'long' || (view && view.histEnd && view.t[at] <= view.histEnd) ? 'Final prices' : 'Dispatch prices'}</div>
			</div>
			<table class="mix">
				<tbody>
					{#each cursorRows as r}
						<tr class:dim={r.dim}><td>{#if r.tok}<i class="sw" style="--c: var({r.tok})"></i>{/if}{r.label}</td><td class="n">{r.value}</td></tr>
					{/each}
				</tbody>
			</table>
			{#if sepNow !== null}
				<p class="sep" class:on={sepNow}>{sepNow ? 'Islands priced apart' : 'Islands priced together'}</p>
			{/if}
			{#if rangeStats}
				<p class="lbl">{R.label}</p>
				<table class="mix">
					<tbody>
						{#each rangeStats.rows as r}
							<tr><td>{r.node} average</td><td class="n">{money(r.avg)}</td></tr>
							<tr><td>{r.node} high</td><td class="n">{money(r.hi)}</td></tr>
							<tr><td>Time over $500</td><td class="n">{hours(r.over)}</td></tr>
						{/each}
						<tr><td>Generation-weighted average</td><td class="n">{money(rangeStats.cap.avg)}</td></tr>
						{#if rangeStats.sepShare !== null}<tr><td>Islands priced apart</td><td class="n">{Math.round(rangeStats.sepShare * 100)}% of the time</td></tr>{/if}
					</tbody>
				</table>
			{/if}
		</aside>
	</div>

	<div class="p-row">
		<section class="card">
			<h2>Price captured by fuel</h2>
			<p class="sub">What each fuel earned over the {R.label.toLowerCase()}: its output × its island's price, divided by its output. {region === 'NZ' ? 'Both islands' : region === 'NI' ? 'North Island (Haywards)' : 'South Island (Benmore)'}.</p>
			{#if rangeStats && rangeStats.cap.rows.length}
				<FuelBars rows={rangeStats.cap.rows} avg={rangeStats.cap.avg} />
				<p class="note">Percent is against the generation-weighted average of all fuels. Batteries count discharge only; embedded solar isn't paid the spot price, so it's left out.</p>
			{:else}
				<p class="empty">{status || 'Loading…'}</p>
			{/if}
		</section>
		<section class="card">
			<div class="card-head">
				<div>
					<h2>Price by time of day</h2>
					<p class="sub">Each half-hour of the {endT === null ? 'last 30 days' : `30 days to ${dateLabel(endT - 1)}`}</p>
				</div>
				<div class="seg" role="group" aria-label="Node for the heat map">
					{#each NODES.filter((nd) => nd.ref || (heatSeg && priceOf(heatSeg, nd.k))) as nd}
						<button type="button" aria-pressed={heatKey === nd.k} onclick={() => { heatKey = nd.k; save(); }}>{nd.name}</button>
					{/each}
				</div>
			</div>
			{#if heatRows.length}<HeatMap rows={heatRows} />{:else}<p class="empty">Loading…</p>{/if}
		</section>
	</div>

	<section class="card notes">
		<div><h3>Scales</h3><p><b>Spike-proof</b> is linear up to about $100 and compressed above it (logarithmic), so one spike doesn't flatten everything else; equal steps up the axis are equal ratios. <b>Capped</b> is linear up to ${CAP} and clips anything higher, marking the highest prices at the top. <b>Linear</b> is a plain scale, where a spike shows at its true size.</p></div>
		<div><h3>Dispatch or final prices</h3><p>The live week shows dispatch prices from the real-time feed. History uses the Electricity Authority's final prices once published, usually the next day; under scarcity the two can differ a lot.</p></div>
		<div><h3>Two kinds of average</h3><p>Time-weighted counts every interval the same. Generation-weighted counts each interval by how much was generated, so busy peaks count for more.</p></div>
		<div><h3>Islands priced apart</h3><p>Shaded where Haywards and Benmore differ by more than $10 and 10%, usually because the HVDC link or the grid near it is at a limit.</p></div>
	</section>

	<SiteFooter />
</div>

<style>
	.p-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px 18px; align-items: start; }
	.p-side { position: sticky; top: 12px; }
	.plot-wrap { position: relative; }
	.arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 30px; height: 44px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 4px; background: color-mix(in srgb, var(--surface) 88%, transparent); color: var(--ink-2); cursor: pointer; opacity: 0.85; }
	.arrow:hover { color: var(--ink); opacity: 1; }
	.arrow:disabled { opacity: 0.3; cursor: default; }
	.arrow.prev { left: 54px; }
	.arrow.next { right: 12px; }
	.keys { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 6px 0 4px; }
	.nk { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 0.8rem; color: var(--ink-2); background: none; border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px 2px 8px; min-height: 28px; cursor: pointer; }
	.nk[aria-pressed='false'] { opacity: 0.45; }
	.nk i, .sw { width: 14px; height: 0; border-top: 2px solid var(--c); display: inline-block; }
	.sw { margin-right: 7px; vertical-align: middle; }
	.kn { font-size: 0.76rem; color: var(--muted); }
	.empty { color: var(--muted); font-size: 0.86rem; padding: 18px 10px; margin: 0; }
	.mix tr.dim { opacity: 0.5; }
	.sep { margin: 0; font-size: 0.8rem; padding: 6px 9px; border-radius: 4px; background: var(--grid); color: var(--ink-2); }
	.sep.on { background: var(--warn-bg); color: var(--warn-ink); font-weight: 600; }
	.lbl { margin: 4px 0 -6px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 600; }
	.p-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 14px 18px; align-items: start; }
	.card { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; display: grid; gap: 10px; min-width: 0; }
	.card > :global(*) { min-width: 0; }
	.card h2 { font-size: 0.86rem; font-weight: 600; margin: 0; }
	.card .sub { margin: 2px 0 0; color: var(--muted); font-size: 0.8rem; }
	.card .note { margin: 0; color: var(--muted); font-size: 0.76rem; }
	.card-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 12px; align-items: flex-start; }
	.notes { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px 22px; }
	.notes h3 { font-size: 0.82rem; margin: 0 0 3px; }
	.notes p { margin: 0; font-size: 0.8rem; color: var(--ink-2); line-height: 1.5; }
	@media (max-width: 900px) {
		.p-layout, .p-row { grid-template-columns: minmax(0, 1fr); }
		.p-side { position: static; }
	}
</style>
