<script lang="ts">
	// On /now: a record the live data has just beaten, provisional until the metered data confirms it.
	import { fmt, fullName, clock, dayOf, meteredDue, REGIONS } from './records.js';

	let { items }: { items: { d: any; region: string; p: { t: number; v: number }; rec: any }[] } = $props();
	const x = $derived(items[0]);
	const where = (r: string) => (r === 'NZ' ? '' : ` in the ${REGIONS.find((q) => q.id === r)?.name}`);
	const href = $derived(`/records/${x.d.id}${x.region === 'NZ' ? '' : `?region=${x.region}`}`);
</script>

<section class="rec-line" aria-label="Provisional record">
	<span class="tag">Provisional record</span>
	<div class="txt">
		<p><b>{fullName(x.d)}{where(x.region)}: {fmt(x.d, x.p.v)}</b> in the {clock(x.p.t)} half-hour, beyond the record of {fmt(x.d, x.rec.v)} set on {dayOf(x.rec.t)}.{items.length > 1 ? ` And ${items.length - 1} more.` : ''}</p>
		<p class="sub">From live dispatch data{x.d.est ? ' (embedded solar is an estimate)' : ''}. Confirmed or dropped when the EA publishes the metered data, around {meteredDue(x.p.t)}.</p>
	</div>
	<a href={items.length > 1 ? '/records' : href}>{items.length > 1 ? 'All records' : 'The record'} →</a>
</section>

<style>
	.rec-line { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; background: var(--surface); border: 1px dashed color-mix(in srgb, var(--warn-ink) 55%, var(--line)); border-radius: 4px; padding: 10px 14px; }
	.tag { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.03em; padding: 2px 9px; border-radius: 999px; background: var(--warn-bg); color: var(--warn-ink); white-space: nowrap; }
	.txt { flex: 1 1 360px; min-width: 0; display: grid; gap: 2px; }
	p { margin: 0; font-size: 0.9rem; color: var(--ink-2); }
	b { color: var(--ink); font-weight: 600; }
	.sub { color: var(--muted); font-size: 0.78rem; }
	a { color: var(--accent); font-weight: 600; font-size: 0.86rem; white-space: nowrap; }
</style>
