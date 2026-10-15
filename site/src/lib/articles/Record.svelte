<script lang="ts">
	// A record callout: the new figure big, what it beat underneath.
	//   <Record label="Peak demand, New Zealand" value="…" unit="MW" when="6:00 pm Tue 24 Jun 2026"
	//           previous="… MW, 9 Aug 2021" fuel="--accent" />
	// fuel: any colour token from tracker.css (--f-wind, --f-hydro, --g-ren…) for the left edge
	let {
		label, value, unit = '', when = '', previous = '', fuel = '--accent'
	}: { label: string; value: string; unit?: string; when?: string; previous?: string; fuel?: string } = $props();
</script>

<aside class="record" style="--c: var({fuel})">
	<p class="r-label">{label}</p>
	<p class="r-value"><span>{value}</span>{#if unit}<small>{unit}</small>{/if}</p>
	{#if when}<p class="r-when">{when}</p>{/if}
	{#if previous}<p class="r-prev"><span>Previous record</span>{previous}</p>{/if}
</aside>

<style>
	.record { margin: 0; padding: 14px 18px 15px; border: 1px solid var(--line); border-left: 4px solid var(--c); border-radius: 4px;
		background: var(--surface); display: grid; gap: 3px; max-width: 30rem; }
	.record p { margin: 0; max-width: none; }
	.r-label { font-size: 0.72rem !important; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted) !important; }
	.r-value { font-size: 2.1rem !important; font-weight: 600; line-height: 1.1 !important; color: var(--ink) !important; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
	.r-value small { font-size: 0.95rem; font-weight: 500; color: var(--muted); margin-left: 6px; letter-spacing: 0; }
	.r-when { font-size: 0.86rem !important; color: var(--ink-2) !important; }
	.r-prev { font-size: 0.82rem !important; color: var(--muted) !important; padding-top: 6px; margin-top: 4px !important; border-top: 1px solid var(--grid); }
	.r-prev span { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; margin-right: 8px; }
</style>
