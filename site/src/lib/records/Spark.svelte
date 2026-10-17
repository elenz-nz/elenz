<script lang="ts">
	// A record's progression as a small step line: each step is the record being broken; the dot is today's record.
	import { stepPath } from './records.js';

	let { steps, end, tok = '--ink', w = 96, h = 26, dashed = false }: { steps: [number, number][]; end?: number; tok?: string; w?: number; h?: number; dashed?: boolean } = $props();
	const P = $derived(stepPath(steps, w - 6, h - 6, { end }));
	const last = $derived(steps?.length ? steps[steps.length - 1] : null);
</script>

{#if last}
	<svg class="spark" width={w} height={h} viewBox="-3 -3 {w} {h}" aria-hidden="true">
		<path d={P.d} fill="none" style="stroke:var({tok})" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray={dashed ? '4 2' : undefined} />
		<circle cx={P.x(last[0])} cy={P.y(last[1])} r="2.6" style="fill:var({tok})" />
	</svg>
{/if}

<style>
	.spark { display: block; overflow: visible; }
</style>
