// A list's colour square, the same on both tracker tabs (owner's report PRC-01, 31 Oct 2026: the Prices list should
// do everything the Generation list does): a click hides or shows that line; a double-click, Shift+click or a long
// press (touch) shows only that one, and again shows them all.

export const SWATCH_TITLE = 'Hide or show · double-click or press and hold: show only this';

/** Wire a colour square. toggle(): hide or show it; only(): show it alone (or all again). Returns a remover. */
export function squareButton(btn, toggle, only) {
  let held = null, longPressed = false;
  const click = e => {
    if (longPressed) { longPressed = false; return; }
    if (e.shiftKey && only) only(); else toggle();
  };
  const dbl = e => { if (!only) return; e.preventDefault(); only(); };
  const down = e => {
    if (e.pointerType === 'mouse' || !only) return;
    clearTimeout(held); held = setTimeout(() => { longPressed = true; only(); navigator.vibrate?.(15); }, 500);
  };
  const up = () => clearTimeout(held);
  const menu = e => { if (longPressed) e.preventDefault(); };
  btn.addEventListener('click', click);
  btn.addEventListener('dblclick', dbl);
  btn.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, up);
  btn.addEventListener('contextmenu', menu);
  return () => {
    clearTimeout(held);
    btn.removeEventListener('click', click); btn.removeEventListener('dblclick', dbl); btn.removeEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.removeEventListener(ev, up);
    btn.removeEventListener('contextmenu', menu);
  };
}

/** The same as a Svelte action: use:swatch={{ toggle, only }}. */
export function swatch(node, opts) {
  let o = opts;
  const off = squareButton(node, () => o.toggle(), o.only ? () => o.only() : null);
  return { update(n) { o = n; }, destroy: off };
}
