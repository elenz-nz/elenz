<script lang="ts">
	// The landing page: the mark, one live figure and the generation mix, then a glimpse of each page.
	// To add a page, add an entry to PAGES with a preview component in #lib/landing. Tracker comes first: the hero's
	// horizon line flies down onto its preview as the page scrolls (Handoff).
	import { onMount } from 'svelte';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import Mark from '#lib/site/Mark.svelte';
	import NowPeek from '#lib/landing/NowPeek.svelte';
	import TrackerPeek from '#lib/landing/TrackerPeek.svelte';
	import ArticlesPeek from '#lib/landing/ArticlesPeek.svelte';
	import HeroBackdrop from '#lib/landing/HeroBackdrop.svelte';
	import Handoff from '#lib/landing/Handoff.svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { summarise } from '#lib/home/now.js';

	const DATA_URL = '/data/tracker.json';
	const LIVE_MINUTES = 15;

	const PAGES = [
		{ href: '/tracker', name: 'Tracker', peek: TrackerPeek,
			blurb: 'Generation by fuel, plant, owner or scheme, and prices at six grid nodes with the island spread and what each fuel earned, from the last 24 hours back to 1997.' },
		{ href: '/now', name: 'Now', peek: NowPeek,
			blurb: 'The system this five minutes: demand, prices at Haywards and Benmore, the HVDC link, emissions, and each island’s generation mix on the map.' },
		{ href: '/articles', name: 'Articles', peek: ArticlesPeek,
			blurb: 'New records, quarterly reviews and closer looks at how the system is running, written from the same data as the tracker.' },
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

	// the second figure rotates through a few others every few seconds; hovering pauses it, the dots pick one
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
	function pick(i: number) { rot = i; lastTurn = Date.now(); }

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
		load().catch((e) => (error = `The live data couldn't be loaded. ${e.message}`));
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
</svelte:head>

<div class="wrap">
	<Masthead brand={false} />

	<main class="landing">
		<section class="hero" aria-labelledby="land-h">
			<div class="mark"><Mark size={84} grow /></div>
			<h1 id="land-h" class="word">Elenz</h1>
			<p class="tagline">New Zealand's electricity, live</p>

			<div class="live-fig" aria-live="polite">
				{#if nz}
					<p class="big"><span class="fig">{fmt(gen.current)}</span><span class="u">MW</span></p>
					<p class="big-sub">being generated across New Zealand right now</p>
					<div class="rot" role="group" aria-label="More figures" onpointerenter={() => (paused = true)} onpointerleave={() => (paused = false)} onfocusin={() => (paused = true)} onfocusout={() => (paused = false)}>
						<div class="rot-v">
							{#key fact?.k}
								{#if fact}
									<p class="fact" style="--fc:var({fact.c})" in:fly={{ y: 14, duration: reduced() ? 0 : 450, easing: cubicOut }} out:fly={{ y: -14, duration: reduced() ? 0 : 300 }}>
										<b>{fact.v}</b> {fact.l}{#if fact.v2}<span class="sep">·</span><b>{fact.v2}</b> {fact.l2}{/if}
									</p>
								{/if}
							{/key}
						</div>
						<div class="dots">
							{#each facts as f, i}
								<button type="button" class:on={f.k === fact?.k} aria-label="Show {f.n}" aria-pressed={f.k === fact?.k} onclick={() => pick(i)}></button>
							{/each}
						</div>
					</div>
					<div class="stack" role="img" aria-label={`Generation now: ${now.mix.map((f: any) => `${f.name} ${((f.mw / nz.gen) * 100).toFixed(0)}%`).join(', ')}`}>
						{#each now.mix as f}<span class:hatch={f.hatch} style="--c:var({f.tok});width:{(f.mw / nz.gen) * 100}%" title="{f.name} {fmt(f.mw)} MW"></span>{/each}
					</div>
					<ul class="key">
						{#each now.mix.filter((f: any) => f.mw / nz.gen >= 0.01) as f}
							<li><span class="sw" class:hatch={f.hatch} style="--c:var({f.tok})"></span>{f.name} <span class="pct">{((f.mw / nz.gen) * 100).toFixed(0)}%</span></li>
						{/each}
					</ul>
					{#if live}
						<span class="pill live" title="Data to {when(now.end)}, from the EMI real-time dispatch feed">Live · {clockOnly(now.end)}</span>
					{:else}
						<span class="pill stale" title="The newest data is more than {LIVE_MINUTES} minutes old">Delayed · {when(now.end)}</span>
					{/if}
				{:else}
					<p class="big-sub" role="status">{error || 'Loading the latest data…'}</p>
				{/if}
			</div>

			<div class="horizon">{#if D}<HeroBackdrop {D} />{/if}</div>

			<a class="down" href="#pages" aria-label="See what's on Elenz">
				<svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</a>
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
					<a class="window" href={p.href} aria-label="Open {p.name}" tabindex="-1">
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
	.hero { min-height: min(80svh, 760px); display: grid; justify-items: center; align-content: center; text-align: center; gap: 6px; padding-block: 12px 4px; position: relative; }
	.mark { margin-bottom: 4px; }
	.word { margin: 0; font-size: clamp(2.4rem, 7vw, 3.6rem); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1; }
	.tagline { margin: 4px 0 0; color: var(--muted); font-size: 1.05rem; }

	.live-fig { margin-top: 34px; display: grid; justify-items: center; gap: 8px; width: min(100%, 560px); }
	.big { margin: 0; font-family: var(--font-ui); font-weight: 800; line-height: 1; letter-spacing: -0.035em; }
	.big .fig { font-size: clamp(3.6rem, 14vw, 6.4rem); }
	.big .u { font-family: var(--font-ui); font-size: clamp(1.3rem, 4vw, 1.9rem); font-weight: 600; color: var(--muted); margin-left: 10px; letter-spacing: 0; }
	.big-sub { margin: 0; color: var(--ink-2); }
	.rot { display: grid; justify-items: center; gap: 6px; margin-top: 6px; }
	.rot-v { display: grid; min-height: 2.2rem; align-items: center; }
	.fact { grid-area: 1 / 1; margin: 0; font-size: 1.15rem; color: var(--ink-2); white-space: nowrap; }
	.fact b { font-family: var(--font-data); font-weight: 600; color: var(--fc); font-size: 1.5rem; margin-right: 3px; }
	.fact .sep { color: var(--muted); margin: 0 10px; }
	.dots { display: flex; gap: 2px; }
	.dots button { width: 18px; height: 18px; padding: 0; border: 0; background: none; cursor: pointer; display: grid; place-items: center; }
	.dots button::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--line); transition: background 0.2s, transform 0.2s; }
	.dots button.on::before { background: var(--ink-2); transform: scale(1.25); }
	.dots button:hover::before { background: var(--muted); }
	.dots button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 50%; }
	.stack { display: flex; width: 100%; height: 22px; border-radius: 4px; overflow: hidden; background: var(--grid); margin-top: 14px; animation: wipe 1.3s cubic-bezier(0.2, 0.7, 0.2, 1) 0.2s both; }
	.stack span { background: var(--c); height: 100%; transition: width 0.9s ease; }
	.stack span + span { box-shadow: inset 2px 0 0 var(--bg); }
	@keyframes wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
	@media (prefers-reduced-motion: reduce) { .stack { animation: none; } .stack span { transition: none; } }
	.key { list-style: none; margin: 2px 0 6px; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; font-size: 0.8rem; color: var(--ink-2); }
	.key .pct { font-family: var(--font-data); color: var(--muted); margin-left: 2px; }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: var(--c); margin-right: 6px; vertical-align: -1px; }
	.hatch { background: repeating-linear-gradient(135deg, var(--c) 0 2px, color-mix(in srgb, var(--c) 30%, transparent) 2px 4px) !important; }

	.horizon { width: calc(100% - 24px); margin-top: 26px; min-height: clamp(90px, 16vh, 150px); }
	.down { margin-top: 18px; color: var(--muted); display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line); animation: nudge 2.4s ease-in-out infinite; }
	.down:hover { color: var(--ink); border-color: var(--ink-2); }
	@keyframes nudge { 50% { transform: translateY(4px); } }
	@media (prefers-reduced-motion: reduce) { .down { animation: none; } }

	.pages-list { display: grid; gap: 96px; scroll-margin-top: 16px; padding-block: 40px 56px; counter-reset: pg; }
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
		.pages-list { gap: 64px; }
		.pg.flip .pg-text { order: 0; }
		.view { min-height: 200px; }
	}
	@media (max-width: 640px) {
		.fact { font-size: 0.95rem; }
		.fact b { font-size: 1.2rem; }
		.fact .sep { margin: 0 6px; }
		.hero { min-height: min(80svh, 640px); }
		.live-fig { margin-top: 24px; }
	}
</style>
