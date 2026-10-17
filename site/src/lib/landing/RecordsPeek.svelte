<script lang="ts">
	// A glimpse of Records for the landing page: the newest record (a provisional one from the live week if there
	// is one), or peak demand, with how it grew.
	import { onMount } from 'svelte';
	import Spark from '#lib/records/Spark.svelte';
	import { loadRecords, liveBeats, recent, get, def, parts, when, fullName, dayOf } from '#lib/records/records.js';

	let { D }: { D?: any; now?: any } = $props();
	let R = $state<any>(null);
	let done = $state(false);
	onMount(() => { loadRecords().then((r) => { R = r; done = true; }); });

	const pick = $derived.by(() => {
		if (!R) return null;
		const live = D ? liveBeats(R, D) : {};
		const first = recent(R, live).find((c) => !c.settled);
		if (first) return { d: first.d, region: first.region, rec: first.rec, prov: first.prov, label: first.prov ? 'Latest, provisional' : 'Latest record' };
		const d = def('demand_max'), rec = get(R, 'demand_max', 'NZ');
		return rec && d ? { d, region: 'NZ', rec, prov: null, label: 'Peak demand' } : null;
	});
</script>

<div class="rec-peek">
	{#if pick}
		{@const shown = pick.prov ?? pick.rec}
		<span class="lbl">{pick.label}: {fullName(pick.d).toLowerCase()}{pick.region === 'NZ' ? '' : ` (${pick.region})`}</span>
		<span class="row">
			<span>
				<span class="val">{parts(pick.d, shown.v).n}<small>{parts(pick.d, shown.v).u}</small></span>
				<span class="sub">{when(pick.d, shown)}{pick.prov ? ` · record ${dayOf(pick.rec.t)}` : ''}</span>
			</span>
			<Spark steps={pick.prov ? [...pick.rec.steps, [pick.prov.t, pick.prov.v]] : pick.rec.steps} end={R.end} tok={pick.d.tok} w={150} h={56} dashed={!!pick.d.est} />
		</span>
	{:else}
		<span class="lbl">Records since 1997</span>
		<span class="sub">{done ? 'Peak demand, renewable share, wind and solar, prices and the HVDC link, for New Zealand and each island.' : 'Loading…'}</span>
	{/if}
</div>

<style>
	.rec-peek { display: grid; gap: 10px; }
	.lbl { color: var(--ink-2); font-size: 0.86rem; font-weight: 600; }
	.row { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; }
	.val { display: block; font-family: var(--font-data); font-size: 2.2rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.05; color: var(--ink); }
	.val small { font-family: var(--font-ui); font-size: 0.9rem; font-weight: 500; color: var(--muted); margin-left: 6px; letter-spacing: 0; }
	.sub { display: block; color: var(--muted); font-size: 0.8rem; margin-top: 4px; }
</style>
