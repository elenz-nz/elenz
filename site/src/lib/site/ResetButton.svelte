<script lang="ts">
	// Reset, on the tabs line of both tracker tabs: asks once, then forgets this browser's saved views (resetView).
	import { resetView } from '#lib/site/view.js';

	let open = $state(false);
	let btn = $state<HTMLButtonElement>(), pop = $state<HTMLDivElement>();

	function toggle() {
		open = !open;
		if (open) queueMicrotask(() => pop?.querySelector<HTMLButtonElement>('.rs-yes')?.focus());
	}
	function outside(e: Event) {
		if (!open) return;
		if (e instanceof KeyboardEvent) { if (e.key === 'Escape') { open = false; btn?.focus(); } return; }
		const t = e.target as Node;
		if (!pop?.contains(t) && !btn?.contains(t)) open = false;
	}
</script>

<svelte:window onclick={outside} onkeydown={outside} />

<span class="rs-wrap">
	<button type="button" class="pill-btn reset-btn" bind:this={btn} aria-expanded={open} aria-controls="reset-pop" title="Forget this browser's saved views and go back to the default charts on both tracker tabs" aria-label="Reset charts to default" onclick={toggle}>
		<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.6v2.9h2.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
		<span class="pill-word">Reset</span>
	</button>
	<div class="rs-pop" id="reset-pop" role="alertdialog" aria-label="Reset all charts?" bind:this={pop} hidden={!open}>
		<p>Reset all charts?</p>
		<div class="rs-row">
			<button type="button" class="rs-yes" onclick={resetView}>Reset</button>
			<button type="button" class="rs-no" onclick={() => { open = false; btn?.focus(); }}>Cancel</button>
		</div>
	</div>
</span>

<style>
	.rs-wrap { position: relative; display: inline-flex; }
	.rs-pop { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; width: max-content; padding: 10px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; box-shadow: 0 6px 20px rgb(0 0 0 / 0.25); }
	.rs-pop[hidden] { display: none; }
	/* it flashes an accent edge as it opens (shown again, its animation starts anew), so it's clear it has popped up
	   (test report TRK-12, 6 Nov 2026) */
	.rs-pop { animation: rs-flash 1.6s ease-out; }
	@keyframes rs-flash {
		0%, 30% { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent), 0 6px 20px rgb(0 0 0 / 0.25); }
		100% { border-color: var(--line); box-shadow: 0 0 0 3px transparent, 0 6px 20px rgb(0 0 0 / 0.25); }
	}
	@media (prefers-reduced-motion: reduce) { .rs-pop { animation: none; } }
	.rs-pop p { margin: 0 0 8px; font-size: 0.86rem; font-weight: 600; color: var(--ink); }
	.rs-row { display: flex; gap: 6px; }
	.rs-row button { height: 28px; padding: 0 12px; font: inherit; font-size: 0.8rem; font-weight: 600; border-radius: 4px; border: 1px solid var(--line); background: none; color: var(--ink); cursor: pointer; }
	.rs-row .rs-yes { background: var(--accent); border-color: var(--accent); color: var(--surface); }
</style>
