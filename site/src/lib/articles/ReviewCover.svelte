<script lang="ts">
	// Cover image for a quarterly review: the quarter's own generation, one column per day stacked by fuel, under the
	// review's title. Always drawn dark, in fixed colours (the site's dark-mode fuel colours), so it looks the same in
	// light and dark mode and as the PNG used for link previews (analysis/cover_png.py).
	//   <ReviewCover data={cover} season="Winter" year={2026} range="1 June – 31 August 2026" />
	// data: site/src/lib/articles/covers/<slug>.json, written by analysis/review_cover.py.
	let { data, season, year, range }: {
		data: { days: string[]; fuels: Record<string, number[]> }; season: string; year: number; range: string;
	} = $props();

	const W = 1200, H = 630, BASE = 630, TALL = 330;   // columns grow from the bottom edge, the tallest day TALL px
	const C: Record<string, string> = {
		geo: '#c4508f', coal: '#6b6662', gas: '#cc7a2e', diesel: '#bf3a52', hydro: '#4f8bd6', wind: '#2fa883', solar: '#d4a21c',
	};
	const ORDER = ['geo', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar'];
	const n = $derived(data.days.length);
	const totals = $derived(data.days.map((_, i) => ORDER.reduce((a, k) => a + (data.fuels[k]?.[i] ?? 0), 0)));
	const k = $derived(TALL / Math.max(...totals));
	const step = $derived(W / n);
	const bw = $derived(step - 2);   // 2px gap between days

	type Seg = { x: number; y: number; h: number; fill: string; top: boolean };
	const segs = $derived.by((): Seg[] => {
		const out: Seg[] = [];
		data.days.forEach((_, i) => {
			let acc = 0;
			const live = ORDER.filter((f) => (data.fuels[f]?.[i] ?? 0) * k >= 0.5);
			live.forEach((f, j) => {
				const h = data.fuels[f][i] * k;
				out.push({ x: i * step + 1, y: BASE - acc - h, h, fill: C[f], top: j === live.length - 1 });
				acc += h;
			});
		});
		return out;
	});
</script>

<figure class="cover">
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="{season} {year} quarterly review: each day's generation over the quarter, stacked by fuel">
		<defs>
			<linearGradient id="cv-bg" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#16262a" />
				<stop offset="1" stop-color="#0e1617" />
			</linearGradient>
			<linearGradient id="cv-fade" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#0e1617" stop-opacity="0" />
				<stop offset="1" stop-color="#0e1617" stop-opacity="0.35" />
			</linearGradient>
		</defs>
		<rect width={W} height={H} fill="url(#cv-bg)" />

		<g>
			{#each segs as s}
				<rect x={s.x} y={s.y + (s.top ? 0 : 0.6)} width={bw} height={Math.max(0, s.h - (s.top ? 0 : 0.6))} rx={s.top ? 2 : 0} fill={s.fill} />
			{/each}
		</g>
		<rect y={BASE - TALL} width={W} height={TALL} fill="url(#cv-fade)" />

		<!-- the Elenz mark and wordmark -->
		<g transform="translate(72,60) scale(1.6)">
			<rect x="3" y="17" width="5" height="10" rx="1" fill={C.geo} /><rect x="3" y="9" width="5" height="7" rx="1" fill={C.hydro} />
			<rect x="9.5" y="17" width="5" height="10" rx="1" fill={C.geo} /><rect x="9.5" y="5" width="5" height="11" rx="1" fill={C.hydro} />
			<rect x="16" y="17" width="5" height="10" rx="1" fill={C.geo} /><rect x="16" y="8" width="5" height="8" rx="1" fill={C.hydro} /><rect x="16" y="4" width="5" height="3" rx="1" fill={C.wind} />
			<rect x="22.5" y="17" width="5" height="10" rx="1" fill={C.geo} /><rect x="22.5" y="11" width="5" height="5" rx="1" fill={C.hydro} /><rect x="22.5" y="6" width="5" height="4" rx="1" fill={C.solar} />
		</g>
		<text x="130" y="96" class="word">ELENZ</text>

		<text x="72" y="168" class="kicker">QUARTERLY REVIEW</text>
		<text x="68" y="252" class="title">{season} {year}</text>
		<text x="72" y="296" class="range">{range}</text>

		<text x={W - 72} y="96" class="note" text-anchor="end">Each column is one day's generation, by fuel</text>
	</svg>
</figure>

<style>
	.cover { margin: 0 0 6px; border-radius: 6px; overflow: hidden; background: #0e1617; line-height: 0; }
	svg { display: block; width: 100%; height: auto; }
	text { font-family: 'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif; }
	.word { font-size: 30px; font-weight: 800; letter-spacing: 0.08em; fill: #e8eeee; }
	.kicker { font-size: 22px; font-weight: 700; letter-spacing: 0.16em; fill: #5cb5c8; }
	.title { font-size: 96px; font-weight: 800; letter-spacing: -0.02em; fill: #f3f6f6; }
	.range { font-size: 28px; font-weight: 500; fill: #9fb0af; }
	.note { font-size: 17px; font-weight: 500; fill: #7d8f8e; }
</style>
