// How far the landing page's previews have built, 0 to 1 for each part. Handoff.svelte drives it as the flying dot
// passes: the Now preview's rings and HVDC link, then the Records preview's staircase, which draws as the dot climbs it.
// Anything it isn't driving (reduced motion, no hand-off) stays complete.
export const build = $state({ ni: 1, link: 1, si: 1, rec: 1 });

// where the Records preview's picture leads: the record it shows (owner's report HOME-05), set by RecordsPeek.svelte
export const peekLink = $state({ rec: '' });
