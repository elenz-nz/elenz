// A big-number dashboard layout (/dashboard): a background, one or two large values and up to four small ones.
// It lives in the page's address, so a link opens that exact layout (for a wall screen or a friend):
//   /dashboard?bg=aurora&big=gen:NZ,ren:NZ&small=wind:NZ:mw,price:NI,hvdc,co2:NZ
// and the last layout used is kept in this browser (localStorage elenz-dashboard, listed on /privacy). An address with
// a layout wins over the stored one. `kiosk=1` shows the screen alone, with no buttons (for a screen nobody touches).

export const STORE_KEY = 'elenz-dashboard';

// each background's ink, secondary ink, tile fill and tile edge, and the swatch shown in the picker
export const BACKGROUNDS = [
  { k: 'horizon', name: 'Horizon', ink: '#f4f7f6', sub: '#b3c2c0', tile: 'rgba(9,16,16,.62)', edge: 'rgba(255,255,255,.09)', sw: 'linear-gradient(180deg,#131c1c 55%,#1d3a3e 100%)' },
  { k: 'light', name: 'Horizon, light', ink: '#132020', sub: '#4b5d5b', tile: 'rgba(255,255,255,.82)', edge: 'rgba(19,32,32,.1)', sw: 'linear-gradient(180deg,#f2f5f5 55%,#cfe1e3 100%)' },
  { k: 'aurora', name: 'Aurora australis', ink: '#f4f7f6', sub: '#b9c6d4', tile: 'rgba(4,10,20,.58)', edge: 'rgba(255,255,255,.08)', sw: 'linear-gradient(180deg,#05101f,#1d6b5a 55%,#050c16)' },
  { k: 'alps', name: 'Southern Alps at dusk', ink: '#f7f5f2', sub: '#d6cbd3', tile: 'rgba(22,24,48,.6)', edge: 'rgba(255,255,255,.1)', sw: 'linear-gradient(180deg,#26355f,#8a6a8e 45%,#e59b7c 75%,#252c4e)' },
  { k: 'contours', name: 'Contours', ink: '#f0f7f5', sub: '#a9c4bf', tile: 'rgba(6,22,23,.66)', edge: 'rgba(111,208,191,.16)', sw: 'repeating-radial-gradient(circle at 30% 40%,#0c2628 0 9px,#1f4b49 10px 11px)' },
  { k: 'strait', name: 'Cook Strait', ink: '#f2f7fa', sub: '#a9c2d0', tile: 'rgba(3,18,32,.62)', edge: 'rgba(159,214,234,.12)', sw: 'linear-gradient(135deg,#062038,#0b3a56 60%,#5d5326)' },
  { k: 'pylons', name: 'Lines at sunset', ink: '#fbf6f0', sub: '#e1cfc6', tile: 'rgba(20,12,30,.58)', edge: 'rgba(255,255,255,.1)', sw: 'linear-gradient(180deg,#1a1238,#5a2a5c 45%,#d4664c 72%,#f7cf7a)' },
  { k: 'mix', name: 'Live mix', ink: '#f4f7f6', sub: '#c2cdcb', tile: 'rgba(5,10,12,.6)', edge: 'rgba(255,255,255,.1)', sw: 'linear-gradient(90deg,#4f8bd6 58%,#2fa883 58% 75%,#c4508f 75% 88%,#bb8c18 88%)' },
];

export const DEFAULT = Object.freeze({ bg: 'horizon', big: ['gen:NZ', 'ren:NZ'], small: ['wind:NZ:mw', 'price:NI', 'hvdc', 'co2:NZ'] });
export const MAX_BIG = 2, MAX_SMALL = 4;
// values offered first when a layout grows a tile
export const POOL = ['demand:NZ', 'hydro:NZ:mw', 'wind:NZ:mw', 'price:NI', 'hvdc', 'co2:NZ', 'tiwai', 'allsolar:NZ:mw', 'geo:NZ:mw', 'ren:NZ', 'gen:NZ'];

const SPEC = /^[a-z0-9_-]{1,60}(:(NZ|NI|SI)?(:(mw|pct|cf))?)?$/;
const specs = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter((x) => SPEC.test(x));

/** A layout made safe: a known background, one or two large values, none to four small ones. */
export function clean(l) {
  const bg = BACKGROUNDS.some((b) => b.k === l?.bg) ? l.bg : DEFAULT.bg;
  let big = (Array.isArray(l?.big) ? l.big : specs(l?.big)).filter((x) => SPEC.test(x)).slice(0, MAX_BIG);
  const small = (Array.isArray(l?.small) ? l.small : specs(l?.small)).filter((x) => SPEC.test(x)).slice(0, MAX_SMALL);
  if (!big.length) big = DEFAULT.big.slice(0, 1);
  return { bg, big, small };
}

/** The layout in an address's query, or null when it has none. */
export function fromQuery(search) {
  const q = new URLSearchParams(search || '');
  if (!q.has('big') && !q.has('small') && !q.has('bg')) return null;
  return clean({ bg: q.get('bg'), big: specs(q.get('big')), small: q.has('small') ? specs(q.get('small')) : DEFAULT.small });
}

/** The layout as a query ("?bg=...&big=...&small=..."); an empty small list is kept as small= so it stays empty. */
export function toQuery(l, extra = {}) {
  const q = new URLSearchParams();
  q.set('bg', l.bg);
  q.set('big', l.big.join(','));
  q.set('small', l.small.join(','));
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return '?' + q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
}

/** The stored layout, or null (storage blocked, nothing kept yet, or unreadable). */
export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? clean(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function save(l) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(clean(l))); } catch { /* storage blocked: the address still holds it */ }
}

/** The list grown or shrunk to n, new tiles taken from POOL (values not already shown first). */
export function resize(list, n, others = []) {
  const out = list.slice(0, n);
  for (const p of POOL) {
    if (out.length >= n) break;
    if (!out.includes(p) && !others.includes(p)) out.push(p);
  }
  while (out.length < n) out.push(POOL[out.length % POOL.length]);
  return out;
}
