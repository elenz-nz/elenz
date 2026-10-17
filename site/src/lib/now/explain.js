// The price explainer on /now ("Why is the price high?"), from tracker.json and its `explain` block (ingest/explain.py).
//
// Always there, in one of three states:
//   quiet      one line under the price tiles ("$38 is about usual for a Saturday at 10:30 am") and a button
//   highlight  the line is outlined and asks to be opened: prices up, the islands split, or a new low
//   open       the card opens by itself: extremes only. Lows never open it.
// The rules were tested on every half-hour of final prices since 1997 (analysis/price_triggers.py; results in
// analysis/README.md, "Price explainer triggers"). Live they test the 30-minute average of the 5-minute dispatch
// prices, and each state holds for 30 minutes after its condition ends.
//
// "Typical" is the median of max(Haywards, Benmore) for the same half-hour of the week over the last four weeks of
// history; `level` the median over the last year (a floor, so a $20 price over a $5 typical doesn't count as 4×).

export const RULES = {
  hlRatio: 1.5, hlLevel: 1.25,                // highlighted: ≥ 1.5× typical and ≥ 1.25× the year median
  splitGap: 50, splitRel: 0.25,               // or the islands more than $50 and 25% apart
  low: 5, lowQuietH: 24, lowShowH: 2,         // or a new low: under $5 after 24 h without one, for its first 2 h
  nearZero: 0.2,                              // a low under this is "near zero"; otherwise just "low"
  windDays: 2,                                // wind: say "lower than it has been for N days" from this many days
  openRatio: 3, openLevel: 3, openFloor: 300, // opens itself: ≥ 3× typical, ≥ 3× the year median and ≥ $300
  openAny: 800,                               // or ≥ $800 at any time
  avgMin: 30, holdMin: 30,
};

// Each factor: which way it pushes the price when above usual (sign); the MW difference below which it isn't worth
// mentioning (floor; also the smallest "usual" a percentage is taken of); the share of usual it must differ by (rel);
// and its weight when ranking. Hydro weighs less: it is dispatched to balance everything else, so it follows the
// others more than it leads. Wind follows the weather, not the clock, so it is compared with its median over the last
// four weeks (not this half-hour's), and described by how long it has been since it was this low or high.
export const FACTORS = [
  { k: 'wind', name: 'Wind', tok: '--f-wind', sign: -1, floor: 100, rel: 0.3 },
  { k: 'solar', name: 'Solar', tok: '--f-solar', sign: -1, floor: 100 },
  { k: 'hydro', name: 'Hydro', tok: '--f-hydro', sign: -1, floor: 250, weight: 0.5 },
  { k: 'thermal', name: 'Gas and coal', tok: '--f-gas', sign: 1, floor: 80 },
  { k: 'peakers', name: 'Peakers', tok: '--f-diesel', sign: 1, floor: 30 },
  { k: 'demand', name: 'Demand', tok: '--ink-2', sign: 1, floor: 150, rel: 0.04 },
];

const NZT = 'Pacific/Auckland';
const HALF = 1800000;
const fmt = (v) => Math.round(v).toLocaleString('en-NZ');
export const money = (v) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', {
  maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2, minimumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const PARTS = new Intl.DateTimeFormat('en-NZ', { timeZone: NZT, weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
/** 'Saturday at 8:30 am' for the half-hour containing t. */
export function slotLabel(t) {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(Math.floor(t / HALF) * HALF)).map((x) => [x.type, x.value]));
  return `${p.weekday} at ${p.hour}${p.minute === '00' ? '' : ':' + p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}
const CLOCK = new Intl.DateTimeFormat('en-NZ', { timeZone: NZT, hour: 'numeric', minute: '2-digit', hour12: true });
export const clock = (t) => CLOCK.format(new Date(t)).replace(/\s?(am|pm)/i, (m) => ' ' + m.trim().toLowerCase());
export const duration = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} minutes` : m < 120 ? `${m >= 90 ? '1½' : '1'} hour${m >= 90 ? 's' : ''}` : `${Math.round(m / 60)} hours`;
};

/** Words for "now is r times usual" when r < 1: 'a fifth of', 'half', ... */
function fraction(r) {
  if (r <= 0.12) return 'a tenth of';
  if (r <= 0.22) return 'a fifth of';
  if (r <= 0.29) return 'a quarter of';
  if (r <= 0.4) return 'a third of';
  if (r <= 0.58) return 'half';
  return 'two-thirds of';
}

/** How far a factor is from usual: { dev, rel, effect (+1 pushes the price up, −1 down, 0 near usual), score }. */
export function compare(f, now, usual) {
  if (now == null || usual == null) return { dev: 0, rel: 0, effect: 0, score: 0 };
  const dev = now - usual;
  const rel = dev / Math.max(usual, f.floor);
  const off = Math.abs(dev) >= f.floor && Math.abs(rel) >= (f.rel ?? 0.15);
  // rank by how far off it is, and by how many MW: a 300 MW swing counts in full
  const score = off ? Math.abs(rel) * Math.min(1, Math.abs(dev) / 300) * (f.weight ?? 1) : 0;
  return { dev, rel, effect: off ? f.sign * Math.sign(dev) : 0, score };
}

/** A factor's difference from usual as a short phrase, or null when near usual: 'wind is a fifth of usual'.
 * long: for the explanation sentence, which has no "usually" line beside it. */
function phrase(f, now, usual, c, long = false) {
  if (!c.effect) return null;
  const name = f.name.toLowerCase();
  if (f.k === 'wind') return `wind is ${c.dev < 0 ? 'below' : 'above'} usual`;
  if (f.k === 'peakers') return now >= 10 && usual < 10 ? 'peaking plants are running' : c.dev > 0 ? `peaking plants are running ${fmt(now)} MW` : 'peaking plants are off';
  const r = usual > 0 ? now / usual : Infinity;
  if (c.dev < 0) return r <= 0.66 ? `${name} is ${fraction(r)} usual` : `${name} is ${Math.round(-c.rel * 100)}% below usual`;
  // from a small usual, a percentage misleads: say the MW
  if (usual < f.floor) return `${name} is up to ${fmt(now)} MW` + (long ? ` from a usual ${fmt(usual)} MW` : '');
  return r >= 1.8 ? `${name} is ${r.toFixed(1)}× usual` : `${name} is ${Math.round(c.rel * 100)}% above usual`;
}

/** Days as words: '5 days', '2 weeks'. */
const span = (d) => (d >= 14 ? `${Math.round(d / 7)} weeks` : `${Math.round(d)} days`);

/** Wind's row: { title, phrase } against its four-week median and how long since it was last this low or high
 * (W: the explain block's wind for the region, from ingest/explain.py wind_since). */
function windWords(W, c, where) {
  const side = W.side === 'low' ? 'lower' : 'higher';
  if (W.days != null && W.days >= RULES.windDays) {
    const p = `wind is ${side} than it has been for ${W.at_least ? 'at least ' : ''}${span(W.days)}`;
    return { title: cap(where + p), phrase: where + p };
  }
  if (c.effect) {
    const p = `wind is ${c.dev < 0 ? 'below' : 'above'} its four-week median`;
    return { title: cap(where + p), phrase: where + p };
  }
  return { title: `${where}${where ? 'wind' : 'Wind'} close to its four-week median`, phrase: null };
}

const avg = (a, j, n) => {
  let s = 0, k = 0;
  for (let i = Math.max(0, j - n + 1); i <= j; i++) if (a[i] != null) { s += a[i]; k++; }
  return k ? s / k : null;
};

/** The explainer for the newest interval of tracker.json, or null if the file has no `explain` block yet.
 * plantMeta: plants.json (plant -> owner, scheme), for naming the possible price setter. */
export function explainNow(D, plantMeta = {}) {
  const E = D.explain;
  if (!E || !E.typ) return null;
  const R = RULES;
  const J = D.N - 1, step = D.step, t = D.t0 + J * step;
  const nAvg = Math.round((R.avgMin * 60000) / step), nHold = Math.round((R.holdMin * 60000) / step);
  const HAY = D.NI.price, BEN = D.SI.price;
  const typAt = (tt, key = 'med') => {
    const k = Math.floor((tt - E.typ.t0) / E.typ.step);
    return k >= 0 && k < E.typ[key].length ? E.typ[key][k] : null;
  };
  // each interval's conditions, on 30-minute averages
  const at = (j) => {
    const tj = D.t0 + j * step, h = avg(HAY, j, nAvg), b = avg(BEN, j, nAvg);
    if (h == null || b == null) return { hi: null };
    const hi = Math.max(h, b), lo = Math.min(h, b), gap = Math.abs(h - b), ty = typAt(tj);
    return {
      h, b, hi, lo, gap, ty,
      high: ty != null && hi >= R.hlRatio * ty && hi >= R.hlLevel * E.level,
      open: (ty != null && hi >= R.openRatio * ty && hi >= R.openLevel * E.level && hi >= R.openFloor) || hi >= R.openAny,
      split: gap > R.splitGap && gap > R.splitRel * Math.max(lo, 1),
      low: lo < R.low,
    };
  };
  const C = [];
  const back = Math.min(J, Math.round(((R.lowQuietH + R.lowShowH + 1) * 3600000) / step));
  for (let j = J - back; j <= J; j++) C[j] = at(j);
  const held = (key) => { for (let j = J - nHold + 1; j <= J; j++) if (C[j]?.[key]) return true; return false; };
  const now = C[J];
  if (now.hi == null) return null;
  const isOpen = held('open'), isHigh = held('high'), isSplit = held('split');
  // when this run of high (or split) prices began: back while it held, bridging gaps up to the 30-minute hold
  const since = (keys) => {
    let j = J, start = null, gap = 0;
    while (j >= J - back && C[j]) {
      if (keys.some((k) => C[j][k])) { start = j; gap = 0; } else if (++gap > nHold) break;
      j--;
    }
    return start == null ? null : D.t0 + start * step;
  };
  // a new low: under $5 now, the run began within lowShowH, and no low in the lowQuietH before it
  let lowStart = null, newLow = false;
  if (now.low) {
    let j = J;
    while (j > J - back && C[j - 1]?.low) j--;
    lowStart = D.t0 + j * step;
    let quiet = true;
    for (let i = Math.max(J - back, j - Math.round((R.lowQuietH * 3600000) / step)); i < j; i++) if (C[i]?.low) { quiet = false; break; }
    newLow = quiet && t - lowStart <= R.lowShowH * 3600000;
  }
  const tier = isOpen ? 'open' : isHigh || isSplit || newLow ? 'highlight' : 'quiet';
  const variant = isOpen ? (isSplit && now.gap > 0.5 * Math.max(now.lo, 1) ? 'split' : 'high')
    : isSplit ? 'split' : isHigh ? 'high' : now.low ? 'low' : 'usual';
  const ratio = now.ty ? now.hi / now.ty : null;
  const nearZero = now.hi < R.nearZero;   // both islands under $0.20
  const label = slotLabel(t);
  const northDear = now.h >= now.b;

  // factors: New Zealand, or for a split the dearer island's (hydro from the South Island, where most of it is)
  const dear = northDear ? 'NI' : 'SI', cheap = northDear ? 'SI' : 'NI';
  const regionOf = (k) => (variant === 'split' ? (k === 'hydro' ? 'SI' : dear) : 'NZ');
  const peakers = E.peakers || [];
  const rows = FACTORS.map((f) => {
    const r = regionOf(f.k);
    const where = r === 'NZ' ? '' : r === 'NI' ? 'North Island ' : 'South Island ';
    const W = f.k === 'wind' ? E.wind?.[r] : null;
    if (W) {
      // wind: against its four-week median (30-minute average now), not this half-hour's usual
      const c = compare(f, W.now, W.med);
      const w = windWords(W, c, where), bare = windWords(W, c, '');
      return { ...f, region: r, now: W.now, usual: W.med, ...c, title: w.title, sub: `${fmt(W.now)} MW now · four-week median ${fmt(W.med)} MW`,
        phrase: w.phrase, bare: bare.phrase, where };
    }
    const nw = E.now[r]?.[f.k], us = E.usual[r]?.[f.k];
    const c = compare(f, nw, us);
    const ph = phrase(f, nw ?? 0, us ?? 0, c), phLong = phrase(f, nw ?? 0, us ?? 0, c, true);
    const title = ph ? cap(where + ph) : `${where}${where ? f.name.toLowerCase() : f.name} close to usual`;
    const named = f.k === 'peakers' && peakers.length ? peakers.slice(0, 3).map((p) => `${p.name} ${fmt(p.mw)}`).join(', ') + ' MW · ' : '';
    const sub = `${named || `${fmt(nw ?? 0)} MW now · `}usually ${fmt(us ?? 0)} MW at this time`;
    return { ...f, region: r, now: nw ?? 0, usual: us ?? 0, ...c, title, sub, phrase: phLong ? where + phLong : null, bare: phLong, where };
  }).filter((x) => !(x.k === 'solar' && x.now < 30 && x.usual < 30) && !(x.k === 'peakers' && x.now < 10 && x.usual < 10));
  rows.sort((a, b) => b.score - a.score);
  // the link between the islands
  const hv = E.now.hvdc ?? 0, hvU = E.usual.hvdc ?? 0;
  const dir = (v) => (Math.abs(v) < 1 ? '' : v > 0 ? 'north' : 'south');
  const link = {
    k: 'hvdc', tok: '--f-hvdc', now: Math.abs(hv), usual: Math.abs(hvU),
    effect: isSplit ? 1 : 0, split: isSplit,
    title: isSplit ? `Islands ${money(now.gap)} apart` : 'Islands priced together',
    sub: `HVDC ${fmt(Math.abs(hv))} MW ${dir(hv)} (estimated) · usually ${fmt(Math.abs(hvU))} MW ${dir(hvU)}` +
      (isSplit ? '' : ` · prices ${money(now.gap)} apart`),
  };

  // the explanation in words
  // the top two factors pushing the way the price has gone (either way when it's about usual)
  const want = variant === 'low' ? -1 : variant === 'usual' ? 0 : 1;
  const top = rows.filter((x) => x.phrase && (want ? x.effect === want : x.effect)).slice(0, 2);
  // name the island once when both reasons are from it: "In the North Island, wind is ... and gas and coal is ..."
  const one = top.length && top.every((x) => x.where && x.where === top[0].where);
  const reasons = one ? top.map((x) => x.bare) : top.map((x) => x.phrase);
  const joined = !reasons.length ? '' : one ? `In the ${top[0].where.trim()}, ${reasons.join(' and ')}.` : cap(reasons.join(' and ')) + '.';
  let headline, line, verdict;
  if (variant === 'split') {
    const [hiIsl, loIsl] = northDear ? ['North', 'South'] : ['South', 'North'];
    headline = `Why is the ${hiIsl} Island dearer?`;
    line = `The islands have split: Haywards ${money(now.h)}, Benmore ${money(now.b)} per MWh (30-minute average).`;
    verdict = `Prices split like this when the HVDC link, or the grid near it, can't carry any more power from the ${loIsl} Island, so each island is priced on its own. ${joined}`.trim();
  } else if (variant === 'high') {
    headline = tier === 'open' ? 'Why is the price high?' : 'Why is the price up?';
    line = `Prices are up: ${money(now.hi)}/MWh over the last 30 minutes${ratio ? `, about ${ratio.toFixed(1)}× usual for a ${label}` : ''}.`;
    verdict = (joined ? joined + ' ' : "None of the factors shown here is far from usual, so the cause may be one this page can't see yet: an outage, a grid constraint, reserves, or how generators have offered. ")
      + 'The price is set by the most expensive offer needed to meet demand in each 5 minutes.';
  } else if (variant === 'low') {
    const word = nearZero ? 'near zero' : 'low';
    headline = 'Why is the price so low?';
    line = (newLow ? `Prices ${word} since ${clock(lowStart)}` : `Prices ${word} for ${duration(t - lowStart)}`)
      + (nearZero ? '.' : `: ${money(now.hi)}/MWh over the last 30 minutes.`);
    verdict = (joined ? joined + ' ' : '') + 'When more low-cost generation is on offer than the country needs, mostly hydro water that would otherwise be spilled, and wind and solar that cost nothing to run, the price falls to a few dollars or less.';
  } else {
    // not unusual enough to flag, but say which way it leans: below usual, about usual, or above (under the floor)
    const lean = !now.ty ? 'about usual' : now.hi < 0.67 * now.ty && now.ty - now.hi >= 10 ? 'below usual'
      : now.hi > 1.3 * now.ty && now.hi - now.ty >= 10 ? 'a little above usual' : 'about usual';
    headline = 'Why this price?';
    line = `${money(now.hi)}/MWh is ${lean} for a ${label}` + (lean === 'about usual' || !now.ty ? '.' : ` (usually ${money(now.ty)}).`);
    verdict = (joined || 'Nothing shown here is far from normal.') + ' The price is set by the most expensive offer needed to meet demand in each 5 minutes.';
  }

  // the possible price setter: the dearer island's (or Haywards'), an estimate from the latest offers
  const sIsl = variant === 'split' ? dear : 'NI';
  const s = E.setter?.[sIsl] || (variant !== 'split' ? E.setter?.SI : null);
  const meta = s ? plantMeta[s.plant] || {} : {};
  const setter = s ? { ...s, owner: meta.owner, scheme: meta.scheme } : null;

  // the last 24 hours: both islands, the usual band and the two thresholds, half-hour by half-hour
  const n24 = Math.min(J, Math.round((24 * 3600000) / step));
  const t24 = [], hay = [], ben = [];
  for (let j = J - n24; j <= J; j++) { t24.push(D.t0 + j * step); hay.push(HAY[j]); ben.push(BEN[j]); }
  const band = [];
  for (let k = 0; k < E.typ.med.length; k++) {
    const ts = E.typ.t0 + k * E.typ.step;
    if (ts + E.typ.step <= t24[0] || ts > t) continue;
    const md = E.typ.med[k];
    if (md == null) continue;
    band.push({
      t0: Math.max(ts, t24[0]), t1: Math.min(ts + E.typ.step, t), med: md, p25: E.typ.p25[k], p75: E.typ.p75[k],
      hl: Math.max(R.hlRatio * md, R.hlLevel * E.level),
      open: Math.min(Math.max(R.openRatio * md, R.openLevel * E.level, R.openFloor), R.openAny),
    });
  }
  const hold = band.length ? band[band.length - 1] : null;

  return {
    t, tier, variant, label, newLow, lowStart, nearZero, since: since(variant === 'split' ? ['split', 'open'] : ['high', 'open']),
    hay: now.h, ben: now.b, hi: now.hi, lo: now.lo, gap: now.gap, typical: now.ty, ratio, level: E.level,
    thresholds: hold ? { highlight: hold.hl, open: hold.open } : null,
    headline, line, verdict, rows, link, setter, offersDay: E.offers_day, setterIsl: sIsl,
    chart: { t: t24, hay, ben, band },
  };
}
