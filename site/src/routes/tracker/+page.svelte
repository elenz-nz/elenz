<script lang="ts">
	import Preview from '#lib/site/Preview.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import { onMount } from 'svelte';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import { mountTracker } from '#lib/tracker/tracker.js';
	import Masthead from '#lib/site/Masthead.svelte';
	import TrackerTabs from '#lib/site/TrackerTabs.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import GenLower from '#lib/generation/GenLower.svelte';
	import ShareLink from '#lib/site/ShareLink.svelte';
	import DownloadMenu from '#lib/site/DownloadMenu.svelte';
	import { barHeight } from '#lib/site/sticky.js';

	type Meta = { intervals: number; expected: number; end: number; api_from: number | null; built: number };

	const DATA_URL = '/data/tracker.json';
	const LIVE_MINUTES = 15; // data newer than this counts as live

	type View = { range: string; kind: string; past: boolean; loading: boolean; error: string; liveEnd: number; histFirst: number | null; histEnd: number | null };

	let meta = $state<Meta | null>(null);
	let error = $state('');
	let view = $state<View | null>(null);
	let lower = $state.raw<any>(null);   // the window the charts show, for the section under them (GenLower)
	let now = $state(Date.now());
	let infoOpen = $state(false);
	let infoBtn = $state<HTMLButtonElement>();
	let infoBox = $state<HTMLDivElement>();
	let helpOpen = $state(false);
	let helpBtn = $state<HTMLButtonElement>();
	let tracker: ReturnType<typeof mountTracker> | undefined;   // the charts (#lib/tracker/tracker.js), once the data has loaded

	const PARTS = new Intl.DateTimeFormat('en-NZ', {
		timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
	});
	function when(t: number) {
		const p = Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
		return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} ${p.weekday} ${p.day} ${p.month}`;
	}
	const clockOnly = (t: number) => {
		const p = Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
		return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
	};
	const dayOnly = (t: number) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' }).format(new Date(t));
	const dayYear = (t: number) => {
		const p = Object.fromEntries(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
		return `${p.day} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[+p.month - 1]} ${p.year}`;
	};

	const age = $derived(meta ? (now - meta.end) / 60000 : 0);
	const live = $derived(meta !== null && age < LIVE_MINUTES);
	// The info button says only where the data comes from; how each series is built is on the About page.
	const notice = $derived.by(() => {
		if (!meta) return '';
		if (view && view.kind !== 'live') {
			if (view.histEnd == null) return '';
			const days = `${dayYear(view.histFirst!)} to ${dayYear(view.histEnd)}`;
			return view.past
				? `Dispatch data from the Electricity Authority's daily dispatch files, ${days}.`
				: `Dispatch data from the Electricity Authority: its daily dispatch files, ${days}, then its real-time dispatch feed to ${when(view.liveEnd)}.`;
		}
		const mixed = meta.api_from !== null && meta.api_from > meta.end - 7 * 864e5 + 3e5;
		return mixed
			? `Dispatch data from the Electricity Authority: its daily dispatch files to ${dayOnly(meta.api_from! - 864e5)}, then its real-time dispatch feed, updated every 5 minutes.`
			: "Dispatch data from the Electricity Authority's real-time dispatch feed, updated every 5 minutes.";
	});

	// the Download button's choices (#lib/site/DownloadMenu.svelte); tracker.js makes the files
	const downloads = () => {
		const t = tracker;
		if (!t) return [];
		return [
			{ label: 'Generation chart', sub: 'Image with title, dates, sources and credit', kind: 'PNG' as const, run: () => t.image('gen') },
			{ label: 'All six charts', sub: 'Generation, price, demand, HVDC, emissions and renewables', kind: 'PNG' as const, run: () => t.image('all') },
			{ label: 'Data for this view', sub: 'Every source shown, prices, demand, HVDC and emissions', kind: 'CSV' as const, run: () => t.csv() },
		];
	};
	const status = $derived(error || (view?.loading ? 'Loading history…' : view?.error) || (meta ? '' : 'Loading the latest data…'));

	// one of the smaller charts enlarged over the page (Esc, the button again or a click outside closes it)
	let popped = $state<string | null>(null);
	function togglePop(id: string) { popped = popped === id ? null : id; }
	function popKey(e: KeyboardEvent) { if (popped && e.key === 'Escape') popped = null; }

	function closeInfo(e: Event) {
		if (helpOpen && e instanceof KeyboardEvent && e.key === 'Escape' && helpBtn?.parentElement?.parentElement?.contains(document.activeElement)) {
			helpOpen = false; helpBtn?.focus();
		}
		if (!infoOpen) return;
		if (e instanceof KeyboardEvent) {
			if (e.key === 'Escape') { infoOpen = false; infoBtn?.focus(); }
			return;
		}
		const t = e.target as Node;
		if (!infoBox?.contains(t) && !infoBtn?.contains(t)) infoOpen = false;
	}

	onMount(() => {
		let due = 0; // when to fetch again (#lib/site/poll)
		let stamp = 0;
		async function load() {
			const r = await fetch(DATA_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(`The data file returned ${r.status}.`);
			const D = await r.json();
			due = nextDue(D.meta.end);
			if (D.meta.end === stamp) return;
			stamp = D.meta.end;
			meta = D.meta;
			error = '';
			if (tracker) tracker.update(D);
			else tracker = mountTracker(D, { status: (v: View) => (view = v), view: (v: any) => (lower = v) });
		}
		load().catch((e) => { console.warn('data load failed:', e); error = "Elenz can't reach its data right now. It will try again every minute."; });   // check() below retries every minute
		// tick every minute (clock and labels); fetch only once the next interval is due, while on screen
		const check = () => {
			now = Date.now();
			if (document.visibilityState === 'visible' && Date.now() >= due) load().catch(() => {});
		};
		const poll = setInterval(check, CHECK_EVERY);
		document.addEventListener('visibilitychange', check);
		return () => {
			clearInterval(poll);
			document.removeEventListener('visibilitychange', check);
			tracker?.destroy();
		};
	});
</script>

<svelte:window onclick={closeInfo} onkeydown={(e) => { closeInfo(e); popKey(e); }} />

<!-- each chart's ⓘ: what it shows and how it's made (the notes that used to sit under the charts) -->
{#snippet chartInfo(id: string)}
	{#if id === 'gen'}
		<p>Each source's output, stacked. The live week is the market's 5-minute dispatch; history is metered output wherever the EA has published it (about six weeks behind). Embedded solar (hatched) is estimated. On one island's chart, HVDC arriving is stacked on top and HVDC leaving goes below zero, like battery charging.</p>
		<p id="gen-note" hidden></p>
		<p><a href="/methods/generation">How generation is built</a></p>
	{:else if id === 'price'}
		<p>Spot prices at the island reference nodes, Haywards (North Island) and Benmore (South Island): dispatch prices for the live week, the EA's final prices for history. Long ranges show averages; the Prices tab has the spread and the spikes.</p>
		<p><a href="/methods/prices">How prices are shown</a></p>
	{:else if id === 'demand'}
		<p>Electricity taken from the grid (solid), and with estimated embedded solar added back (dashed, with its uncertainty band), which is closer to what was actually used. Long ranges show averages; the summary gives each day's peak.</p>
		<p><a href="/methods/demand">How demand is worked out</a></p>
	{:else if id === 'hvdc'}
		<p>Transfer between Benmore and Haywards, northward positive. Metered once the EA publishes it, about two weeks after each month; before that, estimated from each island's generation and demand (about 10 MW out on average).</p>
		<p><a href="/methods/hvdc">How HVDC is worked out</a></p>
	{:else if id === 'co2'}
		<p>Emissions for each kWh generated: each plant's output times its fuel's emission factor, with Huntly's Rankine units at Genesis's quarterly coal share and each geothermal station's own factor.</p>
		<p><a href="/methods/emissions">How emissions are worked out</a></p>
	{:else}
		<p>Renewable output as a share of all generation, embedded solar included. Geothermal counts as renewable, although it emits some CO₂.</p>
		<p><a href="/methods/groupings#renewable">How shares are worked out</a></p>
	{/if}
{/snippet}

{#snippet info(id: string)}
	<InfoTip label="About this chart">{@render chartInfo(id)}</InfoTip>
{/snippet}

{#snippet popBtn(id: string, name: string)}
	<button type="button" class="pop-btn" onclick={() => togglePop(id)} aria-pressed={popped === id}
		aria-label={popped === id ? `Shrink the ${name} chart` : `Enlarge the ${name} chart`} title={popped === id ? 'Close' : 'Enlarge'}>
		{#if popped === id}
			<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
		{:else}
			<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
		{/if}
	</button>
{/snippet}

<svelte:head>
	<title>Tracker · ELENZ</title>
	<meta name="description" content="New Zealand's electricity generation by fuel, plant, owner or hydro scheme, with wholesale prices, demand, HVDC transfer and emissions, from the last 24 hours back to 1997." />
	<Preview title="Electricity generation, prices and demand · ELENZ Tracker" description="New Zealand's electricity generation by fuel, plant, owner or hydro scheme, with wholesale prices, demand, HVDC transfer and emissions, from the last 24 hours back to 1997." path="/tracker" />
</svelte:head>

<div class="wrap wide">
	<Masthead heading />
	<TrackerTabs>
		<div class="status">
			<span class="tstatus" role="status">{status}</span>
			{#if meta}
				{#if view && (view.kind !== 'live' || view.past) && !view.loading && !view.error}
					<span class="pill hist" title="History from the EA's daily dispatch files">History</span>
				{:else if live}
					<span class="pill live" title="Data to {when(meta.end)}. Updated from the EMI real-time dispatch feed every 5 minutes"><span class="pword">Live · </span>{clockOnly(meta.end)}</span>
				{:else}
					<span class="pill stale" title="The newest data is more than {LIVE_MINUTES} minutes old">Delayed · {clockOnly(meta.end)}<span class="pday">{when(meta.end).slice(clockOnly(meta.end).length)}</span></span>
				{/if}
			{/if}
			<DownloadMenu items={downloads} />
			<ShareLink links={() => tracker?.links() ?? null} />
			<button type="button" class="pill-btn about-btn" bind:this={infoBtn} aria-expanded={infoOpen} aria-controls="about-data" aria-label="About this data" title="About this data" onclick={() => (infoOpen = !infoOpen)}>
				<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10 9v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /><circle cx="10" cy="6.2" r="1.1" fill="currentColor" /></svg><span class="pill-word">About this data</span>
			</button>
			<div class="info-pop" id="about-data" role="region" aria-label="About this data" bind:this={infoBox} hidden={!infoOpen}>
				<p class="asof" id="asof"></p>
				<p>{notice || 'Loading the latest data…'}</p>
				<a href="/methods">How each chart is built</a>
			</div>
		</div>
	</TrackerTabs>

	<nav class="toolbar" aria-label="View controls" use:barHeight>
		<div class="ctl">
			<label for="sel-region" class="vh">Region</label>
			<select class="pick" id="sel-region">
				<option value="NZ">New Zealand</option>
				<option value="NI">North Island</option>
				<option value="SI">South Island</option>
			</select>
		</div>
		<div class="ctl">
			<span id="lb-range">Range</span>
			<div class="seg" role="group" aria-labelledby="lb-range" id="seg-range">
				<button type="button" data-v="1d" title="24 hours">1D</button>
				<button type="button" data-v="3d" title="3 days">3D</button>
				<button type="button" data-v="7d" title="7 days">7D</button>
				<button type="button" data-v="30d" title="30 days">30D</button>
				<button type="button" data-v="1y" title="1 year">1Y</button>
				<button type="button" data-v="all" title="All history, from August 1997">ALL</button>
			</div>
			<div class="span-wrap">
				<button type="button" class="span-btn" id="btn-span" aria-haspopup="true" aria-expanded="false" aria-controls="span-menu" title="Shorter than a day" aria-label="Shorter ranges">
					<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
		</div>
		<div class="ctl">
			<span id="lb-int">Interval</span>
			<div class="seg" role="group" aria-labelledby="lb-int" id="seg-int">
				<button type="button" data-v="5m">5m</button>
				<button type="button" data-v="30m">30m</button>
			</div>
		</div>
		<div class="ctl">
			<label for="in-date" id="lb-date">24 hours ending</label>
			<div class="datebox">
				<button type="button" class="step" id="tb-prev" aria-label="Previous 24 hours"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
				<input type="date" id="in-date" title="Shows the selected range ending on this date" />
				<button type="button" class="step" id="tb-next" aria-label="Next 24 hours"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
				<button type="button" class="latest" id="btn-latest" title="Back to the latest data" hidden><svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 3 5 5-5 5M12 3v10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>Latest</button>
			</div>
		</div>
		<button type="button" class="zoom-chip" id="zoom-reset" title="Back to the whole range (Escape)" hidden>
			<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="m10.5 10.5 3.5 3.5M5 7h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
			<span id="zoom-txt"></span><b>Reset zoom</b>
		</button>
	</nav>
	<!-- the 1D menu sits outside the sticky bar, which clips anything hanging below it; placed by tracker.js -->
	<div class="span-menu" id="span-menu" role="group" aria-label="Show the last part of the day" hidden>
		<span class="span-hd">Last</span>
		<button type="button" role="menuitemradio" aria-checked="false" data-h="1">1 hour</button>
		<button type="button" role="menuitemradio" aria-checked="false" data-h="3">3 hours</button>
		<button type="button" role="menuitemradio" aria-checked="false" data-h="6">6 hours</button>
		<button type="button" role="menuitemradio" aria-checked="false" data-h="12">12 hours</button>
		<button type="button" role="menuitemradio" aria-checked="false" data-h="24">24 hours</button>
		<span class="span-tip">Or drag across any chart to zoom</span>
	</div>

	<noscript><p class="notice">The charts need JavaScript turned on.</p></noscript>

	<div class="layout">
		<!-- The chart panel takes arrow keys to move the time cursor, so it needs to be focusable. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<section class="charts" id="charts" tabindex="0" aria-label="Generation chart. Hover or use the left and right arrow keys to read values at a point in time, Page Up and Page Down to move by the range; Escape returns to range totals.">
			<div class="chart gen" class:popped={popped === 'gen'}>
				<div class="ch-head">
					<h2 class="crumbs" id="gen-title">Generation</h2>{@render info('gen')}<span class="unit" id="gen-unit">MW, stacked by fuel</span>
					<div class="legends">
						<span class="lg" id="lg-tot">Total <b id="v-gen"></b></span>
						<select class="grp" id="sel-view" aria-label="Group the generation sources">
							<option value="detailed">Detailed</option>
							<option value="simple">Simplified</option>
							<option value="site">By site</option>
							<option value="scheme">By hydro scheme</option>
							<option value="owner">By owner</option>
							<option value="flex">Flexibility</option>
							<option value="rf">Renewable vs fossil</option>
							<option value="vre">Inverter-based vs synchronous</option>
						</select>
						<div class="seg" role="group" aria-label="Show generation as an amount (MW, or energy on long ranges) or as a share of total generation" id="seg-unit">
							<button type="button" data-v="mw" aria-pressed="true">MW</button>
							<button type="button" data-v="pct" aria-pressed="false">%</button>
						</div>
					</div>
					{@render popBtn('gen', 'generation')}
				</div>
				<div class="plot">
					<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
					<canvas id="cv-gen" role="img" aria-label="Stacked area chart of generation by fuel"></canvas>
					<button type="button" class="nav prev" id="nav-prev" aria-label="Previous 24 h"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
					<button type="button" class="nav next" id="nav-next" aria-label="Next 24 h"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
				</div>
			</div>
		</section>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<section class="charts" id="charts-more" tabindex="0" aria-label="Price, demand, HVDC, emissions and renewables charts, on the same time axis as generation.">
			<div class="chart" class:popped={popped === 'price'}>
				<div class="ch-head">
					<h2>Wholesale price</h2>{@render info('price')}<span class="unit">$/MWh</span>
					<div class="legends">
						<span class="lg" id="lg-pni"><i style="--c:var(--p-ni)"></i>North Island · Haywards <b id="v-pni"></b></span>
						<span class="lg" id="lg-psi"><i style="--c:var(--p-si)"></i>South Island · Benmore <b id="v-psi"></b></span>
					</div>
					{@render popBtn('price', 'wholesale price')}
				</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-price" role="img" aria-label="Line chart of reference node prices"></canvas>
			</div>
			<div class="chart" class:popped={popped === 'demand'}>
				<div class="ch-head">
					<h2>Demand</h2>{@render info('demand')}<span class="unit">MW</span>
					<div class="legends">
						<span class="lg"><i style="--c:var(--ink)"></i>Metered <b id="v-met"></b></span>
						<span class="lg"><i class="dash" style="--c:var(--ink-2)"></i>With embedded solar <b id="v-und"></b></span>
					</div>
					{@render popBtn('demand', 'demand')}
				</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-demand" role="img" aria-label="Line chart of metered and underlying demand"></canvas>
			</div>
			<div class="chart" class:popped={popped === 'hvdc'}>
				<div class="ch-head"><h2>HVDC transfer</h2>{@render info('hvdc')}<span class="unit">MW, northward positive</span><div class="legends"><span class="lg"><i class="area" style="--c:var(--f-hvdc)"></i>Benmore ⇄ Haywards <b id="v-hv"></b></span></div>{@render popBtn('hvdc', 'HVDC transfer')}</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-hvdc" role="img" aria-label="Area chart of HVDC transfer between the islands"></canvas>
			</div>
			<div class="chart" class:popped={popped === 'co2'}>
				<div class="ch-head"><h2>Emissions intensity</h2>{@render info('co2')}<span class="unit">g CO₂e/kWh · <a class="unit-link" href="/methods/emissions">CO₂ per kWh generated</a></span><div class="legends"><span class="lg"><i class="area" style="--c:var(--co2)"></i>Generation mix <b id="v-co2"></b></span></div>{@render popBtn('co2', 'emissions intensity')}</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-co2" role="img" aria-label="Area chart of emissions intensity"></canvas>
			</div>
			<div class="chart" class:popped={popped === 'ren'}>
				<div class="ch-head"><h2>Renewable share</h2>{@render info('ren')}<span class="unit">% of generation</span><div class="legends"><span class="lg"><i style="--c:var(--accent)"></i>Renewables <b id="v-ren"></b></span></div>{@render popBtn('ren', 'renewable share')}</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-ren" role="img" aria-label="Line chart of renewable share with the time axis"></canvas>
			</div>
		</section>
		{#if popped}<button type="button" class="pop-backdrop" aria-label="Close the enlarged chart" onclick={() => (popped = null)}></button>{/if}

		<div class="side">
			<aside class="summary" id="summary" aria-label="Generation for the selected time">
				<div class="sum-head">
					<div>
						<div class="sum-when" id="sum-when"></div>
						<div class="sum-sub" id="sum-sub"></div>
						<div class="sum-pin" id="sum-pin" hidden>Pinned <button type="button" id="sum-unpin">Release</button></div>
					</div>
					<button type="button" class="ctl-btn" bind:this={helpBtn} aria-expanded={helpOpen} aria-controls="sum-help" title="Everything the charts and this list can do" onclick={() => (helpOpen = !helpOpen)}>
						<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h7M12 4h2M2 12h3M8 12h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="10.5" cy="4" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="6.5" cy="12" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>Controls
					</button>
				</div>
				<div class="help" id="sum-help" role="note" hidden={!helpOpen}>
					<dl>
						<dt>Read a time</dt>
						<dd>Hover a chart, or touch and slide on a phone. With a chart focused, ← → move one point (Shift: further), Home and End jump to the ends.</dd>
						<dt>Pin it</dt>
						<dd>Click a chart to hold the time line there; click it again, Release or Escape to let go. Share can then mark that time.</dd>
						<dt>Move through history</dt>
						<dd>Range, interval and region are in the bar at the top. The ‹ › arrows beside the date, on the generation chart, or Page Up and Page Down step back and forward by the range; the date box jumps to a day; Latest comes back.</dd>
						<dt>Zoom in</dt>
						<dd>Drag across any chart to zoom into that stretch; every chart follows. The arrow beside 1D picks the last 1, 3, 6 or 12 hours. While zoomed, the ‹ › arrows step by the zoom’s length, and Reset zoom in the bar (or Escape twice) shows the whole range again.</dd>
						<dt>Break it down</dt>
						<dd>Select a name in this list to go from a fuel to its plants and their grid connections. ‹ Back above the list, or the browser’s Back, steps out. The menu above the generation chart groups it other ways (owner, site, flexibility…), and MW/% switches to shares.</dd>
						<dt>Hide and show</dt>
						<dd>Select a colour square to hide that layer. Double-click it, Shift+click it or press and hold it to show only that one (again to show everything); All and None above the list do the rest. In long lists, type in Filter, and select a fuel heading to fold its plants.</dd>
						<dt>Enlarge, share, download</dt>
						<dd>The corner button on each chart enlarges it, and ⓘ beside it says what the chart shows and how it’s made. Share copies a link to this view, live or for the dates shown; Download gives the charts as a picture or the data as a spreadsheet file. The address always holds the whole view, so it can be bookmarked.</dd>
					</dl>
					<p><a href="/methods">How the figures are worked out</a></p>
				</div>
				<div class="sum-level" id="sum-level" hidden><span id="sum-level-txt"></span><button type="button" class="back" id="sum-back">‹ Back</button></div>
				<input type="search" class="mix-filter" id="mix-filter" aria-label="Filter the list" placeholder="Filter" hidden />
				<div class="mix-tools" id="mix-tools" role="group" aria-label="Show in the chart" hidden><span>Show</span><button type="button" id="mix-all">All</button><button type="button" id="mix-none">None</button></div>
				<table class="mix">
					<thead><tr><th scope="col" id="col-name">Source</th><th scope="col" class="n" id="col-q">GWh</th><th scope="col" class="n">Share</th></tr></thead>
					<tbody id="mix-body"></tbody>
					<tfoot><tr><td id="tot-lbl">Total generation</td><td class="n" id="tot-q"></td><td class="n" id="tot-s">100%</td></tr></tfoot>
				</table>
			</aside>
			<section class="stats" aria-label="Prices, demand and emissions for the selected time">
				<dl class="sys" id="sys"></dl>
			</section>
		</div>
	</div>

	<GenLower v={lower} />

	<!-- follows the mouse over the charts; the summary panel carries the same values for keyboard and screen readers -->
	<div class="tip" id="tip" aria-hidden="true" hidden></div>


	<SiteFooter />
</div>
