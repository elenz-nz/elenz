// The hover tooltip on a record's charts keeps clear of the pinned one, so both can be read (owner's report REC-05,
// 2 Nov 2026). Called from an $effect once both are drawn: the hover tooltip slides above or below the pinned one,
// whichever keeps it in the chart, or the nearer one if both fit.
const GAP = 6;

export function keepClear(tip, other) {
  if (!tip) return;
  tip.style.marginTop = '';
  if (!other) return;
  const a = tip.getBoundingClientRect(), b = other.getBoundingClientRect();
  if (a.right + GAP <= b.left || a.left - GAP >= b.right || a.bottom + GAP <= b.top || a.top - GAP >= b.bottom) return;
  const box = (tip.offsetParent ?? tip.parentElement).getBoundingClientRect();
  const up = b.top - GAP - a.bottom, down = b.bottom + GAP - a.top;   // how far to move: negative is up
  const fitsUp = a.top + up >= box.top, fitsDown = a.bottom + down <= box.bottom;
  const dy = fitsUp && fitsDown ? (-up < down ? up : down) : fitsUp ? up : fitsDown ? down : up;
  tip.style.marginTop = `${Math.round(dy)}px`;
}
