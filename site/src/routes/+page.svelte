<script lang="ts">
	// The landing page: the mark, one live figure and the generation mix, then a glimpse of each page.
	// To add a page, add an entry to PAGES with a preview component in #lib/landing. As the page scrolls, the hero's
	// horizon line shrinks into its dot, which flies down through the Now map to the Tracker preview, opens out onto it,
	// then climbs the Records staircase (Handoff).
	import Preview from '#lib/site/Preview.svelte';
	import { onMount } from 'svelte';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import Mark from '#lib/site/Mark.svelte';
	import NowPeek from '#lib/landing/NowPeek.svelte';
	import TrackerPeek from '#lib/landing/TrackerPeek.svelte';
	import ArticlesPeek from '#lib/landing/ArticlesPeek.svelte';
	import RecordsPeek from '#lib/landing/RecordsPeek.svelte';
	import HeroBackdrop from '#lib/landing/HeroBackdrop.svelte';
	import Handoff from '#lib/landing/Handoff.svelte';
	import { peekLink } from '#lib/landing/build.svelte.js';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { summarise } from '#lib/home/now.js';
	import { listed } from '#lib/articles/registry.js';

	const DATA_URL = '/data/tracker.json';
	const LIVE_MINUTES = 15;

	// the Articles preview shows the newest article's cover, so it opens that article
	const latest = listed[0];
	type Page = { href: string; name: string; peek: any; blurb: string; window?: { href: string; label: string } };
	const PAGES: Page[] = [
		{ href: '/now', name: 'Now', peek: NowPeek,
			blurb: 'What’s happening on the grid right now: demand, prices, generation, emissions and the power flowing between the islands.' },
		{ href: '/tracker', name: 'Tracker', peek: TrackerPeek,
			blurb: 'Explore New Zealand’s electricity generation and wholesale prices, from single power stations to the whole country, back to 1997.' },
		{ href: '/records', name: 'Records', peek: RecordsPeek,
			blurb: 'The biggest and smallest moments on the grid: peak demand, price spikes, renewable highs and HVDC flows, by half-hour, day, week, month and year.' },
		{ href: '/articles', name: 'Articles', peek: ArticlesPeek,
			window: latest ? { href: `/articles/${latest.slug}`, label: `Read ${latest.title}` } : undefined,
			blurb: 'Analysis of New Zealand’s electricity system, using the same data behind the tracker.' },
	];

	let D = $state<any>(null);
	let now = $state<any>(null);
	let error = $state('');
	let clock = $state(Date.now());

	const PARTS = new Intl.DateTimeFormat('en-NZ', {
		timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
	});
	const parts = (t: number) => Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
	const clockOnly = (t: number) => { const p = parts(t); return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`; };
	const when = (t: number) => { const p = parts(t); return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} ${p.weekday} ${p.day} ${p.month}`; };
	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');
	const money = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', { maximumFractionDigits: 0 });

	// the second figure rotates through a few others every few seconds; hovering pauses it, a click moves it on
	const ROTATE_MS = 5500;
	type Fact = { k: string; n: string; v: string; l: string; v2?: string; l2?: string; c: string };
	const facts = $derived.by((): Fact[] => {
		if (!now || !nz) return [];
		const hv = now.hvdc.mid, out: Fact[] = [
			{ k: 'ren', n: 'Renewable share', v: `${nz.ren.toFixed(1)}%`, l: 'renewable', c: '--g-ren' },
			{ k: 'price', n: 'Wholesale price', v: money(now.regions.NI.price ?? 0), l: '/MWh at Haywards', v2: money(now.regions.SI.price ?? 0), l2: 'at Benmore', c: '--accent' },
			Math.abs(hv) < 1
				? { k: 'hvdc', n: 'HVDC', v: '0 MW', l: 'on the HVDC link', c: '--f-hvdc' }
				: { k: 'hvdc', n: 'HVDC', v: `${fmt(Math.abs(hv))} MW`, l: `flowing ${hv > 0 ? 'north' : 'south'} on the HVDC link`, c: '--f-hvdc' },
		];
		return out;
	});
	let rot = $state(0);
	let paused = $state(false);
	let lastTurn = 0;
	const fact = $derived(facts.length ? facts[rot % facts.length] : null);
	const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	function next() { if (facts.length) { rot = (rot + 1) % facts.length; lastTurn = Date.now(); } }

	const nz = $derived(now?.regions.NZ);
	// the big figure counts up on arrival and glides to each new value
	const gen = new Tween(0, { duration: 1400, easing: cubicOut });
	const live = $derived(now !== null && (clock - now.end) / 60000 < LIVE_MINUTES);

	onMount(() => {
		let due = 0; // when to fetch again (#lib/site/poll)
		let stamp = 0, stampSeen = false;
		async function load() {
			const r = await fetch(DATA_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(`The data file returned ${r.status}.`);
			const d = await r.json();
			due = nextDue(d.meta.end);
			if (d.meta.end === stamp) return;
			stamp = d.meta.end;
			D = d;
			now = summarise(d);
			gen.set(now.regions.NZ.gen, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : stampSeen ? 900 : 1400 });
			stampSeen = true;
			error = '';
		}
		load().catch((e) => { console.warn('data load failed:', e); error = "Elenz can't reach its data right now. It will try again every minute."; });   // retried every minute
		const check = () => {
			clock = Date.now();
			if (document.visibilityState === 'visible' && Date.now() >= due) load().catch(() => {});
		};
		const poll = setInterval(check, CHECK_EVERY);
		lastTurn = Date.now() + 1500; // let the big figure finish counting up before the first turn
		const turn = setInterval(() => {
			if (paused || document.visibilityState !== 'visible' || Date.now() - lastTurn < ROTATE_MS - 50 || !facts.length) return;
			rot = (rot + 1) % facts.length;
			lastTurn = Date.now();
		}, 250);
		document.addEventListener('visibilitychange', check);
		return () => { clearInterval(poll); clearInterval(turn); document.removeEventListener('visibilitychange', check); };
	});
</script>

<svelte:head>
	<title>ELENZ · New Zealand's electricity</title>
	<meta name="description" content="New Zealand's electricity, live: the generation mix and renewable share now, and a tracker of generation, prices, demand and the HVDC link back to 1997." />
	<Preview title="ELENZ · New Zealand's electricity, live" description="New Zealand's electricity, live: the generation mix and renewable share now, and a tracker of generation, prices, demand and the HVDC link back to 1997." path="/" />
</svelte:head>

<div class="wrap">
	<Masthead brand={false} />

	<main class="landing">
		<section class="hero" aria-labelledby="land-h">
			<div class="brand">
				<Mark size={84} grow />
				<h1 id="land-h" class="word">Elenz</h1>
			</div>
			<p class="tagline">New Zealand's electricity, live</p>

			<div class="live-fig" aria-live="polite">
				{#if nz}
					<p class="big"><span class="fig">{fmt(gen.current)}</span><span class="u">MW</span></p>
					<p class="sub">
						<span>being generated right now</span><span class="sep" aria-hidden="true">·</span>
						<!-- the second figure rotates every few seconds; hovering pauses it, a click or tap moves it on -->
						<button type="button" class="rot" aria-label="Show the next figure" onclick={next}
							onpointerenter={() => (paused = true)} onpointerleave={() => (paused = false)} onfocus={() => (paused = true)} onblur={() => (paused = false)}>
							{#key fact?.k}
								{#if fact}
									<span class="fact" style="--fc:var({fact.c})" in:fly={{ y: 10, duration: reduced() ? 0 : 420, easing: cubicOut }} out:fly={{ y: -10, duration: reduced() ? 0 : 260 }}>
										<b>{fact.v}</b> {fact.l}{#if fact.v2}<span class="sep2">·</span><b>{fact.v2}</b> {fact.l2}{/if}
									</span>
								{/if}
							{/key}
						</button>
					</p>
					{#if live}
						<p class="stamp" title="Data to {when(now.end)}, from the EMI real-time dispatch feed"><span class="pulse" aria-hidden="true"></span>Live · {clockOnly(now.end)}</p>
					{:else}
						<span class="pill stale" title="The newest data is more than {LIVE_MINUTES} minutes old">Delayed · {when(now.end)}</span>
					{/if}
				{:else}
					<p class="sub" role="status">{error || 'Loading the latest data…'}</p>
				{/if}
			</div>

			<div class="horizon">{#if D}<HeroBackdrop {D} />{/if}</div>
		</section>

		<section id="pages" class="pages-list" aria-label="Pages">
			{#each PAGES as p, i}
				{@const Peek = p.peek}
				<article class="pg" class:flip={i % 2 === 1}>
					<div class="pg-text">
						<h2><a href={p.href}>{p.name}</a></h2>
						<p>{p.blurb}</p>
						<a class="go" href={p.href}>Open {p.name} →</a>
					</div>
					<a class="window" href={p.window?.href ?? (p.href === '/records' && peekLink.rec ? peekLink.rec : p.href)} aria-label={p.window?.label ?? (p.href === '/records' && peekLink.rec ? 'Open the record shown' : `Open ${p.name}`)} tabindex="-1">
						<span class="view">
							{#if D && now}<Peek {D} {now} />{:else}<span class="ph">{error ? 'Preview unavailable' : 'Loading…'}</span>{/if}
						</span>
					</a>
				</article>
			{/each}
		</section>
	</main>

	<SiteFooter />
</div>

{#if D}<Handoff {D} />{/if}

<style>
	.landing { display: grid; gap: 28px; }
	/* the first screen: brand and the live figure centred, the horizon along the bottom */
	.hero { min-height: clamp(520px, calc(100svh - 72px), 860px); display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding-block: 12px 4px; position: relative; }
	/* desktop: the full stacked logo, mark above the wordmark; phones: a compact lockup, mark beside it */
	.brand { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.word { margin: 0; font-size: clamp(2.4rem, 6vw, 3.6rem); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1; }
	.tagline { margin: 4px 0 0; color: var(--muted); font-size: 1.05rem; }

	.live-fig { margin-top: 40px; display: grid; justify-items: center; gap: 10px; width: min(100%, 640px); }
	.big { margin: 0; font-family: var(--font-ui); font-weight: 800; line-height: 1; letter-spacing: -0.035em; }
	.big .fig { font-size: clamp(3.8rem, 15vw, 7rem); }
	.big .u { font-family: var(--font-ui); font-size: clamp(1.3rem, 4vw, 1.9rem); font-weight: 600; color: var(--muted); margin-left: 10px; letter-spacing: 0; }
	/* "being generated right now · 98.3% renewable", the second half rotating */
	.sub { margin: 0; display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 0 10px; color: var(--ink-2); font-size: 1.05rem; }
	.sub .sep { color: var(--muted); }
	.rot { display: inline-grid; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; text-align: center; min-height: 1.6em; }
	.rot:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 3px; }
	.fact { grid-area: 1 / 1; white-space: nowrap; }
	.fact b { font-family: var(--font-data); font-weight: 600; color: var(--fc); }
	.fact .sep2 { color: var(--muted); margin: 0 8px; }
	.stamp { margin: 4px 0 0; display: inline-flex; align-items: center; gap: 7px; font-family: var(--font-data); font-size: 0.75rem; color: var(--muted); }
	.pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--live-ink, var(--accent)); position: relative; }
	.pulse::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: inherit; animation: ping 2.2s ease-out infinite; }
	@keyframes ping { from { transform: scale(1); opacity: 0.6; } to { transform: scale(3); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .pulse::after { animation: none; } }

	.horizon { width: calc(100% - 24px); margin-top: auto; padding-top: 34px; min-height: clamp(90px, 16vh, 150px); }

	.pages-list { display: grid; scroll-margin-top: 16px; padding-block: 40px 56px; counter-reset: pg; }
	/* a faint rule halfway between sections, with room either side */
	.pg + .pg { margin-top: 128px; padding-top: 128px; border-top: 1px solid var(--grid); }
	.pg { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 48px; align-items: center; counter-increment: pg; }
	.pg.flip { grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); }
	.pg.flip .pg-text { order: 2; }
	.pg-text h2 { margin: 0 0 8px; font-size: 2rem; letter-spacing: -0.01em; }
	/* each section numbered 01, 02, … above its heading */
	.pg-text h2::before { content: '0' counter(pg); display: block; font-family: var(--font-data); font-size: 0.75rem; font-weight: 500; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 10px; }
	.pg-text h2 a { color: inherit; text-decoration: none; }
	.pg-text p { margin: 0 0 14px; color: var(--ink-2); max-width: 46ch; font-size: 0.95rem; }
	.go { color: var(--accent); font-weight: 600; }

	/* the preview sits straight on the page, no frame; it lifts a little on hover */
	.window { display: grid; color: inherit; text-decoration: none; transition: transform 0.15s; }
	.window:hover { transform: translateY(-2px); }
	@media (prefers-reduced-motion: reduce) { .window, .window:hover { transition: none; transform: none; } }
	/* every preview the same height side by side (the tallest, Now's map), its content centred */
	.view { display: grid; align-content: center; min-height: 340px; }
	.ph { display: grid; place-items: center; min-height: 200px; color: var(--muted); font-size: 0.85rem; }

	@media (max-width: 820px) {
		.pg, .pg.flip { grid-template-columns: minmax(0, 1fr); gap: 20px; }
		.pg + .pg { margin-top: 80px; padding-top: 80px; }
		.pg.flip .pg-text { order: 0; }
		.view { min-height: 200px; }
	}
	@media (max-width: 640px) {
		.brand { flex-direction: row; gap: 12px; }
		.brand :global(svg) { width: 44px; height: 44px; }
		.word { font-size: 2rem; }
		.tagline { margin-top: 2px; font-size: 0.95rem; }
		/* the rotating figure gets its own line */
		.sub .sep { display: none; }
		.rot { flex-basis: 100%; }
		.sub { font-size: 0.98rem; }
		.hero { min-height: clamp(480px, calc(100svh - 64px), 760px); }
		.live-fig { margin-top: 30px; }
	}
	/* a phone on its side (a short, wide screen): the compact logo and a figure sized to the height, so the first screen
	   fits, and previews no taller than the screen (owner's report HOME-06, 29 Oct 2026) */
	@media (max-height: 520px) and (orientation: landscape) {
		.hero { min-height: calc(100svh - 56px); gap: 2px; padding-block: 4px 0; }
		.brand { flex-direction: row; gap: 12px; }
		.brand :global(svg) { width: 40px; height: 40px; }
		.word { font-size: 1.8rem; }
		.tagline { margin-top: 2px; font-size: 0.9rem; }
		.live-fig { margin-top: 14px; gap: 6px; }
		.big .fig { font-size: clamp(2.8rem, 16vh, 4.4rem); }
		.big .u { font-size: 1.2rem; }
		.sub { font-size: 0.95rem; }
		.horizon { padding-top: 14px; min-height: 70px; }
		.pg-text h2 { font-size: 1.6rem; }
		.pg + .pg { margin-top: 64px; padding-top: 64px; }
		.view { min-height: 0; }
		.view :global(svg) { max-height: calc(100svh - 110px); }
	}
</style>
