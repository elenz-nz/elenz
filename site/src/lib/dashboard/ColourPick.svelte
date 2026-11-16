<script lang="ts">
	// Plain colour's own picker (/dashboard): three sliders (colour, strength, shade) and a box for a hex code, drawn in
	// the site's style. The browser's own picker (input type=color) opens a different dialog on every system, so it isn't
	// used. Each slider's track shows the colours it moves through. The screen follows while a slider moves (oninput);
	// the layout is saved and the address updated when it is let go (onchange).
	import { toHsl, fromHsl } from './layout.js';

	let { value, oninput, onchange }: { value: string; oninput: (hex: string) => void; onchange: (hex: string) => void } = $props();

	// the starting colour; later changes from outside are followed below
	// svelte-ignore state_referenced_locally
	let hsl = $state(toHsl(value));
	// svelte-ignore state_referenced_locally
	let text = $state(value);
	// svelte-ignore state_referenced_locally
	let own = value;                       // the last colour this picker made: a different value came from a preset
	$effect(() => {
		if (value !== own) { hsl = toHsl(value); own = value; text = value; }
	});

	const hex = $derived(fromHsl(hsl));
	function move(k: 'h' | 's' | 'l', v: number, done: boolean) {
		hsl = { ...hsl, [k]: v };
		own = fromHsl(hsl);
		text = own;
		(done ? onchange : oninput)(own);
	}
	function typed(v: string, done: boolean) {
		text = v;
		const h = v.trim().replace(/^#/, '').toLowerCase();
		if (!/^[0-9a-f]{6}$/.test(h)) return;
		own = h;
		hsl = toHsl(h);
		(done ? onchange : oninput)(h);
	}
	const c = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`;
	const hueTrack = $derived(`linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((h) => c(h, 75, 50)).join(', ')})`);
	const satTrack = $derived(`linear-gradient(90deg, ${c(hsl.h, 0, hsl.l)}, ${c(hsl.h, 100, hsl.l)})`);
	const litTrack = $derived(`linear-gradient(90deg, ${c(hsl.h, hsl.s, 0)}, ${c(hsl.h, hsl.s, 50)}, ${c(hsl.h, hsl.s, 100)})`);
	const rows = $derived([
		{ k: 'h' as const, name: 'Colour', min: 0, max: 360, track: hueTrack },
		{ k: 's' as const, name: 'Strength', min: 0, max: 100, track: satTrack },
		{ k: 'l' as const, name: 'Shade', min: 0, max: 100, track: litTrack },
	]);
</script>

<div class="cp">
	<span class="prev" style="background:#{hex}" aria-hidden="true"></span>
	<div class="sl">
		{#each rows as r (r.k)}
			<label>
				<span>{r.name}</span>
				<input type="range" min={r.min} max={r.max} step="1" value={hsl[r.k]} style="--track:{r.track}"
					oninput={(e) => move(r.k, +(e.currentTarget as HTMLInputElement).value, false)}
					onchange={(e) => move(r.k, +(e.currentTarget as HTMLInputElement).value, true)} />
			</label>
		{/each}
		<label class="hx">
			<span>Code</span>
			<input type="text" value={'#' + text.replace(/^#/, '')} maxlength="7" spellcheck="false" autocomplete="off" aria-label="Colour code, six hex digits"
				oninput={(e) => typed((e.currentTarget as HTMLInputElement).value, false)}
				onchange={(e) => typed((e.currentTarget as HTMLInputElement).value, true)} />
		</label>
	</div>
</div>

<style>
	.cp { display: flex; gap: 14px; align-items: stretch; padding: 12px; border: 1px solid var(--line); border-radius: 4px; background: var(--bg); }
	.prev { flex: none; width: 52px; border-radius: 3px; border: 1px solid var(--line); }
	.sl { flex: 1; min-width: 0; display: grid; gap: 8px; }
	label { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr); align-items: center; gap: 10px; font-size: 0.78rem; font-weight: 500; color: var(--ink-2); }
	input[type='range'] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 0; background: transparent; cursor: pointer; }
	input[type='range']::-webkit-slider-runnable-track { height: 12px; border-radius: 3px; background: var(--track); border: 1px solid var(--line); }
	input[type='range']::-moz-range-track { height: 12px; border-radius: 3px; background: var(--track); border: 1px solid var(--line); }
	input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 20px; margin-top: -5px; border-radius: 3px;
		background: var(--surface); border: 2px solid var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.35); }
	input[type='range']::-moz-range-thumb { width: 8px; height: 16px; border-radius: 3px; background: var(--surface); border: 2px solid var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.35); }
	input[type='range']:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
	.hx input { width: 7.5rem; font: 0.8rem var(--font-data); padding: 5px 7px; border: 1px solid var(--line); border-radius: 3px; background: var(--surface); color: var(--ink); }
	.hx input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
