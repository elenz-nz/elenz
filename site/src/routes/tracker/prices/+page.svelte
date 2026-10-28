<script lang="ts">
	// The Prices tab of the tracker: node prices, the island spread and HVDC on one time axis (the live week and 30
	// days), or each period's price range, spread and spikes (12 months and all history); then the price each fuel
	// captured over the range and a heat map of the last 30 days by time of day. Data: #lib/prices/data.js.
	import Preview from '#lib/site/Preview.svelte';
	import { onMount, untrack } from 'svelte';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import { fromLayout, historyStore, firstAtOrAfter, slice, nzOffset } from '#lib/tracker/series.js';
	import Masthead from '#lib/site/Masthead.svelte';
	import TrackerTabs from '#lib/site/TrackerTabs.svelte';
	import { readView, writeView, midnightOf, addDays, ymd, endOfDay, describe, shareLinks } from '#lib/site/view.js';
	import ShareLink from '#lib/site/ShareLink.svelte';
	import { heatWindow, heatSource, monthRows } from '#lib/site/heat.js';
	import { dateSettled, timeSettled } from '#lib/site/datefield.js';
	import { stamp, fromStamp } from '#lib/site/viewurl.js';
	import DownloadMenu from '#lib/site/DownloadMenu.svelte';
	import { composeImage, svgImage, legendOf, csvText, nzTime, utcTime, fileName, CREDIT, LICENCE } from '#lib/site/download.js';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import TimeChart from '#lib/prices/TimeChart.svelte';
	import FuelBars from '#lib/prices/FuelBars.svelte';
	import HeatMap from '#lib/prices/HeatMap.svelte';
	import Context from '#lib/site/Context.svelte';
	import PopButton from '#lib/site/PopButton.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import { fitSelect } from '#lib/site/fitselect.js';
	import { barHeight } from '#lib/site/sticky.js';
	import { rangeName, span } from '#lib/site/context.js';
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
	let hoverBy = $state<'mouse' | 'touch' | 'key' | 'pin' | null>(null); // touch, keys and a pin get the time chip, the mouse its tooltip
	let pinned = $state(false);   // a click on a chart pins the time line there until another click, Release or Escape
	let view = $state<any>(null); // what the charts draw (see build below)
	let busy = $state(false);
	let viewError = $state('');
	let heatRows = $state<any[]>([]);
	let heatSeg = $state.raw<any>(null);
	let heatSpan = $state('');   // the dates the heat map covers, for its context line
	let endT = $state<number | null>(null); // end of the window (ms), or null for the latest data
	let heatTo = 0, heatFrom = -1;
	let heatShort = $state(false);   // a range under a week shows the last week
	let heatScaled = $state(false);   // the heat map's colours fitted to the rows shown rather than the fixed price bands
	let popped = $state<string | null>(null); // a lower chart enlarged over the page
	let winH = $state(800);
	let infoOpen = $state(false), helpOpen = $state(false);
	let infoBtn = $state<HTMLButtonElement>(), infoBox = $state<HTMLDivElement>(), helpBtn = $state<HTMLButtonElement>();
	let tipS = $state<{ chart: string; i: number; x: number; y: number } | null>(null); // the tooltip that follows the mouse
	const store = historyStore();
	const FIRST = Date.UTC(1997, 6, 31, 12); // history starts 1 Aug 1997 (NZ), the metered history's first month
	const R = $derived(RANGES[range as keyof typeof RANGES] as { mode: string; src: string; days: number | null; ints: string[]; past?: string[]; label: string; def?: string });
	const age = $derived(meta ? (now - meta.end) / 60000 : 0);
	const isLive = $derived(meta !== null && age < LIVE_MINUTES);

	// ---------- settings: region and range shared with the Generation tab; the rest kept for this page ----------
	// region, range, interval and date are shared with the Generation tab through the address (#lib/site/view.js);
	// the scale, hidden nodes and price-range island are this page's own, also in the address. A link opens exactly
	// what its address says; a plain visit opens on this browser's last settings ('elenz-prices'). The heat map's node
	// is only remembered in this browser.
	let intPicked = $state(false);   // the viewer chose the interval; otherwise this page's default for the range
	let linkedT: number | null = null;   // a link's point: the summary opens on it once the view is built
	function restore() {
		const v = readView();
		region = v.region;
		range = v.range in RANGES ? v.range : '1d';
		if (v.int) { int = v.int; intPicked = true; }
		endT = v.end;
		linkedT = v.t;
		zoom = v.q.zoom ?? null;
		let p: any = null;
		try { p = JSON.parse(localStorage.getItem('elenz-prices') || 'null'); } catch { /* storage blocked: defaults */ }
		if (v.link) p = { scale: v.q.scale, off: v.q.hide, band: v.q.band, heat: p?.heat };
		if (p) {
			if (SCALES.some((s) => s.k === p.scale)) scale = p.scale;
			if (Array.isArray(p.off)) off = p.off.filter((k: string) => k in NODE);
			if (p.band in NODE) bandKey = p.band;
			if (p.heat in NODE) heatKey = p.heat;
		}
	}
	// ---------- downloads (#lib/site/DownloadMenu.svelte, #lib/site/download.js) ----------
	const EACH: Record<string, string> = { '5m': '5-minute', '30m': 'half-hourly', '1d': 'daily', '1w': 'weekly', '1mo': 'monthly' };
	// "6:05 pm Sat 17 Oct 2026 to 6:00 pm Sun 18 Oct 2026 · 5-minute averages"
	function spanText() {
		const S = view.S, a = S.t[0], b = S.t[S.n - 1] + S.h[S.n - 1] * 36e5, long = view.mode === 'long';
		const at = (t: number) => (long ? dateLabel(t) : `${clock(t)} ${dayLabel(t)} ${nzParts(t).y}`);
		return `${at(a)} to ${at(long ? b - 1 : b)} · ${EACH[effInt] ?? ''} ${long ? 'periods' : 'averages'}`;
	}
	// the address a download names: the live view while it's live, otherwise its dates (and a pinned point)
	function viewLink() {
		const L = links();
		return (L.live && L.point == null ? L.live : (L.fixed(L.point != null) || { url: L.live }).url) ?? "";
	}
	const fileWords = () => describe('prices', { ...sharedNow(), end: endT ?? endOfToday });
	async function image(which: 'price' | 'all') {
		if (!view) throw new Error('The charts are still loading.');
		const cards = [...document.querySelectorAll<HTMLElement>('#charts .chart, #charts-more .chart')].filter((c) => c.querySelector('.tc svg'));
		const tokColour = (tok: string) => getComputedStyle(document.documentElement).getPropertyValue(tok).trim();
		const panels = [];
		for (const card of which === 'price' ? cards.slice(0, 1) : cards) {
			const { img, w, h } = await svgImage(card.querySelector('.tc svg') as SVGSVGElement);
			// the price chart's nodes are listed in the summary table on screen, so name them here
			const nodes = card === cards[0] && view.mode === 'time' ? shown.map((x: any) => ({ name: `${x.name} (${x.node})`, colour: tokColour(x.tok), kind: 'line' })) : [];
			panels.push({ heading: card.querySelector('h2')?.textContent ?? '', unit: card.querySelector('.unit')?.textContent ?? '', legend: [...nodes, ...legendOf(card)], img, w, h });
		}
		const blob = await composeImage({ title: describe('prices', { ...sharedNow(), zoom }), sub: spanText(), panels, credit: [CREDIT, 'Dispatch prices for the live week, final prices for history.'], link: viewLink() });
		return { blob, name: fileName(fileWords(), 'png') };
	}
	function csv() {
		if (!view) throw new Error('The charts are still loading.');
		const r2 = (v: number) => Math.round(v * 100) / 100, r1 = (v: number) => Math.round(v * 10) / 10;
		let header: string[], rows: any[][];
		if (view.mode === 'time') {
			header = ['start_nz', 'start_utc', ...shown.map((x: any) => `${x.name} ${x.node} ($/MWh)`), 'Island spread, Haywards - Benmore ($/MWh)', 'HVDC transfer, northward (MW)'];
			rows = Array.from({ length: view.n }, (_, i) => [nzTime(view.t[i]), utcTime(view.t[i]), ...shown.map((x: any) => r2(x.values[i])), r2(view.spread[i]), r1(view.hvdc[i])]);
		} else {
			// each period's percentiles are its days' percentiles averaged (as the chart's middle 80% band)
			const pc = (n: string) => (effInt === '1d' ? `${n} percentile` : `${n} percentile (daily, averaged)`);
			const P = view.P, cols: [string, string][] = [['price', 'average'], ['p10', pc('10th')], ['p90', pc('90th')], ['pmin', 'lowest'], ['pmax', 'highest'], ['n500', 'half-hours over $500'], ['n1000', 'half-hours over $1,000']];
			const isl = [['NI', 'Haywards'], ['SI', 'Benmore']];
			header = ['period_start_nz', ...isl.flatMap(([, n]) => cols.map(([k, c]) => `${n} ${c}${k.startsWith('n') ? '' : ' ($/MWh)'}`)), 'Island spread, average ($/MWh)', 'HVDC transfer, average northward (MW)'];
			rows = Array.from({ length: P.n }, (_, j) => [nzTime(P.t[j]).slice(0, 10), ...isl.flatMap(([k]) => cols.map(([c]) => (c.startsWith('n') ? P[k][c][j] : r2(P[k][c][j])))), r2(P.spread[j]), r1(P.hvdc[j])]);
		}
		const text = csvText([
			`ELENZ: ${describe('prices', { ...sharedNow(), zoom })}`,
			`${spanText()}. Times are the start of each ${view.mode === 'long' ? 'period' : 'interval'}. Dispatch prices for the live week, final prices for history.`,
			CREDIT, LICENCE, 'How the prices are shown: https://elenz.co.nz/methods/prices', `This view: ${viewLink()}`,
		], header, rows);
		return { blob: new Blob([text], { type: 'text/csv;charset=utf-8' }), name: fileName(fileWords(), 'csv') };
	}
	const downloads = () => [
		{ label: view?.mode === 'long' ? 'Price range chart' : 'Price chart', sub: 'Image with title, dates, nodes and credit', kind: 'PNG' as const, run: () => image('price') },
		{ label: 'All charts', sub: view?.mode === 'long' ? 'Price range, island spread and price spikes' : 'Prices, island spread and HVDC', kind: 'PNG' as const, run: () => image('all') },
		{ label: 'Data for this view', sub: view?.mode === 'long' ? 'Each period’s prices, spread, spikes and HVDC' : 'Node prices, island spread and HVDC', kind: 'CSV' as const, run: () => csv() },
	];
	const sharedNow = () => ({ region, range, int: intPicked && intChoices.includes(int) ? int : null, end: R.days == null ? null : endT });
	const ownNow = () => ({ scale, hide: off, band: bandKey, zoom });
	function save() {
		writeView(sharedNow(), { query: ownNow() });
		document.title = `${describe('prices', { ...sharedNow(), zoom })} · ELENZ`;
		try { localStorage.setItem('elenz-prices', JSON.stringify({ scale, off, band: bandKey, heat: heatKey })); } catch { /* storage blocked */ }
	}
	// the links the Share button offers: this view, live or fixed to its dates, and the pinned point (or one chosen with
	// the arrow keys or a touch)
	function links() {
		const lastT = view && at >= 0 && hoverBy !== 'mouse' ? view.t[at] : null;
		const tDay = !['5m', '30m'].includes(effInt);
		const label = lastT == null ? null : !tDay ? `${clock(lastT)} ${dayLabel(lastT)}` : effInt === '1mo' ? monthLabel(lastT) : effInt === '1w' ? `Week of ${dateLabel(lastT)}` : dateLabel(lastT);
		return shareLinks('/tracker/prices', { ...sharedNow(), ...ownNow() }, { point: lastT, pointLabel: label, tDay, days: R.days, latestEnd: endOfToday });
	}

	function pickRange(k: string) {
		zoom = null;
		range = k;
		intPicked = false;   // a new range starts on its default interval, as on the Generation tab
		save();
	}
	const setEnd = (t: number | null) => { if (zoom && !zoom.span) zoom = null; endT = t; save(); };

	// ---------- zoom (as on the Generation tab): part of a 5-minute or half-hourly window, either the last hours of it
	// ({ span: hours }, from the menu beside 1D, so a live view stays live) or a stretch dragged across a chart
	// ({ from, to }); a range button, the date or Reset zoom clears it. Long ranges (periods of a day or more) ignore it.
	let zoom = $state<{ span?: number; from?: number; to?: number } | null>(null);
	let spanOpen = $state(false);
	let spanBtn = $state<HTMLButtonElement>(), spanMenu = $state<HTMLDivElement>();
	let spanPos = $state({ top: 0, left: 0 });
	function openSpan() {
		if (spanOpen) { spanOpen = false; return; }
		const r = spanBtn!.getBoundingClientRect();
		spanPos = { top: r.bottom + 6, left: Math.max(8, Math.min(innerWidth - 168, r.left - 60)) };
		spanOpen = true;
	}
	function spanOutside(e: Event) {
		if (!spanOpen) return;
		if (e instanceof KeyboardEvent) { if (e.key === 'Escape') { spanOpen = false; spanBtn?.focus(); } return; }
		const t = e.target as Node;
		if (!spanBtn?.contains(t) && !spanMenu?.contains(t)) spanOpen = false;
	}
	function pickSpan(h: number) {
		spanOpen = false;
		range = '1d'; intPicked = false;
		zoom = h < 24 ? { span: h } : null;
		save();
	}
	function setZoom(z: { from: number; to: number } | null) { zoom = z; hover = -1; pinned = false; save(); }
	const zoomed = $derived(!!zoom && view?.mode === 'time' && !!view?.zoomed);
	const zoomTxt = $derived.by(() => {
		if (!zoomed || !view) return '';
		const a = view.t0, b = view.t1;
		return `${clock(a)} – ${clock(b)}${dayLabel(a) === dayLabel(b) ? ' ' + dayLabel(a) : ''}`;
	});
	// zoomed, the stretch shown: [from, to) (to = the end of its last interval), and its length in words
	const zoomEnds = $derived(zoomed && view ? { from: view.t0, to: view.t1 + view.S.h[view.n - 1] * 36e5 } : null);
	const zoomWord = (ms: number) => {
		const m = Math.round(ms / 6e4), hh = Math.floor(m / 60), mm = m % 60;
		return hh ? (mm ? `${hh} h ${mm} min` : `${hh} hour${hh > 1 ? 's' : ''}`) : `${mm} min`;
	};
	const zoomStamp = $derived(zoomEnds ? stamp(zoomEnds.to).split('T') : null);   // ['YYYY-MM-DD', 'HH:MM'], NZ time
	// the date and time boxes, zoomed: the same length of time, ending at t (snapped to 5 minutes). At or past the
	// newest data a span from the menu (or a stretch as long as one) is "the last N hours" again. The window around it is the day it ends in (or the
	// latest), widened to 3 days when the stretch starts the day before, so none of it is cut off. As on the Generation tab.
	function zoomEndAt(t: number | null) {
		if (!zoomEnds || !live || !t) return;
		const len = zoomEnds.to - zoomEnds.from, latest = live.t[live.n - 1] + 3e5;
		const to = Math.max(FIRST + len, Math.min(latest, Math.round(t / 3e5) * 3e5)), from = to - len;
		hover = -1; pinned = false;
		if (to === latest) {
			// back to the newest data: a length the 1D menu offers is live "last N hours" again
			const span = zoom?.span || ([1, 3, 6, 12].includes(len / 36e5) ? len / 36e5 : null);
			if (span) { zoom = { span }; range = '1d'; } else zoom = { from, to };
			endT = null;
		} else {
			zoom = { from, to };
			let end: number | null = addDays(midnightOf(to - 1), 1);
			if (end >= endOfToday) end = null;
			const fits = (k: string) => { const d = (RANGES as any)[k].days; return from >= (end == null ? latest - d * 864e5 : addDays(end, -d)); };
			if (!fits(range)) range = '3d';
			endT = end;
		}
		save();
	}

	// ---------- building the view ----------
	// the points of a segment starting in [from, to): a point is the interval that starts at its time, so a window
	// ending at midnight leaves out the interval that starts then
	const windowOf = (S: any, from: number, to: number) => slice(S, firstAtOrAfter(S.t, from), firstAtOrAfter(S.t, to));
	const latestT = $derived(live ? live.t[live.n - 1] : 0);
	// whether the live week covers a window starting at `from`: always for the latest window (the live week holds
	// 7 days less one 5-minute interval, so "7 days" starts one interval before it, as on the Generation tab), and
	// otherwise within one interval of its start
	const liveCovers = (from: number) => !!live && (endT === null || from >= live.t[0] - 3e5);
	// a window ending before the live week reaches back past it: the live ranges then come from half-hourly history
	const pastLive = $derived(R.src === 'live' && endT !== null && !!live && !liveCovers(windowAt(R).from));
	/** The window a range shows: [from, to), ending at the chosen date or the latest data. */
	function windowAt(r: { days: number | null }) {
		const latest = live.t[live.n - 1];
		const to = r.days == null || endT === null ? latest + 1 : Math.min(endT, latest + 1);
		const from = r.days == null ? 0 : endT !== null && to === endT ? addDays(to, -r.days) : to - r.days * 864e5;   // whole local days, like the Generation tab
		return { from, to };
	}
	const intChoices = $derived(pastLive && R.past ? R.past : R.ints);
	const effInt = $derived(intPicked && intChoices.includes(int) ? int : R.def && intChoices.includes(R.def) ? R.def : intChoices[0]);

	let token = 0;
	async function build() {
		if (!live) return;
		const my = ++token;
		const r = (RANGES as any)[range];
		const { from, to } = windowAt(r);
		const iv = effInt;
		viewError = '';
		// the zoom narrows the window (5-minute and half-hourly views only); ignored if it would leave under two points
		let zf = from, zt = to, isZoomed = false;
		if (zoom && r.src !== 'day') {
			if (zoom.span) { zt = to; zf = Math.max(from, to - zoom.span * 36e5); }
			else if (zoom.from != null && zoom.to != null) { zf = Math.max(from, zoom.from); zt = Math.min(to, zoom.to); }
			if (zt - zf >= (iv === '30m' ? 36e5 : 2 * 3e5)) isZoomed = true; else { zf = from; zt = to; }
		}
		try {
			if (r.src === 'live' && liveCovers(from)) {
				setView(timeView(atInterval(windowOf(live, zf, zt), iv)), isZoomed);
			} else if (r.src !== 'day') {
				if (!store.has('hh', from, to)) { busy = true; await store.load('hh', from, to); }
				if (my !== token) return;
				const m = store.merged('hh', live);
				setView(timeView(atInterval(addRevenue(windowOf(m, zf, zt), undefined, true), iv), m.histEnd), isZoomed);
			} else {
				if (!store.has('day', 0, 0)) { busy = true; await store.load('day', 0, 0); }
				if (my !== token) return;
				const m0 = store.merged('day', live), m = completeDaily(m0, m0.histEnd, live);
				setView(longView(r.days == null ? m : windowOf(m, from, to), m.histEnd));
			}
			if (to !== heatTo || heatFrom !== from) { heatFrom = from; loadHeat(from, to); }
		} catch (e: any) {
			if (my === token) viewError = e.missing ? 'History is still being prepared. Please check back later.' : `History couldn't be loaded. ${e.message}`;
		} finally {
			if (my === token) busy = false;
		}
	}
	function setView(v: any, isZoomed = false) {
		v.zoomed = isZoomed;
		const keep = view && view.mode === v.mode && hover >= 0 && hover < v.n && view.n === v.n;
		view = v;
		if (!keep) { hover = -1; pinned = false; }   // no cursor: the summary shows the whole range, as on the Generation tab
		if (linkedT != null) {
			// a link's point: the period that contains it
			let j = -1;
			for (let i = v.n - 1; i >= 0; i--) if (v.t[i] <= linkedT) { j = i; break; }
			if (j >= 0 && (j < v.n - 1 || linkedT - v.t[j] < 32 * 864e5)) { hover = j; hoverBy = 'pin'; pinned = true; }
			linkedT = null;
		}
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
	// prices above the cap, marked at the top: every clipped point, highest first (the chart labels as many as fit)
	const capMarks = $derived.by(() => {
		if (!view || !priceY || !(priceY as any).capped) return [];
		const pts: { i: number; v: number; k: string }[] = [];
		if (view.mode === 'time') for (const s of shown) s.values.forEach((v: number, i: number) => { if (v > CAP) pts.push({ i, v, k: s.k }); });
		else { const I = view.P[bandKey === 'BEN' ? 'SI' : 'NI']; I.pmax.forEach((v: number, i: number) => { if (v > CAP) pts.push({ i, v, k: bandKey }); }); }
		pts.sort((a, b) => b.v - a.v);
		const seen = new Set<number>();   // one label per point in time: the highest node there
		return pts.map((p) => {
			const first = !seen.has(p.i);
			seen.add(p.i);
			return { i: p.i, label: first ? `${shown.length > 1 || view.mode === 'long' ? NODE[p.k].name + ' ' : ''}${money(p.v)}` : '' };
		});
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

	// ---------- summary: at the cursor, or the whole range when there's no cursor (as on the Generation tab) ----------
	const at = $derived(view && hover >= 0 && hover < view.n ? hover : -1);
	const TP = (t: number) => { const p = nzParts(t); return Math.floor((p.h * 60 + p.mi) / 30) + 1; };
	const yearIf = (t: number) => (endT !== null && nzParts(t).y !== nzParts(latestT).y ? ' ' + nzParts(t).y : '');
	/** A point's name for the tooltip. */
	function chip(i: number) {
		const t = view.t[i];
		if (view.mode === 'long' || effInt === '1d') return effInt === '1mo' ? monthLabel(t) : effInt === '1w' ? `w/c ${dateLabel(t)}` : `${dayLabel(t)} ${nzParts(t).y}`;
		return `${dayLabel(t)}${yearIf(t)}, ${clock(t)}`;
	}
	/** The summary's heading: [title, subtitle]. */
	function heading(i: number): [string, string] {
		if (!view) return ['', ''];
		const kind = view.mode === 'long' || (view.histEnd && view.t[Math.max(i, 0)] <= view.histEnd) ? 'final prices' : 'dispatch prices';
		if (i < 0) {
			const t0 = view.t[0], t1 = view.t[view.n - 1];
			if (view.zoomed) {
				const end = view.S.t[view.S.n - 1] + view.S.h[view.S.n - 1] * 36e5;
				return [zoom?.span && endT === null ? `Last ${zoom.span} hour${zoom.span > 1 ? 's' : ''}` : 'Zoomed in', `${clock(t0)} – ${clock(end)} ${dayLabel(end)} · averages`];
			}
			if (R.days == null) return [`Since ${dateLabel(t0)}`, `to ${dateLabel(t1)} · averages`];
			if (endT === null) return [`Last ${R.label}`, `to ${clock(t1)} ${dayLabel(t1)} · averages`];
			return [`${R.label} to ${dateLabel(t1)}`, `${dateLabel(t0)} – ${dateLabel(t1)} · averages`];
		}
		const t = view.t[i];
		if (view.mode === 'long') return [effInt === '1mo' ? monthLabel(t) : effInt === '1w' ? `Week of ${dateLabel(t)}` : `${dayLabel(t)} ${nzParts(t).y}`, `${effInt === '1d' ? 'daily' : effInt === '1w' ? 'weekly' : 'monthly'} figures · final prices`];
		if (effInt === '1d') return [`${dayLabel(t)} ${nzParts(t).y}`, `daily average · ${kind}`];
		return [clock(t), `${dayLabel(t)}${yearIf(t)} · TP ${TP(t)} · ${effInt === '5m' ? '5-minute' : 'half-hour average'} · ${kind}`];
	}
	const mw = (v: number) => `${Math.round(Math.abs(v)).toLocaleString('en-NZ')} MW ${v >= 0 ? 'north' : 'south'}`;
	const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h < 10 ? h.toFixed(1) : Math.round(h)} h`);
	const wavgOf = (S: any, a: ArrayLike<number>) => { let s = 0, w = 0; for (let i = 0; i < S.n; i++) if (a[i] === a[i]) { s += a[i] * S.h[i]; w += S.h[i]; } return w ? s / w : NaN; };
	// a series' value at the cursor, or its time-weighted average over the range
	const valOf = (a: ArrayLike<number> | null) => (!a ? NaN : at >= 0 ? a[at] : wavgOf(view.mode === 'long' ? view.P : view.S, a));

	const cursorRows = $derived.by(() => {
		if (!view) return [];
		if (view.mode === 'time') {
			const rows: any[] = view.series.filter((s: any) => regionNodes.some((r) => r.k === s.k)).map((s: any) => ({ k: s.k, tok: s.tok, label: NODE[s.k].name, value: money(valOf(s.values)) }));
			rows.push({ tok: '--o1', label: 'Spread HAY − BEN', value: signedMoney(valOf(view.spread)) });
			rows.push({ tok: '--f-hvdc', label: 'HVDC', value: mw(valOf(view.hvdc)) });
			return rows;
		}
		const P = view.P, own = bandKey === 'BEN' ? 'SI' : 'NI', I = P[own];
		if (at < 0) return [
			{ tok: '--p-ni', label: 'Haywards', value: money(valOf(P.NI.price)) },
			{ tok: '--p-si', label: 'Benmore', value: money(valOf(P.SI.price)) },
			{ tok: '--o1', label: 'Spread HAY − BEN', value: signedMoney(valOf(P.spread)) },
			{ tok: '--f-hvdc', label: 'HVDC', value: mw(valOf(P.hvdc)) }
		];
		return [
			{ tok: '--p-ni', label: 'Haywards', value: money(P.NI.price[at]) },
			{ tok: '--p-si', label: 'Benmore', value: money(P.SI.price[at]) },
			{ label: `${NODE[bandKey].name}, middle 80%`, value: `${money(I.p10[at])} – ${money(I.p90[at])}` },
			{ label: `${NODE[bandKey].name}, low`, value: money(I.pmin[at]) },
			{ label: `${NODE[bandKey].name}, high`, value: money(I.pmax[at]) },
			{ label: 'Half-hours over $500', value: String(I.n500[at]) },
			{ tok: '--o1', label: 'Spread HAY − BEN', value: signedMoney(P.spread[at]) },
			{ tok: '--f-hvdc', label: 'HVDC', value: mw(P.hvdc[at]) }
		];
	});
	// the high point of the range on the price chart: the highest of the lines drawn (live week and 30 days: the nodes
	// switched on, named when there's more than one, as the clipped marks are; 12 months and All: the island's band)
	const highNote = $derived.by(() => {
		if (!view) return null;
		let best: { i: number; v: number; k: string } | null = null;
		const scan = (a: ArrayLike<number>, k: string) => { for (let i = 0; i < a.length; i++) if (a[i] === a[i] && (!best || a[i] > best.v)) best = { i, v: a[i], k }; };
		if (view.mode === 'time') for (const s of shown) scan(s.values, s.k);
		else scan(view.P[bandKey === 'BEN' ? 'SI' : 'NI'].pmax, bandKey);
		const h = best as { i: number; v: number; k: string } | null;
		if (!h) return null;
		if (scale === 'capped' && h.v > CAP) return null;   // clipped: the marks at the top label it
		const named = view.mode === 'time' && shown.length > 1;
		return { i: h.i, v: h.v, text: `High ${money(h.v)}${named ? ' · ' + NODE[h.k].name : ''}`, tok: NODE[h.k].tok };
	});
	// the tooltip's rows for one chart at one point
	function tipRows(chart: string, i: number) {
		if (chart === 'price') {
			if (view.mode === 'time') return shown.map((s: any) => ({ tok: s.tok, label: NODE[s.k].name, value: money(s.values[i]), unit: '/MWh' }));
			const I = view.P[bandKey === 'BEN' ? 'SI' : 'NI'], tok = bandKey === 'BEN' ? '--p-si' : '--p-ni';
			return [
				{ tok, label: `${NODE[bandKey].name}, average`, value: money(I.price[i]), unit: '/MWh' },
				{ tok, label: 'Middle 80%', value: `${money(I.p10[i])} – ${money(I.p90[i])}` },
				{ tok, label: 'Low to high', value: `${money(I.pmin[i])} – ${money(I.pmax[i])}` }
			];
		}
		if (chart === 'spread') return [{ tok: '--o1', label: 'Haywards − Benmore', value: signedMoney((view.mode === 'time' ? view.spread : view.P.spread)[i]), unit: '/MWh' }];
		if (chart === 'hvdc') { const v = view.hvdc[i]; return [{ tok: '--f-hvdc', label: 'Benmore ⇄ Haywards', value: `${Math.round(Math.abs(v)).toLocaleString('en-NZ')}`, unit: `MW ${v >= 0 ? 'north' : 'south'}` }]; }
		const I = view.P[bandKey === 'BEN' ? 'SI' : 'NI'];
		return [{ tok: '--o1', label: 'Over $500', value: String(I.n500[i]), unit: 'half-hours' }, { tok: '--o1', label: 'Over $1,000', value: String(I.n1000[i]), unit: 'half-hours' }];
	}
	// the mouse leaving the charts returns the summary to the range (after a moment, so moving from one chart to the next
	// doesn't flicker); a touch keeps its point, since there's no hover to follow
	let leaveTimer: ReturnType<typeof setTimeout> | undefined;
	const point = (chart: string) => (e: PointerEvent, i: number) => {
		if (pinned) return;
		clearTimeout(leaveTimer);
		hoverBy = e.pointerType === 'touch' ? 'touch' : 'mouse';
		if (e.pointerType === 'touch') { tipS = null; return; }
		tipS = { chart, i, x: e.clientX, y: e.clientY };
	};
	const leave = (e?: PointerEvent) => {
		tipS = null;
		if (pinned || (e && e.pointerType === 'touch')) return;
		clearTimeout(leaveTimer);
		leaveTimer = setTimeout(() => (hover = -1), 150);
	};
	// a click pins the time line; a click on the pinned point (or next to it) releases it
	function pin(i: number) {
		clearTimeout(leaveTimer);
		tipS = null;
		if (pinned && Math.abs(i - hover) <= 1) { pinned = false; hoverBy = 'mouse'; return; }
		hover = i; pinned = true; hoverBy = 'pin';
	}
	function unpin() { pinned = false; hover = -1; }
	const tipPos = $derived.by(() => {
		if (!tipS) return '';
		const w = 260, h = 110, pad = 8;
		let x = tipS.x + 16, y = tipS.y + 16;
		if (typeof window !== 'undefined') {
			if (x + w > window.innerWidth - pad) x = tipS.x - w - 16;
			if (y + h > window.innerHeight - pad) y = tipS.y - h - 12;
		}
		return `transform: translate(${Math.max(pad, x)}px, ${Math.max(pad, y)}px)`;
	});
	const sepNow = $derived(view && view.mode === 'time' && at >= 0 ? view.sep[at] : null);
	const head = $derived(heading(at));

	// over the whole range: averages, highs and spikes (Haywards and Benmore), and price captured by fuel
	// what the cards under the charts cover, said on each (the controls are far above)
	const win = $derived(view && view.S.n ? { from: view.S.t[0], to: view.S.t[view.S.n - 1] + view.S.h[view.S.n - 1] * 36e5 } : null);
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

	// ---------- the heat map: follows the range (#lib/site/heat.js): by day up to a year, by month on All ----------
	async function loadHeat(from: number, to: number) {
		if (!live) return;
		heatTo = to;
		const src: any = await heatSource(heatWindow(from, to), store, live);
		if (heatTo !== to) return;
		heatSeg = src;
		heatShort = src.kind === 'days' && src.from < from - 6e4;
		heatRows = heatRowsOf(src, heatKey);
		heatSpan = src.kind === 'days' ? (src.seg && src.seg.n ? span(src.seg.t[0], src.seg.t[src.seg.n - 1] + src.seg.h[src.seg.n - 1] * 36e5) : '') : span(Math.max(from, FIRST), to);
	}
	const heatRowsOf = (src: any, k: string) => src.kind === 'months'
		? monthRows(src.tod, src.from, src.to, (P: any, c: number) => { const a = k === 'HAY' ? P.NI?.price : k === 'BEN' ? P.SI?.price : P.nodes?.[k]; const x = a ? a[c] : null; return x == null ? NaN : x; }, effInt === '1yr')
		: heat(src.seg, k);
	$effect(() => { const k = heatKey; void effInt; untrack(() => { if (heatSeg) heatRows = heatRowsOf(heatSeg, k); }); });
	// nodes the heat map has prices for (the extra nodes start in Sep 2020 for months, and need bus rows for the live week)
	const heatHas = (k: string) => !!heatSeg && (heatSeg.kind === 'months' ? Object.values(heatSeg.tod).some((P: any) => P.nodes?.[k]) : !!(heatSeg.seg && priceOf(heatSeg.seg, k)));

	// rebuild when the range, interval or data change
	// (build reads and writes the view, so it runs untracked: only these three trigger it)
	$effect(() => { void range; void int; void intPicked; void live; void endT; void zoom; untrack(() => build()); });

	// ---------- moving through time: the date box and the arrows ----------
	const canMove = $derived(R.days != null);
	// windows end at a local midnight (the end of the chosen day), stepping by whole days, as on the Generation tab
	const endOfToday = $derived(live ? addDays(midnightOf(latestT), 1) : 0);
	const atLatest = $derived(endT === null || endT >= endOfToday);
	function step(dir: number) {
		if (!R.days || !live) return;
		const next = addDays(endT ?? endOfToday, dir * R.days);
		setEnd(next >= endOfToday ? null : Math.max(next, addDays(FIRST, R.days)));
	}
	const isoDay = ymd;
	const dateValue = $derived(zoomStamp ? zoomStamp[0] : live ? ymd((endT ?? latestT) - 1) : '');
	function pickDate(v: string) {
		if (zoomStamp) return zoomEndAt(fromStamp(`${v}T${zoomStamp[1]}`));
		const t = endOfDay(v);
		setEnd(t === null || t >= endOfToday ? null : Math.max(t, addDays(FIRST, R.days ?? 0)));
	}

	function keys(e: KeyboardEvent) {
		if (!view) return;
		const by = e.shiftKey ? 10 : 1, cur = at < 0 ? view.n : at;
		hoverBy = 'key';
		if (e.key === 'ArrowLeft') { hover = Math.max(0, cur - by); e.preventDefault(); }
		else if (e.key === 'ArrowRight') { hover = Math.min(view.n - 1, at < 0 ? view.n - 1 : at + by); e.preventDefault(); }
		else if (e.key === 'Home') { hover = 0; e.preventDefault(); }
		else if (e.key === 'End') { hover = view.n - 1; e.preventDefault(); }
		else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); step(e.key === 'PageUp' ? -1 : 1); }
		else if (e.key === 'Escape') { if (hover < 0 && zoom && !zoom.span) setZoom(null); hover = -1; tipS = null; pinned = false; }
	}
	function closeInfo(e: Event) {
		if (e instanceof KeyboardEvent) {
			if (e.key !== 'Escape') return;
			if (popped) popped = null;
			if (infoOpen) { infoOpen = false; infoBtn?.focus(); }
			if (helpOpen) helpOpen = false;
			return;
		}
		if (!infoOpen) return;
		const t = e.target as Node;
		if (!infoBox?.contains(t) && !infoBtn?.contains(t)) infoOpen = false;
	}
	const popH = $derived(Math.min(560, Math.round(winH * 0.62)));
	const toggleNode = (k: string) => { off = off.includes(k) ? off.filter((x) => x !== k) : [...off, k]; save(); };

	onMount(() => {
		restore();
		save();   // the address shows the view from the start, so it can be copied as a link
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
		load().catch((e) => { console.warn('data load failed:', e); error = "Elenz can't reach its data right now. It will try again every minute."; });   // check() below retries every minute
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

<svelte:window bind:innerHeight={winH} onclick={(e) => { closeInfo(e); spanOutside(e); }} onkeydown={(e) => { closeInfo(e); spanOutside(e); }} onscroll={() => (spanOpen = false)} />

<svelte:head>
	<title>Prices · Tracker · ELENZ</title>
	<meta name="description" content="New Zealand wholesale electricity prices at six grid nodes, every 5 minutes: the gap between the islands, HVDC transfer, the price each fuel earned, and price ranges and spikes back to 1997." />
	<Preview title="Wholesale electricity prices · ELENZ Tracker" description="New Zealand wholesale electricity prices at six grid nodes, every 5 minutes: the gap between the islands, HVDC transfer, the price each fuel earned, and price ranges and spikes back to 1997." path="/tracker/prices" />
</svelte:head>

<div class="wrap wide">
	<Masthead heading />
	<TrackerTabs>
		<div class="status">
			<span class="tstatus" role="status">{status}</span>
			{#if meta}
				{#if R.src !== 'live' || endT !== null}
					<span class="pill hist" title="Final prices from the EA, then the live week">History</span>
				{:else if isLive}
					<span class="pill live" title="Dispatch prices from the EMI real-time feed, every 5 minutes"><span class="pword">Live · </span>{clock(meta.end)}</span>
				{:else}
					<span class="pill stale" title="The newest data is more than {LIVE_MINUTES} minutes old">Delayed · {clock(meta.end)}<span class="pday"> {dayLabel(meta.end)}</span></span>
				{/if}
			{/if}
			<DownloadMenu items={downloads} />
			<ShareLink {links} />
			<button type="button" class="pill-btn about-btn" bind:this={infoBtn} aria-expanded={infoOpen} aria-controls="p-about" aria-label="About this data" title="About this data" onclick={() => (infoOpen = !infoOpen)}>
				<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10 9v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /><circle cx="10" cy="6.2" r="1.1" fill="currentColor" /></svg><span class="pill-word">About this data</span>
			</button>
			<div class="info-pop" id="p-about" role="region" aria-label="About this data" bind:this={infoBox} hidden={!infoOpen}>
				<p>Prices from the Electricity Authority: its real-time dispatch feed for the live week (dispatch prices, every 5 minutes), and its final prices for history, usually published the next day.</p>
				<a href="/methods/prices">How the price charts are built</a>
			</div>
		</div>
	</TrackerTabs>

	<nav class="toolbar" aria-label="View controls" use:barHeight>
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
					<button type="button" aria-pressed={range === k} title={(RANGES as any)[k].label} onclick={() => pickRange(k)}>{k === '1d' && zoom?.span && zoomed ? `${zoom.span}H` : l}</button>
				{/each}
			</div>
			<div class="span-wrap p-span">
				<button type="button" class="span-btn" aria-haspopup="true" aria-expanded={spanOpen} aria-controls="p-span-menu" title="Shorter than a day" aria-label="Shorter ranges" bind:this={spanBtn} onclick={openSpan}>
					<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
		</div>
		<div class="ctl">
			<span id="p-lb-int">Interval</span>
			<div class="seg" role="group" aria-labelledby="p-lb-int">
				{#each intChoices as k}
					<button type="button" aria-pressed={effInt === k} onclick={() => { int = k; intPicked = true; save(); }}>{(INT_LABEL as any)[k]}</button>
				{/each}
			</div>
		</div>
		{#if canMove}
			<div class="ctl">
				<label for="p-date">{zoomEnds ? zoomWord(zoomEnds.to - zoomEnds.from) : R.label} ending</label>
				<div class="datebox">
					<button type="button" class="step" aria-label="Previous {R.label}" title="Previous {R.label}" disabled={!live || (endT ?? endOfToday) - (R.days ?? 0) * 864e5 <= FIRST} onclick={() => step(-1)}><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
					<input type="date" id="p-date" value={dateValue} min="1997-08-01" max={live ? isoDay(latestT + 3e5) : undefined}
						title="Shows the selected range ending on this date" use:dateSettled={pickDate} />
					{#if zoomStamp}
						<input type="time" id="p-time" step="300" value={zoomStamp[1]} aria-label="Ending at (NZ time)" title="Shows the zoomed hours ending at this time (NZ time)"
							use:timeSettled={(v: string) => zoomEndAt(fromStamp(`${zoomStamp ? zoomStamp[0] : ''}T${v}`))} />
					{/if}
					<button type="button" class="step" aria-label="Next {R.label}" title={atLatest ? 'Showing the latest data' : `Next ${R.label}`} disabled={atLatest} onclick={() => step(1)}><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
					{#if !atLatest}<button type="button" class="latest" title="Back to the latest data" onclick={() => setEnd(null)}><svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 3 5 5-5 5M12 3v10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>Latest</button>{/if}
				</div>
			</div>
		{/if}
		{#if zoomed}
			<button type="button" class="zoom-chip" title="Back to the whole range (Escape)" onclick={() => { zoom = null; save(); }}>
				<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="m10.5 10.5 3.5 3.5M5 7h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
				{#if !zoom?.span}<span>{zoomTxt}</span>{/if}<b>Reset zoom</b>
			</button>
		{/if}
	</nav>
	<!-- outside the sticky bar, which clips anything hanging below it -->
		{#if spanOpen}
			<div class="span-menu" id="p-span-menu" bind:this={spanMenu} style="top:{spanPos.top}px;left:{spanPos.left}px" role="group" aria-label="Show the last part of the day">
				<span class="span-hd">Last</span>
				{#each [1, 3, 6, 12, 24] as h}
					<button type="button" role="menuitemradio" aria-checked={h === 24 ? range === '1d' && !zoom : zoom?.span === h} onclick={() => pickSpan(h)}>{h} hour{h > 1 ? 's' : ''}</button>
				{/each}
				<span class="span-tip">Or drag across any chart to zoom</span>
			</div>
		{/if}

	<noscript><p class="notice">The charts need JavaScript turned on.</p></noscript>

	<!-- each chart's ⓘ: what it shows and how it's made -->
{#snippet chartInfo(id: string)}
	{#if id === 'price'}
		<ul>
			<li>Spot prices at six grid nodes, in $/MWh: dispatch prices for the live week, the EA's final prices for history.</li>
			<li>Shading marks the times the islands were priced apart (Haywards and Benmore more than $10 and 10% apart).</li>
			<li>On 12 months and All: each day's, week's or month's half-hours at the chosen node, lowest to highest and the middle 80%, with the average as a line and the other island's average dashed.</li>
			<li>Scales: Spike-proof is linear to about $100 and compressed above, so spikes don't flatten everything else; Capped cuts at $600; Linear shows it straight.</li>
		</ul>
		<p><a href="/methods/prices#scales">Price scales</a> · <a href="/methods/prices#dispatch">Dispatch and final prices</a></p>
	{:else if id === 'spread'}
		<ul>
			<li>Haywards less Benmore, in $/MWh (on long ranges, each period's average).</li>
			<li>Above zero the North Island is dearer, often when the HVDC link can’t carry any more north.</li>
		</ul>
		<p><a href="/methods/prices#derived">How the spread is worked out</a></p>
	{:else if id === 'hvdc'}
		<ul>
			<li>Transfer between Benmore and Haywards in MW, northward positive.</li>
			<li>Metered once the EA publishes it, estimated before that.</li>
		</ul>
		<p><a href="/methods/hvdc">How HVDC is worked out</a></p>
	{:else}
		<ul>
			<li>How many half-hours in each period were over $500 and over $1,000/MWh.</li>
			<li>At the node chosen for the price range above.</li>
		</ul>
		<p><a href="/methods/prices#derived">How it's counted</a></p>
	{/if}
{/snippet}

{#snippet info(id: string)}
	<InfoTip label="About this chart">{@render chartInfo(id)}</InfoTip>
{/snippet}

<!-- the price chart's key (in its header, or under it on phones) -->
{#snippet priceKey()}
	{#if view?.mode === 'time'}
		<span class="lg"><i class="area" style="--c: var(--warn-bg); opacity: 1"></i>Islands priced apart</span>
	{:else}
		<span class="lg"><i class="area" style="--c: var({bandKey === 'BEN' ? '--p-si' : '--p-ni'}); opacity: 0.25"></i>Low to high</span>
		<span class="lg"><i class="area" style="--c: var({bandKey === 'BEN' ? '--p-si' : '--p-ni'}); opacity: 0.55"></i>Middle 80%</span>
		<span class="lg"><i class="dash" style="--c: var({bandKey === 'BEN' ? '--p-ni' : '--p-si'})"></i>{bandKey === 'BEN' ? 'Haywards' : 'Benmore'}</span>
	{/if}
{/snippet}

{#snippet popBtn(id: string, name: string)}
		<button type="button" class="pop-btn" onclick={() => (popped = popped === id ? null : id)} aria-pressed={popped === id}
			aria-label={popped === id ? `Shrink the ${name} chart` : `Enlarge the ${name} chart`} title={popped === id ? 'Close' : 'Enlarge'}>
			{#if popped === id}
				<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
			{:else}
				<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
			{/if}
		</button>
	{/snippet}

	<div class="layout">
		<!-- The chart panels take arrow keys to move the time cursor, so they need to be focusable. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<section class="charts" id="charts" tabindex="0" aria-busy={busy} onkeydown={keys}
			aria-label="Price chart. Hover or use the left and right arrow keys to read values at a point in time, Page Up and Page Down to move by the range; Escape returns to range averages.">
			{#if view && priceY}
				<div class="chart" class:popped={popped === 'price'}>
					<div class="ch-head">
						<h2>{view.mode === 'time' ? 'Wholesale price' : 'Price range'}</h2>{@render info('price')}
						<div class="legends">
							<!-- the key: here on wider screens, under the chart on phones (so the header keeps to two rows) -->
							<span class="lg-set">{@render priceKey()}</span>
							{#if view.mode !== 'time'}
								<div class="seg node-seg" role="group" aria-label="Node for the price range">
									{#each ['HAY', 'BEN'] as k}
										<button type="button" aria-pressed={bandKey === k} onclick={() => { bandKey = k; save(); }}>{NODE[k].name}</button>
									{/each}
								</div>
							{/if}
							<select class="grp scale-pick" aria-label="Price scale" title={SCALES.find((s) => s.k === scale)?.title} value={scale} use:fitSelect={scale}
								onchange={(e) => { const v = e.currentTarget.value; if (SCALES.some((s) => s.k === v)) { scale = v; save(); } }}>
								{#each SCALES as s}<option value={s.k}>{s.label}</option>{/each}
							</select>
						</div>
						{@render popBtn('price', 'wholesale price')}
					</div>
					<div class="legends lg-foot">{@render priceKey()}</div>
					<div class="plot">
						<TimeChart onzoom={view.mode === 'time' ? (a, b) => setZoom({ from: a, to: b }) : undefined} t={view.t} t0={view.t0} t1={view.t1} height={popped === 'price' ? popH : 266} showX {xTicks} y={priceY} fmt={fmtTick} layers={priceLayers} note={highNote} stamp={at >= 0 && hoverBy !== 'mouse' ? chip(at) : null}
							shade={view.mode === 'time' ? view.shade : []} marks={capMarks} bind:hover onpoint={point('price')} onleave={leave} onpin={pin} {pinned}
							label="Prices at the grid nodes over the range, $/MWh" zero unit="$/MWh" />
						{#if canMove}
							<button type="button" class="nav prev" aria-label="Previous {R.label}" title="Previous {R.label}" onclick={() => step(-1)}>
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
							<button type="button" class="nav next" aria-label="Next {R.label}" title="Next {R.label}" disabled={atLatest} onclick={() => step(1)}>
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
						{/if}
					</div>
				</div>
			{:else}
				<p class="empty">{status || 'Loading…'}</p>
			{/if}
		</section>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<section class="charts" id="charts-more" tabindex="0" onkeydown={keys} aria-label="Island spread and {view?.mode === 'long' ? 'price spike' : 'HVDC'} charts, on the same time axis as the prices.">
			{#if view && priceY}
				<div class="chart" class:popped={popped === 'spread'}>
					<div class="ch-head">
						<h2>Island spread</h2>{@render info('spread')}
						<div class="legends">
							<span class="lg"><i class="area" style="--c: var(--o1)"></i>North Island dearer</span>
							<span class="lg"><i class="area" style="--c: var(--o2)"></i>South Island dearer</span>
						</div>
						{@render popBtn('spread', 'island spread')}
					</div>
					<TimeChart onzoom={view.mode === 'time' ? (a, b) => setZoom({ from: a, to: b }) : undefined} t={view.t} t0={view.t0} t1={view.t1} height={popped === 'spread' ? popH : 120} y={spreadY} fmt={fmtSpread} zero showX={popped === 'spread'} {xTicks} unit="$/MWh"
						layers={view.mode === 'time' ? [{ kind: 'posneg', values: view.spread, pos: '--o1', neg: '--o2' }] : [{ kind: 'bars', values: view.P.spread, tok: '--o1', neg: '--o2', opacity: 0.85 }]}
						shade={view.mode === 'time' ? view.shade : []} bind:hover onpoint={point('spread')} onleave={leave} onpin={pin} {pinned} label="The price gap between Haywards and Benmore" />
				</div>

				{#if view.mode === 'time'}
					<div class="chart" class:popped={popped === 'hvdc'}>
						<div class="ch-head">
							<h2>HVDC transfer</h2>{@render info('hvdc')}
							<div class="legends"><span class="lg"><i class="area" style="--c: var(--f-hvdc)"></i>Benmore ⇄ Haywards <b>{mw(valOf(view.hvdc))}</b></span></div>
							{@render popBtn('hvdc', 'HVDC transfer')}
						</div>
						<TimeChart onzoom={view.mode === 'time' ? (a, b) => setZoom({ from: a, to: b }) : undefined} t={view.t} t0={view.t0} t1={view.t1} height={popped === 'hvdc' ? popH : 140} y={hvdcY} fmt={fmtMW} zero showX {xTicks} unit="MW"
							layers={[{ kind: 'area', values: view.hvdc, tok: '--f-hvdc', opacity: 0.5 }, { kind: 'line', values: view.hvdc, tok: '--f-hvdc', width: 1.3, dot: false }]}
							shade={view.shade} bind:hover onpoint={point('hvdc')} onleave={leave} onpin={pin} {pinned} label="HVDC transfer between the islands" />
					</div>
				{:else if spikeY}
					<div class="chart" class:popped={popped === 'spikes'}>
						<div class="ch-head">
							<h2>Price spikes</h2>{@render info('spikes')}
							<div class="legends">
								<span class="lg"><i class="area" style="--c: var(--o1); opacity: 0.45"></i>Over $500</span>
								<span class="lg"><i class="area" style="--c: var(--o1)"></i>Over $1,000</span>
							</div>
							{@render popBtn('spikes', 'price spikes')}
						</div>
						<TimeChart onzoom={view.mode === 'time' ? (a, b) => setZoom({ from: a, to: b }) : undefined} t={view.t} t0={view.t0} t1={view.t1} height={popped === 'spikes' ? popH : 140} y={spikeY} fmt={(v) => String(v)} showX {xTicks} unit="½-hours"
							layers={[{ kind: 'bars', values: view.P[bandKey === 'BEN' ? 'SI' : 'NI'].n500, tok: '--o1', opacity: 0.45 }, { kind: 'bars', values: view.P[bandKey === 'BEN' ? 'SI' : 'NI'].n1000, tok: '--o1' }]}
							bind:hover onpoint={point('spikes')} onleave={leave} onpin={pin} {pinned} label="Half-hours with prices over $500 and $1,000 in each period" />
					</div>
				{/if}
			{/if}
		</section>
		{#if popped}<button type="button" class="pop-backdrop" aria-label="Close the enlarged chart" onclick={() => (popped = null)}></button>{/if}

		<div class="side">
			<aside class="summary" aria-label="Prices for the selected time">
				<div class="sum-head">
					<div>
						<div class="sum-when">{head[0]}</div>
						<div class="sum-sub">{head[1]}</div>
						{#if pinned && at >= 0}<div class="sum-pin">Pinned <button type="button" onclick={unpin}>Release</button></div>{/if}
					</div>
					<button type="button" class="ctl-btn" bind:this={helpBtn} aria-expanded={helpOpen} aria-controls="p-help" title="Everything the charts and this list can do" onclick={() => (helpOpen = !helpOpen)}>
						<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h7M12 4h2M2 12h3M8 12h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="10.5" cy="4" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="6.5" cy="12" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>Controls
					</button>
				</div>
				<div class="help" id="p-help" role="note" hidden={!helpOpen}>
					<dl>
						<dt>Read a time</dt>
						<dd>Hover a chart, or touch and slide on a phone. With a chart focused, ← → move one point (Shift: further).</dd>
						<dt>Pin it</dt>
						<dd>Click a chart to hold the time line there; click it again, Release or Escape to let go. Share can then mark that time.</dd>
						<dt>Move through history</dt>
						<dd>Range, interval and region are in the bar at the top. The ‹ › arrows beside the date or on the price chart step by the range; the date box jumps to a day; Latest comes back.</dd>
						<dt>Zoom in</dt>
						<dd>On the live week and 30 days, drag across any chart to zoom into that stretch; every chart follows. The arrow beside 1D picks the last 1, 3, 6 or 12 hours. While zoomed, the date box gains a time: pick the date and time the zoomed hours should end (NZ time) to move them there. Reset zoom in the bar, Escape or a range button goes back.</dd>
						<dt>Nodes and scales</dt>
						<dd>Select a node's colour square in this list to hide or show its line. The menu beside the price chart's title changes its scale (Spike-proof, Capped or Linear); on long ranges, choose the island whose price range is shown.</dd>
						<dt>Enlarge, share, download</dt>
						<dd>The corner button on each chart enlarges it; ⓘ says how it's made. Share copies a link to this view; Download gives the charts as a picture or the data as a spreadsheet file.</dd>
					</dl>
					<p><a href="/methods/prices">How the figures are worked out</a></p>
				</div>
				<table class="mix">
					<thead><tr><th scope="col">{view?.mode === 'time' ? 'Node' : 'Series'}</th><th scope="col" class="n">{at < 0 ? 'Average' : 'Value'}</th></tr></thead>
					<tbody>
						{#each cursorRows as r}
							<tr class:off={r.k && off.includes(r.k)}>
								<td><div class="row-name">
									{#if r.k}
										<button type="button" class="sw-btn" aria-pressed={!off.includes(r.k)} aria-label="Show {r.label} in the chart" title="Show or hide {r.label} ({NODE[r.k].node}, {NODE[r.k].place})" onclick={() => toggleNode(r.k)}><span class="sw" style="--c: var({r.tok})"></span></button>
									{:else}
										<span class="sw-btn">{#if r.tok}<span class="sw" style="--c: var({r.tok})"></span>{/if}</span>
									{/if}
									<span class="nm">{r.label}</span>
								</div></td>
								<td class="n">{r.value}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if sepNow !== null}
					<p class="sep" class:on={sepNow}>{sepNow ? 'Islands priced apart' : 'Islands priced together'}</p>
				{/if}
			</aside>
			{#if rangeStats}
				<section class="stats" aria-label="Prices over the range">
					<dl class="sys">
						{#each rangeStats.rows as r}
							<dt>{r.node} average</dt><dd>{money(r.avg)}<small>/MWh</small></dd>
							<dt>{r.node} high</dt><dd>{money(r.hi)}<small>{R.days === 1 && view.mode === 'time' ? clock(r.hiT) : shortDate(r.hiT)}</small></dd>
							<dt>{r.node} over $500</dt><dd>{hours(r.over)}</dd>
						{/each}
						<dt>Generation-weighted average</dt><dd>{money(rangeStats.cap.avg)}<small>/MWh</small></dd>
						{#if rangeStats.sepShare !== null}<dt>Islands priced apart</dt><dd>{Math.round(rangeStats.sepShare * 100)}%<small>of the time</small></dd>{/if}
					</dl>
				</section>
			{/if}
		</div>
	</div>

	{#if tipS && view && tipS.i < view.n}
		<div class="tip" aria-hidden="true" style={tipPos}>
			<div class="tip-t">{chip(tipS.i)}</div>
			{#each tipRows(tipS.chart, tipS.i) as r}
				<div class="tip-r"><i style="--c: var({r.tok})"></i><span>{r.label}</span><b>{r.value}</b>{#if r.unit}<small>{r.unit}</small>{/if}</div>
			{/each}
		</div>
	{/if}

	<div class="p-row">
		<section class="card" class:popped={popped === 'cap'}>
			<div class="card-head">
				<div>
					<div class="ttl-row"><h2>Price captured by fuel</h2><InfoTip>What each fuel earned over the range: its output × its island's price, divided by its output. Percent is against the average of all fuels. Battery (charging) is what batteries paid to charge, left out of the average. Hover over a bar (or tap it) for its energy in GWh and what it earned or paid. <a href="/methods/prices#derived">How it's worked out</a></InfoTip></div>
					<Context range={rangeName(R.label, endT, R.days)} items={[win ? span(win.from, win.to) : '']} />
				</div>
				<PopButton open={popped === 'cap'} name="price captured by fuel chart" onclick={() => (popped = popped === 'cap' ? null : 'cap')} />
			</div>
			{#if rangeStats && rangeStats.cap.rows.length}
				<FuelBars rows={rangeStats.cap.rows} avg={rangeStats.cap.avg} />
			{:else}
				<p class="empty">{status || 'Loading…'}</p>
			{/if}
		</section>
		<section class="card" class:popped={popped === 'heat'} style={popped === 'heat' ? '--rh: 15px' : ''}>
			<div class="card-head">
				<div>
					<div class="ttl-row"><h2>Price by time of day</h2><InfoTip>{heatSeg?.kind === 'months' ? `One row per ${effInt === '1yr' ? 'year' : 'month'}: the average price in each half-hour.` : heatRows.length > 40 ? 'One row per day; scroll for earlier days.' : 'One row per day.'} {heatScaled ? 'Colours fitted to the prices shown.' : 'Colours on fixed price bands, so periods compare.'}</InfoTip></div>
					<Context range={heatShort ? (endT === null ? 'Last 7 days' : rangeName('7 days', endT, 7)) : rangeName(R.label, endT, R.days)} items={[heatSpan, NODE[heatKey]?.name, heatSeg?.kind === 'months' ? (effInt === '1yr' ? 'yearly' : 'monthly') + ' average of each half-hour' : 'each half-hour']} />
				</div>
				<div class="tools">
				<div class="seg" role="group" aria-label="Node for the heat map">
					{#each NODES.filter((nd) => nd.ref || heatHas(nd.k)) as nd}
						<button type="button" aria-pressed={heatKey === nd.k} onclick={() => { heatKey = nd.k; save(); }}>{nd.name}</button>
					{/each}
				</div>
				<button type="button" class="tog-scale" aria-pressed={heatScaled} title={heatScaled ? 'Colours fitted to the prices shown' : 'Colours on fixed price bands, so different periods compare'} onclick={() => (heatScaled = !heatScaled)}><i aria-hidden="true"></i>Scale to this view</button>
				<PopButton open={popped === 'heat'} name="price by time of day chart" onclick={() => (popped = popped === 'heat' ? null : 'heat')} />
				</div>
			</div>
			{#if heatRows.length}<HeatMap rows={heatRows} scaled={heatScaled} />{:else}<p class="empty">Loading…</p>{/if}
		</section>
	</div>

	<p class="more">How these charts are made: <a href="/methods/prices#scales">price scales</a> · <a href="/methods/prices#dispatch">dispatch and final prices</a> · <a href="/methods/prices#derived">averages, spread and shading</a></p>

	<SiteFooter />
</div>

<style>
	.plot .nav { top: calc(50% - 22px); }
	.lg-set { display: contents; }
	.lg-foot { display: none; }
	/* phones: the price chart's header in two rows (title, ⓘ and scale; then the node on long ranges), its key under
	   the chart (owner's call, 29 Oct 2026) */
	@media (max-width: 560px) {
		.chart .ch-head { gap: 6px 8px; align-items: center; }
		.chart .ch-head :global(.info-tip) { margin-left: -6px; }
		.ch-head .legends { display: contents; }
		.ch-head .lg-set { display: none; }
		.scale-pick { order: 1; }
		.node-seg { order: 2; }
		.lg-foot { display: flex; margin: 6px 0 2px; margin-left: 0; gap: 4px 12px; font-size: 0.76rem; }
	}
	.empty { color: var(--muted); font-size: 0.86rem; padding: 18px 10px; margin: 0; }
	.sep { margin: 0; font-size: 0.8rem; padding: 6px 9px; border-radius: 4px; background: var(--grid); color: var(--ink-2); }
	.sep.on { background: var(--warn-bg); color: var(--warn-ink); font-weight: 600; }
	.p-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 14px 18px; align-items: start; }
	.card { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; display: grid; gap: 10px; min-width: 0; }
	.card > :global(*) { min-width: 0; }
	.card h2 { font-size: 0.86rem; font-weight: 600; margin: 0; }
	/* the enlarge button sits in the card's top right corner (PopButton, .pop-btn in tracker.css), clear of the tools */
	.card:not(.popped) { position: relative; }
	.tog-scale { display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 0.78rem; color: var(--ink-2); background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 2px 10px; min-height: 30px; cursor: pointer; }
	.tog-scale i { width: 10px; height: 10px; border: 1.5px solid var(--accent); border-radius: 2px; background: var(--accent); }
	.tog-scale[aria-pressed='false'] { opacity: 0.6; }
	.tog-scale[aria-pressed='false'] i { background: none; }
	.card-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 12px; align-items: flex-start; padding-right: 28px; }
	.tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; max-width: 100%; }
	.tools .seg { flex-wrap: wrap; }   /* six nodes don't fit a phone's width in one row */
	.more { margin: 2px 2px 0; color: var(--muted); font-size: 0.8rem; }
	.more a { color: inherit; }
	/* big screens: the two cards split down the centre, as on the Generation tab */
	@media (min-width: 1600px) {
		.p-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
	}
	@media (max-width: 900px) {
		.p-row { grid-template-columns: minmax(0, 1fr); }
	}
</style>
