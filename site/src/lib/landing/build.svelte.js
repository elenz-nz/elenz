// How far the landing page's Now preview has built, 0 to 1 for each part. Handoff.svelte drives it as the flying dot
// passes through the map; anything it isn't driving (reduced motion, no hand-off) stays complete.
export const build = $state({ ni: 1, link: 1, si: 1 });
