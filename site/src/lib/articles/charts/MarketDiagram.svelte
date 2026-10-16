<script lang="ts">
	// How the wholesale market works, as a flow: offers → dispatch → spot price → settlement → retailers → customers,
	// with contracts beside the spot market. Two rows of three boxes on wide screens; one column on phones.
	type Box = { k: string; name: string; lines: [string, string]; main?: boolean; tint?: boolean };
	const B: Box[] = [
		{ k: 'gen', name: 'Generators', lines: ['offer MW at a price for', 'every trading period'] },
		{ k: 'disp', name: 'Dispatch', lines: ['Transpower runs the', 'cheapest mix every 5 min'] },
		{ k: 'price', name: 'Spot price', lines: ['set at every grid point,', 'final next business day'], main: true },
		{ k: 'settle', name: 'Settlement', lines: ['generators paid and', 'retailers charged at it'] },
		{ k: 'retail', name: 'Retailers', lines: ['buy at spot for what', 'their customers use'] },
		{ k: 'cust', name: 'Homes and businesses', lines: ['pay tariffs set months', 'in advance'] },
	];
	const C = { name: 'Contracts', lines: ["Hedges, futures and gentailers' own customers", 'fix the price of most electricity in advance'] };

	let w = $state(680);
	const wide = $derived(w >= 560);
	const H = 72;
	// wide: positions of the six boxes (centres) in a 760-wide frame; narrow: one column
	const bw = $derived(wide ? 200 : Math.min(300, w - 40));
	const pos = $derived(wide
		? [[130, 70], [380, 70], [630, 70], [630, 210], [380, 210], [130, 210]]
		: B.map((_, i) => [w / 2, 50 + i * 104]));
	const cpos = $derived(wide ? [380, 330] : [w / 2, 50 + 6 * 104 + 10]);
	const cw = $derived(wide ? 400 : bw);
	const height = $derived(wide ? 380 : cpos[1] + H / 2 + 12);
	const vb = $derived(wide ? '0 0 760 380' : `0 0 ${w} ${height}`);
	// connectors between consecutive boxes
	const links = $derived(B.slice(0, -1).map((_, i) => {
		const [x0, y0] = pos[i], [x1, y1] = pos[i + 1];
		if (!wide) return `M${x0} ${y0 + H / 2}V${y1 - H / 2}`;
		if (y0 === y1) return x1 > x0 ? `M${x0 + bw / 2} ${y0}H${x1 - bw / 2}` : `M${x0 - bw / 2} ${y0}H${x1 + bw / 2}`;
		return `M${x0} ${y0 + H / 2}V${y1 - H / 2}`;
	}));
	// contracts: tied to the generators and to the retailers
	const cGen = $derived(wide
		? `M${pos[0][0] - bw / 2} ${pos[0][1]}H14V${cpos[1]}H${cpos[0] - cw / 2}`
		: `M${pos[0][0] + bw / 2} ${pos[0][1]}H${w - 8}V${cpos[1]}H${cpos[0] + cw / 2}`);
	const cRet = $derived(wide
		? `M${pos[4][0]} ${pos[4][1] + H / 2}V${cpos[1] - H / 2}`
		: `M${pos[4][0] + bw / 2} ${pos[4][1]}H${w - 8}`);
</script>

<div class="md" bind:clientWidth={w}>
	<svg viewBox={vb} width="100%" role="img" aria-label="How the wholesale market works: generators' offers go through dispatch to set the spot price, which settlement charges to retailers, who sell to homes and businesses; contracts fix the price of most electricity in advance">
		<defs>
			<marker id="md-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="md-head" /></marker>
		</defs>
		{#each links as d}<path {d} class="md-link" marker-end="url(#md-arrow)" />{/each}
		<path d={cGen} class="md-link dash" marker-end="url(#md-arrow)" />
		<path d={cRet} class="md-link dash" marker-start="url(#md-arrow)" marker-end={wide ? 'url(#md-arrow)' : undefined} />
		{#each B as b, i}
			{@const [cx, cy] = pos[i]}
			<g>
				<rect x={cx - bw / 2} y={cy - H / 2} width={bw} height={H} rx="8" class="md-box" class:main={b.main} />
				<text x={cx} y={cy - 12} text-anchor="middle" class="md-name">{b.name}</text>
				<text x={cx} y={cy + 8} text-anchor="middle" class="md-line" class:strong={b.main}>{b.lines[0]}</text>
				<text x={cx} y={cy + 24} text-anchor="middle" class="md-line" class:strong={b.main}>{b.lines[1]}</text>
			</g>
		{/each}
		<g>
			<rect x={cpos[0] - cw / 2} y={cpos[1] - H / 2} width={cw} height={H} rx="8" class="md-box tint" />
			<text x={cpos[0]} y={cpos[1] - 12} text-anchor="middle" class="md-name">{C.name}</text>
			{#if wide}
				<text x={cpos[0]} y={cpos[1] + 8} text-anchor="middle" class="md-line">{C.lines[0]}</text>
				<text x={cpos[0]} y={cpos[1] + 24} text-anchor="middle" class="md-line">{C.lines[1]}</text>
			{:else}
				<text x={cpos[0]} y={cpos[1] + 8} text-anchor="middle" class="md-line">fix the price of most</text>
				<text x={cpos[0]} y={cpos[1] + 24} text-anchor="middle" class="md-line">electricity in advance</text>
			{/if}
		</g>
	</svg>
</div>

<style>
	.md { width: 100%; }
	svg { display: block; overflow: visible; }
	.md-box { fill: none; stroke: var(--muted); stroke-width: 1.25; }
	.md-box.main { fill: color-mix(in srgb, var(--accent) 12%, transparent); stroke: var(--accent); stroke-width: 2; }
	.md-box.tint { fill: var(--grid); }
	.md-link { fill: none; stroke: var(--muted); stroke-width: 1.25; }
	.md-link.dash { stroke-dasharray: 4 3; }
	.md-head { fill: var(--muted); }
	.md-name { fill: var(--ink); font-size: 13px; font-weight: 650; font-family: var(--font-ui); }
	.md-line { fill: var(--ink-2); font-size: 11.5px; font-family: var(--font-ui); }
	.md-line.strong { fill: var(--ink); }
</style>
