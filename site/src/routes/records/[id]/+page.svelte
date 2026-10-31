<script lang="ts">
	// One record's page: the record, how it grew since 1997, the day it fell, what it beat, and the best for each
	// month of the year. The region is ?region=NI or SI (New Zealand without it).
	import Preview from '#lib/site/Preview.svelte';
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import Progression from '#lib/records/Progression.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import ChartControls from '#lib/records/ChartControls.svelte';
	import DayChart from '#lib/records/DayChart.svelte';
	import { drawRecord, pageIsDark } from '#lib/records/shareImage.js';
	import CopyLink from '#lib/site/CopyLink.svelte';
	import { stamp } from '#lib/site/viewurl.js';
	import {
		LISTED, PERIODS, PERIOD_KEYS, periodOf, periodSub, periodWhen, REGIONS, LIVE_URL, MONTHS, def, get, notShown, parts, fmt, when, step, fullName, provisional, liveBeats, energy, pace, soFar, toGo, needText, paceAt, periodNow, figureSoFar, loadDetail, bgOf, udemOf, periodSeries, periodAxis,
		loadRecords, trimZeros, periodHours, meteredDue, clock, dayOf, dayLong, monthOf, yearOf, daysBetween, runLength, isNew as isNewRec
	} from '#lib/records/records.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const d = $derived(def(data.id)!);

	let R = $state<any>(null);
	let live = $state<any>({});
	let status = $state<'loading' | 'none' | 'ok'>('loading');
	let region = $state('NZ');
	// a half-hour record's day, week, month or year record (?period=)
	let period = $state('tp');
	const per = $derived(d.kind === 'hh' ? period : 'tp');
	let liveD = $state.raw<any>(null);
	let det = $state.raw<any>(null);   // records-detail.json: the best by month behind the progression, the record periods
	let shareMsg = $state('');   // "Link copied" for a moment after Share copies the link
	let busy = $state(false);

	onMount(() => {
		const q = new URLSearchParams(location.search).get('region');
		if (q && ['NZ', 'NI', 'SI'].includes(q) && d.regions.includes(q)) region = q;
		const qp = new URLSearchParams(location.search).get('period');
		if (qp && PERIOD_KEYS.includes(qp)) period = qp;
		(async () => {
			R = await loadRecords();
			status = R ? 'ok' : 'none';
			if (!R) return;
			loadDetail().then((x) => (det = x));
			try {
				const r = await fetch(LIVE_URL, { cache: 'no-cache' });
				if (r.ok) { liveD = await r.json(); live = liveBeats(R, liveD); }
			} catch { /* the live check is extra */ }
		})();
	});
	function setRegion(r: string) { region = r; syncUrl(); }
	function setPeriod(p: string) { period = p; syncUrl(); }
	function syncUrl() {
		const u = new URL(location.href);
		if (region === 'NZ') u.searchParams.delete('region'); else u.searchParams.set('region', region);
		if (period === 'tp') u.searchParams.delete('period'); else u.searchParams.set('period', period);
		replaceState(u, {});
	}
	// the tracker over the record's period: the day, the week, the month (30 days to its end), the year by month
	const trackerHref = (t: number) => {
		const q = (range: string, end: number, extra = '') => `/tracker?region=${region}&range=${range}&end=${ymd(end)}${extra}`;
		const nzd = (x: number) => new Date(x + 13 * 36e5);
		if (per === 'day') return q('1d', t, '&int=30m');
		if (per === 'week') return q('7d', t + 6.5 * 864e5, '&int=30m');
		if (per === 'month') { const a = nzd(t); return q('30d', Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1) - 13 * 36e5 - 864e5 / 2); }
		if (per === 'year') { const y = nzd(t).getUTCFullYear(); return q('1y', Date.UTC(y, 11, 31) - 12 * 36e5, '&int=1mo'); }
		return q('1d', t, `&int=30m&t=${stamp(t)}`);
	};

	const rec = $derived(R ? get(R, d.id, region, per) : null);
	// the faint line behind the progression: each month's (or year's) best, and how the tooltip names it
	const bg = $derived(d.kind === 'hh' ? bgOf(det, d.id, per, region) : null);
	const bgWhen = (t: number) => {
		const hi = d.id.endsWith('_min') ? 'Lowest' : 'Highest';
		if (per === 'year') return yearOf(t);
		if (per === 'month') return monthOf(t);
		return `${hi} ${per === 'tp' ? 'half-hour' : per} in ${monthOf(t)}`;
	};
	// a month or year record's running period so far: the faint line's last step (records-detail leaves it out)
	// demand records: the same line for demand with embedded solar added back, dashed, for information only
	const isDemand = $derived(d.id === 'demand_max' || d.id === 'demand_min');
	// it starts where embedded solar does (Aug 2013): before that it would sit on the faint line
	const udem = $derived.by(() => {
		const u: [number, number | null][] | null = isDemand && d.kind === 'hh' ? udemOf(det, d.id, per, region) : null;
		if (!u || !bg || u.length !== bg.length) return u;
		const i = u.findIndex((x, k) => x[1] != null && bg[k][1] != null && x[1] !== bg[k][1]);
		return i < 0 ? null : u.map((x, k) => (k < i ? [x[0], null] : x) as [number, number | null]);
	});
	const udemNow = $derived.by(() => {
		if (!udem || (per !== 'month' && per !== 'year')) return null;
		const c = periodNow(R, liveD, per);
		const a = c ? figureSoFar(c, d, region) : null, b = c ? figureSoFar(c, def('roof_max'), region) : null;
		return c && a && b ? { t: c.start, v: Math.round(a.v + b.v) } : null;
	});
	// the key over the progression: what each line is
	const bgKey = $derived(per === 'year' ? 'Each year' : per === 'month' ? 'Each month'
		: `${d.id.endsWith('_min') ? 'Lowest' : 'Highest'} ${per === 'tp' ? 'half-hour' : per} each month`);
	const bgNow = $derived.by(() => {
		if (!bg || (per !== 'month' && per !== 'year')) return null;
		const c = periodNow(R, liveD, per);
		const f = c ? figureSoFar(c, d, region) : null;
		return c && f ? { t: c.start, v: f.v } : null;
	});
	// the day, week, month or year the record fell in, for its chart
	const ser = $derived(per !== 'tp' && rec ? periodSeries(det, d.id, per, region, rec) : null);
	const serAxis = $derived(ser ? periodAxis(per, ser) : null);
	// heading for a record: this period so far, while it is on pace to beat the record (records.js pace)
	const onPace = $derived(R && liveD && per !== 'tp' ? pace(R, liveD).find((x) => x.d.id === d.id && x.region === region && x.period === per) ?? null : null);
	const na = $derived(R ? notShown(d, region, rec, R, per) : null);
	const prov = $derived(R && !na ? (per === 'tp' ? provisional(R, live, d.id, region) : (rec?.prov ?? null)) : null);
	const isNew = $derived(isNewRec(rec, per));
	const regionName = $derived(REGIONS.find((x) => x.id === region)!.name);
	const f = (v: number) => fmt(d, v, per);
	const axisFmt = (v: number) => (d.unit === '$' ? '$' + Math.round(v).toLocaleString('en-NZ') : d.unit === '%' ? `${+v.toFixed(1)}%` : Math.round(v).toLocaleString('en-NZ'));
	const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
	const ymd = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(t);
	const others = $derived(LISTED.filter((x) => x.group === d.group && x.id !== d.id));

	// when the record was set: the end of its period (a year record stands from the year's end, not its start), the
	// end of its half-hour or month, or of its run
	const recEnd = $derived.by(() => {
		if (!rec) return 0;
		if (d.kind === 'run') return rec.t + rec.v * 36e5;
		if (per !== 'tp') return rec.t + periodHours(rec.t, per) * 36e5;
		if (d.kind === 'month') return rec.t + periodHours(rec.t, 'month') * 36e5;
		return rec.t + 1800e3;
	});
	// the two charts' zoom and pinned point, for Reset zoom and Release in their headings
	let growZoom = $state<[number, number] | null>(null);
	let growPin = $state<number | null>(null);
	let dayZoom = $state<[number, number] | null>(null);
	const monYr = (t: number) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', month: 'short', year: 'numeric' }).format(t);
	// a new record, region or period starts both charts afresh
	$effect(() => { void d.id; void region; void per; growZoom = null; growPin = null; dayZoom = null; });

	// the progression's ⓘ: how many times it has been broken, what the faint line is
	const growNote = $derived.by(() => {
		if (!rec) return '';
		const tr = trimZeros(rec.steps) !== rec.steps, n = rec.steps.length - 1 - (tr ? rec.steps.findIndex((s: [number, number]) => s[1] !== 0) : 0);
		const since = tr ? `the first above zero in ${yearOf(trimZeros(rec.steps)[0][0])}` : monthOf(R.first);
		const unit = per === 'year' ? 'year' : 'month', hi = d.id.endsWith('_min') ? 'lowest' : 'highest';
		const what = per === 'year' || per === 'month' ? `each ${per}’s figure` : `the ${hi} ${per === 'tp' ? 'half-hour' : per} in each month`;
		return `${n === 0 ? (tr ? `First above zero in ${yearOf(trimZeros(rec.steps)[0][0])}` : 'Not broken since the data began') : `Broken ${n} ${n === 1 ? 'time' : 'times'} since ${since}`}.`
			+ (bg ? ` The faint line is ${what}; the ${unit} still running sits in a hatched band, its line dotted, because it isn’t finished; hovering there gives its figure so far and how long is left.` : '')
			+ (udem ? ` The dashed line is the same with embedded solar added back: what ${region === 'NZ' ? 'the country' : 'the island'} used, met partly by rooftops and small arrays behind the meter. It is there for information only, not a record, because embedded solar is modelled (from August 2013; zero before).` : '')
			+ (prov ? ' Dashed step: provisional, from dispatch data.' : '')
			+ ' Hover or tap for the record at any date; click to pin it. Drag across the chart to zoom in; Reset zoom or Escape goes back.';
	});

	// one more figure from the record's half-hour, the one that says most about it
	const extra = $derived.by(() => {
		const c = rec?.ctx;
		if (!c || d.kind !== 'hh' || per !== 'tp') return null;
		if (d.id.startsWith('demand')) return c.ren != null ? { k: 'Renewable share then', v: `${c.ren.toFixed(1)}%` } : null;
		if (d.id.startsWith('ren') || d.id.startsWith('fossil') || d.id === 'hydro_max') return { k: 'Demand then', v: `${c.demand.toLocaleString('en-NZ')} MW` };
		if (['wind_max', 'solar_max', 'roof_max'].includes(d.id)) return c.gen > 0 ? { k: 'Share of generation then', v: `${((100 * rec.v) / c.gen).toFixed(1)}%` } : null;
		if (d.id === 'price_max' || d.id === 'gap_max') return { k: 'Haywards · Benmore', v: `$${Math.round(c.hay).toLocaleString('en-NZ')} · $${Math.round(c.ben).toLocaleString('en-NZ')}` };
		if (d.id.startsWith('hvdc')) return { k: 'Haywards price then', v: `$${Math.round(c.hay).toLocaleString('en-NZ')}/MWh` };
		return null;
	});
	const history = $derived(rec?.steps ? rec.steps.slice(-8).reverse().map((s: [number, number], i: number) => {
		const before = rec.steps[rec.steps.length - 2 - i];
		return { t: s[0], v: s[1], by: before ? Math.abs(s[1] - before[1]) : null, first: !before };
	}) : []);
	const moy = $derived(R && d.kind !== 'run' && per === 'tp' ? (R.moy?.[d.id]?.[region] ?? []) : []);

	// sharing (records are made to be shared): Share opens the phone's share sheet with the record's image, a line about
	// it and its link (or the link alone where images can't be shared); on computers it copies the link. Download saves
	// the image (shareImage.js, 1200 x 630).
	const en = $derived(rec ? energy(d, rec.t, rec.v, per) : '');
	const fileName = $derived(`elenz-record-${d.id}${per !== 'tp' ? '-' + per : ''}-${region.toLowerCase()}.png`);
	const shareText = $derived(rec ? `${isNew ? 'New record: ' : ''}${fullName(d)}${per !== 'tp' ? ` (${periodOf(per).label.toLowerCase()})` : ''}, ${regionName}: ${f(rec.v)}${en ? ` (${en})` : ''}, ${d.kind === 'run' ? runLength(rec.v) + ' from ' : ''}${when(d, rec, false, per)}.` : '');
	const canShare = typeof navigator !== 'undefined' && !!navigator.share && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
	async function image(): Promise<Blob | null> {
		const c = document.createElement('canvas');
		await drawRecord(c, { d, region, rec, end: R.end, isNew, period: per });
		return await new Promise((ok) => c.toBlob(ok, 'image/png'));
	}
	// The image is drawn ahead (a moment after the record shows), so the share sheet opens straight from the tap:
	// phones refuse a share that waits on drawing first (owner's report SHR-03, 31 Oct 2026). If it isn't ready, or
	// the theme changed, the line and link go without it.
	let prepared = $state.raw<{ key: string; file: File } | null>(null);
	const imageKey = () => `${fileName}|${rec?.t}|${rec?.v}|${isNew}|${pageIsDark()}`;
	$effect(() => {
		if (!canShare || !rec || !R) return;
		const key = imageKey();
		if (prepared?.key === key) return;
		const timer = setTimeout(async () => {
			const b = await image();
			if (b && key === imageKey()) prepared = { key, file: new File([b], fileName, { type: 'image/png' }) };
		}, 500);
		return () => clearTimeout(timer);
	});
	let manual = $state('');   // a link the browser wouldn't share or copy: shown with a Copy button, by the button used
	let manualAt = $state<'top' | 'foot'>('top');
	async function share(at: 'top' | 'foot' = 'top') {
		manualAt = at;
		if (busy) return;
		const url = location.href;
		manual = '';
		if (canShare) {
			const file = prepared?.key === imageKey() ? prepared.file : null;
			// the link goes in the text too: some apps drop the url when a file is shared
			const data = file && navigator.canShare?.({ files: [file] })
				? { files: [file], title: document.title, text: `${shareText} ${url}` }
				: { title: document.title, text: shareText, url };
			try { await navigator.share(data); }
			catch (e: any) { if (e?.name !== 'AbortError') manual = url; }   // cancelled, or refused: offer the link
			return;
		}
		try { await navigator.clipboard.writeText(url); shareMsg = 'Link copied'; setTimeout(() => (shareMsg = ''), 2000); }
		catch { manual = url; }
	}
	async function download() {
		if (busy) return;
		busy = true;
		try {
			const b = await image();
			if (!b) return;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(b);
			a.download = fileName;
			document.body.append(a); a.click(); a.remove();
			setTimeout(() => URL.revokeObjectURL(a.href), 1000);
		} finally { busy = false; }
	}
</script>

<svelte:head>
	<title>{fullName(d)} · Records · ELENZ</title>
	<meta name="description" content="New Zealand's electricity record for {fullName(d).toLowerCase()} since 1997, for New Zealand and each island: the record, how it grew, and the day it fell." />
	<Preview title="{fullName(d)} · New Zealand electricity records" description="New Zealand's electricity record for {fullName(d).toLowerCase()} since 1997, for New Zealand and each island: the record, how it grew, and the day it fell." path="/records/{data.id}" />
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="rec-one">
		<div class="head">
			<p class="crumb"><a href="/records{(() => { const q = new URLSearchParams(); if (region !== 'NZ') q.set('region', region); if (period !== 'tp') q.set('period', period); const x = q.toString(); return x ? '?' + x : ''; })()}">Records</a> › {d.group}</p>
			<div class="h-row">
				<h1><span class="dot" style="--c:var({d.tok})"></span>{fullName(d)}{#if d.est}<span class="tag est">Estimate</span>{/if}</h1>
				<div class="acts">
					{#if d.regions.length > 1}
						<select class="pick" aria-label="Region" value={region} onchange={(e) => setRegion((e.currentTarget as HTMLSelectElement).value)}>
							{#each REGIONS as r}<option value={r.id}>{r.name}</option>{/each}
						</select>
					{/if}
					{#if rec && !na}
						<button type="button" class="pill-btn" onclick={() => share('top')} disabled={busy} title={canShare ? 'Share this record' : 'Copy a link to this record'} aria-label={canShare ? 'Share this record' : 'Copy a link to this record'}>
							<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3.2 3.2 0 0 0 4.6 0l2.6-2.6a3.2 3.2 0 0 0-4.6-4.6l-1 1M11.5 8.5a3.2 3.2 0 0 0-4.6 0l-2.6 2.6a3.2 3.2 0 0 0 4.6 4.6l1-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
							<span class="pill-word">{shareMsg || 'Share'}</span>
						</button>
						<button type="button" class="pill-btn" onclick={download} disabled={busy} title="Download the record as an image" aria-label="Download the record as an image">
							<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9M6 8.5l4 4 4-4M4 15.5h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
							<span class="pill-word">Download</span>
						</button>
					{/if}
				</div>
			</div>
			{#if manual && manualAt === 'top'}<div class="manual"><CopyLink url={manual} onclose={() => (manual = '')} /></div>{/if}
			<p class="sub">{periodSub(d, per)}</p>
			{#if d.kind === 'hh'}
				<div class="seg per" role="group" aria-label="Record for each">
					{#each PERIODS as p}
						<button type="button" aria-pressed={per === p.k} onclick={() => setPeriod(p.k)}>{p.label}</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if status === 'loading'}
			<p class="note" role="status">Loading the record…</p>
		{:else if status === 'none'}
			<section class="panel"><p>The records will appear once the history rebuild finishes, in the next few days.</p></section>
		{:else if na || !rec}
			<section class="panel"><p>{na ?? 'No record yet'} ({regionName}).</p><p><a href="/records">All records</a></p></section>
		{:else}
			<section class="panel hero-rec" aria-label="The record">
				<div class="big">
					<span class="lbl">{regionName}{#if isNew} <span class="tag new">New</span>{/if}</span>
					<span class="val">{parts(d, rec.v, per).n}<small>{parts(d, rec.v, per).u}</small></span>
					{#if en}<span class="en">{en} over the {periodOf(per).word}</span>{/if}
					<span class="when">{d.kind === 'run' ? runLength(rec.v) + ', ' : ''}{when(d, rec, true, per)}</span>
				</div>
				<dl class="stats">
					{#if d.kind === 'run'}
						{#if rec.top?.[1]}<div><dt>Next longest</dt><dd>{parts(d, rec.top[1][1]).n} hours</dd><dd class="s">from {dayOf(rec.top[1][0])}</dd></div>{/if}
					{:else if rec.prev}
						<div><dt>Previous record</dt><dd>{f(rec.prev[1])}</dd><dd class="s">{per !== 'tp' ? periodWhen(rec.prev[0], per) : d.kind === 'month' ? monthOf(rec.prev[0]) : dayOf(rec.prev[0])}{energy(d, rec.prev[0], rec.prev[1], per) ? ` · ${energy(d, rec.prev[0], rec.prev[1], per)}` : ''}</dd></div>
					{/if}
					{#if !rec.ongoing}
						<div><dt>Has stood for</dt><dd>{daysBetween(recEnd, Date.now()).toLocaleString('en-NZ')} days</dd><dd class="s">since {dayOf(recEnd)}</dd></div>
					{/if}
					<div><dt>Broken</dt><dd>{rec.n} {rec.n === 1 ? 'time' : 'times'}</dd><dd class="s">since {monthOf(R.first)}</dd></div>
					{#if extra}<div><dt>{extra.k}</dt><dd>{extra.v}</dd></div>{/if}
				</dl>
			</section>

			{#if onPace}
				<section class="pace" aria-label="Heading for a record">
					<span class="tag pacetag">On record pace</span>
					<p><b>{soFar(onPace)}: {fmt(d, onPace.v, per)} {paceAt(onPace)}</b>, ahead of the record {periodOf(per).word} ({periodWhen(onPace.bestT, per)}{onPace.provBest ? ', provisional' : ''}), which had {fmt(d, onPace.ref, per)} at the same point and finished at {fmt(d, onPace.best, per)}. {cap(toGo(onPace))}. {needText(onPace)}
						From dispatch data, so provisional until the metered data confirms it.</p>
				</section>
			{/if}

			{#if prov}
				<section class="prov" aria-label="Provisional record">
					<span class="tag provtag">Provisional</span>
					<p>{prov.src === 'live' ? 'Live data shows' : 'Dispatch data shows'} <b>{f(prov.v)}</b>
						{per === 'day' ? `on ${dayOf(prov.t)}` : per === 'week' ? `in the week of ${dayOf(prov.t)}` : per === 'month' ? `in ${monthOf(prov.t)}` : per === 'year' ? `in ${yearOf(prov.t)}`
							: d.kind === 'hh' ? `in the ${clock(prov.t)} half-hour on ${dayOf(prov.t)}` : d.kind === 'run' ? `from ${dayOf(prov.t)}` : `in ${monthOf(prov.t)}`},
						beyond the record. Dispatch data runs a little above the metered data, so it is confirmed or dropped when the EA publishes the metered data, around {meteredDue(per === 'week' ? prov.t + 6.5 * 864e5 : per === 'year' ? Date.UTC(+yearOf(prov.t), 11, 15) : prov.t)}.</p>
				</section>
			{/if}

			<section class="panel" aria-labelledby="grow-h">
				<div class="p-head"><div class="ttl-row"><h2 id="grow-h">How the record grew</h2><InfoTip label="About this chart">{growNote} <a href="/methods/records">How records work</a></InfoTip></div><div class="ctls">{#if growZoom || growPin !== null}<ChartControls zoomed={!!growZoom} pinned={growPin !== null} text={growZoom ? `${monYr(growZoom[0])} – ${monYr(growZoom[1])}` : ''} onreset={() => (growZoom = null)} onrelease={() => (growPin = null)} />{/if}</div></div>
				<ul class="key" aria-label="Key">
					<li><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" style="stroke:var({d.tok})" stroke-width="2.4" /></svg>Record</li>
					{#if bg}<li><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" style="stroke:var({d.tok})" stroke-width="1.2" opacity="0.35" /></svg>{bgKey}</li>{/if}
					{#if bg}<li><svg width="14" height="12" aria-hidden="true"><defs><pattern id="key-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="var(--muted)" stroke-width="1" opacity="0.5" /></pattern></defs><rect width="14" height="12" fill="url(#key-hatch)" /></svg>{per === 'year' ? 'This year' : 'This month'} so far</li>{/if}
					{#if udem}<li><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" style="stroke:var({d.tok})" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.6" /></svg>With embedded solar added back <span class="muted">(estimate, not a record)</span></li>{/if}
				</ul>
				<Progression steps={rec.steps} first={R.first} end={R.end} tok={d.tok} fmt={axisFmt} full={f} {bg} {bgWhen} now={bgNow} info={udem} infoNow={udemNow} infoLabel="With embedded solar" bind:zoom={growZoom} bind:pin={growPin} dashed={!!d.est} prov={prov ? { t: prov.t, v: prov.v } : null} when={(t) => per !== 'tp' ? periodWhen(t, per) : d.kind === 'month' ? monthOf(t) : d.kind === 'run' ? dayOf(t) : `${clock(t)}, ${dayOf(t)}`}
					label="{fullName(d)}, {regionName}: the record over time, from {f(rec.steps[0][1])} in {yearOf(rec.steps[0][0])} to {f(rec.v)} in {yearOf(rec.t)}, broken {rec.n} times" />
			</section>

			<div class="two">
				{#if per !== 'tp'}
					<section class="panel" aria-labelledby="day-h">
						<!-- the period in the title, the rest in the ⓘ, as on the other charts (owner's report REC-05, 26 Oct 2026) -->
						<div class="p-head"><div class="ttl-row"><h2 id="day-h">The {periodOf(per).word} it fell <span class="h-when">{periodWhen(rec.t, per, true)}</span></h2><InfoTip label="About this chart">{parts(d, rec.v, per).n} {parts(d, rec.v, per).u}{en ? ` (${en})` : ''}{d.unit === '%' ? ' of its generation renewable' : ''}{rec.prev ? `, beating ${f(rec.prev[1])} (${periodWhen(rec.prev[0], per)})` : ''}. The dashed line is the record’s average. Open it in the tracker to see what happened through it. <a href="/methods/records">How records work</a></InfoTip></div><div class="ctls"><ChartControls zoomed={!!dayZoom} onreset={() => (dayZoom = null)} /><a class="link" href={trackerHref(rec.t)}>Open in the tracker</a></div></div>
						{#if ser && serAxis}
							<DayChart day={ser} t={-1} tok={d.tok} fmt={axisFmt} full={f} xticks={serAxis.ticks} tipAt={serAxis.tip} labAt={serAxis.lab} bind:zoom={dayZoom} avg={rec.v} avgLabel="Average {f(rec.v)}"
								label="{fullName(d)} through {periodWhen(rec.t, per, true)}, {per === 'day' ? 'half-hourly' : per === 'week' ? 'hourly' : per === 'month' ? 'daily' : 'weekly'}, averaging {f(rec.v)}" />
						{/if}
					</section>
				{:else if d.kind === 'hh' && rec.ctx}
					{@const c = rec.ctx}
					<section class="panel" aria-labelledby="day-h">
						<div class="p-head"><div class="ttl-row"><h2 id="day-h">The day it fell <span class="h-when">{dayLong(rec.t)}, {clock(rec.t)}</span></h2><InfoTip label="About this chart">The figures under the chart are for the {clock(rec.t)} half-hour, {regionName === 'New Zealand' ? 'across New Zealand' : `in the ${regionName}`}: metered generation and demand, final prices. <a href="/methods/records">How records work</a></InfoTip></div><div class="ctls"><ChartControls zoomed={!!dayZoom} onreset={() => (dayZoom = null)} /><a class="link" href={trackerHref(rec.t)}>Open in the tracker</a></div></div>
						<DayChart day={c.day} t={rec.t} tok={d.tok} fmt={axisFmt} bind:zoom={dayZoom} label="{fullName(d)} through {dayLong(rec.t)}, half-hourly, peaking at {f(rec.v)} at {clock(rec.t)}" />
						<dl class="facts">
							<div><dt>Demand</dt><dd>{c.demand.toLocaleString('en-NZ')} MW</dd></div>
							<div><dt>Generation</dt><dd>{c.gen.toLocaleString('en-NZ')} MW</dd></div>
							{#if c.ren != null}<div><dt>Renewable</dt><dd>{c.ren.toFixed(1)}%</dd></div>{/if}
							<div><dt>Prices</dt><dd>HAY ${Math.round(c.hay).toLocaleString('en-NZ')} · BEN ${Math.round(c.ben).toLocaleString('en-NZ')}</dd></div>
							{#if c.hvdc != null}<div><dt>HVDC</dt><dd>{Math.abs(c.hvdc).toLocaleString('en-NZ')} MW {c.hvdc > 0 ? 'north' : c.hvdc < 0 ? 'south' : ''}</dd></div>{/if}
							{#if c.top?.length}<div class="wide"><dt>Biggest {d.id === 'wind_max' ? 'wind farms' : 'solar farms'}</dt><dd>{c.top.map((p: [string, number]) => `${p[0]} ${p[1]} MW`).join(', ')}</dd></div>{/if}
						</dl>
					</section>
				{/if}

				<section class="panel" aria-labelledby="prev-h">
					{#if d.kind === 'run'}
						<h2 id="prev-h">Longest runs</h2>
						<table class="lst">
							<thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col" class="n">Hours</th></tr></thead>
							<tbody>
								{#each rec.top as [t, h, ongoing]}
									<tr><td>{dayOf(t)}</td><td>{ongoing ? 'still going' : dayOf(t + h * 36e5)}</td><td class="n">{parts(d, h).n}</td></tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<h2 id="prev-h">Recent records</h2>
						<table class="lst">
							<thead><tr><th scope="col">{per !== 'tp' ? periodOf(per).label : d.kind === 'month' ? 'Month' : 'Half-hour'}</th><th scope="col" class="n">Record</th>{#if en}<th scope="col" class="n">Energy</th>{/if}<th scope="col" class="n">{d.id.endsWith('_min') ? 'Down' : 'Up'}</th></tr></thead>
							<tbody>
								{#each history as h}
									<tr><td>{per !== 'tp' ? periodWhen(h.t, per) : d.kind === 'month' ? monthOf(h.t) : `${clock(h.t)}, ${dayOf(h.t)}`}</td><td class="n">{f(h.v)}</td>{#if en}<td class="n">{energy(d, h.t, h.v, per)}</td>{/if}<td class="n muted">{h.first ? 'first' : d.unit === '%' ? (h.by ?? 0).toFixed(1) : parts(d, h.by ?? 0).n}</td></tr>
								{/each}
							</tbody>
						</table>
						{#if rec.n > 8}<p class="note">The {rec.n - 7} before these are on the chart above.</p>{/if}
					{/if}
				</section>
			</div>

			{#if moy.length}
				<section class="panel" aria-labelledby="moy-h">
					<div class="p-head"><h2 id="moy-h">Best for each month of the year</h2><span class="unit">{regionName}</span></div>
					<div class="moy">
						{#each MONTHS as m, i}
							{@const tv = moy[i]}
							<div class="mcell"><span class="m">{m.slice(0, 3)}</span><span class="v">{tv ? parts(d, tv[1]).n : '–'}</span><span class="y">{tv ? yearOf(tv[0]) : ''}</span></div>
						{/each}
					</div>
				</section>
			{/if}

			<div class="share">
				<div class="btns">
					<button type="button" class="btn" onclick={() => share('foot')} disabled={busy}>{shareMsg || (canShare ? 'Share' : 'Copy link')}</button>
					<button type="button" class="btn" onclick={download} disabled={busy}>Download image</button>
				</div>
				{#if manual && manualAt === 'foot'}<div class="manual"><CopyLink url={manual} onclose={() => (manual = '')} /></div>{/if}
				<span class="note">{per === 'tp' ? 'Half-hour averages' : `Averages over each ${periodOf(per).word}${en ? ', ranked by average so periods of different lengths compare; energy is the average times the hours in the period' : ''}`} from the EA’s metered data and final prices. <a href="/methods/records">How records work</a></span>
			</div>
		{/if}

		<nav class="others" aria-label="Other {d.group.toLowerCase()} records">
			<h2>Other {d.group.toLowerCase()} records</h2>
			<ul>
				{#each others as o}
					<li><a href="/records/{o.id}{region === 'NZ' ? '' : `?region=${region}`}"><span class="dot" style="--c:var({o.tok})"></span>{fullName(o)}</a></li>
				{/each}
				<li><a href="/records{region === 'NZ' ? '' : `?region=${region}`}">All records</a></li>
			</ul>
		</nav>
	</main>

	<SiteFooter />
</div>

<style>
	/* the period a chart shows, after its title (REC-05) */
	.h-when { font-weight: 500; color: var(--ink-2); margin-left: 4px; }
	.rec-one { display: grid; gap: 14px; }
	.head { display: grid; gap: 6px; padding-block: 6px 2px; }
	.crumb { margin: 0; color: var(--muted); font-size: 0.82rem; }
	.crumb a, .link, .others a, .note a { color: var(--accent); }
	.h-row { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; }
	h1 { font-size: 1.6rem; letter-spacing: -0.02em; line-height: 1.15; display: flex; align-items: center; flex-wrap: wrap; }
	.sub { margin: 0; color: var(--ink-2); }
	.per { justify-self: start; flex-wrap: wrap; }
	.per button { min-height: 32px; padding-inline: 12px; font-size: 0.84rem; }
	.dot { display: inline-block; flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--c); margin-right: 10px; }
	.tag { display: inline-block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em; padding: 1px 7px; border-radius: 999px; background: var(--grid); color: var(--ink-2); margin-left: 8px; white-space: nowrap; }
	.tag.new { background: var(--warn-bg); color: var(--warn-ink); }
	.tag.est { background: transparent; border: 1px solid var(--line); color: var(--muted); }
	.tag.provtag { background: transparent; border: 1px dashed var(--warn-ink); color: var(--warn-ink); margin-left: 0; }

	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.panel p { margin: 0; }
	.p-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.key { list-style: none; margin: 4px 0 2px; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 0.78rem; color: var(--ink-2); }
	.key li { display: inline-flex; align-items: center; gap: 6px; }
	.key .muted { color: var(--muted); }
	.p-head .ctls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 28px; }
	h2 { font-size: 1rem; }
	.unit, .note { color: var(--muted); font-size: 0.8rem; }
	.note { margin: 0; }

	.hero-rec { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px 32px; padding: 18px 20px; }
	.big { display: grid; gap: 6px; }
	.lbl { color: var(--ink-2); font-size: 0.82rem; font-weight: 600; }
	.big .val { font-family: var(--font-data); font-size: 3rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
	.big .val small { font-family: var(--font-ui); font-size: 1.1rem; font-weight: 500; color: var(--muted); margin-left: 8px; letter-spacing: 0; }
	.when { color: var(--ink-2); }
	.en { font-family: var(--font-data); font-size: 1.15rem; font-weight: 500; color: var(--ink-2); }
	.acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	/* labelled on phones too (the tracker's pill buttons shrink to icons there) */
	.acts .pill-btn { height: 34px; width: auto; padding: 0 12px 0 10px; border-color: var(--line); border-radius: 999px; }
	.acts .pill-btn .pill-word { display: inline; }
	.acts .pill-btn:disabled { opacity: 0.6; cursor: progress; }
	.stats { display: grid; grid-template-columns: repeat(2, minmax(0, auto)); gap: 14px 36px; margin: 0; }
	.stats dt, .facts dt { color: var(--muted); font-size: 0.76rem; }
	.stats dd { margin: 2px 0 0; font-family: var(--font-data); font-size: 1.1rem; font-weight: 600; }
	.stats dd.s { font-family: var(--font-ui); font-size: 0.78rem; font-weight: 400; color: var(--muted); margin-top: 0; }

	.prov { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; border: 1px dashed color-mix(in srgb, var(--warn-ink) 55%, var(--line)); background: color-mix(in srgb, var(--warn-bg) 45%, var(--surface)); border-radius: 4px; }
	.prov p { margin: 0; color: var(--ink-2); font-size: 0.86rem; }
	.pace { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent-soft) 60%, var(--surface)); border-radius: 4px; }
	.pace p { margin: 0; color: var(--ink-2); font-size: 0.86rem; }
	.pace b { color: var(--ink); }
	.tag.pacetag { background: var(--accent); color: var(--surface); margin-left: 0; }
	@media (max-width: 640px) { .pace, .prov { flex-direction: column; gap: 6px; } }

	.two { display: flex; gap: 14px; flex-wrap: wrap; align-items: start; }
	.two > :first-child { flex: 999 1 520px; }
	.two > :last-child { flex: 1 1 320px; }
	.two > .panel { min-width: 0; }
	.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px 16px; margin: 0; }
	.facts dd { margin: 2px 0 0; font-family: var(--font-data); font-size: 0.9rem; }
	.facts .wide { grid-column: 1 / -1; }
	.facts .wide dd { font-family: var(--font-ui); }

	.lst { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
	.lst th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 0; border-bottom: 1px solid var(--line); }
	.lst td { padding: 7px 0; border-bottom: 1px solid var(--grid); }
	.lst tr:last-child td { border-bottom: 0; }
	.lst .n { text-align: right; font-family: var(--font-data); padding-left: 14px; white-space: nowrap; }
	.lst th.n { font-family: var(--font-ui); }
	.muted { color: var(--muted); }

	.moy { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px; }
	.mcell { display: grid; gap: 2px; text-align: center; padding: 8px 2px; border-radius: 4px; background: color-mix(in srgb, var(--grid) 55%, transparent); }
	.mcell .m { font-size: 0.72rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
	.mcell .v { font-family: var(--font-data); font-size: 0.86rem; font-weight: 600; }
	.mcell .y { font-size: 0.72rem; color: var(--muted); }

	.manual { max-width: 520px; flex-basis: 100%; }
	.share { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 14px; }
	.btns { display: flex; gap: 8px; }
	.btn { font: inherit; font-size: 0.86rem; font-weight: 600; padding: 9px 14px; min-height: 40px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 4px; cursor: pointer; }
	.btn:hover { border-color: var(--ink-2); }

	.others h2 { font-size: 0.9rem; margin-bottom: 6px; }
	.others ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
	.others a { display: inline-flex; align-items: center; font-size: 0.86rem; }
	.others .dot { width: 9px; height: 9px; margin-right: 6px; }

	@media (max-width: 760px) {
		.hero-rec { grid-template-columns: minmax(0, 1fr); }
		.moy { grid-template-columns: repeat(6, minmax(0, 1fr)); }
	}
	@media (max-width: 640px) {
		h1 { font-size: 1.3rem; }
		.big .val { font-size: 2.3rem; }
	}
</style>
