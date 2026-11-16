<script lang="ts">
	// The big-number dashboard's screen (/dashboard): a background with one or two large values and up to four small
	// ones over it. Sized by its own width (--u, a hundredth of it), so the same layout fills a phone, a laptop or a
	// wall screen. Cards keep their size when fewer are chosen (two large columns, four small), and a value too long
	// for its card shrinks until it fits (fit, below). Horizon draws the last 24 hours of New Zealand's generation,
	// Live mix the mix right now, Plain colour a flat colour; the other backgrounds are drawn scenes (backgrounds.js,
	// loaded only when picked). Simple hides the line under each value.
	import { BACKGROUNDS, plainPalette } from './layout.js';
	import { FUEL_COLOUR } from './values.js';

	type Tile = { label: string; region: string | null; v: string; u: string; s: string; c: string; est: boolean; none: boolean; txt: boolean };
	let { bg, col = '0e2a2c', simple = false, big, small, live, fresh = true, line, mix, hvdc = 0, windLoad = 0.3 }: {
		bg: string; col?: string; simple?: boolean; big: Tile[]; small: Tile[]; live: string; fresh?: boolean;
		line: number[];                       // the last 24 hours of generation, oldest first
		mix: { k: string; mw: number }[];     // the mix right now, largest first
		hvdc?: number;                        // HVDC transfer, MW, northward positive (Cook Strait's cable)
		windLoad?: number;                    // wind output ÷ installed, 0 to 1 (Aurora's turbines)
	} = $props();

	const info = $derived(BACKGROUNDS.find((b) => b.k === bg) ?? BACKGROUNDS[0]);
	const pal = $derived(bg === 'plain' ? plainPalette(col) : info);
	// sizes are in hundredths of the screen's width (--u), measured here: container query units need Safari 16
	let w = $state(0);
	const RN: Record<string, string> = { NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' };

	// drawn scenes: loaded on first use
	let svg = $state<Record<string, string> | null>(null);
	$effect(() => {
		if (!svg && !['horizon', 'light', 'mix', 'plain'].includes(bg)) import('./backgrounds.js').then((m) => (svg = m.SVG));
	});

	// Horizon: the line of the last 24 hours, its newest point pulsing at the right edge
	const horizon = $derived.by(() => {
		const v = line.filter((x) => Number.isFinite(x));
		if (v.length < 2) return null;
		const lo = Math.min(...v), hi = Math.max(...v), span = Math.max(hi - lo, 200);
		const pts = v.map((x, i) => [(i / (v.length - 1)) * 1600, 780 - ((x - lo) / span) * 250]);
		const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(0)} ${y.toFixed(0)}`).join(' ');
		return { d, area: `${d} L1600 900 L0 900 Z`, end: pts[pts.length - 1] };
	});
	const mixRects = $derived.by(() => {
		const total = mix.reduce((a, f) => a + f.mw, 0) || 1;
		let x = 0;
		return mix.map((f) => { const w = (f.mw / total) * 1600; const r = { x, w, c: (FUEL_COLOUR as Record<string, string>)[f.k] ?? '#7f909b' }; x += w; return r; });
	});
	const flow = $derived(Math.abs(hvdc) < 5 ? 'none' : hvdc > 0 ? 'north' : 'south');
	const spin = $derived(windLoad < 0.03 ? 0 : 9 - 7 * Math.min(1, windLoad));   // seconds a turn

	// A value and its unit too wide for their card: --fit scales both down until they fit (not below 35%).
	// Measured again when the value changes and when the card is resized.
	function fit(node: HTMLElement, _key: string) {
		let raf = 0;
		const run = () => {
			node.style.setProperty('--fit', '1');
			const num = node.querySelector<HTMLElement>('.num');
			if (!num) return;
			const unit = node.querySelector<HTMLElement>('.unit');
			const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
			const need = num.scrollWidth + (unit ? unit.scrollWidth + gap : 0);
			const have = node.clientWidth;
			if (have > 0 && need > have) node.style.setProperty('--fit', String(Math.max(0.35, (have / need) * 0.97)));
		};
		const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
		const ro = new ResizeObserver(later);
		ro.observe(node);
		document.fonts?.ready.then(later);
		run();
		return { update: later, destroy() { ro.disconnect(); cancelAnimationFrame(raf); } };
	}
</script>

<div class="stage" bind:clientWidth={w} class:narrow={w > 0 && w <= 640}
	style="--u:{(w || 1280) / 100}px;--ink:{pal.ink};--sub:{pal.sub};--tile:{pal.tile};--edge:{pal.edge};--spin:{spin || 1}s"
	data-hvdc={flow} class:still={!spin} class:simple>
	<div class="bg" aria-hidden="true">
		{#if bg === 'horizon' || bg === 'light'}
			{@const dark = bg === 'horizon'}
			{@const c = dark ? '#5cc2d2' : '#0d6275'}
			<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
				<defs>
					<pattern id="dash-dots-{bg}" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill={dark ? '#ffffff' : '#132020'} fill-opacity={dark ? 0.07 : 0.09} /></pattern>
					<linearGradient id="dash-hz-{bg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={c} stop-opacity={dark ? 0.22 : 0.14} /><stop offset="1" stop-color={c} stop-opacity="0" /></linearGradient>
				</defs>
				<rect width="1600" height="900" fill={dark ? '#131c1c' : '#f2f5f5'} />
				<rect width="1600" height="900" fill="url(#dash-dots-{bg})" />
				{#if horizon}
					<path d={horizon.area} fill="url(#dash-hz-{bg})" />
					<path d={horizon.d} fill="none" stroke={c} stroke-opacity=".75" stroke-width="3" stroke-linejoin="round" />
					<circle class="pulse" cx={horizon.end[0] - 6} cy={horizon.end[1]} r="16" fill={c} fill-opacity=".35" style="transform-origin:{horizon.end[0] - 6}px {horizon.end[1]}px" />
					<circle cx={horizon.end[0] - 6} cy={horizon.end[1]} r="7" fill={c} />
				{/if}
			</svg>
		{:else if bg === 'mix'}
			<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
				<rect width="1600" height="900" fill="#0e1515" />
				{#each mixRects as r}<rect x={r.x} y="0" width={r.w + 1} height="900" fill={r.c} />{/each}
				<rect width="1600" height="900" fill="#071012" fill-opacity=".62" />
				{#each { length: 14 } as _, i}<path d="M0 {(i + 1) * 60} H1600" stroke="#ffffff" stroke-opacity=".05" stroke-width="1" />{/each}
			</svg>
		{:else if bg === 'plain'}
			<div class="plain" style="background:#{col}"></div>
		{:else if svg?.[bg]}
			{@html svg[bg]}
		{/if}
	</div>
	<div class="fg nb{big.length} ns{small.length}">
		<div class="top">
			<b>elenz</b>
			<span class="live" class:late={!fresh}><i></i>{live}</span>
		</div>
		<div class="bigrow">
			{#each big as t}
				<div class="tile big" class:txt={t.txt}>
					<div class="lab"><i style="background:{t.c}"></i><span>{t.label}{#if t.region}<em>{' · '}{RN[t.region]}</em>{/if}{#if t.est && !t.none}<span class="etag">est.</span>{/if}</span></div>
					<div class="row" class:none={t.none} use:fit={t.v + t.u}><span class="num">{t.v}</span>{#if t.u}<span class="unit">{t.u}</span>{/if}</div>
					{#if !simple}<div class="sub">{t.s}</div>{/if}
				</div>
			{/each}
		</div>
		{#if small.length}
			<div class="smallrow">
				{#each small as t}
					<div class="tile small" class:txt={t.txt}>
						<div class="lab"><i style="background:{t.c}"></i><span>{t.label}{#if t.region}<em>{' · '}{t.region}</em>{/if}{#if t.est && !t.none}<span class="etag">est.</span>{/if}</span></div>
						<div class="row" class:none={t.none} use:fit={t.v + t.u}><span class="num">{t.v}</span>{#if t.u}<span class="unit">{t.u}</span>{/if}</div>
						{#if !simple}<div class="sub">{t.s}</div>{/if}
					</div>
				{/each}
			</div>
		{/if}
		<div class="foot">Elenz (elenz.co.nz), from Electricity Authority data{#if 'credit' in info && bg !== 'plain'}{' · '}{info.credit}{/if}</div>
	</div>
</div>

<style>
	.stage { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 14px; background: #131c1c; color: var(--ink);
		font-family: var(--font-ui); }
	.bg, .bg :global(svg), .plain { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

	/* wide screens: the cards sit at the foot of the screen, with room around them; two large columns and four small
	   ones whether or not each is filled, so fewer cards stay the same size */
	.fg { position: absolute; inset: 0; display: flex; flex-direction: column; gap: calc(1.5 * var(--u)); padding: calc(4.2 * var(--u)) calc(5.6 * var(--u)) calc(2.4 * var(--u)); }
	.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: calc(1 * var(--u)) calc(2 * var(--u)); }
	.top b { font-weight: 800; font-size: calc(2 * var(--u)); letter-spacing: -0.02em; }
	.live { display: inline-flex; align-items: center; gap: calc(0.7 * var(--u)); font: 500 calc(1.15 * var(--u)) var(--font-data); color: var(--sub); font-variant-numeric: tabular-nums; }
	.live i { width: calc(0.7 * var(--u)); height: calc(0.7 * var(--u)); border-radius: 50%; background: #3fd18b; box-shadow: 0 0 0 calc(0.3 * var(--u)) rgba(63, 209, 139, 0.18); }
	.live.late i { background: #e0b44c; box-shadow: 0 0 0 calc(0.3 * var(--u)) rgba(224, 180, 76, 0.18); }
	.bigrow { margin-top: auto; display: grid; gap: calc(1.6 * var(--u)); grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.smallrow { display: grid; gap: calc(1.2 * var(--u)); grid-template-columns: repeat(4, minmax(0, 1fr)); }
	.foot { margin-top: calc(0.6 * var(--u)); font-size: calc(0.9 * var(--u)); color: var(--sub); opacity: 0.85; }

	.tile { min-width: 0; background: var(--tile); border: 1px solid var(--edge); border-radius: calc(1.2 * var(--u)); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
	.tile.big { padding: calc(1.5 * var(--u)) calc(1.9 * var(--u)) calc(1.6 * var(--u)); --nf: calc(7.2 * var(--u)); --uf: calc(1.9 * var(--u)); }
	.tile.small { padding: calc(1 * var(--u)) calc(1.3 * var(--u)) calc(1.1 * var(--u)); --nf: calc(2.9 * var(--u)); --uf: calc(1 * var(--u)); }
	.tile.big.txt { --nf: calc(4.6 * var(--u)); } .tile.small.txt { --nf: calc(2 * var(--u)); }
	.tile.big .row.none { --nf: calc(3.2 * var(--u)); } .tile.small .row.none { --nf: calc(1.7 * var(--u)); }
	.lab { display: flex; align-items: center; gap: calc(0.7 * var(--u)); color: var(--sub); font-weight: 600; min-width: 0; }
	.lab > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.lab i { flex: none; border-radius: 50%; }
	.lab em { font-style: normal; font-weight: 500; }
	.etag { margin-left: 0.6em; font: 500 0.8em var(--font-data); padding: 0 0.4em; border: 1px solid var(--edge); border-radius: 0.3em; }
	.big .lab { font-size: calc(1.3 * var(--u)); } .big .lab i { width: calc(0.95 * var(--u)); height: calc(0.95 * var(--u)); }
	.small .lab { font-size: calc(0.95 * var(--u)); } .small .lab i { width: calc(0.7 * var(--u)); height: calc(0.7 * var(--u)); }
	.row { display: flex; align-items: baseline; gap: calc(0.7 * var(--u)); min-width: 0; --fit: 1; }
	.num { font-size: calc(var(--nf) * var(--fit)); font-weight: 600; letter-spacing: -0.03em; line-height: 1.04; font-variant-numeric: tabular-nums;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
	.unit { font-size: calc(var(--uf) * max(var(--fit), 0.7)); color: var(--sub); font-weight: 500; white-space: nowrap; }
	/* names rather than numbers (a plant, the possible price setter): the text face */
	.txt .num, .row.none .num { font-family: var(--font-ui); letter-spacing: -0.02em; }
	.row.none .num { color: var(--sub); }
	.sub { color: var(--sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.big .sub { font-size: calc(1.2 * var(--u)); margin-top: calc(0.3 * var(--u)); } .small .sub { font-size: calc(0.9 * var(--u)); margin-top: calc(0.15 * var(--u)); }

	/* phones, upright (a screen 640 px wide or less): the cards stack under the top line and the credit keeps to the
	   foot of the screen */
	.stage.narrow { aspect-ratio: auto; min-height: 70vh; display: flex; }
	.narrow .fg { position: relative; flex: 1; gap: calc(3 * var(--u)); padding: calc(5 * var(--u)) calc(5 * var(--u)) calc(4 * var(--u)); }
	.narrow .top b { font-size: calc(6 * var(--u)); }.narrow .live { font-size: calc(3 * var(--u)); gap: calc(2 * var(--u)); }.narrow .live i { width: calc(2 * var(--u)); height: calc(2 * var(--u)); }
	.narrow .bigrow { margin-top: calc(8 * var(--u)); grid-template-columns: minmax(0, 1fr); gap: calc(3 * var(--u)); }
	.narrow .smallrow { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(3 * var(--u)); }
	.narrow .foot { margin-top: auto; padding-top: calc(3 * var(--u)); font-size: calc(2.6 * var(--u)); }
	.narrow .tile { border-radius: calc(4 * var(--u)); }
	.narrow .tile.big { padding: calc(4.5 * var(--u)) calc(5 * var(--u)); --nf: calc(16 * var(--u)); --uf: calc(4.6 * var(--u)); }.narrow .tile.big.txt { --nf: calc(9 * var(--u)); }.narrow .tile.big .row.none { --nf: calc(7 * var(--u)); }
	.narrow .tile.small { padding: calc(3.5 * var(--u)) calc(4 * var(--u)); --nf: calc(8 * var(--u)); --uf: calc(3 * var(--u)); }.narrow .tile.small.txt { --nf: calc(5 * var(--u)); }.narrow .tile.small .row.none { --nf: calc(4.5 * var(--u)); }
	.narrow .big .lab { font-size: calc(3.8 * var(--u)); gap: calc(2 * var(--u)); }.narrow .big .lab i { width: calc(2.6 * var(--u)); height: calc(2.6 * var(--u)); }
	.narrow .small .lab { font-size: calc(3 * var(--u)); gap: calc(1.6 * var(--u)); }.narrow .small .lab i { width: calc(2 * var(--u)); height: calc(2 * var(--u)); }
	.narrow .row { gap: calc(1.6 * var(--u)); }
	.narrow .big .sub { font-size: calc(3.4 * var(--u)); }.narrow .small .sub { font-size: calc(2.8 * var(--u)); white-space: normal; }

	/* the drawn scenes' motion; still for viewers who ask for less */
	.stage :global(.tw) { animation: dash-tw 3.2s ease-in-out infinite alternate; }
	.stage :global(.sway) { animation: dash-sway 22s ease-in-out infinite alternate; }
	.stage :global(.sway2) { animation: dash-sway 31s ease-in-out infinite alternate-reverse; }
	.stage :global(.blade) { animation: dash-spin var(--spin) linear infinite; }
	.stage.still :global(.blade) { animation: none; }
	.stage :global(.pulse) { animation: dash-pulse 2.4s ease-out infinite; }
	.stage :global(.ripple) { animation: dash-tw 4s ease-in-out infinite alternate; }
	.stage :global(.swell) { animation: dash-swell 16s ease-in-out infinite alternate; }
	.stage :global(.cable) { animation: dash-cable 1.4s linear infinite; }
	.stage[data-hvdc='south'] :global(.cable) { animation-direction: reverse; }
	.stage[data-hvdc='none'] :global(.cable) { animation: none; }
	@keyframes -global-dash-tw { from { opacity: 0.25; } to { opacity: 1; } }
	@keyframes -global-dash-sway { from { transform: translateX(-40px); } to { transform: translateX(40px); } }
	@keyframes -global-dash-spin { to { transform: rotate(360deg); } }
	@keyframes -global-dash-pulse { from { transform: scale(0.6); opacity: 0.9; } to { transform: scale(2); opacity: 0; } }
	@keyframes -global-dash-swell { from { transform: translateX(-50px); } to { transform: translateX(50px); } }
	@keyframes -global-dash-cable { to { stroke-dashoffset: -32; } }
	@media (prefers-reduced-motion: reduce) {
		.stage :global(*) { animation: none !important; }
	}
</style>
