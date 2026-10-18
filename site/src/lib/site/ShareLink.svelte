<script lang="ts">
	// The Share button on the tracker's tabs line: a link to the view on screen, either live (always the latest data)
	// or fixed to the dates shown, optionally marking the last point the cursor was on (the summary opens on it).
	// links(): from the page (#lib/site/view.js shareLinks), read when the panel opens. On phones the system share
	// sheet opens; elsewhere the link is copied, or shown to copy by hand if the browser won't allow that.
	import { tick } from 'svelte';

	type Links = { live: string | null; point: number | null; pointLabel: string | null; fixed: (mark?: boolean) => { url: string; span: string | null } | null };
	let { links }: { links: () => Links | null } = $props();

	let open = $state(false);
	let L = $state.raw<Links | null>(null);
	let mark = $state(true);
	let done = $state('');       // which link was just copied
	let manual = $state('');     // a link the browser wouldn't copy: shown to copy by hand
	let btn = $state<HTMLButtonElement>(), pop = $state<HTMLDivElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const fixed = $derived(L ? L.fixed(mark && L.point != null) : null);
	const canShare = typeof navigator !== 'undefined' && !!navigator.share && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
	const verb = canShare ? 'Share' : 'Copy';

	async function toggle() {
		if (open) { open = false; return; }
		L = links();
		mark = true; done = ''; manual = '';
		open = true;
		await tick();
		pop?.querySelector<HTMLButtonElement>('.sh-go')?.focus();
	}
	async function send(url: string, key: string) {
		if (canShare) {
			try { await navigator.share({ title: document.title, url }); return; }
			catch (e: any) { if (e?.name === 'AbortError') return; }   // cancelled; otherwise fall back to copying
		}
		try {
			await navigator.clipboard.writeText(url);
			done = key; manual = '';
			clearTimeout(timer); timer = setTimeout(() => (done = ''), 2000);
		} catch {
			manual = url;
			await tick();
			pop?.querySelector<HTMLInputElement>('.sh-manual')?.select();
		}
	}
	function outside(e: Event) {
		if (!open) return;
		if (e instanceof KeyboardEvent) { if (e.key === 'Escape') { open = false; btn?.focus(); } return; }
		const t = e.target as Node;
		if (!pop?.contains(t) && !btn?.contains(t)) open = false;
	}
</script>

<svelte:window onclick={outside} onkeydown={outside} />

<button type="button" class="share-btn" bind:this={btn} aria-expanded={open} aria-controls="share-pop" aria-label="Share this view" title="Share this view" onclick={toggle}>
	<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3.2 3.2 0 0 0 4.6 0l2.6-2.6a3.2 3.2 0 0 0-4.6-4.6l-1 1M11.5 8.5a3.2 3.2 0 0 0-4.6 0l-2.6 2.6a3.2 3.2 0 0 0 4.6 4.6l1-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
	<span class="sh-word">Share</span>
</button>
<div class="info-pop share-pop" id="share-pop" role="region" aria-label="Share this view" bind:this={pop} hidden={!open}>
	{#if L}
		{#if L.live}
			<div class="sh-row">
				<div class="sh-txt"><b>Link to this live view</b><span>Always opens on the latest data</span></div>
				<button type="button" class="sh-go" onclick={() => send(L!.live!, 'live')}>{done === 'live' ? 'Copied' : verb}</button>
			</div>
		{/if}
		{#if fixed}
			<div class="sh-row">
				<div class="sh-txt">
					<b>{L.live ? 'Link to this moment' : 'Link to this view'}</b>
					<span>{fixed.span ? `Opens on ${fixed.span}` : 'All history'}</span>
				</div>
				<button type="button" class="sh-go" onclick={() => send(fixed.url, 'fixed')}>{done === 'fixed' ? 'Copied' : verb}</button>
			</div>
			{#if L.pointLabel}
				<label class="sh-mark"><input type="checkbox" bind:checked={mark} /> Mark {L.pointLabel}</label>
			{:else}
				<p class="sh-tip">To mark a time, click the chart there to pin it, then share.</p>
			{/if}
		{/if}
		{#if manual}
			<label class="sh-man">Copy this link:<input class="sh-manual" readonly value={manual} onfocus={(e) => e.currentTarget.select()} /></label>
		{/if}
	{/if}
</div>

<style>
	/* the link icon, with the word beside it where there's room */
	.share-btn { display: inline-flex; align-items: center; gap: 5px; height: 30px; min-width: 30px; justify-content: center; padding: 0 9px 0 7px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--ink-2); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
	.share-btn:hover, .share-btn[aria-expanded='true'] { color: var(--ink); background: var(--grid); border-color: var(--ink-2); }
	@media (max-width: 720px) {
		.share-btn { padding: 0; border-color: transparent; border-radius: 50%; }
		.sh-word { display: none; }
	}
	.sh-tip { font-size: 0.78rem !important; color: var(--muted) !important; margin: -4px 0 0 !important; }
	.share-pop { width: min(360px, calc(100vw - 32px)); gap: 10px; }
	.sh-row { display: flex; align-items: center; gap: 12px; }
	.sh-txt { display: grid; gap: 1px; min-width: 0; flex: 1; }
	.sh-txt b { font-size: 0.86rem; color: var(--ink); font-weight: 600; }
	.sh-txt span { font-size: 0.78rem; color: var(--muted); }
	.sh-go { flex: none; font: inherit; font-size: 0.8rem; font-weight: 600; min-width: 68px; min-height: 30px; padding: 0 12px; border-radius: 4px; border: 1px solid var(--line); background: var(--surface); color: var(--accent); cursor: pointer; }
	.sh-go:hover { background: var(--accent-soft); border-color: var(--accent); }
	.sh-mark { display: flex; align-items: center; gap: 7px; font-size: 0.8rem; color: var(--ink-2); margin-top: -4px; cursor: pointer; }
	.sh-mark input { accent-color: var(--accent); margin: 0; }
	.sh-man { display: grid; gap: 4px; font-size: 0.78rem; color: var(--ink-2); }
	.sh-man input { font: 0.76rem var(--font-data); padding: 5px 6px; border: 1px solid var(--line); border-radius: 3px; background: var(--bg); color: var(--ink); width: 100%; box-sizing: border-box; }
</style>
