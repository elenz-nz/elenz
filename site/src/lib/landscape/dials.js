// The power landscape's dials (/landscape): the live feed turned into numbers between 0 and 1, one for each part of the
// scene (scene.js draws them). Each dial runs from 0 at `lo` MW to 1 at `hi` MW (BAND): the outputs each fuel really
// moves between, not zero to installed capacity. Hydro never nears capacity (outages, river limits), and about 20 MW of
// gas cogeneration never stops. Provisional values from judgement and one day's feed (13 Nov 2026); the plan is to set
// them from percentiles of the site's history.
//
// The feed (feed.js) is New Zealand's last 24 hours: { t0, step, n, hydro: [MW], wind, geo, solar, roof, oemb, oembR,
// coal, gas, diesel, bio, waste, batt, demand, hay, ben, roofNA: [0|1], cap: { fuel: MW }, plants: [{ n, f, c, s }] }.

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------- time and sun ----------
/** The sun's elevation and hour angle (degrees) for the middle of New Zealand (41° S, 174.5° E). */
export function sun(ms) {
  const d = new Date(ms), lat = -41 * Math.PI / 180, lon = 174.5;
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const doy = (ms - start) / 864e5;
  const decl = -23.44 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180;
  const hrs = d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15;
  const H = ((hrs % 24) - 12) * 15;
  const sinE = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H * Math.PI / 180);
  return { e: Math.asin(sinE) * 180 / Math.PI, H };
}
const hourFmt = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
/** New Zealand clock time, in hours. */
export function hourOf(ms) { const p = hourFmt.formatToParts(ms); return +p.find((x) => x.type === 'hour').value % 24 + +p.find((x) => x.type === 'minute').value / 60; }
/** 0 in the evening, 1 from midnight until people start waking up (lights out around 10 pm). */
export function lateness(ms) {
  const h = hourOf(ms);
  return h >= 21.75 ? clamp((h - 21.75) * 2) : h < 5.5 ? 1 : h < 6.5 ? 6.5 - h : 0;
}

// ---------- reading the feed ----------
export const FIELDS = ['hydro', 'wind', 'geo', 'solar', 'roof', 'roofNA', 'oemb', 'oembR', 'coal', 'gas', 'diesel', 'bio', 'waste', 'batt', 'demand', 'hay', 'ben'];
/** The feed at a fractional interval x, linear between 5-minute intervals. */
export function sampleAt(D, x) {
  const i = clamp(Math.floor(x), 0, D.n - 1), j = Math.min(i + 1, D.n - 1), f = clamp(x - i, 0, 1);
  const o = { t: D.t0 + x * D.step };
  for (const k of FIELDS) o[k] = lerp(D[k]?.[i] ?? 0, D[k]?.[j] ?? 0, f);
  return o;
}

// ---------- the seasons ----------
export const SEASONS = ['Summer', 'Autumn', 'Winter', 'Spring'];
export const SEASON_F = [.12, .37, .62, .82, .96]; // a typical day in each: mid-February, mid-May, mid-August, late October; then December
export const seasonIdx = (f) => Math.floor(((Math.floor(clamp(f, 0, .999) * 12) + 1) % 12) / 3);
/** The date as a fraction of the year: 0 = 1 January, 1 = 31 December (New Zealand). */
export const seasonOf = (ms) => { const d = new Date(ms + 13 * 36e5); return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 / 365; };
export const snowAmt = (f) => .5 + .5 * Math.cos(2 * Math.PI * (f * 365 - 235) / 365); // deepest in late August, least in late February
export const meltAmt = (f) => { const t = (f * 365 - 265 + 365) % 365; return t < 35 ? t / 35 : clamp(1 - (t - 35) / 150); }; // the thaw: late September to March
export const lakeAmt = (f) => .5 - .5 * Math.cos(2 * Math.PI * (f * 365 - 265) / 365); // the hydro lake's seasonal shape, not measured storage
const band2 = (f, a, b, e = .035) => clamp((f - a) / e) * clamp((b - f) / e); // 1 between a and b, easing in and out
export const springAmt = (f) => band2(f, .66, .93), autumnAmt = (f) => band2(f, .16, .43), winterAmt = (f) => band2(f, .41, .68);
export const dryAmt = (f) => f < .22 ? clamp((.22 - f) / .06) : clamp((f - .97) / .03) * .5; // paddocks brown off in January and February
export const redAmt = (f) => Math.max(clamp((.16 - f) / .03), clamp((f - .9) / .03));          // pōhutukawa flower from December into summer
export const isXmas = (f) => f >= .915;                                                          // December

// ---------- the dials ----------
export const BAND = { hydro: [1400, 4600], wind: [0, 1270], geo: [900, 1180], solar: [0, 600], roof: [0, 760], thermal: [30, 600], town: [3000, 6800] };
export const band01 = (k, mw) => clamp((mw - BAND[k][0]) / (BAND[k][1] - BAND[k][0]));
// embedded solar on a clear day at a high sun (MW): cloud cover is worked out against it
export const CLEAR_PEAK = 748;

/** A dial maker: cloud cover holds its last daylight value overnight, so each maker keeps its own. */
export function makeDials(cap) {
  let lastCloud = 0.2;
  return function dialsFrom(s) {
    const sp = sun(s.t);
    const expected = CLEAR_PEAK * Math.pow(Math.max(Math.sin(sp.e * Math.PI / 180), 0) / 0.866, 1.2);
    const noRoof = s.roofNA > 0.5;   // no embedded solar estimate (feed.js carries the last one forward for the picture)
    if (sp.e > 10 && !noRoof) lastCloud = clamp(1 - s.roof / expected);
    const total = s.hydro + s.wind + s.geo + s.solar + s.roof + s.oemb + s.coal + s.gas + s.diesel + s.bio + s.waste;
    const ren = s.geo + s.bio + s.hydro + s.wind + s.solar + s.roof + s.oembR;
    return {
      sun: sp.e, sunH: sp.H, cloud: lastCloud,
      wind: band01('wind', s.wind), hydro: band01('hydro', s.hydro),
      geo: s.geo < 50 ? 0 : lerp(.5, 1, band01('geo', s.geo)), // geothermal runs in a tight band: always a healthy plume that swells a little
      solar: band01('solar', s.solar), roof: band01('roof', s.roof),
      thermal: band01('thermal', s.coal + s.gas + s.diesel),
      batt: clamp(s.batt / (cap?.batt || 335), -1, 1), town: band01('town', s.demand),
      season: seasonOf(s.t), time: hourOf(s.t), late: lateness(s.t),
      _gen: total + Math.max(s.batt, 0), _ren: noRoof ? null : total > 0 ? ren / total : 0, _noRoof: noRoof, _s: s,
    };
  };
}
