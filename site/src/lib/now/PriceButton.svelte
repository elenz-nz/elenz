<script lang="ts">
	// The price explainer's button, in /now's wholesale price tile: quiet most of the time ("Why this price?"), lit when
	// the explainer has something to say (prices up, the islands split, a new low), and it opens the explainer card
	// that drops down under the tiles (PriceExplainer.svelte). explain.js decides the state.
	let { x, open, onclick }: { x: { tier: string; variant: string; newLow: boolean; nearZero: boolean }; open: boolean; onclick: () => void } = $props();
	const lit = $derived(x.tier !== 'quiet');
	const label = $derived(
		x.tier === 'open' ? 'High price' : x.variant === 'split' ? 'Islands split' : x.variant === 'high' ? 'Prices up'
		: x.variant === 'low' && lit ? (x.newLow ? 'New low' : x.nearZero ? 'Near zero' : 'Low') : ''
	);
</script>

<button type="button" class="why" class:lit class:low={x.variant === 'low'} aria-expanded={open} aria-controls="pe-body" {onclick}>
	{#if label}<span class="dot" aria-hidden="true"></span>{label}<span class="w" aria-hidden="true">&nbsp;·&nbsp;</span>{/if}<span class:w={!!label && !open}>{open ? 'Hide' : label ? 'Why?' : 'Why this price?'}</span>
	<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" class:up={open}><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
</button>

<style>
	.why { justify-self: start; display: inline-flex; align-items: center; gap: 5px; margin-top: 2px; font: inherit; font-size: 0.76rem; font-weight: 600; color: var(--accent);
		background: transparent; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; min-height: 26px; cursor: pointer; white-space: nowrap; }
	.why:hover { border-color: var(--accent); }
	.why:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.why svg { transition: transform 0.15s; }
	.why svg.up { transform: rotate(180deg); }
	.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
	/* lit: prices up or the islands split (amber), a new low (teal) */
	.why.lit { color: var(--surface); background: var(--warn-ink); border-color: var(--warn-ink); }
	.why.lit:hover { filter: brightness(1.1); }
	.why.lit.low { background: var(--accent); border-color: var(--accent); }
	.why { max-width: 100%; box-sizing: border-box; }
	/* narrow phones: the label and the arrow only, so "Islands split" fits its tile (owner's report NOW-08) */
	@media (max-width: 420px) { .why .w { display: none; } }
</style>
