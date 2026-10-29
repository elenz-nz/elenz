// The line under a chart's title that says what it covers: range, dates, region and resolution, so a chart far
// from the page's controls (or seen as a screenshot) still says what it shows. Drawn by Context.svelte.

import { nzOffset } from '#lib/tracker/series.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parts = (t) => { const d = new Date(t + nzOffset(t)); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const clock = (p) => `${p.h % 12 || 12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'am' : 'pm'}`;

export const REGION_NAME = { NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' };

/** 'Last 30 days', '30 days to 14 Aug 2024', 'All history'. label: the range's name ('24 hours', '1 year' ...). */
export function rangeName(label, end, days) {
  if (days == null) return 'All history';
  if (end == null) return `Last ${label}`;
  const p = parts(end - 1);
  return `${label} to ${p.d} ${MON[p.mo]} ${p.y}`;
}

/** The dates a window covers, [from, to): '18 Sep – 17 Oct 2026', with clock times for windows of a few days. */
export function span(from, to) {
  const a = parts(from), b = parts(to - 1);
  if (to - from <= 4 * 864e5) {
    // whole days (a past window ends at midnight): just the days; otherwise the clock at both ends
    const bEnd = parts(to - 1), e = parts(to), whole = e.h === 0 && e.mi === 0 && a.h === 0 && a.mi === 0;
    const yr = bEnd.y !== a.y ? ' ' + bEnd.y : '';
    if (whole && a.d === bEnd.d && a.mo === bEnd.mo) return `${WD[a.wd]} ${a.d} ${MON[a.mo]} ${a.y}`;
    if (whole) return `${WD[a.wd]} ${a.d}${a.mo === bEnd.mo ? '' : ' ' + MON[a.mo]} – ${WD[bEnd.wd]} ${bEnd.d} ${MON[bEnd.mo]} ${bEnd.y}`;
    return `${WD[a.wd]} ${a.d} ${MON[a.mo]}, ${clock(a)} – ${WD[e.wd]} ${e.d} ${MON[e.mo]}${yr}, ${clock(e)}`;
  }
  const left = a.y === b.y ? `${a.d} ${MON[a.mo]}` : `${a.d} ${MON[a.mo]} ${a.y}`;
  return `${left} – ${b.d} ${MON[b.mo]} ${b.y}`;
}

/** What one point stands for, for the context line. */
export const RES = { '5m': '5-minute', '30m': 'half-hourly', '1d': 'daily', '1w': 'weekly', '1mo': 'monthly', '1yr': 'yearly' };

/** Why a 30-day heat map's chip has a padlock: it doesn't follow the range buttons. */
export const LOCKED = 'Always the 30 days to the end of the range, whatever range is picked';
