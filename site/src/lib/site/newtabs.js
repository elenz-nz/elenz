// newTabs: a Svelte action that makes every link inside an element open in a new tab (target="_blank", rel="noopener"),
// including links added later (a plant opened on the research page). Links within the page (#...) and mail or phone
// links are left alone. Used on the private research page (design decision, 19 Nov 2026), so reading a source never
// loses the page's filters and open plant. SvelteKit doesn't route a link with a target, so it opens as a plain link.

const SKIP = /^(#|mailto:|tel:)/i;

/** Marks every link under `root`. */
export function markLinks(/** @type {ParentNode} */ root) {
  for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (root.querySelectorAll('a[href]'))) {
    if (SKIP.test(a.getAttribute('href') || '')) continue;
    if (a.target !== '_blank') a.target = '_blank';
    const rel = new Set((a.rel || '').split(/\s+/).filter(Boolean));
    if (!rel.has('noopener')) a.rel = [...rel, 'noopener'].join(' ');
  }
}

/** @param {HTMLElement} node */
export function newTabs(node) {
  markLinks(node);
  const watch = new MutationObserver(() => markLinks(node));
  watch.observe(node, { childList: true, subtree: true });
  return { destroy: () => watch.disconnect() };
}
