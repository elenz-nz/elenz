// A few Umami events (design decision, 16 Nov 2026), alongside the heartbeat: how the dashboards are used, not who uses
// them. Umami's script (src/app.html) counts only on elenz.co.nz and honours Do Not Track; where it hasn't loaded
// (previews, local builds, a blocker, the browser tests) this does nothing. Each event counts against the free plan's
// 100,000 a month, so keep them few:
//   wall-screen-open    a wall-screen link opened         { page }
//   wall-screen-copy    Copy wall-screen link             { page }
//   layout-change       the dashboard's layout changed    { bg, view, big, small } (bg and view, then how many of each), at most one a minute (throttled)
//   landscape-mode      the landscape's mode chosen       { mode }
//   support-click       Support Elenz clicked             (data-umami-event in Coffee.svelte; Umami adds the page)
//   report-click        Report a problem clicked          (ReportLink.svelte)
// A browser that has opted out (?exclude-me, src/app.html) sends none of them: Umami's script checks umami.disabled.

export function track(name, data) {
  try { window.umami?.track(name, data); } catch { /* counting never gets in the way */ }
}

/** `track` for an event at page load: Umami's script loads after the page (defer), so this waits up to 10 s for it. */
export function trackOnLoad(name, data, tries = 20) {
  if (typeof window === 'undefined') return;
  if (window.umami) return track(name, data);
  if (tries > 0) setTimeout(() => trackOnLoad(name, data, tries - 1), 500);
}

/** `track`, but at most once per `ms`: the first call goes at once, and the last of any made in the next `ms` follows
 * at its end (a colour slider moving, or several changes in a row, count once or twice, not every step). */
export function throttled(ms = 60e3, send = track) {
  let timer, pending;
  const tick = () => {
    if (!pending) { timer = undefined; return; }
    send(...pending); pending = null;
    timer = setTimeout(tick, ms);
  };
  return (name, data) => {
    if (timer) { pending = [name, data]; return; }
    send(name, data);
    timer = setTimeout(tick, ms);
  };
}
