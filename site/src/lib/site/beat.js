// The heartbeat's message, shared by the pages that send it (heartbeat.js) and the Worker that stores it
// (worker/index.js, in Workers Analytics Engine). Design decision, 16 Nov 2026: Umami reports time on page only when a
// tab is hidden or closed, so it can't show screens left open on Now or the dashboards. While one of those pages is
// open, it sends this every 5 minutes, hidden or not.
//
// A message is a little JSON (sent as text, so no preflight):
//   p  the page: 'now', 'dashboard' or 'landscape'
//   s  16 hex digits, random for each page load and never stored, so one open screen's beats can be put together
//   m  whole minutes since the page loaded (0 for the first beat), so a screen's time open is its largest m
//   v  1 while the page is on screen, 0 while it's hidden (another tab, minimised, the screen asleep)
//   k  1 on a wall-screen link (kiosk=1), else 0
// Nothing else: no cookie, no address, nothing kept in the browser.

export const BEAT_URL = '/data/beat';
export const BEAT_EVERY = 5 * 60e3;
export const BEAT_PAGES = ['now', 'dashboard', 'landscape'];
const MAX_MINUTES = 60 * 24 * 366;   // a screen left open for a year still counts; past that it's not a real page

/** The message for one beat. */
export function beatBody(page, id, minutes, visible, kiosk) {
  return JSON.stringify({ p: page, s: id, m: Math.max(0, Math.floor(minutes)), v: visible ? 1 : 0, k: kiosk ? 1 : 0 });
}

/** A beat read back from its text, or null if it isn't one (anything else posted to the address is dropped). */
export function readBeat(text) {
  if (typeof text !== 'string' || text.length > 200) return null;
  let b;
  try { b = JSON.parse(text); } catch { return null; }
  if (!b || typeof b !== 'object') return null;
  const { p, s, m, v, k } = b;
  if (!BEAT_PAGES.includes(p) || typeof s !== 'string' || !/^[0-9a-f]{16}$/.test(s)) return null;
  if (!Number.isInteger(m) || m < 0 || m > MAX_MINUTES || (v !== 0 && v !== 1) || (k !== 0 && k !== 1)) return null;
  return { page: p, id: s, minutes: m, visible: v === 1, kiosk: k === 1 };
}

/** A new page load's random ID: 16 hex digits. */
export function newBeatId(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return Array.from(rand(8), (x) => x.toString(16).padStart(2, '0')).join('');
}
