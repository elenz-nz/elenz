<script lang="ts">
	// "Report a problem": an email to hello@elenz.co.nz with the page's title and full address filled in. The address
	// carries the view (range, dates, region, drill-down), so a report from the tracker says exactly which chart and
	// time. Built when clicked, so it has the view as it is then. The click is an Umami event (#lib/site/track.js), sent
	// from here rather than with data-umami-event, which would take over the click before this fills the email in.
	import { track } from './track.js';
	let { label = 'Report a problem' }: { label?: string } = $props();
	const TO = 'mailto:hello@elenz.co.nz';
	function fill(e: MouseEvent) {
		track('report-click');
		const subject = `Problem on Elenz: ${document.title}`;
		const body = `Page: ${location.href}\n\nWhat looks wrong (which chart or figure, and at what time)?\n\n`;
		(e.currentTarget as HTMLAnchorElement).href = `${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	}
</script>

<a href="{TO}?subject=Problem%20on%20Elenz" onclick={fill}>{label}</a>
