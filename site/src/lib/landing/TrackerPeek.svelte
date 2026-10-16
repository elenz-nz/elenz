<script lang="ts">
	// A glimpse of the Tracker for the landing page: the last 24 hours of generation, stacked by fuel.
	// A pin travels along it from 24 hours ago to now as the chart scrolls up the screen (hovering moves it too),
	// with the time, total and renewable share at that point. No y axis: the top of the chart is a rounded-up
	// maximum, so a label there would read as a figure it isn't.
	import { onMount } from 'svelte';
	import { recent } from '#lib/home/now.js';

	let { D }: { D: any; now?: any } = $props();

	const W = 600, H = 210, TOP = 8;
	const S = $derived(recent(D, 24, 3));
	const max = $derived.by(() => {
		let m = 0;
		for (let i = 0; i < S.t.length; i++) m = Math.max(m, S.layers.reduce((a, l) => a + l.v[i], 0));
		return Math.ceil(m / 1000) * 1000 || 1000;
	});
	const x = (i: number) => (i / Math.max(1, S.t.length - 1)) * W;
	const y = (v: number) => H - (v / max) * (H - TOP);
	// each layer as a closed path between its base and its top
	const areas = $derived.by(() => {
		const base = new Array(S.t.length).fill(0);
		return S.layers.map((l) => {
			const lo = base.slice();
			l.v.forEach((v, i) => (base[i] += v));
			const top = base.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
			const bot = lo.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse();
			return { ...l, d: `M${top.join('L')}L${bot.join('L')}Z` };
		});
	});
	// a tick at every six hours, New Zealand time
	const HOUR = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: true });
	const ticks = $derived.by(() => {
		const out: { x: number; label: string }[] = [];
		S.t.forEach((t, i) => {
			const p = HOUR.formatToParts(new Date(t));
			const h = Number(p.find((q) => q.type === 'hour')?.value);
			const pm = /p/i.test(p.find((q) => q.type === 'dayPeriod')?.value ?? '');
			const h24 = (h % 12) + (pm ? 12 : 0);
			if (h24 % 6 === 0 && new Date(t).getUTCMinutes() < 15 && i > S.t.length * 0.04 && i < S.t.length * 0.96 && (!out.length || (x(i) / W) * 100 - out[out.length - 1].x > 7))
				out.push({ x: (x(i) / W) * 100, label: h24 === 0 ? 'midnight' : h24 === 12 ? 'noon' : `${h} ${pm ? 'pm' : 'am'}` });
		});
		return out;
	});

	// the pin: f runs 0 (24 hours ago) to 1 (now)
	const TIME = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
	const timeOf = (t: number) => {
		const p = Object.fromEntries(TIME.formatToParts(new Date(t)).map((q) => [q.type, q.value]));
		return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} ${p.weekday}`;
	};
	let root: HTMLElement;
	let plot: HTMLElement;
	let scrollF = $state(1);
	let hoverF = $state<number | null>(null);
	const f = $derived(hoverF ?? scrollF);
	const pin = $derived.by(() => {
		const n = S.t.length;
		if (n < 2) return null;
		const fi = f * (n - 1), i = Math.min(n - 2, Math.floor(fi)), w = fi - i;
		const at = (a: number[]) => a[i] + (a[i + 1] - a[i]) * w;
		let tot = 0, ren = 0;
		for (const l of S.layers) { const v = at(l.v); tot += v; if (l.ren) ren += v; }
		const j = Math.round(fi);
		return { left: f * 100, top: (y(tot) / H) * 100, mw: Math.round(tot).toLocaleString('en-NZ'),
			ren: tot > 0 ? Math.round((ren / tot) * 100) : 0, time: j === n - 1 ? 'Now' : timeOf(S.t[j]) };
	});
	function hover(e: PointerEvent) {
		const r = plot.getBoundingClientRect();
		hoverF = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
	}

	onMount(() => {
		// 0 while the chart's middle is low on the screen, 1 once it has risen to the upper third
		let raf = 0;
		const update = () => {
			raf = 0;
			const r = root.getBoundingClientRect(), vh = window.innerHeight;
			const mid = r.top + r.height / 2, from = vh * 0.85, to = vh * 0.32;
			scrollF = Math.min(1, Math.max(0, (from - mid) / (from - to)));
		};
		const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
		update();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
	});
</script>

<div class="trk-peek" bind:this={root}>
	<div class="plot" role="img" aria-label="Generation over the last 24 hours, stacked by fuel" bind:this={plot} onpointermove={hover} onpointerdown={hover} onpointerleave={() => (hoverF = null)}>
		<div class="chart">
			<svg viewBox="0 0 {W} {H}" aria-hidden="true">
				<defs>
					<pattern id="pk-hatch-trk" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect width="4" height="4" class="hb" /><rect width="2" height="4" class="hf" />
					</pattern>
				</defs>
				{#each [0.25, 0.5, 0.75] as g}<line class="grid" x1="0" x2={W} y1={y(max * g)} y2={y(max * g)} />{/each}
				{#each areas as a}<path d={a.d} style="fill:{a.hatch ? 'url(#pk-hatch-trk)' : `var(${a.tok})`}" />{/each}
				<line class="axis" x1="0" x2={W} y1={H} y2={H} />
			</svg>
			{#if pin}<span class="pin" style="left:{pin.left}%;top:{pin.top}%"></span>{/if}
		</div>
		{#if pin}
			<span class="guide" style="left:{pin.left}%"></span>
			<span class="read" style="left:clamp(84px, {pin.left}%, calc(100% - 84px))"><b>{pin.mw} MW</b><span>{pin.ren}% renewable · {pin.time}</span></span>
		{/if}
	</div>
	<div class="ticks">{#each ticks as t}<span style="left:{t.x}%">{t.label}</span>{/each}</div>
	<ul class="key">
		{#each [...S.layers].reverse() as l}<li><span class="sw" class:hatch={l.hatch} style="--c:var({l.tok})"></span>{l.name}</li>{/each}
	</ul>
</div>

<style>
	.trk-peek { display: grid; gap: 4px; }
	.plot { position: relative; padding-top: 44px; touch-action: pan-y; }
	svg { display: block; width: 100%; height: auto; }
	path { stroke: none; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.axis { stroke: var(--line); stroke-width: 1; }
	/* the pin: a line from under the readout down to the axis, through a dot on top of the stack */
	.chart { position: relative; }
	.guide { position: absolute; top: 36px; bottom: 0; width: 1px; margin-left: -0.5px; pointer-events: none;
		background: linear-gradient(to bottom, color-mix(in srgb, var(--ink) 15%, transparent), color-mix(in srgb, var(--ink) 55%, transparent)); }
	.pin { position: absolute; z-index: 1; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border-radius: 50%; background: var(--surface); border: 2px solid var(--ink); box-sizing: border-box; pointer-events: none; }
	.read { position: absolute; top: 0; transform: translateX(-50%); display: grid; gap: 1px; text-align: center; white-space: nowrap; pointer-events: none;
		font-size: 0.72rem; color: var(--muted); }
	.read b { font-family: var(--font-data); font-size: 0.9rem; font-weight: 600; color: var(--ink); }
	.hb { fill: color-mix(in srgb, var(--f-solar) 30%, transparent); }
	.hf { fill: var(--f-solar); }
	.ticks { position: relative; height: 16px; font-family: var(--font-data); font-size: 0.7rem; color: var(--muted); }
	.ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
	.key { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.76rem; color: var(--ink-2); }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: var(--c); margin-right: 6px; vertical-align: -1px; }
	.hatch { background: repeating-linear-gradient(135deg, var(--c) 0 2px, color-mix(in srgb, var(--c) 30%, transparent) 2px 4px); }
</style>
