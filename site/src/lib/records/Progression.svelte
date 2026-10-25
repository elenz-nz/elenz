<script lang="ts">
	// How a record grew: a step line from the first data to today, one step each time it was broken, the current
	// record marked, and a provisional one (dashed) beyond it. Hover shows the record at that date; a click, tap or
	// drag pins it (it stays after the finger lifts; another click on it, a tap outside the chart or Escape lets go).
	// On touch the tooltip sits above the chart, clear of the finger. bg: the best of each month (or year) through the
	// history, drawn faintly behind the record line (records.py build_detail), so the near misses show; the tooltip
	// gives the record in force at the pointer's date and that month's best. While the latest month (or year) is still
	// running, its faint line carries on past the data to the period's end, fading out, and the tooltip there says how
	// long is left ("6 days to go"). Month and year records leave the running period out of `bg` (it isn't whole), so
	// the page passes its figure so far as `now` ({ t: its start, v, at: how far the data goes }).
	import { yearOf, trimZeros, bgEnd, hoursToGo } from './records.js';

	// fmt: axis labels (bare numbers); full: a value with its unit, for the tooltip and readout (fmt if not given)
	let { steps: all, first: dataFirst, end, tok = '--ink', label, fmt, full, prov = null, dashed = false, when, bg = null, bgWhen, now = null }:
		{ steps: [number, number][]; first: number; end: number; tok?: string; label: string; fmt: (v: number) => string;
		  full?: (v: number) => string; prov?: { t: number; v: number } | null; dashed?: boolean; when?: (t: number) => string;
		  bg?: [number, number | null][] | null; bgWhen?: (t: number) => string;
		  now?: { t: number; v: number; at: number } | null } = $props();
	const val = (v: number) => (full ?? fmt)(v);
	// leading zeros left out (grid solar until its first farm): the chart starts at the first record above zero
	const steps = $derived(trimZeros(all) as [number, number][]);
	const trimmed = $derived(steps !== all);
	const first = $derived(trimmed ? steps[0][0] : dataFirst);
	const whenOf = (t: number) => when ? when(t) : new Date(t).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' });

	// drawn at the width it is shown, so labels stay readable on phones
	let cw = $state(1000);
	const W = $derived(Math.max(320, Math.min(1000, cw)));
	const H = $derived(W < 600 ? 220 : 300);
	const L = 64, Rm = 18, T = 16, B = 30;
	const pts = $derived(prov ? [...steps, [prov.t, prov.v] as [number, number]] : steps);
	const t1 = $derived(Math.max(end, pts[pts.length - 1][0]));
	// the background line, within the chart's dates
	const bgYear = $derived(!!bg && bg.length > 1 && bg[1][0] - bg[0][0] > 200 * 864e5);
	// within the chart's dates, with the running period's figure so far (now) in place of its gap
	const bgIn = $derived.by(() => {
		if (!bg) return [];
		const a = bg.filter((b) => b[0] >= first - 31 * 864e5 && b[0] <= t1 && !(now && b[0] >= now.t));
		return now && a.length ? [...a, [now.t, now.v] as [number, number | null]] : a;
	});
	// the period still running: the last month (or year) of the faint line, if it ends after the data; the chart's
	// dates then run on to its end, and the line fades out from where the data stops (`from`)
	const cur = $derived.by(() => {
		const b = bgIn[bgIn.length - 1];
		if (!b || b[1] == null) return null;
		const to = bgEnd(b[0], bgYear);
		const from = Math.min(to, Math.max(t1, now && now.t === b[0] ? now.at : t1));
		return to > from ? { t: b[0], v: b[1], to, from } : null;
	});
	const tx = $derived(cur ? cur.to : t1);
	const uid = $props.id();

	// a round axis that holds every step (from zero for most records: the growth is the point)
	function niceStep(span: number) {
		const raw = span / 4, p = 10 ** Math.floor(Math.log10(raw || 1)), m = raw / p;
		return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
	}
	const ax = $derived.by(() => {
		const vs = [...pts.map((s) => s[1]), ...bgIn.map((b) => b[1]).filter((v): v is number => v != null)];
		let lo = Math.min(...vs), hi = Math.max(...vs);
		if (lo >= 0 && lo < 0.5 * hi) lo = 0;   // from zero unless the record moved over a narrow range
		if (hi === lo) hi = lo + 1;
		const st = niceStep(hi - lo);
		lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
		const ticks = [];
		for (let v = lo; v <= hi + st / 2; v += st) ticks.push(v);
		return { lo, hi, ticks };
	});
	const x = (t: number) => L + ((t - first) / (tx - first)) * (W - L - Rm);
	const y = (v: number) => T + (1 - (v - ax.lo) / (ax.hi - ax.lo)) * (H - T - B);
	const path = $derived.by(() => {
		let d = `M${x(steps[0][0]).toFixed(1)} ${y(steps[0][1]).toFixed(1)}`;
		for (const [t, v] of steps.slice(1)) d += ` H${x(t).toFixed(1)} V${y(v).toFixed(1)}`;
		return d + (prov ? ` H${x(prov.t).toFixed(1)}` : ` H${x(t1).toFixed(1)}`);
	});
	const years = $derived.by(() => {
		const a = +yearOf(first), b = +yearOf(tx), every = (b - a) / (W / 90) > 5 ? 10 : b - a > 20 ? 5 : b - a > 8 ? 2 : 1;
		const out = [];
		for (let yr = Math.ceil(a / every) * every; yr <= b; yr += every) out.push({ yr, t: Date.UTC(yr, 0, 1) - 13 * 36e5 });
		return out.filter((q) => q.t >= first && x(q.t) > L + 14);
	});
	const last = $derived(steps[steps.length - 1]);
	// each month (or year) holds its value until the next: drawn as flat steps, broken where there is none
	const bgPath = $derived.by(() => {
		let d = '', pen = false;
		bgIn.forEach(([t, v], i) => {
			const nx = i + 1 < bgIn.length ? bgIn[i + 1][0] : Math.min(cur ? cur.from : t1, bgEnd(t, bgYear));
			if (v == null) { pen = false; return; }
			const xa = Math.max(L, x(t)), xb = Math.max(L, x(nx));
			d += `${pen ? 'L' : 'M'}${xa.toFixed(1)} ${y(v).toFixed(1)} H${xb.toFixed(1)}`;
			pen = true;
		});
		return d;
	});

	// the pointer's date (hov: under the mouse; pin: clicked, tapped or dragged to); the record in force then and that
	// month's best follow from it
	let hov = $state<number | null>(null);
	let pin = $state<number | null>(null);
	let touch = $state(false);               // the last pointer was a finger or pen
	const hoverT = $derived(hov ?? pin);
	// in the period still running (from its start): how long is left of it, from now
	const left = $derived(cur && hoverT !== null && hoverT >= cur.t ? hoursToGo(Math.max(0, cur.to - Date.now()) / 36e5) : null);
	const ahead = $derived(hoverT !== null && hoverT > t1);   // past the record line's end: only the faint line goes on
	const hover = $derived.by(() => {
		if (hoverT === null || hoverT < pts[0][0]) return null;
		let i = 0;
		while (i + 1 < pts.length && pts[i + 1][0] <= hoverT) i++;
		return i;
	});
	const bgAt = $derived.by(() => {
		if (hoverT === null || !bgIn.length) return null;
		let b = null;
		for (const x of bgIn) if (x[0] <= hoverT) b = x; else break;
		return b && b[1] != null ? b : null;
	});
	let fig = $state<HTMLElement>();
	function at(e: PointerEvent) {
		const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		const t = first + (((e.clientX - r.left) / r.width) * W - L) / (W - L - Rm) * (tx - first);
		return t < pts[0][0] ? null : Math.min(t, tx);
	}
	function move(e: PointerEvent) {
		touch = e.pointerType !== 'mouse';
		if (touch) { pin = at(e); hov = null; } else hov = at(e);
	}
	function click(e: MouseEvent) {
		if (touch) return;   // a tap pinned it already
		const t = at(e as PointerEvent);
		// a click near the pinned date lets go; elsewhere it moves the pin
		pin = t === null || (pin !== null && Math.abs(x(t) - x(pin)) < 8) ? null : t;
	}
	function outside(e: Event) {
		if (pin === null) return;
		if (e instanceof KeyboardEvent) { if (e.key === 'Escape') pin = null; return; }
		if (fig && !fig.contains(e.target as Node)) pin = null;
	}
</script>

<svelte:window onpointerdown={outside} onkeydown={outside} />

<figure class="prog" bind:clientWidth={cw} bind:this={fig}>
	<div class="plot">
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (pointer readout; the figcaption and the table below carry the figures) -->
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={label} onpointermove={move} onpointerdown={move} onclick={click} onpointerleave={() => (hov = null)}>
		{#each ax.ticks as v}
			<line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} class="grid" />
			<text x={L - 8} y={y(v) + 4} text-anchor="end" class="lab">{fmt(v)}</text>
		{/each}
		{#each years as q}
			<text x={x(q.t)} y={H - 8} text-anchor="middle" class="lab">{q.yr}</text>
		{/each}
		{#if bgPath}<path d={bgPath} fill="none" class="bg" style="stroke:var({tok})" />{/if}
		{#if cur}
			<!-- user space: a gradient on a flat line's bounding box (no height) would draw nothing -->
			<defs><linearGradient id="{uid}-fade" gradientUnits="userSpaceOnUse" x1={x(cur.from)} x2={x(cur.to)} y1="0" y2="0">
				<stop offset="0" style="stop-color:var({tok});stop-opacity:0.35" /><stop offset="1" style="stop-color:var({tok});stop-opacity:0" />
			</linearGradient></defs>
			<path d="M{x(cur.from).toFixed(1)} {y(cur.v).toFixed(1)} H{x(cur.to).toFixed(1)}" fill="none" stroke="url(#{uid}-fade)" stroke-width="1.2" />
		{/if}
		<path d={path} fill="none" style="stroke:var({tok})" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray={dashed ? '6 3' : undefined} />
		{#if prov}
			<path d="M{x(prov.t)} {y(last[1])} V{y(prov.v)} H{x(t1)}" fill="none" style="stroke:var({tok})" stroke-width="2" stroke-dasharray="4 4" />
			<circle cx={x(prov.t)} cy={y(prov.v)} r="5" class="hole" style="stroke:var({tok})" />
		{/if}
		<circle cx={x(last[0])} cy={y(last[1])} r="5" style="fill:var({tok})" />
		{#if hover !== null && hoverT !== null}
			{@const p = pts[hover]}
			<line x1={x(hoverT)} x2={x(hoverT)} y1={T} y2={H - B} class="cursor" class:pinned={hov === null} />
			{#if !ahead}<circle cx={x(hoverT)} cy={y(p[1])} r="4" style="fill:var({tok})" />{/if}
			{#if bgAt}<circle cx={x(hoverT)} cy={y(bgAt[1] as number)} r="3.5" class="hole bg-dot" style="stroke:var({tok})" />{/if}
		{/if}
	</svg>
	{#if hover !== null && hoverT !== null}
		{@const p = pts[hover]}
		{@const fx = x(hoverT) / W}
		{@const ty = ahead && bgAt ? y(bgAt[1] as number) : y(p[1])}
		<div class="tip" style={touch ? `left:${Math.min(80, Math.max(20, fx * 100))}%` : `left:${fx * 100}%;top:${(ty / H) * 100}%`} class:flip={!touch && fx > 0.7} class:above={touch} aria-hidden="true">
			<b>{val(p[1])}</b><span>{prov && hover === pts.length - 1 ? 'Provisional, ' : 'Record from '}{whenOf(p[0])}</span>
			{#if bgAt}<span class="bgl">{bgWhen ? bgWhen(bgAt[0]) : ''}{left ? ' so far' : ''}: {val(bgAt[1] as number)}</span>{/if}
			{#if left}<span class="bgl togo">{left}</span>{/if}
		</div>
	{/if}
	</div>
	<figcaption class="readout" aria-live="polite">
		{#if hover !== null}
			{@const p = pts[hover]}
			Record {val(p[1])} {prov && hover === pts.length - 1 ? 'provisional,' : 'from'} {whenOf(p[0])}{#if left}; {left} this {bgYear ? 'year' : 'month'}{/if}{#if hov === null}<button type="button" class="rel" onclick={() => (pin = null)}>Release</button>{/if}
		{:else}
			{bgPath ? 'The faint line is the best of each ' + (bgYear ? 'year' : 'month') + (cur ? `, fading over what is left of this ${bgYear ? 'year' : 'month'}` : '') + '. ' : ''}{steps.length - 1 === 0 ? (trimmed ? `First above zero in ${yearOf(first)}` : 'Not broken since the data began') : `Broken ${steps.length - 1} times since ${trimmed ? `the first above zero in ${yearOf(first)}` : yearOf(first)}`}{prov ? '; dashed: provisional' : ''}. {touch ? 'Tap or drag' : 'Hover or click'} for the record at any date.
		{/if}
	</figcaption>
</figure>

<style>
	.prog { margin: 0; display: grid; gap: 4px; }
	svg { width: 100%; height: auto; display: block; touch-action: pan-y; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.lab { fill: var(--muted); font-family: var(--font-data); font-size: 12px; }
	.cursor { stroke: var(--ink-2); stroke-width: 1; stroke-dasharray: 3 3; }
	.hole { fill: var(--surface); stroke-width: 2.4; }
	.bg { stroke-width: 1.2; opacity: 0.35; }
	.bg-dot { stroke-width: 1.6; }
	.tip .bgl { color: var(--muted); }
	.tip .togo { font-style: italic; }
	.readout { color: var(--muted); font-size: 0.8rem; min-height: 1.4em; }
	.plot { position: relative; }
	/* the value and date beside the hovered step */
	.tip { position: absolute; transform: translate(12px, -50%); pointer-events: none; display: grid; gap: 1px; padding: 5px 8px; border-radius: 4px;
		background: var(--surface); border: 1px solid var(--line); box-shadow: 0 4px 14px rgb(0 0 0 / 0.12); font-size: 0.78rem; color: var(--ink-2); white-space: nowrap; }
	.tip.flip { transform: translate(calc(-100% - 12px), -50%); }
	/* touch: above the chart, centred on the point, so the finger doesn't hide it */
	.tip.above { top: 0; transform: translate(-50%, calc(-100% - 6px)); z-index: 2; }
	.cursor.pinned { stroke: var(--accent); stroke-dasharray: none; }
	.rel { font: inherit; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); background: none; border: 0; padding: 0 4px; margin-left: 8px; cursor: pointer; }
	.tip b { font-family: var(--font-data); color: var(--ink); font-size: 0.9rem; }
</style>
