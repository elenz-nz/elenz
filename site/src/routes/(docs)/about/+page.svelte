<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import Coffee from '#lib/site/Coffee.svelte';

	// How each chart was built used to be on this page; links to its old sections go to the new pages
	const MOVED: Record<string, string> = {
		sources: '/methods', 'm-gen': '/methods/generation', 'm-roof': '/methods/embedded-solar', 'm-price': '/methods/prices',
		'm-explain': '/methods/price-explainer', 'm-demand': '/methods/demand', 'm-hvdc': '/methods/hvdc',
		'm-co2': '/methods/emissions', 'm-hist': '/methods/history', 'm-groups': '/methods/groupings',
	};
	onMount(() => {
		const to = MOVED[location.hash.slice(1)];
		if (to) goto(to, { replaceState: true });
		const onHash = () => flashIf();
		addEventListener('hashchange', onHash);
		return () => removeEventListener('hashchange', onHash);
	});

	// arriving at #contact (the sidebar's Contact, from any page): after 0.5 s the section lights up and fades, since it sits at
	// the foot of the page and often can't scroll to the top
	let flash = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function flashIf() {
		if (location.hash !== '#contact') return;
		flash = false;
		clearTimeout(timer);
		// half a second's pause after landing, so the change catches the eye
		timer = setTimeout(() => { flash = true; timer = setTimeout(() => (flash = false), 2600); }, 500);
	}
	afterNavigate(flashIf);

	type Part = { name: string; href: string; lede: string; items: string[] };
	const PAGES: Part[] = [
		{
			name: 'Now', href: '/now',
			lede: 'The system at a glance, updated every five minutes.',
			items: [
				'Demand, renewable share, the Haywards and Benmore prices, HVDC transfer, emissions intensity and embedded solar.',
				'A map of the two islands, each island’s generation mix as a ring, and the flow on the HVDC link.',
				'The generation mix right now, by fuel.',
				'“Why is the price high?”: whether the price is usual for the time of week, and what is different when it isn’t.',
			],
		},
		{
			name: 'Tracker: Generation', href: '/tracker',
			lede: 'Linked charts on one time axis, with one hover line driving a summary table.',
			items: [
				'Generation stacked by fuel, or grouped by site, hydro scheme, owner, flexibility, renewable vs fossil, or inverter-based vs synchronous; in MW or as a share. Drill down from a fuel to its plants and their units.',
				'Wholesale prices at Haywards and Benmore.',
				'Demand at the grid, and with embedded solar added back; the Tiwai Point smelter on its own.',
				'HVDC transfer, emissions intensity and renewable share.',
				'Energy, averages and peaks over the range in the summary table.',
			],
		},
		{
			name: 'Tracker: Prices', href: '/tracker/prices',
			lede: 'The wholesale price in detail, on the same ranges.',
			items: [
				'Prices at six nodes, Ōtāhuhu to Invercargill, with the island spread and HVDC transfer, for the live week and 30 days.',
				'Each period’s range of half-hourly prices, and half-hours over $500 and $1,000, for 12 months and the whole history.',
				'Price captured by fuel: what each fuel’s generation was worth on average.',
				'Price by time of day: a heat map of the last 30 days.',
				'Spike-proof, capped and linear scales, and time- and generation-weighted averages.',
			],
		},
		{
			name: 'Articles', href: '/articles',
			lede: 'Records, quarterly reviews and analysis built on the same data.',
			items: ['Each article lists the data behind its figures.'],
		},
	];
</script>

<svelte:head>
	<title>About · ELENZ</title>
	<meta name="description" content="What Elenz is, what each page shows, and how to support it." />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker">Elenz</p>
		<h1 id="mt-h">About Elenz</h1>
		<p class="mt-lede">Elenz shows how New Zealand’s electricity system is running: what is generating, by fuel and by plant; the wholesale price in each island; demand; the flow on the HVDC link between the islands; and how much greenhouse gas the mix emits. The live view updates every five minutes from the Electricity Authority’s market data, and the history goes back to August 1997.</p>
		<p class="mt-meta">Free, no ads, and not connected with the Electricity Authority.</p>
	</header>

	<div class="mt-body">
		<h2 id="pages">What’s on the site</h2>
		<p>Both tracker tabs share the same controls: New Zealand or either island; any range from the last 24 hours to the whole history; and intervals from 5 minutes to a year. A view’s address keeps its region, range, interval and date, so any view can be linked to. Every page has light and dark modes and a layout for phones.</p>
		<div class="ab-pages">
			{#each PAGES as p (p.href)}
				<article class="ab-page">
					<h3><a href={p.href}>{p.name}</a></h3>
					<p>{p.lede}</p>
					<ul>{#each p.items as it (it)}<li>{it}</li>{/each}</ul>
				</article>
			{/each}
		</div>

		<h2 id="data">Where the data comes from</h2>
		<p>Almost everything comes from the Electricity Authority’s market data, published free under CC BY 4.0: the real-time dispatch feed for the live week, and metered generation, grid flows and final prices for the history. Embedded solar is modelled from installed capacity and satellite sunshine, and the live HVDC transfer is estimated, because neither is in the market data.</p>
		<p><a href="/methods">Data and methods</a> explains each series in full: every source, every calculation, how it was checked, and what it can’t tell you.</p>

		<h2 id="code">Open code</h2>
		<p>The code behind the site, including every correction made to the EA’s data and the analysis behind each estimate, is on <a href="https://github.com/elenz-nz/elenz">GitHub</a>.</p>

		<h2 id="support">Support Elenz</h2>
		<p>Elenz is free and has no ads. If you find it useful, a coffee helps keep it running and improving.</p>
		<div><Coffee label="Buy Elenz a coffee" /></div>

		<section class="ab-contact" class:flash id="contact" aria-labelledby="contact-h">
			<h2 id="contact-h">Contact</h2>
			<p>Questions, corrections and ideas: <a href="mailto:hello@elenz.co.nz">hello@elenz.co.nz</a>.</p>
		</section>
	</div>
</main>

<style>
	/* the pages in two columns, each card straight under the one above (no ragged rows); one column on phones */
	.ab-pages { columns: 2 280px; column-gap: 14px; }
	.ab-page { break-inside: avoid; margin: 0 0 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; display: grid; gap: 8px; align-content: start; }
	.ab-page h3 { margin: 0; font-size: 1rem; }
	.ab-page h3 a { color: var(--ink); text-decoration: none; }
	.ab-page h3 a:hover { color: var(--accent); text-decoration: underline; }
	.ab-page p { color: var(--muted); font-size: 0.88rem; }
	.ab-page li { font-size: 0.88rem; line-height: 1.5; }
	/* Contact: a section like the others (rule above, heading), able to light up when the sidebar's Contact is used */
	.ab-contact { margin: 18px -16px 0; padding: 18px 16px 14px; border-top: 1px solid var(--line); border-radius: 0 0 8px 8px; display: grid; gap: 12px; scroll-margin-top: 16px; }
	.ab-contact h2 { margin: 0; font-size: 1.18rem; font-weight: 700; letter-spacing: -0.005em; }
	.ab-contact.flash { animation: ab-flash 2.6s ease-out; }
	@keyframes ab-flash {
		0%, 35% { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
		100% { background: transparent; box-shadow: inset 0 0 0 2px transparent; }
	}
	@media (prefers-reduced-motion: reduce) {
		.ab-contact.flash { animation: none; background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
	}
</style>
