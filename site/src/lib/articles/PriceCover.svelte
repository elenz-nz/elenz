<script lang="ts">
	// Cover image for a pricing article: one column per month of average wholesale price, coloured from blue (cheap)
	// to orange (dear), under the article's title, with the dearest and cheapest months labelled. Always drawn dark,
	// in fixed colours, like ReviewCover, so it looks the same in light and dark mode and as the link-preview PNG
	// (analysis/cover_png.py).
	//   <PriceCover values={D.months.HAY} start="1996-10" kicker="Analysis" title={['What sets the', 'wholesale price']} />
	let { values, start, kicker, title, note = '' }: {
		values: number[]; start: string; kicker: string; title: string[]; note?: string;
	} = $props();

	const W = 1200, H = 630, BASE = 630, TALL = 300;
	const n = $derived(values.length);
	const step = $derived(W / n);
	const k = $derived(TALL / Math.max(...values));
	const hi = $derived(values.indexOf(Math.max(...values)));
	const lo = $derived(values.indexOf(Math.min(...values)));

	// cheap months blue (hydro), dear months orange (gas), in four bands
	const fill = (v: number) => (v < 40 ? '#4f8bd6' : v < 100 ? '#86aee0' : v < 200 ? '#dfa46c' : '#d9772a');
	const ym = $derived(start.split('-').map(Number));
	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const label = (i: number) => { const j = ym[1] - 1 + i; return `${MON[j % 12]} ${ym[0] + Math.floor(j / 12)}`; };
	const money = (v: number) => (v < 10 ? `$${v.toFixed(2)}` : `$${Math.round(v)}`);
	const xOf = (i: number) => i * step + step / 2;
</script>

<figure class="cover">
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="{title.join(' ')}: average wholesale price each month since {label(0)}">
		<defs>
			<linearGradient id="pc-bg" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#16262a" />
				<stop offset="1" stop-color="#0e1617" />
			</linearGradient>
		</defs>
		<rect width={W} height={H} fill="url(#pc-bg)" />

		{#each values as v, i}
			{@const h = Math.max(2, v * k)}
			<rect x={i * step + 0.3} y={BASE - h} width={Math.max(0.8, step - 0.6)} height={h} rx="0.8" fill={fill(v)} />
		{/each}

		<!-- the dearest and cheapest months, labelled in the clear space above the columns -->
		<line x1={xOf(hi)} x2={xOf(hi)} y1={BASE - values[hi] * k - 6} y2={BASE - TALL - 58} class="tick" />
		<text x={xOf(hi) - 10} y={BASE - TALL - 58} class="flag" text-anchor="end" dy="0.75em">{money(values[hi])}</text>
		<text x={xOf(hi) - 10} y={BASE - TALL - 18} class="flag-sub" text-anchor="end">{label(hi)}</text>
		<line x1={xOf(lo)} x2={xOf(lo)} y1={BASE - 6} y2={BASE - TALL - 150} class="tick" />
		<text x={xOf(lo) - 10} y={BASE - TALL - 150} class="flag" text-anchor="end" dy="0.75em">{money(values[lo])}</text>
		<text x={xOf(lo) - 10} y={BASE - TALL - 110} class="flag-sub" text-anchor="end">{label(lo)}</text>

		<!-- the Elenz mark and wordmark -->
		<g transform="translate(72,60) scale(1.6)">
			<rect x="3" y="17" width="5" height="10" rx="1" fill="#c4508f" /><rect x="3" y="9" width="5" height="7" rx="1" fill="#4f8bd6" />
			<rect x="9.5" y="17" width="5" height="10" rx="1" fill="#c4508f" /><rect x="9.5" y="5" width="5" height="11" rx="1" fill="#4f8bd6" />
			<rect x="16" y="17" width="5" height="10" rx="1" fill="#c4508f" /><rect x="16" y="8" width="5" height="8" rx="1" fill="#4f8bd6" /><rect x="16" y="4" width="5" height="3" rx="1" fill="#2fa883" />
			<rect x="22.5" y="17" width="5" height="10" rx="1" fill="#c4508f" /><rect x="22.5" y="11" width="5" height="5" rx="1" fill="#4f8bd6" /><rect x="22.5" y="6" width="5" height="4" rx="1" fill="#d4a21c" />
		</g>
		<text x="130" y="96" class="word">ELENZ</text>

		<text x="72" y="168" class="kicker">{kicker.toUpperCase()}</text>
		{#each title as line, i}<text x="68" y={240 + i * 76} class="title">{line}</text>{/each}

		{#if note}<text x={W - 72} y="96" class="note" text-anchor="end">{note}</text>{/if}
	</svg>
</figure>

<style>
	.cover { margin: 0 0 6px; border-radius: 6px; overflow: hidden; background: #0e1617; line-height: 0; }
	svg { display: block; width: 100%; height: auto; }
	text { font-family: 'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif; }
	.word { font-size: 30px; font-weight: 800; letter-spacing: 0.08em; fill: #e8eeee; }
	.kicker { font-size: 22px; font-weight: 700; letter-spacing: 0.16em; fill: #5cb5c8; }
	.title { font-size: 72px; font-weight: 800; letter-spacing: -0.02em; fill: #f3f6f6; }
	.note { font-size: 17px; font-weight: 500; fill: #7d8f8e; }
	.flag { font-size: 30px; font-weight: 800; fill: #f3f6f6; }
	.flag-sub { font-size: 18px; font-weight: 500; fill: #9fb0af; }
	.tick { stroke: #9fb0af; stroke-width: 1.5; }
</style>
