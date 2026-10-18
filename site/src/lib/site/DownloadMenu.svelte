<script lang="ts">
	// The Download button on the tracker's tabs line: the chart as a PNG (title, dates, legend and the credit line drawn
	// in) or the view's data as a CSV (with the source and licence in its header). items: from the page; each run()
	// resolves to { blob, name } (#lib/site/download.js).
	import { tick } from 'svelte';
	import { save } from '#lib/site/download.js';

	type Item = { label: string; sub: string; kind: 'PNG' | 'CSV'; run: () => Promise<{ blob: Blob; name: string }> | { blob: Blob; name: string } };
	let { items }: { items: () => Item[] } = $props();

	let open = $state(false);
	let list = $state.raw<Item[]>([]);
	let busy = $state(-1);
	let error = $state('');
	let btn = $state<HTMLButtonElement>(), pop = $state<HTMLDivElement>();

	async function toggle() {
		if (open) { open = false; return; }
		list = items(); error = ''; open = true;
		await tick();
		pop?.querySelector<HTMLButtonElement>('.dl-go')?.focus();
	}
	async function go(i: number) {
		busy = i; error = '';
		try {
			const { blob, name } = await list[i].run();
			save(blob, name);
			open = false;
		} catch (e: any) {
			error = e?.message || 'The download could not be made.';
		} finally { busy = -1; }
	}
	function outside(e: Event) {
		if (!open) return;
		if (e instanceof KeyboardEvent) { if (e.key === 'Escape') { open = false; btn?.focus(); } return; }
		const t = e.target as Node;
		if (!pop?.contains(t) && !btn?.contains(t)) open = false;
	}
</script>

<svelte:window onclick={outside} onkeydown={outside} />

<button type="button" class="dl-btn pill-btn" bind:this={btn} aria-expanded={open} aria-controls="dl-pop" aria-label="Download the chart or data" title="Download the chart or data" onclick={toggle}>
	<svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9M6 9l4 4 4-4M4 15.5h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
	<span class="pill-word">Download</span>
</button>
<div class="info-pop dl-pop" id="dl-pop" role="region" aria-label="Download" bind:this={pop} hidden={!open}>
	{#each list as it, i}
		<div class="dl-row">
			<div class="dl-txt"><b>{it.label}</b><span>{it.sub}</span></div>
			<button type="button" class="dl-go" disabled={busy >= 0} onclick={() => go(i)}>{busy === i ? 'Making…' : it.kind}</button>
		</div>
	{/each}
	{#if error}<p class="dl-err" role="alert">{error}</p>{/if}
	<p class="dl-note">Free to reuse with credit: “Elenz (elenz.co.nz), from Electricity Authority data, CC BY 4.0”. Images and files carry it.</p>
</div>

<style>
	.dl-pop { width: min(380px, calc(100vw - 32px)); gap: 10px; }
	.dl-row { display: flex; align-items: center; gap: 12px; }
	.dl-txt { display: grid; gap: 1px; min-width: 0; flex: 1; }
	.dl-txt b { font-size: 0.86rem; color: var(--ink); font-weight: 600; }
	.dl-txt span { font-size: 0.78rem; color: var(--muted); }
	.dl-go { flex: none; font: inherit; font-size: 0.8rem; font-weight: 600; min-width: 68px; min-height: 30px; padding: 0 12px; border-radius: 4px; border: 1px solid var(--line); background: var(--surface); color: var(--accent); cursor: pointer; }
	.dl-go:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent); }
	.dl-go:disabled { opacity: 0.6; cursor: progress; }
	.dl-err { color: var(--warn-ink) !important; }
	.dl-note { font-size: 0.76rem !important; color: var(--muted) !important; border-top: 1px solid var(--line); padding-top: 8px; }
</style>
