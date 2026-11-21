<script lang="ts">
	// A plant page's picture panel (review of 19 Nov 2026): a Photos tab and a Location tab in one frame beside Now.
	// Photos: every licensed photo of the plant (plant_images.csv), side by side in a strip that swipes on a phone, with
	// arrows and a count when there is more than one; each credited under it, its links opening in a new tab.
	// Location: the LINZ aerial views (analysis/plant_aerials.py: Site, Close, Wide) and, with a LINZ key, a Map view on
	// the LINZ topolite basemap (MapLibre, loaded only when Map is chosen), with a small locator of the plant's island in
	// the corner. Switching only swaps what is shown, so a click answers at once. Without JavaScript the first tab
	// shows (the photos when there are any), its first view, and the tabs and switches hide. docs/architecture.md,
	// Plant pages.
	import type { Snippet } from 'svelte';
	import { LINZ_BASEMAPS_KEY } from '$app/env/public';
	import { VIEW, NI as NI_PATH, SI as SI_PATH } from '#lib/home/nzmap.js';
	import { toView, islandBox } from './map.js';

	type Photo = { file: string; title: string; author: string; source_url: string; licence: string; licence_url: string };
	type View = { k: string; file: string; across: number; imagery: string };
	type Loc = { lat: number; lon: number; basis: string };
	let { images = [], aerial = null, location = null, island, name, tok, note }: {
		images?: Photo[]; aerial?: View[] | null; location?: Loc | null; island: string; name: string; tok: string; note?: Snippet;
	} = $props();

	const KEY = LINZ_BASEMAPS_KEY;
	const LABEL: Record<string, string> = { site: 'Site', close: 'Close', wide: 'Wide', map: 'Map' };
	const hasPhotos = $derived(images.length > 0);
	const hasLoc = $derived(!!location);
	const views = $derived([...(aerial ?? []).map((v) => v.k), ...(location && KEY ? ['map'] : [])]);
	let tab = $state<'photos' | 'location' | ''>('');
	const shown = $derived(tab || (hasPhotos ? 'photos' : 'location'));
	let k = $state('');
	const vk = $derived(views.includes(k) ? k : views[0] ?? '');
	const av = $derived((aerial ?? []).find((v) => v.k === vk) ?? null);
	const size = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 5000 ? 0 : 1)} km` : `${Math.round(m / 50) * 50} m`);

	// ---------- photos ----------
	let strip = $state<HTMLDivElement>();
	let i = $state(0);
	const im = $derived(images[Math.min(i, images.length - 1)]);
	function onScroll() { if (strip) i = Math.max(0, Math.min(images.length - 1, Math.round(strip.scrollLeft / strip.clientWidth))); }
	function go(d: number) {
		if (!strip) return;
		const j = Math.max(0, Math.min(images.length - 1, i + d));
		strip.scrollTo({ left: j * strip.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		i = j;
	}
	function keys(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') { go(1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
	}

	// ---------- the island locator ----------
	const BOX = { NI: islandBox(NI_PATH), SI: islandBox(SI_PATH) };
	const box = $derived(BOX[island === 'SI' ? 'SI' : 'NI']);
	const pin = $derived(location ? toView(location.lat, location.lon) : null);

	// ---------- the map view ----------
	let mapEl = $state<HTMLDivElement>();
	let map: any = null;
	let mapState = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
	$effect(() => {
		// Leaving the Map view removes its container, so drop the map with it; the next visit builds a new one in the new
		// container (a kept map would still point at the removed one and the view would stay blank).
		if (!mapEl) {
			if (map) { map.remove(); map = null; }
			if (mapState !== 'idle') mapState = 'idle';
			return;
		}
		if (shown !== 'location' || vk !== 'map' || map || mapState === 'failed' || !location) return;
		mapState = 'loading';
		const el = mapEl, at: [number, number] = [location.lon, location.lat];
		const colour = getComputedStyle(document.documentElement).getPropertyValue(tok).trim() || '#2f6f6a';
		(async () => {
			const [lib, worker] = await Promise.all([
				import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')
			]);
			if (!el.isConnected) { mapState = 'idle'; return; }   // the view was switched away while the library loaded
			const ml = (lib as any).default ?? lib;
			ml.setWorkerUrl(worker.default);
			map = new ml.Map({
				container: el, style: `https://basemaps.linz.govt.nz/v1/styles/topolite-v2.json?api=${KEY}`, center: at, zoom: 11,
				minZoom: 5, maxZoom: 16, dragRotate: false, pitchWithRotate: false, cooperativeGestures: true, attributionControl: { compact: true }
			});
			map.touchZoomRotate.disableRotation();
			map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
			map.on('error', (e: any) => { if (mapState !== 'ready' && /style|Failed to fetch|40[13]/i.test(String(e?.error?.message ?? ''))) fail(); });
			map.on('load', () => {
				map.addSource('pt', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: at }, properties: {} } });
				map.addLayer({ id: 'halo', type: 'circle', source: 'pt', paint: { 'circle-radius': 16, 'circle-color': colour, 'circle-opacity': 0.25 } });
				map.addLayer({ id: 'pt', type: 'circle', source: 'pt', paint: { 'circle-radius': 7, 'circle-color': colour, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });
				mapState = 'ready';
			});
		})().catch(fail);
		function fail() { map?.remove(); map = null; mapState = 'failed'; }
	});
	$effect(() => () => { map?.remove(); map = null; });
</script>

<div class="media">
	{#if hasPhotos && hasLoc}
		<div class="tabs seg js-only" role="group" aria-label="Show">
			<button type="button" aria-pressed={shown === 'photos'} onclick={() => (tab = 'photos')}>{images.length > 1 ? `Photos (${images.length})` : 'Photo'}</button>
			<button type="button" aria-pressed={shown === 'location'} onclick={() => (tab = 'location')}>Location</button>
		</div>
	{/if}

	{#if shown === 'photos' && im}
		<figure class="pane photos">
			<div class="frame">
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div class="strip" bind:this={strip} onscroll={onScroll} onkeydown={keys} tabindex={images.length > 1 ? 0 : undefined}
					role={images.length > 1 ? 'region' : undefined} aria-label={images.length > 1 ? `Photos of ${name}, ${images.length}; use the arrow keys to move between them` : undefined}>
					{#each images as x, j (x.file)}
						<img src="/plants/{x.file}" alt={x.title} width="1600" height="1024" loading={j ? 'lazy' : 'eager'} decoding="async" />
					{/each}
				</div>
				{#if images.length > 1}
					<button type="button" class="step prev js-only" aria-label="Previous photo" disabled={i === 0} onclick={() => go(-1)}>‹</button>
					<button type="button" class="step next js-only" aria-label="Next photo" disabled={i === images.length - 1} onclick={() => go(1)}>›</button>
					<span class="count">{i + 1} of {images.length}</span>
				{/if}
			</div>
			<figcaption>Photo: {im.author}, <a href={im.source_url} target="_blank" rel="noopener">{im.title}</a>, {#if im.licence_url}<a href={im.licence_url} target="_blank" rel="noopener">{im.licence}</a>{:else}{im.licence}{/if}</figcaption>
		</figure>
	{:else if shown === 'location' && location}
		<figure class="pane loc">
			<div class="frame">
				{#if vk === 'map'}
					<div class="ml" bind:this={mapEl} role="region" aria-label="Map around {name}"></div>
					{#if mapState === 'failed'}<p class="fail">The map can’t load right now. The aerial views still work.</p>{/if}
				{:else if av}
					<img src="/plants/{av.file}" alt="Aerial view of {name}, about {size(av.across)} across" width="1000" height="640" loading={hasPhotos ? 'lazy' : 'eager'} decoding="async" />
				{:else}
					<svg class="big" viewBox="{box.join(' ')}" role="img" aria-label="Map of the {island === 'SI' ? 'South' : 'North'} Island with {name} marked">
						<path d={island === 'SI' ? SI_PATH : NI_PATH} class="land" />
						{#if pin}<circle cx={pin[0]} cy={pin[1]} r={box[2] / 30} class="halo" style="--c: var({tok})" /><circle cx={pin[0]} cy={pin[1]} r={box[2] / 70} class="dot" style="--c: var({tok})" />{/if}
					</svg>
				{/if}
				{#if views.length > 1}
					<div class="views seg js-only" role="group" aria-label="View">
						{#each views as x (x)}<button type="button" aria-pressed={x === vk} onclick={() => (k = x)}>{LABEL[x] ?? x}</button>{/each}
					</div>
				{/if}
				{#if pin && (av || vk === 'map')}
					<svg class="locator" viewBox="{box.join(' ')}" aria-hidden="true">
						<path d={island === 'SI' ? SI_PATH : NI_PATH} class="land" />
						<circle cx={pin[0]} cy={pin[1]} r={box[2] / 18} class="dot" style="--c: var({tok})" />
					</svg>
				{/if}
			</div>
			<figcaption>
				{#if vk === 'map'}Map: Toitū Te Whenua LINZ, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.
				{:else if av}Aerial view, about {size(av.across)} across{av.k !== 'site' ? '; the ring marks the station' : ''}. Imagery: {av.imagery ? `${av.imagery}, ` : ''}Toitū Te Whenua LINZ, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.
				{:else}Outline: Electricity Authority network zones, CC BY 4.0.{/if}
				{#if note}<span class="note">{@render note()}</span>{/if}
			</figcaption>
		</figure>
	{/if}
</div>

<style>
	.media { display: grid; gap: 8px; align-content: start; min-width: 0; }
	.tabs { justify-self: start; }
	.pane { margin: 0; display: grid; gap: 6px; align-content: start; min-width: 0; }
	.frame { position: relative; aspect-ratio: 1000 / 640; border-radius: 4px; overflow: hidden; background: var(--grid); }
	.frame img, .ml, .big { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
	.frame > img { object-fit: cover; }
	.strip { position: absolute; inset: 0; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
	.strip::-webkit-scrollbar { display: none; }
	.strip:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.strip img { position: static; flex: 0 0 100%; width: 100%; height: 100%; object-fit: cover; scroll-snap-align: start; }
	.step { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
		background: rgb(255 255 255 / 0.88); color: #132020; font-size: 1.5rem; line-height: 1; box-shadow: 0 1px 3px rgb(0 0 0 / 0.3); }
	.step:disabled { opacity: 0; pointer-events: none; }
	.step:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.prev { left: 8px; }
	.next { right: 8px; }
	.count { position: absolute; bottom: 8px; right: 8px; font-size: 0.74rem; background: rgb(0 0 0 / 0.55); color: #fff; border-radius: 3px; padding: 1px 6px; }
	.views { position: absolute; top: 8px; right: 8px; background: var(--surface); box-shadow: 0 1px 3px rgb(0 0 0 / 0.3); }
	.locator { position: absolute; left: 8px; bottom: 8px; width: auto; height: 34%; max-height: 120px; aspect-ratio: auto;
		background: rgb(255 255 255 / 0.9); border-radius: 4px; padding: 4px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.3); pointer-events: none; }
	.locator .land { fill: #c9d3d1; stroke: #6c7b79; stroke-width: 1.2; }
	.big { background: var(--surface); padding: 8px; box-sizing: border-box; }
	.big .land { fill: var(--grid); stroke: var(--muted); stroke-width: 1; }
	.halo { fill: var(--c); opacity: 0.3; }
	.dot { fill: var(--c); stroke: #ffffff; stroke-width: 2; }
	.fail { position: absolute; inset: auto 8px 8px; margin: 0; background: var(--surface); color: var(--ink-2); font-size: 0.82rem; padding: 6px 10px; border-radius: 4px; }
	figcaption { font-size: 0.78rem; color: var(--muted); line-height: 1.45; }
	figcaption a { color: inherit; }
	.note { display: block; margin-top: 2px; }
</style>
