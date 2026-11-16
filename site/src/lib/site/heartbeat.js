// The heartbeat from a page that may be left open on a screen (/now, /dashboard, /landscape): one beat when it opens,
// then one every 5 minutes, on screen or hidden, until it closes. The message and the reasons are in beat.js; the
// Worker stores each beat in Workers Analytics Engine (worker/index.js), which is part of Workers Paid, so screens
// left open don't use Umami's allowance. Described on /privacy.
//
// Like Umami, it counts only on elenz.co.nz (not previews or local builds) and not where the browser sends Do Not Track.
import { BEAT_URL, BEAT_EVERY, beatBody, newBeatId } from './beat.js';
import { SITE_URL } from './viewurl.js';

const SITE_HOST = new URL(SITE_URL).hostname;

/** Whether this visit is counted: on the real site, and Do Not Track not set. */
export function counting(loc = location, nav = navigator, win = window) {
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  return loc.hostname === SITE_HOST && dnt !== '1' && dnt !== 'yes';
}

/** Start beating for `page`; returns a function that stops it. `kiosk`: opened from a wall-screen link. */
export function startHeartbeat(page, { kiosk = false } = {}) {
  if (typeof window === 'undefined' || !counting()) return () => {};
  const id = newBeatId(), t0 = Date.now();
  const send = () => {
    const body = beatBody(page, id, (Date.now() - t0) / 60e3, document.visibilityState === 'visible', kiosk);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(BEAT_URL, body)) return;
      fetch(BEAT_URL, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
    } catch { /* a missed beat only shortens the count */ }
  };
  send();
  const timer = setInterval(send, BEAT_EVERY);
  return () => clearInterval(timer);
}
