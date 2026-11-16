// /data/screens: a private page for the Elenz team showing the screens left open on /now, /dashboard and /landscape,
// from the heartbeats in Workers Analytics Engine (dataset elenz_beats; the beats: site/src/lib/site/beat.js). Cloudflare's
// dashboard has no view of an Analytics Engine dataset, so the Worker asks its SQL API and draws the tables itself.
//
// Settings on the Worker (Cloudflare dashboard → Workers & Pages → elenz → Settings → Variables and Secrets; never in
// the repo): SCREENS_KEY, a secret the page's address must carry (?key=...); CF_ANALYTICS_TOKEN, a secret API token
// with only Account Analytics: Read; CF_ACCOUNT_ID, the account's ID. Without SCREENS_KEY, or with the wrong key, the
// address answers 404 like any missing page. Never cached, never indexed. analysis/open_screens.py runs the same query
// from a computer.

export const SCREENS_URL = '/data/screens';
export const PAGES = ['now', 'dashboard', 'landscape'];
const NAMES = { now: 'Now', dashboard: 'Dashboard', landscape: 'Power landscape' };
const RANGES = [1, 7, 30, 90];   // days; Analytics Engine keeps three months

/** One row per page load per hour and state: the most minutes it reported, and how many beats. */
export function screensSql(days) {
  return `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob1 AS page, index1 AS id,
  blob2 AS shown, blob3 AS opened, blob4 AS country, max(double1) AS minutes, count() AS beats
FROM elenz_beats
WHERE timestamp > NOW() - INTERVAL '${days}' DAY
GROUP BY hour, page, id, shown, opened, country
ORDER BY hour
LIMIT 100000
FORMAT JSON`;
}

/** Whole days asked for, from the address: 1, 7, 30 or 90 (7 if anything else). */
export const daysOf = (url) => {
  const d = Number(url.searchParams.get('days'));
  return RANGES.includes(d) ? d : 7;
};

// the API gives UTC times as '2026-11-17 08:00:00'
const utc = (text) => Date.parse(String(text).replace(' ', 'T') + 'Z');
const NZ = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', hour12: false,
});
function nzParts(t) {
  const p = Object.fromEntries(NZ.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24;
  return { label: `${p.weekday} ${p.day} ${p.month}, ${String(h).padStart(2, '0')}:00`, hour: h };
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * From the query's rows: by hour (NZ time, newest first) and page, the screens open, how many were on screen at some
 * point in that hour, and how many came from a wall-screen link; by hour of day, the average screens open per day; and
 * per page, every screen's time open (its largest minutes), wall-screen links and countries.
 */
export function summarise(rows, days) {
  const hours = new Map(), clock = Array.from({ length: 24 }, () => Object.fromEntries(PAGES.map((p) => [p, 0])));
  const screens = Object.fromEntries(PAGES.map((p) => [p, new Map()]));
  const seen = new Set();   // page, id and hour, counted once whatever its state
  for (const r of rows) {
    if (!PAGES.includes(r.page)) continue;
    const t = utc(r.hour);
    if (!Number.isFinite(t)) continue;
    if (!hours.has(t)) hours.set(t, Object.fromEntries(PAGES.map((p) => [p, { open: new Set(), shown: new Set(), wall: new Set() }])));
    const h = hours.get(t)[r.page];
    h.open.add(r.id);
    if (r.shown === 'visible') h.shown.add(r.id);
    if (r.opened === 'kiosk') h.wall.add(r.id);
    const key = `${r.page} ${r.id} ${t}`;
    if (!seen.has(key)) { seen.add(key); clock[nzParts(t).hour][r.page] += 1; }
    const s = screens[r.page].get(r.id) ?? { minutes: 0, wall: false, country: '' };
    s.minutes = Math.max(s.minutes, Number(r.minutes) || 0);
    s.wall ||= r.opened === 'kiosk';
    s.country ||= r.country || '';
    screens[r.page].set(r.id, s);
  }
  const byHour = [...hours.entries()].sort((a, b) => b[0] - a[0]).map(([t, by]) => ({
    t, label: nzParts(t).label,
    pages: Object.fromEntries(PAGES.map((p) => [p, { open: by[p].open.size, shown: by[p].shown.size, wall: by[p].wall.size }])),
  }));
  const byClock = clock.map((c, hour) => ({ hour, pages: Object.fromEntries(PAGES.map((p) => [p, c[p] / days])) }));
  const perPage = Object.fromEntries(PAGES.map((p) => {
    const list = [...screens[p].values()], mins = list.map((s) => s.minutes);
    const countries = {};
    for (const s of list) if (s.country) countries[s.country] = (countries[s.country] ?? 0) + 1;
    return [p, {
      screens: list.length, wall: list.filter((s) => s.wall).length,
      median: median(mins), hourPlus: mins.filter((m) => m >= 60).length, longest: Math.max(0, ...mins),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]),
    }];
  }));
  return { days, byHour, byClock, perPage };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mins = (m) => (m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
const avg = (v) => (v ? (v < 10 ? v.toFixed(1) : String(Math.round(v))) : '–');

const STYLE = `body{font:15px/1.45 system-ui,sans-serif;margin:0;padding:20px;color:#132020;background:#f5f7f6}
h1{font-size:1.4rem;margin:0 0 4px}h2{font-size:1.05rem;margin:28px 0 8px}p{margin:4px 0 10px;color:#4b5d5b;max-width:70ch}
nav a{margin-right:12px}a{color:#0e6b62}a[aria-current]{font-weight:700;color:#132020;text-decoration:none}
table{border-collapse:collapse;background:#fff;border:1px solid #d9e0de;font-variant-numeric:tabular-nums}
th,td{padding:5px 10px;border-bottom:1px solid #e6ebe9;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
thead th{font-size:.8rem;color:#4b5d5b}.wrap{overflow-x:auto}.bad{color:#9b2c1c}.zero{color:#b3bfbd}
@media (prefers-color-scheme:dark){body{background:#101716;color:#e8efed}p,thead th{color:#9fb0ad}a{color:#6fd0bf}a[aria-current]{color:#e8efed}
table{background:#16201f;border-color:#2a3836}th,td{border-color:#223030}.zero{color:#4b5d5b}.bad{color:#f19a85}}`;

function page(title, body) {
  return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · ELENZ</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

/** The page for a summary. `key` goes back into its own links so the range buttons work. */
export function screensPage(sum, key, now = Date.now()) {
  const q = (d) => `?key=${encodeURIComponent(key)}&days=${d}`;
  const nav = RANGES.map((d) => `<a href="${q(d)}"${d === sum.days ? ' aria-current="page"' : ''}>${d === 1 ? 'Last 24 hours' : `Last ${d} days`}</a>`).join('');
  const cell = (n) => (n ? String(n) : '<span class="zero">0</span>');
  const totals = `<table><thead><tr><th>Page</th><th>Screens</th><th>From a wall-screen link</th><th>Median time open</th><th>Open an hour or more</th><th>Longest</th><th>Countries</th></tr></thead><tbody>${
    PAGES.map((p) => {
      const s = sum.perPage[p];
      return `<tr><td>${NAMES[p]}</td><td>${s.screens}</td><td>${s.wall}</td><td>${s.screens ? mins(s.median) : '–'}</td><td>${s.hourPlus}</td><td>${s.screens ? mins(s.longest) : '–'}</td><td>${
        esc(s.countries.slice(0, 4).map(([c, n]) => `${c} ${n}`).join(', ') || '–')}</td></tr>`;
    }).join('')}</tbody></table>`;
  const clock = `<table><thead><tr><th>NZ time</th>${PAGES.map((p) => `<th>${NAMES[p]}</th>`).join('')}</tr></thead><tbody>${
    sum.byClock.map((r) => `<tr><td>${String(r.hour).padStart(2, '0')}:00</td>${PAGES.map((p) => `<td>${avg(r.pages[p])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const hours = sum.byHour.length
    ? `<table><thead><tr><th>Hour (NZ time)</th>${PAGES.map((p) => `<th>${NAMES[p]}<br>open · on screen · wall</th>`).join('')}</tr></thead><tbody>${
      sum.byHour.map((r) => `<tr><td>${esc(r.label)}</td>${PAGES.map((p) => {
        const c = r.pages[p];
        return `<td>${cell(c.open)} · ${cell(c.shown)} · ${cell(c.wall)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`
    : '<p>No heartbeats in this range yet.</p>';
  const asOf = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(now));
  return page('Open screens', `<h1>Open screens</h1>
<p>Now, the dashboard and the power landscape send a heartbeat every 5 minutes while they're open, on screen or hidden. A screen is one opening of a page. As of ${esc(asOf)} NZ time.</p>
<nav>${nav}</nav>
<h2>Each page</h2><div class="wrap">${totals}</div>
<h2>By time of day</h2><p>Screens open in each hour, averaged over the ${sum.days === 1 ? 'last 24 hours' : `last ${sum.days} days`}.</p><div class="wrap">${clock}</div>
<h2>Hour by hour</h2><p>Newest first. Open: screens with a beat that hour. On screen: of them, seen at least once (not hidden behind another tab or a sleeping display). Wall: of them, opened from a wall-screen link.</p><div class="wrap">${hours}</div>`);
}

export const problemPage = (text) => page('Open screens', `<h1>Open screens</h1><p class="bad">${esc(text)}</p>`);

/** Whether `given` is the key, compared in constant time. */
export async function keyMatches(given, key) {
  if (!given || !key) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([enc.encode(given), enc.encode(key)].map((x) => crypto.subtle.digest('SHA-256', x)));
  return crypto.subtle.timingSafeEqual(a, b);
}

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
};   // Referrer-Policy is the site's own (finish() in index.js): other sites get only the origin, never the key
const html = (body, status = 200) => new Response(body, { status, headers: HEADERS });

/** Answers /data/screens. */
export async function screens(request, env, url) {
  if (request.method !== 'GET' || !(await keyMatches(url.searchParams.get('key'), env.SCREENS_KEY))) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const missing = ['CF_ACCOUNT_ID', 'CF_ANALYTICS_TOKEN'].filter((k) => !env[k]);
  if (missing.length) return html(problemPage(`Add ${missing.join(' and ')} to the Worker's settings (Workers & Pages → elenz → Settings → Variables and Secrets), then reload.`), 503);
  const days = daysOf(url);
  let res;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/analytics_engine/sql`, {
      method: 'POST', body: screensSql(days), headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    });
  } catch (e) {
    return html(problemPage(`Cloudflare's analytics couldn't be reached: ${e && e.message}. Try again in a minute.`), 502);
  }
  const text = await res.text();
  if (!res.ok) {
    const why = res.status === 401 || res.status === 403
      ? 'Cloudflare refused the token: check CF_ANALYTICS_TOKEN (Account Analytics: Read) and CF_ACCOUNT_ID.'
      : /unknown table|does not exist|elenz_beats/i.test(text)
        ? 'No heartbeats have been stored yet. Open elenz.co.nz/now for a minute, then reload.'
        : `Cloudflare's analytics answered ${res.status}.`;
    return html(problemPage(`${why} (${text.slice(0, 300)})`), 502);
  }
  let data;
  try { data = JSON.parse(text).data ?? []; } catch { return html(problemPage('Cloudflare sent something that is not a table.'), 502); }
  return html(screensPage(summarise(data, days), url.searchParams.get('key')));
}
