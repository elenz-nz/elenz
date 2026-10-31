// Touch for the article charts (owner's report ART-03, 31 Oct 2026): on a phone the readout stays where the finger
// last was instead of vanishing as it lifts, and a tap anywhere outside the chart clears it. A mouse leaving the
// chart still clears it at once.

/** Use on a chart's root element: calls clear() on a touch outside it. */
export function tapAway(node, clear) {
  let cb = clear;
  const down = (e) => { if (e.pointerType === 'touch' && !node.contains(e.target)) cb(); };
  document.addEventListener('pointerdown', down, true);
  return { update(c) { cb = c; }, destroy() { document.removeEventListener('pointerdown', down, true); } };
}

/** A pointerleave handler that clears only for a mouse or pen (a lifted finger keeps its readout). */
export const leaveFor = (clear) => (e) => { if (e.pointerType !== 'touch') clear(); };
