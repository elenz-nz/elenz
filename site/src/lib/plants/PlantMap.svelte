<script lang="ts">
	// The plant index's map: each plant at its point, coloured by fuel and sized by installed MW (or, with `sizes`, by
	// its output now: the index's "Output now" switch, review of 19 Nov 2026), on the LINZ topolite
	// basemap (Toitū Te Whenua LINZ, CC BY 4.0) drawn by MapLibre GL JS. The library (about 300 KB gzipped, and its
	// worker) loads only on this page, after the first paint. Without a LINZ key (LINZ_BASEMAPS_KEY, a build variable in
	// src/env.ts, never committed), without WebGL, or if the basemap fails, the page keeps the drawn outline map it is
	// prerendered with (#lib/home/nzmap.js, as the plant pages' location panel). docs/architecture.md, Plant pages.
	import { onMount } from 'svelte';
	import { LINZ_BASEMAPS_KEY } from '$app/env/public';
	import { VIEW, NI as NI_PATH, SI as SI_PATH } from '#lib/home/nzmap.js';
	import { toView, aerialSource } from './map.js';
	import { dotSize, fuelName, type Plant } from './list.js';
	import { fuelOf } from './registry.js';
	import { fmtMw } from './history.js';

	let { plants, sel = '', island = '', sizes = null, onpick }: { plants: Plant[]; sel?: string; island?: string; sizes?: Map<string, number> | null; onpick: (slug: string) => void } = $props();
	const mwOf = (p: Plant) => (sizes ? sizes.get(p.slug) ?? 0 : p.mw ?? 0);

	const KEY = LINZ_BASEMAPS_KEY;
	const STYLE = `https://basemaps.linz.govt.nz/v1/styles/topolite-v2.json?api=${KEY}`;
	type Box = [[number, number], [number, number]];
	const NZ: Box = [[166.2, -47.4], [178.7, -34.2]];   // the whole country, Stewart Island to Cape Rēinga
	const FIT: Record<string, Box> = { NI: [[172.5, -41.7], [178.7, -34.2]], SI: [[166.2, -47.4], [174.5, -40.4]] };
	const view = () => FIT[island] ?? NZ;

	let box: HTMLDivElement;
	let mode = $state<'outline' | 'loading' | 'map'>('outline');
	let map: any = null;
	let ml: any = null;
	let colours: Record<string, string> = {};
	let base = $state<'map' | 'sat'>('map');
	// Satellite: LINZ's aerial tiles drawn over the topolite basemap and under the plants' dots
	$effect(() => {
		const b = base;
		if (mode === 'map' && map?.getLayer('aerial')) map.setLayoutProperty('aerial', 'visibility', b === 'sat' ? 'visible' : 'none');
	});

	const label = (p: Plant) => `${p.name}, ${fuelName(p.fuel).toLowerCase()}, ${fmtMw(p.mw)} MW${sizes && p.status === 'operating' ? `, ${fmtMw(sizes.get(p.slug) ?? 0)} MW now` : ''}${p.status === 'closed' ? ', closed' : ''}${p.pt && !p.pt.checked ? ' (location not checked yet)' : ''}`;
	const shown = $derived(plants.filter((p) => p.pt));
	// the outline map: largest first, so small dots sit on top
	const dots = $derived(shown.slice().sort((a, b) => mwOf(b) - mwOf(a)).map((p) => {
		const [x, y] = toView(p.pt!.lat, p.pt!.lon);
		return { p, x: (100 * x) / VIEW.w, y: (100 * y) / VIEW.h, d: dotSize(mwOf(p)) };
	}));

	function features(list: Plant[]) {
		return {
			type: 'FeatureCollection',
			features: list.slice().sort((a, b) => mwOf(b) - mwOf(a)).map((p) => ({
				type: 'Feature', id: p.slug,
				geometry: { type: 'Point', coordinates: [p.pt!.lon, p.pt!.lat] },
				properties: { slug: p.slug, name: p.name, r: dotSize(mwOf(p)) / 2, c: colours[p.fuel] ?? '#7a8a89', closed: p.status === 'closed' ? 1 : 0,
					draft: p.pt!.checked ? 0 : 1, tip: label(p) }
			}))
		};
	}

	// keep the map's dots and ring in step with the filters and the selection
	$effect(() => {
		const data = features(shown);
		if (mode === 'map' && map) map.getSource('plants')?.setData(data);
	});
	$effect(() => {
		const s = sel;
		if (mode !== 'map' || !map) return;
		map.setFilter('sel', ['==', ['get', 'slug'], s]);
		const p = shown.find((q) => q.slug === s);
		if (p && !map.getBounds().contains([p.pt!.lon, p.pt!.lat])) map.easeTo({ center: [p.pt!.lon, p.pt!.lat], duration: 600 });
	});
	// an island filter frames that island; back to both, the whole country
	let framed = '';
	$effect(() => {
		const k = island;
		if (mode !== 'map' || !map || k === framed) return;
		framed = k;
		map.fitBounds(view(), { padding: 12, duration: 600 });
	});

	function webgl() {
		try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
	}

	onMount(() => {
		if (!KEY || !webgl()) return;
		let gone = false;
		mode = 'loading';
		const css = getComputedStyle(document.documentElement);
		for (const p of plants) colours[p.fuel] ??= css.getPropertyValue(fuelOf(p.fuel).tok).trim() || '#7a8a89';
		const ink = css.getPropertyValue('--ink').trim() || '#132020';
		(async () => {
			const [lib, worker] = await Promise.all([
				import('maplibre-gl'),
				import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
				import('maplibre-gl/dist/maplibre-gl.css')
			]);
			if (gone) return;
			ml = (lib as any).default ?? lib;
			ml.setWorkerUrl(worker.default);
			map = new ml.Map({
				container: box, style: STYLE, bounds: view(), fitBoundsOptions: { padding: 12 }, maxBounds: [[160, -50], [185, -31]],
				minZoom: 3.5, maxZoom: 15, dragRotate: false, pitchWithRotate: false, attributionControl: { compact: true },
				cooperativeGestures: false
			});
			map.touchZoomRotate.disableRotation();
			map.keyboard.disableRotation();
			map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
			map.addControl({
				onAdd() {
					const el = document.createElement('div');
					el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
					el.innerHTML = '<button type="button" class="nz-all" aria-label="Show all of New Zealand" title="Show all of New Zealand"><svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>';
					el.querySelector('button')!.addEventListener('click', () => map.fitBounds(NZ, { padding: 12 }));
					return el;
				},
				onRemove() {}
			}, 'top-right');
			map.on('error', (e: any) => { if (mode !== 'map' && /style|Failed to fetch|40[13]/i.test(String(e?.error?.message ?? ''))) fail(); });
			map.on('load', () => {
				if (gone) return;
				map.addSource('aerial', aerialSource(KEY));
				map.addLayer({ id: 'aerial', type: 'raster', source: 'aerial', layout: { visibility: base === 'sat' ? 'visible' : 'none' } });
				map.addSource('plants', { type: 'geojson', data: features(shown) });
				map.addLayer({ id: 'plants', type: 'circle', source: 'plants', paint: {
					'circle-radius': ['get', 'r'],
					'circle-color': ['case', ['==', ['get', 'closed'], 1], '#ffffff', ['get', 'c']],
					'circle-opacity': ['case', ['==', ['get', 'draft'], 1], 0.55, 0.9],
					'circle-stroke-color': ['case', ['==', ['get', 'closed'], 1], ['get', 'c'], '#ffffff'],
					'circle-stroke-width': ['case', ['==', ['get', 'closed'], 1], 2, 1.2],
					'circle-stroke-opacity': ['case', ['==', ['get', 'draft'], 1], 0.7, 1]
				} });
				map.addLayer({ id: 'sel', type: 'circle', source: 'plants', filter: ['==', ['get', 'slug'], sel], paint: {
					'circle-radius': ['+', ['get', 'r'], 3], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ink, 'circle-stroke-width': 2.5
				} });
				const tip = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'plant-tip' });
				map.on('mousemove', 'plants', (e: any) => {
					map.getCanvas().style.cursor = 'pointer';
					const f = e.features[0];
					tip.setLngLat(f.geometry.coordinates).setText(f.properties.tip).addTo(map);
				});
				map.on('mouseleave', 'plants', () => { map.getCanvas().style.cursor = ''; tip.remove(); });
				map.on('click', 'plants', (e: any) => onpick(e.features[0].properties.slug));
				framed = island;
				mode = 'map';
			});
		})().catch(fail);
		function fail() {
			if (gone) return;
			map?.remove();
			map = null;
			mode = 'outline';
		}
		return () => { gone = true; map?.remove(); };
	});
</script>

<div class="pmap" class:live={mode !== 'outline'}>
	<div class="ml" bind:this={box} aria-label="Map of the plants. The table below lists the same plants." role="region"></div>
	{#if mode === 'map'}
		<div class="bm" role="group" aria-label="Map style">
			<button type="button" aria-pressed={base === 'map'} onclick={() => (base = 'map')}>Map</button>
			<button type="button" aria-pressed={base === 'sat'} onclick={() => (base = 'sat')}>Satellite</button>
		</div>
	{/if}
	{#if mode !== 'map'}
		<div class="outline" class:fading={mode === 'loading'}>
			<svg viewBox="0 0 {VIEW.w} {VIEW.h}" aria-hidden="true"><path d={NI_PATH} /><path d={SI_PATH} /></svg>
			{#each dots as d (d.p.slug)}
				<button type="button" class="dot" class:closed={d.p.status === 'closed'} class:draft={!d.p.pt!.checked} class:on={d.p.slug === sel}
					style="left:{d.x}%;top:{d.y}%;--d:{d.d}px;--c:var({fuelOf(d.p.fuel).tok})" aria-label={label(d.p)} title={label(d.p)}
					onclick={() => onpick(d.p.slug)}></button>
			{/each}
		</div>
	{/if}
</div>
<p class="cap">{#if mode === 'map'}Drag to move, pinch or scroll to zoom. Tap a dot for its plant. {base === 'sat' ? 'Imagery' : 'Basemap'}: Toitū Te Whenua LINZ, CC BY 4.0.{:else}Tap a dot for its plant. Outline: Electricity Authority network zones, CC BY 4.0.{/if}</p>

<style>
	.pmap { position: relative; width: 100%; }
	.ml { position: absolute; inset: 0; }
	.pmap:not(.live) .ml { display: none; }
	.pmap.live { aspect-ratio: 5 / 6; max-height: min(80vh, 780px); min-height: 360px; border-radius: 3px; overflow: hidden; background: #b8dcf2; }
	.outline { position: relative; width: 100%; max-width: 520px; margin: 0 auto; aspect-ratio: 420 / 607; }
	.live .outline { position: absolute; inset: 0; margin: 0 auto; max-width: none; aspect-ratio: auto; transition: opacity 0.3s; }
	.outline.fading { opacity: 0.5; }
	.outline svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
	.outline path { fill: var(--grid); stroke: var(--line); stroke-width: 0.8; }
	.dot { position: absolute; width: var(--d); height: var(--d); margin: calc(var(--d) / -2) 0 0 calc(var(--d) / -2); padding: 0; border-radius: 50%;
		background: var(--c); border: 1.5px solid var(--surface); opacity: 0.9; cursor: pointer; box-sizing: border-box; }
	.dot.draft { opacity: 0.55; }
	.dot.closed { background: var(--surface); border: 2px solid var(--c); }
	.dot.on { box-shadow: 0 0 0 2.5px var(--ink); opacity: 1; z-index: 1; }
	.dot:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; z-index: 2; }
	.bm { position: absolute; top: 10px; left: 10px; z-index: 2; display: flex; background: var(--surface); border-radius: 4px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.3); overflow: hidden; }
	.bm button { font: 0.8rem/1 var(--font-ui); padding: 7px 10px; border: 0; background: transparent; color: var(--ink); cursor: pointer; }
	.bm button[aria-pressed='true'] { background: var(--ink); color: var(--surface); }
	.bm button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.cap { margin: 6px 4px 0; color: var(--muted); font-size: 0.76rem; line-height: 1.45; }
	.pmap :global(.nz-all) { display: grid; place-items: center; color: #333; }
	.pmap :global(.plant-tip .maplibregl-popup-content) { font: 0.82rem/1.35 var(--font-ui); padding: 5px 9px; color: #132020; }
</style>
