<script lang="ts">
	// The site's link-preview image (1200 x 630): the Elenz mark and name over a week of New Zealand's generation,
	// stacked by fuel, in the article covers' style (#lib/articles/cover.css). Drawn at /og/card and saved as
	// static/og/elenz.png by analysis/site_card_png.py; every page without its own image uses it (Preview.svelte).
	// D: tracker.json (the live week, 5-minute).
	import '#lib/articles/cover.css';
	import { fromLayout } from '#lib/tracker/series.js';

	let { D }: { D: any } = $props();

	const W = 1200, H = 630, BASE = 630, TALL = 290;   // the stack grows from the bottom edge, its highest point TALL px
	// stack order from the base, as on the tracker; the small thermal fuels join coal/gas, embedded solar joins solar
	const LAYERS: [string, string[]][] = [
		['--cv-geo', ['geo']], ['--cv-coal', ['bio', 'waste', 'coal']], ['--cv-gas', ['gas']], ['--cv-diesel', ['diesel']],
		['--cv-hydro', ['hydro']], ['--cv-wind', ['wind']], ['--cv-solar', ['solar', 'roof']],
	];
	const HOUR = 12;   // 5-minute points averaged to hours, for a smooth outline

	const paths = $derived.by(() => {
		const S = fromLayout(D), n = Math.floor(S.n / HOUR);
		const v = LAYERS.map(([, ks]) => Array.from({ length: n }, (_, j) => {
			let s = 0;
			for (let i = j * HOUR; i < (j + 1) * HOUR; i++) for (const k of ks) s += Math.max(0, (S.NI[k]?.[i] || 0) + (S.SI[k]?.[i] || 0));
			return s / HOUR;
		}));
		const tot = Array.from({ length: n }, (_, j) => v.reduce((a, l) => a + l[j], 0));
		const k = TALL / Math.max(...tot), x = (j: number) => ((j / (n - 1)) * W).toFixed(1);
		const base = new Array(n).fill(0);
		return LAYERS.map(([tok], li) => {
			const lo = base.slice();
			v[li].forEach((y, j) => (base[j] += y));
			const top = base.map((y, j) => `${x(j)},${(BASE - y * k).toFixed(1)}`);
			const bot = lo.map((y, j) => `${x(j)},${(BASE - y * k).toFixed(1)}`).reverse();
			return { tok, d: `M${top.join('L')}L${bot.join('L')}Z` };
		});
	});
</script>

<figure class="cover cv site-card">
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="ELENZ: New Zealand's electricity, live. A week of generation, stacked by fuel">
		<defs>
			<linearGradient id="sc-bg" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" style="stop-color: var(--cv-bg-1)" />
				<stop offset="1" style="stop-color: var(--cv-bg-2)" />
			</linearGradient>
			<linearGradient id="sc-fade" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" style="stop-color: var(--cv-bg-2); stop-opacity: 0" />
				<stop offset="1" style="stop-color: var(--cv-bg-2); stop-opacity: var(--cv-fade)" />
			</linearGradient>
		</defs>
		<rect width={W} height={H} fill="url(#sc-bg)" />
		<g>{#each paths as p}<path d={p.d} style="fill: var({p.tok})" />{/each}</g>
		<rect y={BASE - TALL} width={W} height={TALL} fill="url(#sc-fade)" />

		<!-- the Elenz mark and wordmark, as on the review covers -->
		<g transform="translate(72,60) scale(1.6)">
			<rect x="3" y="17" width="5" height="10" rx="1" style="fill: var(--cv-geo)" /><rect x="3" y="9" width="5" height="7" rx="1" style="fill: var(--cv-hydro)" />
			<rect x="9.5" y="17" width="5" height="10" rx="1" style="fill: var(--cv-geo)" /><rect x="9.5" y="5" width="5" height="11" rx="1" style="fill: var(--cv-hydro)" />
			<rect x="16" y="17" width="5" height="10" rx="1" style="fill: var(--cv-geo)" /><rect x="16" y="8" width="5" height="8" rx="1" style="fill: var(--cv-hydro)" /><rect x="16" y="4" width="5" height="3" rx="1" style="fill: var(--cv-wind)" />
			<rect x="22.5" y="17" width="5" height="10" rx="1" style="fill: var(--cv-geo)" /><rect x="22.5" y="11" width="5" height="5" rx="1" style="fill: var(--cv-hydro)" /><rect x="22.5" y="6" width="5" height="4" rx="1" style="fill: var(--cv-solar)" />
		</g>
		<text x="130" y="96" class="word">ELENZ</text>
		<text x={W - 72} y="96" class="note" text-anchor="end">elenz.co.nz</text>

		<text x="72" y="168" class="kicker">LIVE · EVERY 5 MINUTES</text>
		<text x="68" y="246" class="sc-title">New Zealand's electricity</text>
		<text x="72" y="292" class="sc-sub">Generation, prices, demand and emissions, back to 1997</text>
	</svg>
</figure>

<style>
	.site-card { width: 1200px; border-radius: 0; margin: 0; }
	.sc-title { font-size: 74px; font-weight: 800; letter-spacing: -0.02em; }
	.sc-sub { font-size: 28px; font-weight: 500; fill: var(--cv-ink-2); }
</style>
