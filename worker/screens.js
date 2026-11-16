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
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

// Colours: the first three slots of the data-viz reference palette (blue, orange, aqua), stepped for light and dark,
// which pass its colour-blind checks as a set. Identity never rests on colour alone: each chart has a legend, every bar
// a hover note, and the tables below give every number.
const STYLE = `:root{--bg:#f4f6f5;--card:#fff;--line:#dfe5e3;--grid:#e9eeec;--ink:#0f1c1b;--ink2:#3d4d4b;--muted:#6b7b78;
--link:#0e6b62;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--bad:#9b2c1c;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0f1514;--card:#172120;--line:#2a3735;--grid:#22302e;--ink:#eef3f2;--ink2:#c3cfcc;
--muted:#8d9d9a;--link:#6fd0bf;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--bad:#f19a85;color-scheme:dark}}
*{box-sizing:border-box}body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px clamp(14px,3vw,32px) 40px;color:var(--ink);background:var(--bg)}
main{max-width:1180px;margin:0 auto}h1{font-size:1.6rem;margin:0}h2{font-size:1.1rem;margin:0 0 2px}
.lede{color:var(--ink2);margin:4px 0 16px}.note{color:var(--muted);font-size:.9rem;margin:0 0 10px}
a{color:var(--link)}.top{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:end;justify-content:space-between;margin-bottom:18px}
nav{display:flex;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px}
nav a{padding:5px 12px;border-radius:999px;text-decoration:none;font-size:.9rem;color:var(--ink2);white-space:nowrap}
nav a[aria-current]{background:var(--ink);color:var(--card);font-weight:600}
.grid{display:grid;gap:14px;margin-bottom:14px}.cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.charts{grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.page{display:flex;align-items:center;gap:8px;font-weight:600}.sw{width:12px;height:12px;border-radius:3px;flex:none}
.big{font-size:2.3rem;font-weight:700;line-height:1.1;margin:8px 0 0;font-variant-numeric:tabular-nums}.big small{font-size:.9rem;font-weight:400;color:var(--muted)}
dl.stats{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin:12px 0 0;font-size:.92rem}dl.stats dt{color:var(--ink2)}
dl.stats dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.85rem;color:var(--ink2);margin:0 0 6px}.legend span{display:flex;align-items:center;gap:6px}
svg{display:block;width:100%;height:auto;overflow:visible}svg text{fill:var(--muted);font-size:11px;font-family:inherit}
.gl{stroke:var(--grid);stroke-width:1}.base{stroke:var(--line);stroke-width:1}.f1{fill:var(--s1)}.f2{fill:var(--s2)}.f3{fill:var(--s3)}
.hit{fill:transparent}.hit:hover{fill:var(--ink);fill-opacity:.06}
.help{margin:0;padding-left:1.1em;color:var(--ink2);font-size:.92rem}.help li{margin:3px 0}.help b{color:var(--ink)}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 18px;margin-bottom:14px}
summary{cursor:pointer;font-weight:600}details[open] summary{margin-bottom:10px}
table{border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:.9rem;margin:0 0 6px}.wrap{overflow-x:auto}
th,td{padding:5px 10px;border-bottom:1px solid var(--grid);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
thead th{font-size:.8rem;color:var(--muted);font-weight:600}thead tr:first-child th{color:var(--ink2)}.gstart{border-left:1px solid var(--line)}
.zero{color:var(--muted);opacity:.6}.bad{color:var(--bad)}
@media (max-width:600px){svg text{font-size:19px}nav a{padding:5px 10px}}`;

function page(title, body) {
  return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · ELENZ</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

const FILL = { now: 'f1', dashboard: 'f2', landscape: 'f3' };
const SWATCH = { now: 'var(--s1)', dashboard: 'var(--s2)', landscape: 'var(--s3)' };
const legend = `<div class="legend">${PAGES.map((p) => `<span><i class="sw" style="background:${SWATCH[p]}"></i>${NAMES[p]}</span>`).join('')}</div>`;

/** A round axis top and 3–4 gridlines for values up to `max`. */
function ticks(max) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw);
  const out = [];
  for (let v = 0; v < max + step * 0.999; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Path for a bar segment with its top corners rounded (the data end), square at the bottom. */
function topRounded(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (r <= 0.5) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * A stacked bar chart, drawn on the server as SVG. bars: [{ tip, values: { now, dashboard, landscape } }];
 * xLabel(i) gives the axis label under bar i, or nothing. Each bar has a full-height hover target with its note.
 */
function stacked(bars, xLabel, { unit, height = 220 } = {}) {
  const W = 640, H = height, L = 34, R = 6, T = 8, B = 30, pw = W - L - R, ph = H - T - B;
  const totals = bars.map((b) => PAGES.reduce((a, p) => a + (b.values[p] || 0), 0));
  const tk = ticks(Math.max(0, ...totals)), top = tk[tk.length - 1] || 1;
  const step = pw / Math.max(1, bars.length), bw = Math.max(1, bars.length > 60 ? step - 1 : step * 0.72);
  const gap = bw >= 6 ? 2 : 0, y = (v) => T + ph - (v / top) * ph;
  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  let g = tk.map((v) => `<line class="${v ? 'gl' : 'base'}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('');
  bars.forEach((b, i) => {
    const x = L + i * step + (step - bw) / 2, shown = PAGES.filter((p) => b.values[p] > 0);
    let base = 0;
    shown.forEach((p, k) => {
      const v = b.values[p], y0 = y(base), y1 = y(base + v), last = k === shown.length - 1;
      const h = Math.max(0.5, y0 - y1 - (k ? gap : 0));
      g += last ? `<path class="${FILL[p]}" d="${topRounded(x, y1, bw, h, 4)}"/>` : `<rect class="${FILL[p]}" x="${x}" y="${y1}" width="${bw}" height="${h}"/>`;
      base += v;
    });
    const label = xLabel(i);
    if (label) g += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(label)}</text>`;
    g += `<rect class="hit" x="${L + i * step}" y="${T}" width="${step}" height="${ph}"><title>${esc(b.tip)}\n${
      PAGES.map((p) => `${NAMES[p]}: ${avg(b.values[p])}`).join('\n')}\nTotal: ${avg(totals[i])} ${unit}</title></rect>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unit)}">${g}</svg>`;
}

const NZ_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' });
const NZ_SHORT = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' });
const NZ_WEEKDAY = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric' });

/** Bars over the range: one per hour up to 7 days, one per NZ day (average screens open per hour) beyond. */
function overTime(sum, now) {
  const HOUR = 3600e3, byT = new Map(sum.byHour.map((r) => [r.t, r]));
  const end = Math.floor(now / HOUR) * HOUR, n = sum.days * 24;
  const hours = Array.from({ length: n }, (_, i) => end - (n - 1 - i) * HOUR);
  const val = (t) => Object.fromEntries(PAGES.map((p) => [p, byT.get(t)?.pages[p].open ?? 0]));
  if (sum.days <= 7) {
    const bars = hours.map((t) => ({ tip: `${nzParts(t).label} NZ time`, values: val(t) }));
    const label = (i) => {
      const { hour } = nzParts(hours[i]);
      if (sum.days === 1) return hour % 6 === 0 ? hh(hour) : '';
      return hour === 0 ? NZ_WEEKDAY.format(new Date(hours[i])) : '';
    };
    return { svg: stacked(bars, label, { unit: 'screens open' }), note: sum.days === 1 ? 'Screens open in each hour.' : 'Screens open in each hour; labels at midnight.' };
  }
  const days = new Map();
  for (const t of hours) {
    const d = NZ_DAY.format(new Date(t));
    if (!days.has(d)) days.set(d, { t, sums: Object.fromEntries(PAGES.map((p) => [p, 0])) });
    const v = val(t);
    for (const p of PAGES) days.get(d).sums[p] += v[p];
  }
  const list = [...days.values()];
  const bars = list.map((d) => ({ tip: NZ_SHORT.format(new Date(d.t)), values: Object.fromEntries(PAGES.map((p) => [p, d.sums[p] / 24])) }));
  const every = sum.days > 30 ? 14 : 7;
  return { svg: stacked(bars, (i) => (i % every === 0 ? NZ_SHORT.format(new Date(list[i].t)) : ''), { unit: 'screens open, average per hour' }),
    note: 'Average screens open per hour, day by day.' };
}

/** The page for a summary. `key` goes back into its own links so the range buttons work. */
export function screensPage(sum, key, now = Date.now()) {
  const q = (d) => `?key=${encodeURIComponent(key)}&days=${d}`;
  const rangeName = (d) => (d === 1 ? 'Last 24 hours' : `Last ${d} days`);
  const nav = RANGES.map((d) => `<a href="${q(d)}"${d === sum.days ? ' aria-current="page"' : ''} title="${rangeName(d)}">${d === 1 ? '24 hours' : `${d} days`}</a>`).join('');
  const cell = (n) => (n ? String(n) : '<span class="zero">0</span>');
  const cards = PAGES.map((p) => {
    const s = sum.perPage[p];
    const countries = s.countries.slice(0, 4).map(([c, n]) => `${c} ${n}`).join(', ') || '–';
    return `<div class="card"><div class="page"><i class="sw" style="background:${SWATCH[p]}"></i>${NAMES[p]}</div>
<p class="big">${s.screens} <small>screen${s.screens === 1 ? '' : 's'}</small></p><dl class="stats">
<dt>From a wall-screen link</dt><dd>${s.wall}</dd><dt>Typical time open</dt><dd>${s.screens ? mins(s.median) : '–'}</dd>
<dt>Open an hour or more</dt><dd>${s.hourPlus}</dd><dt>Longest</dt><dd>${s.screens ? mins(s.longest) : '–'}</dd>
<dt>Countries</dt><dd>${esc(countries)}</dd></dl></div>`;
  }).join('');
  const clockBars = sum.byClock.map((r) => ({ tip: `${hh(r.hour)}–${hh((r.hour + 1) % 24)} NZ time`, values: r.pages }));
  const clockSvg = stacked(clockBars, (i) => (i % 3 === 0 ? hh(i) : ''), { unit: 'screens open, average' });
  const ot = overTime(sum, now);
  const clockTable = `<table><thead><tr><th>NZ time</th>${PAGES.map((p) => `<th>${NAMES[p]}</th>`).join('')}</tr></thead><tbody>${
    sum.byClock.map((r) => `<tr><td>${hh(r.hour)}</td>${PAGES.map((p) => `<td>${avg(r.pages[p])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const sub = ['Open', 'On screen', 'Wall link'];
  const hours = sum.byHour.length
    ? `<table><thead><tr><th></th>${PAGES.map((p) => `<th colspan="3" class="gstart">${NAMES[p]}</th>`).join('')}</tr>
<tr><th>Hour (NZ time)</th>${PAGES.map(() => sub.map((x, i) => `<th${i ? '' : ' class="gstart"'}>${x}</th>`).join('')).join('')}</tr></thead><tbody>${
      sum.byHour.map((r) => `<tr><td>${esc(r.label)}</td>${PAGES.map((p) => {
        const c = r.pages[p];
        return `<td class="gstart">${cell(c.open)}</td><td>${cell(c.shown)}</td><td>${cell(c.wall)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="note">No heartbeats in this range yet.</p>';
  const asOf = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(now));
  const span = sum.days === 1 ? 'the last 24 hours' : `the last ${sum.days} days`;
  return page('Open screens', `<div class="top"><div><h1>Open screens</h1>
<p class="lede">Now, the dashboard and the power landscape, left open. ${esc(rangeName(sum.days))}, as of ${esc(asOf)} NZ time.</p></div>
<nav aria-label="Range">${nav}</nav></div>
<section class="grid cards">${cards}</section>
<section class="grid charts">
<div class="card"><h2>By time of day</h2><p class="note">Average screens open in each hour of the day, over ${esc(span)}.</p>${legend}${clockSvg}</div>
<div class="card"><h2>Over time</h2><p class="note">${esc(ot.note)}</p>${legend}${ot.svg}</div>
</section>
<details><summary>What the numbers mean</summary><ul class="help">
<li><b>Screen:</b> one opening of a page. Reloading or opening it again in another tab counts as a new screen.</li>
<li><b>Open:</b> the page sent a heartbeat that hour. It sends one every 5 minutes while open, even in a hidden tab.</li>
<li><b>On screen:</b> it was actually visible at some point that hour, not behind another tab or on a sleeping display.</li>
<li><b>Wall link:</b> opened from a wall-screen link (the picture alone, no menus).</li>
<li><b>Typical time open:</b> the median: half the screens were open longer, half shorter.</li>
<li>Browsers with Do Not Track, or that opened <code>?exclude-me</code>, send nothing. Hover over a bar for its numbers.</li>
</ul></details>
<details><summary>Table: by time of day</summary><div class="wrap">${clockTable}</div></details>
<details><summary>Table: hour by hour</summary><p class="note">Newest first.</p><div class="wrap">${hours}</div></details>`);
}

export const problemPage = (text) => page('Open screens', `<h1>Open screens</h1><div class="card" style="margin-top:14px"><p class="bad" style="margin:0">${esc(text)}</p></div>`);

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
