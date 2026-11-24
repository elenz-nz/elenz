// Screen-burn guard for the pages that may be left open on a screen for hours (/dashboard, /landscape): the parts that
// never change (numbers' cards, labels, the credit) drift a few pixels in a slow loop, so their edges don't sit on the
// same pixels all day. OLED and plasma screens can keep a faint copy of a still image (burn-in); an LCD only keeps one
// for a while, and there the drift does no harm. Always on, on the pages and in their wall-screen and full-screen
// views (design decision, 25 Nov 2026): there is no setting, as the screens that need it are the ones nobody would set.
//
// The offset follows two slow sine waves with periods that don't share a multiple (a Lissajous path), so over a
// few hours it covers most of a square DRIFT_PX on each side of centre. It moves in whole pixels (sub-pixel
// offsets blur text) at most one pixel per step, every STEP_MS, so nobody sees it move; `prefers-reduced-motion` needs
// nothing different. The action sets --dx and --dy on the element; each page's CSS says what moves with them. Not on an element
// whose style attribute Svelte writes (it would wipe them): there, put driftAt() in the style string (dashboard/Stage.svelte).

export const DRIFT_PX = 5;                 // furthest from centre, CSS px, each way
export const STEP_MS = 20e3;               // how often the offset is worked out again
const PX = 17 * 60e3, PY = 23 * 60e3;      // the two waves' periods

/** The offset in whole CSS pixels at time `t` (ms). */
export function driftAt(t, r = DRIFT_PX) {
  return [Math.round(r * Math.sin((2 * Math.PI * t) / PX)), Math.round(r * Math.sin((2 * Math.PI * t) / PY))];
}

/** Svelte action: keeps --dx and --dy on `node` up to date while it is on the page. */
export function drift(node) {
  const set = () => {
    const [x, y] = driftAt(Date.now());
    node.style.setProperty('--dx', `${x}px`);
    node.style.setProperty('--dy', `${y}px`);
  };
  set();
  const id = setInterval(set, STEP_MS);
  return { destroy() { clearInterval(id); } };
}
