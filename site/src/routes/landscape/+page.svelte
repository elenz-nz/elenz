<script lang="ts">
	// /landscape: the power landscape, a kids' dashboard. An animated storybook New Zealand driven by the live feed: the
	// river runs faster with hydro, the turbines turn with the wind, the sun hides behind cloud as embedded solar drops.
	// The scene and its controls are in #lib/landscape/scene.js, the dials in dials.js, the feed in feed.js; this page
	// fetches tracker.json as /now does and hands each new interval over. Linked from /now and /guide since 16 Nov 2026,
	// with its own link-preview image (static/og/landscape.png, analysis/dashboard_og_png.py); sends a heartbeat while
	// open (#lib/site/heartbeat.js). The view (mode, what shows, replay speed) is in the address and kept in this browser
	// (prefs.js); `kiosk=1` shows the picture alone for a wall screen, replaying again if it's a replay.
	import { onMount } from 'svelte';
	import '@fontsource/fredoka/500.css';
	import '@fontsource/fredoka/600.css';
	import '#lib/landscape/landscape.css';
	import Masthead from '#lib/site/Masthead.svelte';
	import Preview from '#lib/site/Preview.svelte';
	import { startHeartbeat } from '#lib/site/heartbeat.js';
	import { track, trackOnLoad } from '#lib/site/track.js';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import { generatorRows } from '#lib/now/generators.js';
	import { feedFrom } from '#lib/landscape/feed.js';
	import { clean, fromQuery, toQuery, load as loadPrefs, save as savePrefs, SPEEDS } from '#lib/landscape/prefs.js';

	const DATA_URL = '/data/tracker.json';
	const DESC = "New Zealand's electricity for kids: a living landscape where the wind, rivers, sun and steam follow the live data.";
	let root = $state<HTMLElement>();
	let error = $state('');
	let ready = $state(false);
	let kiosk = $state(false);
	let prefs = $state(clean(null));
	let sharing = $state(false);
	let copied = $state('');

	// a changed view is kept in this browser and in the address (not in history: Back still leaves the page)
	function keep(p: ReturnType<typeof clean>) {
		if (p.mode !== prefs.mode) track('landscape-mode', { mode: p.mode });
		prefs = p;
		savePrefs(p);
		try { history.replaceState(history.state, '', location.pathname + toQuery(p, { kiosk: kiosk ? '1' : '' })); } catch { /* the view still works */ }
	}
	async function copy(which: 'view' | 'kiosk') {
		const url = location.origin + location.pathname + toQuery(prefs, { kiosk: which === 'kiosk' ? '1' : '' });
		if (which === 'kiosk') track('wall-screen-copy', { page: 'landscape' });
		try { await navigator.clipboard.writeText(url); copied = which; } catch { prompt('Copy this link:', url); }
		setTimeout(() => (copied = ''), 2200);
	}

	onMount(() => {
		const q = new URLSearchParams(location.search);
		kiosk = q.get('kiosk') === '1';
		prefs = fromQuery(q) ?? loadPrefs();
		const stopBeat = startHeartbeat('landscape', { kiosk });
		if (kiosk) trackOnLoad('wall-screen-open', { page: 'landscape' });
		let scene: { setFeed(f: any): void; destroy(): void } | null = null;
		let due = 0, stamp = 0, gone = false;
		async function load() {
			const r = await fetch(DATA_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(`The data file returned ${r.status}.`);
			const D = await r.json();
			due = nextDue(D.meta.end);
			if (D.meta.end === stamp || gone) return;
			stamp = D.meta.end;
			// installed MW by fuel today, for the wind and battery dials
			const cap: Record<string, number> = {};
			for (const row of generatorRows(D)) if (!row.est && row.cap) cap[row.fuel] = (cap[row.fuel] ?? 0) + row.cap;
			const feed = feedFrom(D, cap);
			if (scene) scene.setFeed(feed);
			else {
				const { mountScene } = await import('#lib/landscape/scene.js');
				if (gone) return;
				scene = mountScene(root!, feed, { prefs, onPrefs: keep, loop: kiosk });
				ready = true;
			}
			error = '';
		}
		load().catch((e) => { console.warn('data load failed:', e); error = "Elenz can't reach its data right now. It will try again every minute."; });
		const check = () => { if (document.visibilityState === 'visible' && Date.now() >= due) load().catch(() => {}); };
		const poll = setInterval(check, CHECK_EVERY);
		document.addEventListener('visibilitychange', check);
		return () => { gone = true; stopBeat(); clearInterval(poll); document.removeEventListener('visibilitychange', check); scene?.destroy(); };
	});
</script>

<svelte:head>
	<title>ELENZ · Power landscape</title>
	<meta name="description" content={DESC} />
	<Preview title="Power landscape · ELENZ" description={DESC} path="/landscape" image="/og/landscape.png?v=1" alt="The Elenz power landscape: a storybook New Zealand whose wind turbines, rivers and sun follow the live grid" />
</svelte:head>

<div class="wrap" class:kiosk>
	{#if !kiosk}<Masthead />{/if}
	<main class="ls" class:kiosk bind:this={root}>
		<div class="ls-head">
			<div>
				<h1>Power landscape</h1>
				<p>Where New Zealand's electricity comes from, right now. Everything in the picture follows the real grid.</p>
			</div>
			<div class="when" id="when">Loading…</div>
		</div>
		{#if error}<p class="when" role="status">{error}</p>{/if}
		<noscript><p>The power landscape needs JavaScript turned on.</p></noscript>

		<div class="controls js-only" role="group" aria-label="Scene controls">
			<div class="seg" role="group" aria-label="Mode">
				<button type="button" id="m-now" aria-pressed="true">Right now</button>
				<button type="button" id="m-replay" aria-pressed="false">Replay 24 h</button>
				<button type="button" id="m-play" aria-pressed="false">Play with dials</button>
			</div>
			<button type="button" class="btn" id="labels-btn" aria-pressed="true">Names on</button>
			<button type="button" class="btn" id="hud-btn" aria-pressed="true">Numbers on</button>
			<button type="button" class="btn" id="cards-btn" aria-pressed="true">Cards on</button>
			<button type="button" class="btn" id="birds-btn" aria-pressed="true">Birds on</button>
			<button type="button" class="btn" id="calm-btn" aria-pressed="false">Low motion off</button>
			<button type="button" class="btn" id="fs-btn">Full screen</button>
			<button type="button" class="btn" aria-expanded={sharing} aria-controls="ls-share" onclick={() => (sharing = !sharing)}>Share</button>
			<div class="scrub" id="scrub" hidden>
				<button type="button" class="btn" id="pp" aria-label="Pause replay">Pause</button>
				<input id="scrub-in" type="range" min="0" max="287" step="0.05" value="0" aria-label="Time in the last 24 hours" />
				<output id="scrub-out">--:--</output>
				<span class="speed-l" id="speed-l">A day in</span>
				<div class="seg" id="speed" role="group" aria-labelledby="speed-l">
					{#each SPEEDS as m (m)}<button type="button" data-min={m} aria-pressed={m === 1}>{m} min</button>{/each}
				</div>
			</div>
		</div>
		{#if sharing}
			<div class="ls-share" id="ls-share">
				<p>A link opens this view anywhere: the mode, what's on the picture and the replay speed. This browser keeps it too. The wall-screen link shows the picture alone, with no buttons{prefs.mode === 'replay' ? ', and replays the day again each time it ends' : ''}.</p>
				<div class="share-b">
					<button type="button" class="btn go" onclick={() => copy('view')}>{copied === 'view' ? 'Link copied' : 'Copy link to this view'}</button>
					<button type="button" class="btn go" onclick={() => copy('kiosk')}>{copied === 'kiosk' ? 'Link copied' : 'Copy wall-screen link'}</button>
				</div>
			</div>
		{/if}

		<div class="scene js-only">
			<div class="stage" id="stage">
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv" role="img" aria-label="A storybook New Zealand landscape showing how electricity is being made: wind turbines on a ridge, a hydro dam with its lake and river, a steaming geothermal station, a solar farm, solar panels on houses, a gas power station and batteries, all joined to the town by power lines."></canvas>
				<div class="labels" id="labels"></div>
				<div class="hud" id="hud" aria-hidden="true">
					<div class="hud-card" id="h-clock"><b id="h-time">–</b><span id="h-day"></span></div>
					<div class="hud-card"><b id="h-gen">–</b><span>MW being made</span></div>
					<div class="hud-card"><b id="h-ren">–</b><span>renewable</span></div>
					<div class="vstack"><div class="vbar" id="vstack"></div><div id="vlabs"></div></div>
				</div>
			</div>
			<div class="toasts" id="toasts" aria-live="polite"></div>
			<p class="kcredit">Elenz (elenz.co.nz), from Electricity Authority data</p>
			<div class="fsbar" id="fsbar">
				<button type="button" class="fsb" id="fs-menu-btn" aria-label="Options" aria-expanded="false" aria-controls="fsmenu"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none" /></svg></button>
				<button type="button" class="fsb" id="fs-x" aria-label="Exit full screen"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none" /></svg></button>
				<div class="fsmenu" id="fsmenu" hidden>
					<!-- each takes its name from the page button it mirrors (scene.js, syncMenu) -->
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button type="button" class="btn" data-for="labels-btn"></button>
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button type="button" class="btn" data-for="hud-btn"></button>
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button type="button" class="btn" data-for="cards-btn"></button>
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button type="button" class="btn" data-for="birds-btn"></button>
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button type="button" class="btn" data-for="calm-btn"></button>
				</div>
			</div>
		</div>

		<section class="kid js-only" aria-label="Right now">
			<div class="tile"><small>Electricity being made</small><strong id="k-gen">–</strong><em id="k-gen-s">megawatts across Aotearoa</em></div>
			<div class="tile"><small>Made by nature</small><strong id="k-ren">–</strong><em>wind, water, sun and the earth's heat</em></div>
			<div class="tile"><small>Where it comes from</small><div class="ls-mix" id="mix" aria-hidden="true"></div><em id="k-top">–</em></div>
		</section>

		<section class="dials js-only" aria-labelledby="dials-h">
			<h2 id="dials-h">The dials behind the scene</h2>
			<p class="lede" id="dials-lede">Each part of the picture follows one dial, somewhere between its minimum and maximum, worked out from the live feed.</p>
			<div class="dtable" id="dtable"></div>
		</section>

		<p class="ls-foot">Elenz (elenz.co.nz), from Electricity Authority data. Embedded solar and cloud cover are calculated estimates; the lake level and snow follow the season, not measurements.{#if !ready && !error} Loading the latest data…{/if}</p>
	</main>
</div>
