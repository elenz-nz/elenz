// The record alert (.github/workflows/watchdog.yml, job `records`): which provisional records the Elenz team hasn't
// been told about yet. A provisional record is one the Records pages show as such: the live week beating a record
// (liveBeats, the same check /now and the record pages make) or the history's dispatch months beating one (records.json
// `prov`, half-hours, periods and runs). The workflow opens one GitHub issue (labelled `record`) per run that finds
// new ones, which GitHub emails to the repository's watchers; each record's key is kept in the issue as a comment line,
// so it is told once. Design decision, 17 Nov 2026.
import { DEFS, REGIONS, PERIOD_KEYS, get, fmt, when, liveBeats, meteredDue, clock, dayOf } from './records.js';

const NZ_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' });
const LAST_DAY = { day: 0, week: 6, month: 27, year: 364 };   // a day inside the period's last month
const regionName = (r) => REGIONS.find((x) => x.id === r)?.name ?? r;

/** A record's key: one alert per record, region and period, and for half-hours per NZ day, so a figure that keeps
 *  climbing through a sunny afternoon (or the history's version of the live week's record a few days later) is told
 *  once. */
export const keyOf = (id, region, period, t) => `${id}|${region}|${period}|${NZ_DATE.format(t)}`;

/** The record page's address on elenz.co.nz. */
export function pageOf(id, region, period) {
  const q = new URLSearchParams();
  if (region !== 'NZ') q.set('region', region);
  if (period !== 'tp') q.set('period', period);
  const s = q.toString();
  return `https://elenz.co.nz/records/${id}${s ? `?${s}` : ''}`;
}

/** Every provisional record now: [{ key, id, region, period, t, v, src, line, url }], NZ first, half-hours first. */
export function provisionalNow(R, D) {
  if (!R) return [];
  const live = D ? liveBeats(R, D) : {};
  const out = [];
  for (const d of DEFS) {
    if (d.old) continue;
    const periods = d.kind === 'hh' ? PERIOD_KEYS : ['tp'];
    for (const region of d.regions) {
      for (const period of periods) {
        const rec = get(R, d.id, region, period);
        if (!rec) continue;
        const lv = period === 'tp' ? live[d.id]?.[region] : null;
        const prov = lv ?? rec.prov;
        if (!prov) continue;
        const p = { t: prov.t, v: prov.v, ongoing: prov.ongoing };
        const label = period === 'tp' ? d.name : `${d.name}, ${period}`;
        // metered data settles it once the month holding the period's last half-hour is metered
        const last = d.kind === 'run' ? prov.t + prov.v * 36e5 - 1800e3 : prov.t + (LAST_DAY[period] ?? 0) * 864e5;
        const official = `${fmt(d, rec.v, period)}, ${when(d, rec, false, period)}`;
        out.push({
          key: keyOf(d.id, region, period, prov.t), id: d.id, region, period, t: prov.t, v: prov.v,
          src: lv ? 'live' : 'history',
          line: `${label}, ${regionName(region)}: ${fmt(d, prov.v, period)} (${when(d, p, true, period)}). Official record ${official}.` +
            `${d.est ? ' Modelled estimate.' : ''}${prov.ongoing ? ' Period still running.' : ''}` +
            ` From ${lv ? 'the live data' : 'dispatch data in the history'}; metered data settles it ${meteredDue(Math.min(last, Date.now()))}.`,
          url: pageOf(d.id, region, period),
        });
      }
    }
  }
  const rank = (x) => (x.region === 'NZ' ? 0 : 1) * 10 + PERIOD_KEYS.indexOf(x.period);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Keys already told, from the bodies of earlier alert issues (lines `<!-- record: key -->`). */
export function toldKeys(bodies) {
  const told = new Set();
  for (const b of bodies) for (const m of String(b ?? '').matchAll(/<!-- record: (.+?) -->/g)) told.add(m[1]);
  return told;
}

/** The issue for the records not yet told, or null: { title, body }. `first`: the alert's first run, which lists what
 *  is provisional already instead of announcing it as new. */
export function issueFor(list, told, now = Date.now(), first = false) {
  const fresh = list.filter((x) => !told.has(x.key));
  if (!fresh.length) return null;
  const top = fresh[0];
  const tag = (u) => `${u}${u.includes('?') ? '&' : '?'}utm_source=linkedin&utm_medium=social&utm_campaign=record`;
  const title = first
    ? `Record alert is on: ${fresh.length} provisional record${fresh.length > 1 ? 's' : ''} already showing`
    : `Provisional record: ${top.line.split(':')[0]}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''} (${clock(now)}, ${dayOf(now)})`;
  const body = [
    first ? 'The record alert has started. These provisional records were already on the site, so they are listed here once rather than announced:' : 'New provisional record' + (fresh.length > 1 ? 's' : '') + ' on Elenz:',
    '',
    ...fresh.map((x) => `- ${x.line} [Record page](${x.url})`),
    '',
    ...(first ? [] : ['Tagged link for a LinkedIn post:', '', '```', tag(top.url), '```', '',
      'Push kit: the record post drafts. Close this issue once it has been dealt with.', '']),
    ...fresh.map((x) => `<!-- record: ${x.key} -->`),
  ].join('\n');
  return { title, body };
}
