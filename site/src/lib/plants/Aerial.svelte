<script lang="ts">
	// A plant's LINZ aerial views (analysis/plant_aerials.py): site, close and wide, one shown at a time. Switching only
	// swaps the image's address, so a click answers at once. Without JavaScript the first view shows and the switch hides.
	type View = { k: string; file: string; across: number; imagery: string };
	let { views, name, eager = false }: { views: View[]; name: string; eager?: boolean } = $props();
	const LABEL: Record<string, string> = { site: 'Site', close: 'Close', wide: 'Wide' };
	let k = $state('');
	const v = $derived(views.find((x) => x.k === k) ?? views[0]);
	const size = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 5000 ? 0 : 1)} km` : `${Math.round(m / 50) * 50} m`);
</script>

<figure class="aerial">
	<div class="frame">
		<img src="/plants/{v.file}" alt="Aerial view of {name}, about {size(v.across)} across" width="1000" height="640"
			loading={eager ? 'eager' : 'lazy'} decoding="async" />
		{#if views.length > 1}
			<div class="seg js-only" role="group" aria-label="Aerial view">
				{#each views as x}
					<button type="button" aria-pressed={x.k === v.k} onclick={() => (k = x.k)}>{LABEL[x.k] ?? x.k}</button>
				{/each}
			</div>
		{/if}
	</div>
	<figcaption>
		Aerial view, about {size(v.across)} across{v.k !== 'site' ? '; the ring marks the station' : ''}. Imagery:
		{v.imagery ? `${v.imagery}, ` : ''}Toitū Te Whenua LINZ, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
	</figcaption>
</figure>

<style>
	.aerial { margin: 0; display: grid; gap: 6px; align-content: start; min-width: 0; }
	.frame { position: relative; }
	.frame img { width: 100%; height: auto; aspect-ratio: 1000 / 640; object-fit: cover; border-radius: 4px; display: block; background: var(--grid); }
	.frame .seg { position: absolute; top: 8px; right: 8px; background: var(--surface); box-shadow: 0 1px 3px rgb(0 0 0 / 0.3); }
	figcaption { font-size: 0.78rem; color: var(--muted); }
	figcaption a { color: inherit; }
</style>
