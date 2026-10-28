// A <select> only as wide as the choice it shows (a select is normally as wide as its longest option), so chart
// headers fit fewer rows on a phone (owner's call, 29 Oct 2026). Used by the Generation tab (tracker.js) and, as a
// Svelte action, by the Prices tab: <select use:fitSelect={value}>.
let measure = null;
export function fit(sel) {
  const o = sel.options[sel.selectedIndex];
  if (!o) return;
  const cs = getComputedStyle(sel);
  const ctx = measure || (measure = document.createElement('canvas').getContext('2d'));
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const w = ctx.measureText(o.text).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  sel.style.width = `${Math.ceil(w) + 2}px`;
}
/** Svelte action: refits when the value passed changes and once the fonts have loaded.
 *  @param {HTMLSelectElement} sel  @param {unknown} [_value] the select's value, so a change refits it */
export function fitSelect(sel, _value) {
  const again = () => queueMicrotask(() => fit(sel));
  again();
  document.fonts?.ready.then(again);
  return { update: again };
}
