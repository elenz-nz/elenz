<script lang="ts">
	// "Keep screen on" for /now on a wall or desk screen: the Screen Wake Lock API stops the display sleeping while the
	// page is open and visible. The browser drops the lock whenever the tab is hidden, so it is asked for again when
	// the page comes back. The choice is remembered in this browser (localStorage elenz-awake, listed on /privacy).
	// Hidden where the browser has no wake lock (older Safari and Firefox).
	import { onMount } from 'svelte';

	const KEY = 'elenz-awake';
	let supported = $state(false);
	let on = $state(false);
	let lock: { release(): Promise<void>; addEventListener(t: string, f: () => void): void } | null = null;
	let failed = $state(false);

	async function acquire() {
		if (!on || lock || document.visibilityState !== 'visible') return;
		try {
			lock = await (navigator as any).wakeLock.request('screen');
			failed = false;
			lock!.addEventListener('release', () => { lock = null; });
		} catch {
			failed = true;   // e.g. battery saver on, or the page not focused yet
		}
	}
	function release() { lock?.release().catch(() => {}); lock = null; }
	function toggle() {
		on = !on;
		try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* storage blocked: still works for this visit */ }
		on ? acquire() : release();
	}

	onMount(() => {
		supported = 'wakeLock' in navigator;
		if (!supported) return;
		try { on = localStorage.getItem(KEY) === '1'; } catch { on = false; }
		const vis = () => { if (document.visibilityState === 'visible') acquire(); };
		document.addEventListener('visibilitychange', vis);
		acquire();
		return () => { document.removeEventListener('visibilitychange', vis); release(); };
	});
</script>

{#if supported}
	<button type="button" class="awake" aria-pressed={on} onclick={toggle}
		title={on ? (failed ? 'The browser didn’t allow it just now (battery saver?); it will try again' : 'The screen stays on while this page is open. Select to let it sleep again') : 'Keep the screen from sleeping while this page is open'}>
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M5.5 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />{#if on}<path d="M8 5v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />{/if}</svg>
		{on ? 'Screen stays on' : 'Keep screen on'}
	</button>
{/if}

<style>
	.awake { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 0.74rem; font-weight: 500; color: var(--ink-2); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px 3px 8px; min-height: 26px; cursor: pointer; white-space: nowrap; }
	.awake:hover { color: var(--ink); border-color: var(--ink-2); }
	.awake[aria-pressed='true'] { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
	/* on: a slow, faint glow, just enough to see it's working */
	.awake[aria-pressed='true'] { animation: glow 4s ease-in-out infinite; }
	@keyframes glow {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); }
		50% { box-shadow: 0 0 10px 1px color-mix(in srgb, var(--accent) 45%, transparent); }
	}
	@media (prefers-reduced-motion: reduce) { .awake[aria-pressed='true'] { animation: none; box-shadow: 0 0 6px 0 color-mix(in srgb, var(--accent) 35%, transparent); } }
</style>
