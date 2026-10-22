<script lang="ts">
	// On /now, above Generation now: a record the live data beat today, as one small link to the record. Shown only on
	// the day it was set (the page filters); provisional until the metered data confirms it, which the title says.
	import { fmt, fullName, clock, meteredDue, REGIONS } from './records.js';

	let { items }: { items: { d: any; region: string; p: { t: number; v: number }; rec: any }[] } = $props();
	const x = $derived(items[0]);
	const where = (r: string) => (r === 'NZ' ? '' : `, ${REGIONS.find((q) => q.id === r)?.name}`);
	const href = $derived(items.length > 1 ? '/records' : `/records/${x.d.id}${x.region === 'NZ' ? '' : `?region=${x.region}`}`);
	const title = $derived(`${fullName(x.d)}${where(x.region)}: ${fmt(x.d, x.p.v)} in the ${clock(x.p.t)} half-hour, beyond the record of ${fmt(x.d, x.rec.v)}. Provisional, from live dispatch data${x.d.est ? ' (embedded solar is an estimate)' : ''}: confirmed or dropped when the EA publishes the metered data, around ${meteredDue(x.p.t)}.`);
</script>

<a class="rec" {href} {title}>
	<span class="dot" aria-hidden="true"></span>
	<span class="txt">New record today: <b>{fullName(x.d)}{where(x.region)}</b>{items.length > 1 ? ` and ${items.length - 1} more` : ''}</span>
	<span class="go" aria-hidden="true">→</span>
</a>

<style>
	.rec { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px dashed color-mix(in srgb, var(--warn-ink) 55%, var(--line)); border-radius: 4px;
		background: var(--surface); color: var(--ink-2); text-decoration: none; font-size: 0.86rem; min-width: 0; }
	.rec:hover { border-style: solid; color: var(--ink); }
	.rec:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warn-ink); flex: none; }
	.txt { flex: 1; min-width: 0; }
	b { color: var(--ink); font-weight: 600; }
	.go { color: var(--accent); font-weight: 600; }
</style>
