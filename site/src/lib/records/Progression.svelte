<script lang="ts">
	// How a record grew: a step line from the first data to today, one step each time it was broken, the current
	// record marked, and a provisional one (dashed) beyond it. Hover shows the record at that date; a click, tap or
	// touch drag pins it (it stays after the finger lifts; Release, another click on it, a tap outside the chart or
	// Escape lets go). On touch the tooltip sits above the chart, clear of the finger. A mouse drag across the chart
	// zooms into that span (at least two months; the axes follow); Reset zoom or Escape goes back. bg: the best of
	// each month (or year) through the history, drawn faintly behind the record line (records.py build_detail), so the
	// near misses show; the tooltip gives the record in force at the pointer's date and that month's best. The month
	// (or year) still running is drawn as it stands so far across the whole period (the chart's dates run on to its
	// end), dotted, in a hatched band (a wash like the tracker's partial periods didn't show on a single line; owner,
	// 25 Oct 2026), and the tooltip there says "so far" and how long is left ("6 days to go"). Month and year
	// records leave the running period out of `bg` (it isn't whole), so the page passes its figure so far as `now` ({ t: its start, v }). info (demand records only): the same line for demand with embedded solar
	// added back, drawn dashed above the faint line for information (embedded solar is modelled, so it is never a
	// record), with infoNow for its running period and infoLabel naming it in the tooltip. The page's ⓘ beside the heading explains the chart; zoom and pin are bound
	// to the page, which shows Reset zoom and Release in the card's heading (ChartControls).
	import { trimZeros, bgEnd, hoursToGo, periodStart } from './records.js';

	// fmt: axis labels (bare numbers); full: a value with its unit, for the tooltip and readout (fmt if not given)
	let { steps: all, first: dataFirst, end, tok = '--ink', label, fmt, full, prov = null, dashed = false, when, bg = null, bgWhen, now = null, info = null, infoNow = null, infoLabel = 'With embedded solar', zoom = $bindable(null), pin = $bindable(null) }:
		{ steps: [number, number][]; first: number; end: number; tok?: string; label: string; fmt: (v: number) => string;
		  full?: (v: number) => string; prov?: { t: number; v: number } | null; dashed?: boolean; when?: (t: number) => string;
		  bg?: [number, number | null][] | null; bgWhen?: (t: number) => string;
		  now?: { t: number; v: number } | null; info?: [number, number | null][] | null; infoNow?: { t: number; v: number } | null;
		  infoLabel?: string; zoom?: [number, number] | null; pin?: number | null } = $props();
	const val = (v: number) => (full ?? fmt)(v);
	// leading zeros left out (grid solar until its first farm): the chart starts at the first record above zero
	const steps = $derived(trimZeros(all) as [number, number][]);
	const trimmed = $derived(steps !== all);
	const first = $derived(trimmed ? steps[0][0] : dataFirst);
	const whenOf = (t: number) => when ? when(t) : new Date(t).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' });
	const uid = $props.id();

	// drawn at the width it is shown, so labels stay readable on phones
	let cw = $state(1000);
	const W = $derived(Math.max(320, Math.min(1000, cw)));
	const H = $derived(W < 600 ? 220 : 300);
	const L = 64, Rm = 18, T = 16, B = 30;
	const pts = $derived(prov ? [...steps, [prov.t, prov.v] as [number, number]] : steps);
	const t1 = $derived(Math.max(end, pts[pts.length - 1][0]));
	const bgYear = $derived(!!bg && bg.length > 1 && bg[1][0] - bg[0][0] > 200 * 864e5);
	// the background line within the chart's dates, with the running period's figure so far (now) in place of its gap;
	// each entry holds until the next (or its own period's end)
	function within(line: [number, number | null][] | null, nw: { t: number; v: number } | null) {
		if (!line) return [];
		const a = line.filter((b) => b[0] >= first - 31 * 864e5 && b[0] <= t1 && !(nw && b[0] >= nw.t));
		return nw && a.length ? [...a, [nw.t, nw.v] as [number, number | null]] : a;
	}
	const bgIn = $derived(within(bg, now));
	const infoIn = $derived(within(info, infoNow));
	// the period still running: the faint line's last month (or year), if it ends after the data; drawn across its
	// whole span, dotted in a hatched band, and the chart's dates run on to its end
	const cur = $derived.by(() => {
		const b = bgIn[bgIn.length - 1];
		if (!b || b[1] == null) return null;
		const to = bgEnd(b[0], bgYear);
		return to > t1 ? { t: b[0], v: b[1], to } : null;
	});
	const tx = $derived(cur ? cur.to : t1);
	const segsOf = (line: [number, number | null][]) => line.map(([t, v], i) => ({ t, v, to: i + 1 < line.length ? line[i + 1][0] : cur && t === cur.t ? cur.to : Math.min(t1, bgEnd(t, bgYear)) }));
	const segs = $derived(segsOf(bgIn));
	const isegs = $derived(segsOf(infoIn));

	// zoom: [from, to] in time, or the whole history
	const MIN_ZOOM = 61 * 864e5;
	const za = $derived(zoom ? zoom[0] : first);
	const zb = $derived(zoom ? zoom[1] : tx);

	// a round axis that holds every value shown (from zero for most records: the growth is the point)
	function niceStep(span: number) {
		const raw = span / 4, p = 10 ** Math.floor(Math.log10(raw || 1)), m = raw / p;
		return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
	}
	const ax = $derived.by(() => {
		const inView = (a: number, b: number) => b > za && a < zb;
		const vs: number[] = [];
		pts.forEach(([t, v], i) => { if (inView(t, i + 1 < pts.length ? pts[i + 1][0] : t1 + 1)) vs.push(v); });
		for (const s of [...segs, ...isegs]) if (s.v != null && inView(s.t, s.to)) vs.push(s.v);
		if (!vs.length) vs.push(pts[pts.length - 1][1]);
		let lo = Math.min(...vs), hi = Math.max(...vs);
		if (lo >= 0 && lo < 0.5 * hi) lo = 0;   // from zero unless the values span a narrow range
		if (hi === lo) hi = lo + 1;
		const st = niceStep(hi - lo);
		lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
		const ticks = [];
		for (let v = lo; v <= hi + st / 2; v += st) ticks.push(v);
		return { lo, hi, ticks };
	});
	const x = (t: number) => L + ((t - za) / (zb - za)) * (W - L - Rm);
	const y = (v: number) => T + (1 - (v - ax.lo) / (ax.hi - ax.lo)) * (H - T - B);
	const path = $derived.by(() => {
		let d = `M${x(steps[0][0]).toFixed(1)} ${y(steps[0][1]).toFixed(1)}`;
		for (const [t, v] of steps.slice(1)) d += ` H${x(t).toFixed(1)} V${y(v).toFixed(1)}`;
		return d + (prov ? ` H${x(prov.t).toFixed(1)}` : ` H${x(t1).toFixed(1)}`);
	});
	// x labels: years, or months when zoomed in (every 1, 2, 3 or 6 months; January carries the year)
	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const xticks = $derived.by(() => {
		const nzStart = (y: number, m: number) => Date.UTC(y, m, 1) - 13 * 36e5;
		const months = (zb - za) / (30.44 * 864e5), fit = Math.max(2, (W - L - Rm) / 80);
		const k = [1, 2, 3, 6, 12, 24, 60, 120].find((k) => months / k <= fit) ?? 120;
		const a = new Date(za + 13 * 36e5), out = [];
		for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); ; m++) {
			if (m === 12) { m = 0; y++; }
			const t = nzStart(y, m);
			if (t > zb) break;
			if (k >= 12 ? m === 0 && y % (k / 12) === 0 : m % k === 0) out.push({ t, l: m === 0 ? String(y) : MON[m] });
		}
		return out.filter((q) => q.t >= za && x(q.t) > L + 14);
	});
	const last = $derived(steps[steps.length - 1]);
	// each month (or year) holds its value until the next: drawn as flat steps, broken where there is none
	function flat(list: { t: number; v: number | null; to: number }[]) {
		let d = '', pen = false;
		for (const s of list) {
			if (s.v == null) { pen = false; continue; }
			d += `${pen ? 'L' : 'M'}${x(s.t).toFixed(1)} ${y(s.v).toFixed(1)} H${x(s.to).toFixed(1)}`;
			pen = true;
		}
		return d;
	}
	// the running period goes on its own (dotted, in the hatched band), joined to the one before it
	const running = (list: { t: number; v: number | null; to: number }[]) => !!cur && list.length > 0 && list[list.length - 1].t === cur.t;
	const bgPath = $derived(flat(running(segs) ? segs.slice(0, -1) : segs));
	const infoPath = $derived(flat(running(isegs) ? isegs.slice(0, -1) : isegs));
	function curOf(list: { t: number; v: number | null; to: number }[]) {
		if (!cur || !running(list)) return '';
		const c = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null;
		if (c.v == null) return '';
		const y0 = prev && prev.v != null && prev.to >= c.t ? y(prev.v) : y(c.v);
		return `M${x(c.t).toFixed(1)} ${y0.toFixed(1)} V${y(c.v).toFixed(1)} H${x(c.to).toFixed(1)}`;
	}
	const infoCur = $derived(curOf(isegs));
	// the running period, joined to the one before it, dotted
	const curPath = $derived(curOf(segs));
	// the hatched band over the running period, within the plot
	const band = $derived.by(() => {
		if (!cur) return null;
		const a = Math.max(L, x(cur.t)), b = Math.min(W - Rm, x(cur.to));
		return b <= L || a >= W - Rm ? null : { a, b };
	});

	// the pointer's date (hov: under the mouse; pin: clicked, tapped or dragged to); the record in force then and that
	// month's best follow from it
	let hov = $state<number | null>(null);
	let touch = $state(false);               // the last pointer was a finger or pen
	const hoverT = $derived(hov ?? pin);
	const hover = $derived.by(() => {
		if (hoverT === null || hoverT < pts[0][0]) return null;
		let i = 0;
		while (i + 1 < pts.length && pts[i + 1][0] <= hoverT) i++;
		return i;
	});
	function segAt(list: { t: number; v: number | null; to: number }[]) {
		if (hoverT === null) return null;
		let b = null;
		for (const s of list) if (s.t <= hoverT) b = s; else break;
		return b && b.v != null && hoverT < b.to + 864e5 ? b : null;
	}
	const bgAt = $derived(segAt(segs));
	const infoAt = $derived(segAt(isegs));
	// in the period still running: how long is left of it, from now
	// (counted from the start of today, as "Heading for a record" does, until the last two days, then from now)
	const left = $derived.by(() => {
		if (!cur || hoverT === null || hoverT < cur.t) return null;
		const nowT = Date.now(), fromNow = (cur.to - nowT) / 36e5;
		return hoursToGo(Math.max(0, fromNow < 48 ? fromNow : (cur.to - periodStart(nowT, 'day')) / 36e5));
	});
	const ahead = $derived(hoverT !== null && hoverT > t1);   // past the record line's end: only the faint line goes on

	let fig = $state<HTMLElement>();
	const pxOf = (e: PointerEvent) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
	const tOf = (px: number) => za + ((px - L) / (W - L - Rm)) * (zb - za);
	function at(e: PointerEvent) {
		const t = tOf(pxOf(e));
		return t < pts[0][0] ? null : Math.max(za, Math.min(t, zb));
	}
	// a mouse drag: from where it was pressed to where the pointer is, in px; a few pixels is still a click
	let drag = $state<{ a: number; b: number } | null>(null);
	let dragged = false;
	function down(e: PointerEvent) {
		move(e);
		if (e.pointerType === 'mouse' && e.button === 0) {
			const px = pxOf(e);
			drag = { a: px, b: px }; dragged = false;
			(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
		}
	}
	function up() {
		if (!drag) return;
		const d = drag; drag = null;
		if (Math.abs(d.b - d.a) < 6) return;
		dragged = true;
		let a = Math.max(first, tOf(Math.min(d.a, d.b))), b = Math.min(tx, tOf(Math.max(d.a, d.b)));
		if (b - a < MIN_ZOOM) { const m = (a + b) / 2; a = Math.max(first, m - MIN_ZOOM / 2); b = Math.min(tx, a + MIN_ZOOM); a = Math.max(first, b - MIN_ZOOM); }
		zoom = a <= first && b >= tx ? null : [a, b];
	}
	function move(e: PointerEvent) {
		touch = e.pointerType !== 'mouse';
		if (touch) { pin = at(e); hov = null; } else hov = at(e);
		if (drag) drag.b = Math.max(L, Math.min(W - Rm, pxOf(e)));
	}
	function click(e: MouseEvent) {
		if (touch) return;   // a tap pinned it already
		if (dragged) { dragged = false; return; }   // the end of a zoom drag, not a click
		const t = at(e as PointerEvent);
		// a click near the pinned date lets go; elsewhere it moves the pin
		pin = t === null || (pin !== null && Math.abs(x(t) - x(pin)) < 8) ? null : t;
	}
	function outside(e: Event) {
		if (e instanceof KeyboardEvent) {
			if (e.key !== 'Escape') return;
			if (pin !== null) pin = null; else if (zoom) zoom = null;
			return;
		}
		if (pin !== null && fig && !fig.contains(e.target as Node)) pin = null;
	}
</script>

<svelte:window onpointerdown={outside} onkeydown={outside} />

<figure class="prog" bind:clientWidth={cw} bind:this={fig}>
	<div class="plot">
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (pointer readout; the readout and the table below carry the figures) -->
	<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label={label} onpointermove={move} onpointerdown={down} onpointerup={up} onclick={click} onpointerleave={() => (hov = null)} class:zoomable={!touch}>
		<defs>
			<clipPath id="{uid}-clip"><rect x={L} y={T - 8} width={W - L - Rm} height={H - T - B + 16} /></clipPath>
			<pattern id="{uid}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hatch" /></pattern>
		</defs>
		{#if band}
			<!-- the period still running: a hatched band behind everything -->
			<rect class="part" x={band.a} y={T} width={band.b - band.a} height={H - T - B} fill="url(#{uid}-hatch)" />
			<line class="part-edge" x1={band.a} x2={band.a} y1={T} y2={H - B} />
		{/if}
		{#each ax.ticks as v}
			<line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} class="grid" />
			<text x={L - 8} y={y(v) + 4} text-anchor="end" class="lab">{fmt(v)}</text>
		{/each}
		{#each xticks as q}
			<text x={x(q.t)} y={H - 8} text-anchor="middle" class="lab">{q.l}</text>
		{/each}
		<g clip-path="url(#{uid}-clip)">
			{#if bgPath}<path d={bgPath} fill="none" class="bg" style="stroke:var({tok})" />{/if}
			<!-- information only (demand with embedded solar added back): dashed, never a record -->
			{#if infoPath}<path d={infoPath} fill="none" class="bg info" style="stroke:var({tok})" />{/if}
			{#if infoCur}<path d={infoCur} fill="none" class="bg info cur" style="stroke:var({tok})" />{/if}
			{#if cur}
				<!-- the period still running, as it stands so far: dotted -->
				{#if curPath}<path d={curPath} fill="none" class="bg cur" style="stroke:var({tok})" />{/if}
			{/if}
			<path d={path} fill="none" style="stroke:var({tok})" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray={dashed ? '6 3' : undefined} />
			{#if prov}
				<path d="M{x(prov.t)} {y(last[1])} V{y(prov.v)} H{x(t1)}" fill="none" style="stroke:var({tok})" stroke-width="2" stroke-dasharray="4 4" />
				<circle cx={x(prov.t)} cy={y(prov.v)} r="5" class="hole" style="stroke:var({tok})" />
			{/if}
			<circle cx={x(last[0])} cy={y(last[1])} r="5" style="fill:var({tok})" />
		</g>
		{#if hover !== null && hoverT !== null}
			{@const p = pts[hover]}
			<line x1={x(hoverT)} x2={x(hoverT)} y1={T} y2={H - B} class="cursor" class:pinned={hov === null} />
			{#if !ahead}<circle cx={x(hoverT)} cy={y(p[1])} r="4" style="fill:var({tok})" />{/if}
			{#if bgAt}<circle cx={x(hoverT)} cy={y(bgAt.v as number)} r="3.5" class="hole bg-dot" style="stroke:var({tok})" />{/if}
			{#if infoAt}<circle cx={x(hoverT)} cy={y(infoAt.v as number)} r="3" class="hole bg-dot info-dot" style="stroke:var({tok})" />{/if}
		{/if}
		{#if drag && Math.abs(drag.b - drag.a) >= 6}
			<rect class="zsel" x={Math.min(drag.a, drag.b)} y={T} width={Math.abs(drag.b - drag.a)} height={H - T - B} />
		{/if}
	</svg>
	{#if hover !== null && hoverT !== null && !drag}
		{@const p = pts[hover]}
		{@const fx = x(hoverT) / W}
		{@const ty = ahead && bgAt ? y(bgAt.v as number) : y(p[1])}
		<div class="tip" style={touch ? `left:${Math.min(80, Math.max(20, fx * 100))}%` : `left:${fx * 100}%;top:${(ty / H) * 100}%`} class:flip={!touch && fx > 0.7} class:above={touch} aria-hidden="true">
			<b>{val(p[1])}</b><span>{prov && hover === pts.length - 1 ? 'Provisional, ' : 'Record from '}{whenOf(p[0])}</span>
			{#if bgAt}<span class="bgl">{bgWhen ? bgWhen(bgAt.t) : ''}{left ? ' so far' : ''}: {val(bgAt.v as number)}</span>{/if}
			{#if infoAt}<span class="bgl">{infoLabel}{left ? ' so far' : ''}: {val(infoAt.v as number)} <i>(estimate, not a record)</i></span>{/if}
			{#if left}<span class="bgl togo">{left}</span>{/if}
		</div>
	{/if}
	</div>
	<figcaption class="sr" aria-live="polite">
		{#if hover !== null}
			{@const p = pts[hover]}
			Record {val(p[1])} {prov && hover === pts.length - 1 ? 'provisional,' : 'from'} {whenOf(p[0])}{#if bgAt}; {bgWhen ? bgWhen(bgAt.t) : ''}{left ? ' so far' : ''}: {val(bgAt.v as number)}{/if}{#if infoAt}; {infoLabel}: {val(infoAt.v as number)}, an estimate{/if}{#if left}; {left}{/if}
		{/if}
	</figcaption>
</figure>

<style>
	.prog { margin: 0; display: grid; gap: 4px; }
	svg.chart { width: 100%; height: auto; display: block; touch-action: pan-y; user-select: none; }
	svg.zoomable { cursor: crosshair; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.lab { fill: var(--muted); font-family: var(--font-data); font-size: 12px; }
	.cursor { stroke: var(--ink-2); stroke-width: 1; stroke-dasharray: 3 3; }
	.hole { fill: var(--surface); stroke-width: 2.4; }
	.bg { stroke-width: 1.2; opacity: 0.35; }
	.bg.cur { opacity: 0.75; stroke-width: 1.8; stroke-dasharray: 0.1 3.4; stroke-linecap: round; }
	/* demand with embedded solar: dashed so it can't be taken for the record or the faint line */
	.bg.info { stroke-dasharray: 4 3; stroke-width: 1.3; }
	.info-dot { stroke-dasharray: 2 1.5; }
	.tip i { font-style: normal; opacity: 0.8; }
	.bg-dot { stroke-width: 1.6; }
	/* a period still under way: a hatched band and its edge */
	.hatch { stroke: var(--muted); stroke-width: 1; opacity: 0.22; }
	.part-edge { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 2 3; opacity: 0.6; }
	.zsel { fill: color-mix(in srgb, var(--accent) 16%, transparent); stroke: var(--accent); stroke-width: 1; }
	.tip .bgl { color: var(--muted); }
	.tip .togo { font-style: italic; }
	.plot { position: relative; }
	/* the value and date beside the hovered step */
	.tip { position: absolute; transform: translate(12px, -50%); pointer-events: none; display: grid; gap: 1px; padding: 5px 8px; border-radius: 4px;
		background: var(--surface); border: 1px solid var(--line); box-shadow: 0 4px 14px rgb(0 0 0 / 0.12); font-size: 0.78rem; color: var(--ink-2); white-space: nowrap; z-index: 1; }
	.tip.flip { transform: translate(calc(-100% - 12px), -50%); }
	/* touch: above the chart, centred on the point, so the finger doesn't hide it */
	.tip.above { top: 0; transform: translate(-50%, calc(-100% - 6px)); z-index: 2; }
	.cursor.pinned { stroke: var(--accent); stroke-dasharray: none; }
	.tip b { font-family: var(--font-data); color: var(--ink); font-size: 0.9rem; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
