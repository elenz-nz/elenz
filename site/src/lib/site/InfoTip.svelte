<script lang="ts">
	// The ⓘ beside a chart's heading: the note that used to sit under the chart, in a small popover (one style for
	// every chart on the Tracker, Prices, Now and article pages). Opens on click or tap; Escape, a click outside or
	// scrolling closes it. Fixed to the window so a card's overflow never clips it.
	//   <InfoTip label="About this chart">Dashed: the same dates a year earlier. <a href="/methods/…">How</a></InfoTip>
	import type { Snippet } from 'svelte';
	let { label = 'About this chart', children }: { label?: string; children: Snippet } = $props();

	let open = $state(false);
	let btn = $state<HTMLButtonElement>();
	let pop = $state<HTMLDivElement>();
	let pos = $state({ top: 0, left: 0 });
	const id = 'info-' + Math.random().toString(36).slice(2, 9);

	function place() {
		if (!btn) return;
		const r = btn.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24);
		pos = { top: r.bottom + 6, left: Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) };
	}
	function toggle() { if (!open) place(); open = !open; }
	function outside(e: Event) { if (open && !btn?.contains(e.target as Node) && !pop?.contains(e.target as Node)) open = false; }
	function key(e: KeyboardEvent) { if (open && e.key === 'Escape') { open = false; btn?.focus(); } }
</script>

<svelte:window onclick={outside} onkeydown={key} onscroll={() => (open = false)} onresize={() => open && place()} />

<button type="button" class="info-tip" bind:this={btn} aria-expanded={open} aria-controls={id} aria-label={label} title={label} onclick={toggle}>
	<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><circle cx="10" cy="6.2" r="1.15" fill="currentColor" /></svg>
</button>
<div class="info-pop-tip" {id} role="note" bind:this={pop} hidden={!open} style="top: {pos.top}px; left: {pos.left}px">
	{@render children()}
</div>

<style>
	.info-tip { display: inline-grid; place-items: center; flex: none; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; vertical-align: middle; }
	.info-tip:hover, .info-tip[aria-expanded='true'] { color: var(--ink); background: var(--grid); }
	.info-tip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
	.info-pop-tip { position: fixed; z-index: 40; width: min(340px, calc(100vw - 24px)); padding: 10px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.16); color: var(--ink-2); font-size: 0.8rem; line-height: 1.5; font-weight: 400; text-align: left; letter-spacing: normal; text-transform: none; }
	.info-pop-tip[hidden] { display: none; }
	.info-pop-tip :global(a) { color: var(--accent); }
	.info-pop-tip :global(p) { margin: 0 0 6px; }
	.info-pop-tip :global(p:last-child) { margin-bottom: 0; }
</style>
