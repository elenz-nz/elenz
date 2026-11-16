<script lang="ts">
	// /dashboard: the big-number dashboard, for a wall screen, a spare tablet or a phone. One or two large live values
	// and up to four small ones over a background, each picked from every live figure Elenz has (dashboard/values.js).
	// The layout is in the address and kept in this browser (dashboard/layout.js); `kiosk=1` shows the screen alone.
	// Linked from /now and /guide since 16 Nov 2026, with its own link-preview image (static/og/dashboard.png,
	// analysis/dashboard_og_png.py). Sends a heartbeat while open (#lib/site/heartbeat.js).
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Masthead from '#lib/site/Masthead.svelte';
	import Preview from '#lib/site/Preview.svelte';
	import { startHeartbeat } from '#lib/site/heartbeat.js';
	import { track, throttled, trackOnLoad } from '#lib/site/track.js';
	import KeepAwake from '#lib/now/KeepAwake.svelte';
	import Stage from '#lib/dashboard/Stage.svelte';
	import ColourPick from '#lib/dashboard/ColourPick.svelte';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import { recent } from '#lib/home/now.js';
	import { generatorRows } from '#lib/now/generators.js';
	import { context, catalogue, resolve, GROUPS, REGION_NAMES, MEASURE_NAMES } from '#lib/dashboard/values.js';
	import { BACKGROUNDS, PLAIN, DEFAULT, clean, fromQuery, toQuery, load, save, resize } from '#lib/dashboard/layout.js';

	const DATA_URL = '/data/tracker.json';
	const DESC = "A live dashboard of New Zealand's electricity for a wall screen or a phone: pick the big numbers and the background.";
	const LIVE_MINUTES = 15;

	let x = $state.raw<ReturnType<typeof context> | null>(null);
	let line = $state.raw<number[]>([]);
	let error = $state('');
	let clock = $state(Date.now());
	let layout = $state(clean(DEFAULT));
	let kiosk = $state(false);
	let panel = $state(true);
	let full = $state(false);        // the screen alone: the browser's full screen, or the page's own where there is none
	let stageWrap = $state<HTMLElement>();

	const cat = $derived(catalogue(x));
	const big = $derived(layout.big.map((s: string) => resolve(s, cat, x)));
	const small = $derived(layout.small.map((s: string) => resolve(s, cat, x)));

	// the label in the screen's corner
	const PARTS = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
	const parts = (t: number) => Object.fromEntries(PARTS.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
	const clockOf = (t: number) => { const p = parts(t); return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`; };
	const dayOf = (t: number) => { const p = parts(t); return `${p.weekday} ${p.day} ${p.month}`; };
	const fresh = $derived(!!x && (clock - x.end) / 60000 < LIVE_MINUTES);
	// Detailed: the time of the newest data; Simple: just whether it's live
	const live = $derived(!x ? (error ? 'Data unavailable' : 'Loading…')
		: layout.view === 'simple' ? (fresh ? 'Live' : 'Delayed')
		: fresh ? `Live ${clockOf(x.end)} · ${dayOf(x.end)}` : `Delayed · data to ${clockOf(x.end)} ${dayOf(x.end)}`);

	const windLoad = $derived.by(() => {
		if (!x) return 0.3;
		const cap = x.cap as Record<string, Record<string, number>>;
		const c = (cap.NI.wind ?? 0) + (cap.SI.wind ?? 0);
		return c ? Math.max(0, x.now.regions.NZ.fuels.wind ?? 0) / c : 0.3;
	});

	// ---------- changing the layout ----------
	const layoutEvent = throttled();   // an Umami event, at most one a minute (#lib/site/track.js)
	// persist false: the screen follows (a colour slider moving) but the address and the stored layout wait for the end
	function set(next: { bg: string; col: string; view: string; big: string[]; small: string[] }, persist = true) {
		layout = clean(next);
		if (!persist) return;
		save(layout);
		layoutEvent('layout-change', { bg: layout.bg, view: layout.view, big: layout.big.length, small: layout.small.length });
		const url = location.pathname + toQuery(layout, { kiosk: kiosk ? '1' : '' });
		Promise.resolve().then(() => replaceState(url, {})).catch(() => history.replaceState(history.state, '', url));
	}
	const setSpec = (slot: string, spec: string) => {
		const n = { ...layout, big: layout.big.slice(), small: layout.small.slice() };
		(slot[0] === 'b' ? n.big : n.small)[Number(slot.slice(1))] = spec;
		set(n);
	};
	const specOf = (slot: string) => (slot[0] === 'b' ? layout.big : layout.small)[Number(slot.slice(1))];
	const slotName = (slot: string) => (slot[0] === 'b' ? 'Large ' : 'Small ') + (Number(slot.slice(1)) + 1);
	const slots = $derived([...layout.big.map((_: string, i: number) => 'b' + i), ...layout.small.map((_: string, i: number) => 's' + i)]);

	let mixing = $state(false);     // Plain colour's own picker open
	const custom = $derived(layout.bg === 'plain' && !PLAIN.some((p) => p.c === layout.col));

	// ---------- the value picker ----------
	let picking = $state<string | null>(null);
	let tab = $state('System');
	let opener: HTMLElement | null = null;
	let sheet = $state<HTMLElement>();
	async function openPicker(slot: string, e: MouseEvent) {
		opener = e.currentTarget as HTMLElement;
		picking = slot;
		tab = resolve(specOf(slot), cat, x).item?.g ?? 'System';
		await tick();
		sheet?.querySelector<HTMLElement>('.opt.on, .opt')?.focus();
	}
	function closePicker() { picking = null; opener?.focus(); }
	function choose(k: string) {
		if (!picking) return;
		const cur = resolve(specOf(picking), cat, x);
		const it = cat.find((c) => c.k === k)!;
		const r = it.regions ? (it.regions.includes(cur.region ?? '') ? cur.region : it.regions[0]) : '';
		const ms = it.ms ?? [''];
		const m = ms.includes(cur.measure ?? '') ? cur.measure : ms[0];
		setSpec(picking, [k, r ?? '', m ?? ''].join(':').replace(/:+$/, ''));
		closePicker();
	}
	const sections = $derived.by(() => {
		if (!picking) return [];
		const items = cat.filter((c) => c.g === tab);
		if (tab !== 'Plants') return [{ name: '', items }];
		const FUELS = ['hydro', 'geo', 'wind', 'solar', 'gas', 'coal', 'batt', 'bio', 'waste'];
		const NAMES: Record<string, string> = { hydro: 'Hydro', geo: 'Geothermal', wind: 'Wind', solar: 'Grid solar', gas: 'Gas', coal: 'Coal/gas, Rankine', batt: 'Battery', bio: 'Bioenergy', waste: 'Waste heat' };
		return FUELS.map((f) => ({ name: NAMES[f], items: items.filter((c: any) => c.fuel === f) })).filter((s) => s.items.length);
	});
	const preview = (k: string) => {
		const cur = picking ? resolve(specOf(picking), cat, x) : null;
		const it = cat.find((c) => c.k === k)!;
		const r = it.regions ? (it.regions.includes(cur?.region ?? '') ? cur!.region : it.regions[0]) : '';
		const d = resolve([k, r ?? '', cur?.measure ?? ''].join(':'), cat, x);
		return d.v + (d.u && d.u.length < 12 ? ' ' + d.u : '') + (r && it.regions.length > 1 ? ' · ' + r : '');
	};

	// ---------- full screen ----------
	async function goFull() {
		full = true;
		wake();
		try { if (stageWrap?.requestFullscreen) await stageWrap.requestFullscreen(); } catch { /* the page's own full screen stays */ }
	}
	// the X to leave full screen fades after 3 seconds without the mouse or a touch, and comes back with either
	let idle = $state(false);
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	function wake() {
		idle = false;
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => (idle = true), 3000);
	}
	function exitFull() {
		full = false;
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	}

	// ---------- copying links ----------
	let copied = $state('');
	async function copy(which: 'layout' | 'kiosk') {
		const url = location.origin + location.pathname + toQuery(layout, { kiosk: which === 'kiosk' ? '1' : '' });
		if (which === 'kiosk') track('wall-screen-copy', { page: 'dashboard' });
		try { await navigator.clipboard.writeText(url); copied = which; }
		catch { window.prompt('Copy this link:', url); }
		setTimeout(() => (copied = ''), 2200);
	}

	onMount(() => {
		const q = new URLSearchParams(location.search);
		kiosk = q.get('kiosk') === '1';
		layout = fromQuery(location.search) ?? load() ?? clean(DEFAULT);
		const stopBeat = startHeartbeat('dashboard', { kiosk });
		if (kiosk) trackOnLoad('wall-screen-open', { page: 'dashboard' });
		if (matchMedia('(max-width: 640px)').matches) panel = false;
		const fsChange = () => { if (!document.fullscreenElement) full = false; };
		const moved = () => { if (full) wake(); };
		addEventListener('pointermove', moved);
		addEventListener('pointerdown', moved);
		document.addEventListener('fullscreenchange', fsChange);
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (picking) closePicker(); else if (full) exitFull(); } };
		addEventListener('keydown', esc);

		let due = 0, stamp = 0;
		async function fetchData() {
			const r = await fetch(DATA_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(`The data file returned ${r.status}.`);
			const D = await r.json();
			due = nextDue(D.meta.end);
			if (D.meta.end === stamp) return;
			stamp = D.meta.end;
			x = context(D, generatorRows(D));
			const rc = recent(D, 24, 3);
			line = rc.t.map((_: number, i: number) => rc.layers.reduce((a: number, l: any) => a + l.v[i], 0));
			error = '';
		}
		fetchData().catch((e) => { console.warn('data load failed:', e); error = "Elenz can't reach its data right now. It will try again every minute."; });
		const check = () => {
			clock = Date.now();
			if (document.visibilityState === 'visible' && Date.now() >= due) fetchData().catch(() => {});
		};
		const poll = setInterval(check, CHECK_EVERY);
		document.addEventListener('visibilitychange', check);
		return () => {
			stopBeat();
			clearInterval(poll);
			document.removeEventListener('visibilitychange', check);
			document.removeEventListener('fullscreenchange', fsChange);
			removeEventListener('keydown', esc);
			removeEventListener('pointermove', moved);
			removeEventListener('pointerdown', moved);
			clearTimeout(idleTimer);
		};
	});
</script>

<svelte:head>
	<title>ELENZ · Dashboard</title>
	<meta name="description" content={DESC} />
	<Preview title="Dashboard · ELENZ" description={DESC} path="/dashboard" image="/og/dashboard.png?v=1" size={[2400, 1260]} alt="The Elenz dashboard: New Zealand's electricity as big live numbers on a wall screen" />
</svelte:head>

{#if kiosk}
	<div class="kiosk" bind:this={stageWrap}>
		<Stage bg={layout.bg} col={layout.col} simple={layout.view === 'simple'} {big} {small} {live} {fresh} {line} mix={x?.now.mix ?? []} hvdc={x?.now.hvdc.mid ?? 0} {windLoad} />
	</div>
{:else}
<div class="wrap wide dash">
	<Masthead />
	<main>
		<header class="dhead">
			<div>
				<h1>Dashboard</h1>
				<p class="lede">Live values for a wall screen, a spare tablet or your phone. Customise it, then copy the link or bookmark the page to get it back.</p>
			</div>
			<div class="acts">
				<KeepAwake />
				<button type="button" class="btn" aria-pressed={panel} onclick={() => (panel = !panel)}>
					<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" /><circle cx="16" cy="7" r="2.2" stroke="currentColor" stroke-width="2" fill="none" /><circle cx="10" cy="17" r="2.2" stroke="currentColor" stroke-width="2" fill="none" /></svg>
					Customise
				</button>
				<button type="button" class="btn" onclick={goFull}>
					<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
					Full screen
				</button>
			</div>
		</header>
		{#if error}<p class="tstatus" role="status">{error}</p>{/if}
		<noscript><p class="lede">The dashboard needs JavaScript turned on.</p></noscript>

		<div class="stagewrap js-only" class:full bind:this={stageWrap}>
			{#if full}
				<button type="button" class="exit" class:idle aria-label="Exit full screen" title="Exit full screen" onclick={exitFull}>
					<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none" /></svg>
				</button>
			{/if}
			<Stage bg={layout.bg} col={layout.col} simple={layout.view === 'simple'} {big} {small} {live} {fresh} {line} mix={x?.now.mix ?? []} hvdc={x?.now.hvdc.mid ?? 0} {windLoad} />
		</div>

		{#if panel}
			<div class="panels js-only">
				<div class="col">
					<section class="panel" aria-labelledby="h-layout">
						<h2 id="h-layout">Layout</h2>
						<div class="opts">
							<div class="opt-g"><span class="hint">Large values</span>
								<div class="seg" role="group" aria-label="Number of large values">
									{#each [1, 2] as n}<button type="button" aria-pressed={layout.big.length === n} onclick={() => set({ ...layout, big: resize(layout.big, n, layout.small) })}>{n}</button>{/each}
								</div>
							</div>
							<div class="opt-g"><span class="hint">Small values</span>
								<div class="seg" role="group" aria-label="Number of small values">
									{#each [0, 1, 2, 3, 4] as n}<button type="button" aria-pressed={layout.small.length === n} onclick={() => set({ ...layout, small: resize(layout.small, n, layout.big) })}>{n}</button>{/each}
								</div>
							</div>
							<div class="opt-g"><span class="hint">Show</span>
								<div class="seg" role="group" aria-label="How much to show">
									<button type="button" aria-pressed={layout.view === 'simple'} title="The numbers alone" onclick={() => set({ ...layout, view: 'simple' })}>Simple</button>
									<button type="button" aria-pressed={layout.view !== 'simple'} title="The time, and a line under each value" onclick={() => set({ ...layout, view: 'detailed' })}>Detailed</button>
								</div>
							</div>
						</div>
					</section>
					<section class="panel" aria-labelledby="h-bg">
						<h2 id="h-bg">Background</h2>
						<div class="swatches">
							{#each BACKGROUNDS as b}
								<button type="button" class="bgsw" aria-pressed={layout.bg === b.k} onclick={() => set({ ...layout, bg: b.k })}><span style="background:{b.sw}"></span>{b.name}</button>
							{/each}
						</div>
						<div class="plainrow">
							<span class="hint">Plain colour</span>
							<div class="dots" role="group" aria-label="Plain colour">
								{#each PLAIN as p}
									<button type="button" class="dot" style="background:#{p.c}" aria-label={p.name} title={p.name}
										aria-pressed={layout.bg === 'plain' && layout.col === p.c} onclick={() => set({ ...layout, bg: 'plain', col: p.c })}></button>
								{/each}
								<button type="button" class="dot pickc" class:on={custom} aria-expanded={mixing} aria-controls="cpick" title="Pick any colour" aria-label="Pick any colour"
									onclick={() => { mixing = !mixing; if (mixing && layout.bg !== 'plain') set({ ...layout, bg: 'plain' }); }}></button>
							</div>
							{#if mixing}
								<div id="cpick">
									<ColourPick value={layout.col} oninput={(c) => set({ ...layout, bg: 'plain', col: c }, false)} onchange={(c) => set({ ...layout, bg: 'plain', col: c })} />
								</div>
							{/if}
						</div>
					</section>
				</div>
				<section class="panel vals" aria-labelledby="h-vals">
					<div class="vhead"><h2 id="h-vals">Values</h2><p class="hint">Every value is live. Pick one, then its region or how to show it.</p></div>
					{#each slots as slot (slot)}
						{@const d = resolve(specOf(slot), cat, x)}
						<div class="slot">
							<span class="nm">{slotName(slot)}</span>
							<button type="button" class="pick" onclick={(e) => openPicker(slot, e)} aria-label="{slotName(slot)}: {d.label}. Change">
								<i style="background:{d.c}"></i><span>{d.label || 'Loading…'}</span><small>{d.v}{d.u && d.u.length < 12 ? ' ' + d.u : ''}</small>
								<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
							</button>
							{#if d.item?.regions || (d.item?.ms?.length ?? 0) > 1}
								<div class="sopts">
									{#if d.item?.regions}
										<div class="seg" role="group" aria-label="Region for {slotName(slot)}">
											{#each d.item.regions as r}<button type="button" title={REGION_NAMES[r as keyof typeof REGION_NAMES]} aria-pressed={d.region === r} onclick={() => setSpec(slot, [d.key, r, d.measure ?? ''].join(':').replace(/:+$/, ''))}>{r}</button>{/each}
										</div>
									{/if}
									{#if (d.item?.ms?.length ?? 0) > 1}
										<div class="seg" role="group" aria-label="Show {slotName(slot)} as">
											{#each d.item!.ms as m}<button type="button" aria-pressed={d.measure === m} onclick={() => setSpec(slot, [d.key, d.region ?? '', m].join(':'))}>{MEASURE_NAMES[m as keyof typeof MEASURE_NAMES]}</button>{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
					<div class="share">
						<button type="button" class="btn" onclick={() => copy('layout')}>{copied === 'layout' ? 'Link copied' : 'Copy link to this layout'}</button>
						<button type="button" class="btn" onclick={() => copy('kiosk')}>{copied === 'kiosk' ? 'Link copied' : 'Copy wall-screen link'}</button>
						<p class="hint">This browser keeps your layout. A link opens it anywhere; the wall-screen link shows the screen alone, with no buttons.</p>
					</div>
				</section>
			</div>
		{/if}
		<p class="note">Figures follow the <a href="/now">Now page</a> and update every 5 minutes. <a href="/methods">How each figure is built</a>.</p>
	</main>
</div>
{/if}

{#if picking}
	<div class="overlay">
		<button type="button" class="scrim" aria-label="Close" tabindex="-1" onclick={closePicker}></button>
		<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="h-pick" bind:this={sheet}>
			<div class="sh-head">
				<h2 id="h-pick">Choose a value for {slotName(picking)}</h2>
				<button type="button" class="btn x" aria-label="Close" onclick={closePicker}>
					<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" /></svg>
				</button>
			</div>
			<div class="seg tabs" role="group" aria-label="Kind of value">
				{#each GROUPS as g}<button type="button" aria-pressed={tab === g} onclick={() => (tab = g)}>{g}</button>{/each}
			</div>
			<div class="lists">
				{#each sections as sec}
					{#if sec.name}<h3>{sec.name}</h3>{/if}
					<div class="list">
						{#each sec.items as it (it.k)}
							<button type="button" class="opt" class:on={resolve(specOf(picking), cat, x).key === it.k} onclick={() => choose(it.k)}>
								<span><i style="background:{it.c}"></i>{it.label}</span><small>{x ? preview(it.k) : ''}</small>
							</button>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.dash main { display: grid; gap: 16px; }
	.dhead { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 20px; }
	.dhead h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; line-height: 1.15; }
	.lede { margin: 6px 0 0; color: var(--ink-2); max-width: 70ch; }
	.acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	/* the site's buttons: as Keep screen on beside them, and the copy buttons as the site's Copy */
	.btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 0.74rem; font-weight: 500; min-height: 30px; padding: 3px 10px 3px 8px; border-radius: 4px;
		border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); cursor: pointer; white-space: nowrap; }
	.btn:hover { color: var(--ink); border-color: var(--ink-2); }
	.btn[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
	.btn:focus-visible, .pick:focus-visible, .bgsw:focus-visible, .opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.tstatus { margin: 0; color: var(--warn-ink); background: var(--warn-bg); padding: 8px 12px; border-radius: 4px; }

	.stagewrap { position: relative; }
	.stagewrap.full { position: fixed; inset: 0; z-index: 100; background: #0b1212; display: grid; }
	.stagewrap.full :global(.stage), .kiosk :global(.stage) { aspect-ratio: auto; height: 100%; min-height: 0; border-radius: 0; }
	.exit { position: absolute; top: 10px; right: 10px; z-index: 2; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(5, 12, 12, 0.55); color: #f4f7f6; cursor: pointer; transition: opacity 0.4s; }
	.exit.idle { opacity: 0; }
	.exit:hover, .exit:focus-visible { opacity: 1; }
	.exit:focus-visible { outline: 2px solid #5cc2d2; outline-offset: 2px; }
	.kiosk { position: fixed; inset: 0; display: grid; background: #0b1212; }

	.panels { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
	.col { flex: 1 1 320px; min-width: 0; display: grid; gap: 16px; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px; display: grid; gap: 10px; min-width: 0; }
	.panel.vals { flex: 2 1 520px; }
	.panel h2 { margin: 0; font-size: 1rem; font-weight: 700; }
	.hint { margin: 0; font-size: 0.82rem; color: var(--muted); }
	.opts { display: flex; flex-wrap: wrap; gap: 12px 28px; }
	.opt-g { display: grid; gap: 6px; justify-items: start; }
	.plainrow { display: grid; gap: 6px; padding-top: 4px; }
	.dots { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
	.dot { width: 28px; height: 28px; border-radius: 4px; border: 1px solid var(--line); cursor: pointer; padding: 0; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); }
	.dot[aria-pressed='true'], .dot.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
	.dot:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
	#cpick { margin-top: 4px; }
	.pickc { background: conic-gradient(#e0524a, #e6c35c, #2fa883, #4f8bd6, #8a72d8, #e0524a); }
	.pickc[aria-expanded='true'] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink-2); }
	.pickc.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
	.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
	.bgsw { display: grid; gap: 6px; text-align: left; font: inherit; font-size: 0.8rem; font-weight: 600; color: var(--ink-2); padding: 6px; border-radius: 4px; border: 1px solid var(--line); background: var(--bg); cursor: pointer; }
	.bgsw span { display: block; height: 46px; border-radius: 3px; }
	.bgsw[aria-pressed='true'] { border-color: var(--accent); color: var(--ink); box-shadow: 0 0 0 1px var(--accent); }
	.vhead { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; }
	.slot { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: 6px 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
	.nm { font-size: 0.8rem; font-weight: 600; color: var(--muted); }
	.pick { display: flex; align-items: center; gap: 8px; min-width: 0; font: inherit; font-size: 0.86rem; font-weight: 600; text-align: left; padding: 7px 10px; border-radius: 4px;
		border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
	.pick:hover { border-color: var(--ink-2); }
	.pick i, .opt i { flex: none; width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
	.pick span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pick small { margin-left: auto; font: 0.8rem var(--font-data); color: var(--muted); white-space: nowrap; }
	.pick svg { flex: none; color: var(--muted); }
	.sopts { grid-column: 2; display: flex; flex-wrap: wrap; gap: 8px 20px; padding-top: 2px; }
	.share { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; border-top: 1px solid var(--line); padding-top: 12px; }
	.share .btn { font-size: 0.8rem; font-weight: 600; color: var(--accent); padding: 3px 12px; }
	.share .btn:hover { background: var(--accent-soft); border-color: var(--accent); }
	.note { margin: 0; font-size: 0.85rem; color: var(--muted); }

	.overlay { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 16px; }
	.scrim { position: absolute; inset: 0; border: 0; background: rgba(5, 12, 12, 0.55); cursor: default; }
	.sheet { position: relative; width: min(720px, 100%); max-height: min(80vh, 760px); display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 12px;
		background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 4px; padding: 16px; box-shadow: 0 18px 50px rgb(0 0 0 / 0.28); }
	.sh-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.sh-head h2 { margin: 0; font-size: 1.05rem; }
	.btn.x { padding: 0 8px; }
	.tabs { flex-wrap: wrap; }
	.lists { overflow: auto; display: grid; gap: 8px; align-content: start; }
	.lists h3 { margin: 6px 0 0; font-size: 0.78rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
	.list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 6px; }
	.opt { display: flex; justify-content: space-between; align-items: center; gap: 10px; font: inherit; font-size: 0.86rem; text-align: left; padding: 8px 10px; border-radius: 4px;
		border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; min-width: 0; }
	.opt > span { display: inline-flex; align-items: center; gap: 7px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.opt small { font: 0.76rem var(--font-data); color: var(--muted); white-space: nowrap; }
	.opt:hover { border-color: var(--ink-2); }
	.opt.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
	@media (max-width: 640px) {
		.slot { grid-template-columns: minmax(0, 1fr); }
		.sopts { grid-column: 1; }
		.overlay { padding: 0; align-items: end; }
		.sheet { border-radius: 4px 4px 0 0; max-height: 86vh; }
	}
</style>
