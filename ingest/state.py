"""The compact 7-day state: one row per 5-minute interval, one column per measured quantity.

Raw dispatch rows (daily files or API) are reduced to what the tracker needs:
  U|POC UNIT   generation MW for every dispatched unit (mapped to plant and fuel later, so register fixes apply retroactively)
  C|POC UNIT   battery charging load MW (netted against the battery when building)
  L|NI, L|SI   island grid load MW, excluding battery charging
  T            Tiwai smelter load MW
  P|NI, P|SI   island reference price $/MWh
  P|OTA, ...   price at the other nodes in [price_nodes] (API only: the daily files have no bus rows)
plus 'src' ('api', 'file', 'empty' for intervals with no dispatch case, so they aren't fetched again, or 'partial'
for a case that arrived incomplete: see suspect()) and R, the number of rows the interval arrived with.
About 110-140 columns × ~2,300 rows (KEEP_DAYS): roughly 0.3 MB gzipped.
"""
import io

import numpy as np
import pandas as pd

from common import connection_islands, overrides

KEEP_DAYS = 8


def compact(d, src):
    """Raw rows in the daily-file layout -> state rows (index: interval start, UTC)."""
    O = overrides()
    charge = set(O['battery_charging'])
    refnode = O['reference_nodes']
    tiwai = O['loads']['tiwai']
    isl_tab = connection_islands()
    d = d.copy()
    d['t'] = pd.to_datetime(d.IntervalDateTime, utc=True)
    d = d.sort_values('RunDateTime').drop_duplicates(['t', 'PointOfConnectionCode', 'UnitCode'], keep='last')
    island_col = d['Island'] if 'Island' in d else pd.Series('', index=d.index)
    d['isl'] = [isl_tab.get(p) or {'North Island': 'NI', 'South Island': 'SI'}.get(i, '') for p, i in zip(d.PointOfConnectionCode, island_col)]
    d['key'] = d.PointOfConnectionCode + ' ' + d.UnitCode
    units = d[d.UnitCode != 'N/A']
    is_chg = units.UnitCode.isin(charge)
    parts = [
        units[~is_chg].pivot_table(index='t', columns='key', values='GenerationMegawatts', aggfunc='sum').add_prefix('U|'),
        units[is_chg].pivot_table(index='t', columns='key', values='LoadMegawatts', aggfunc='sum').add_prefix('C|'),
    ]
    load = d[~d.UnitCode.isin(charge) & d.isl.isin(['NI', 'SI'])].pivot_table(index='t', columns='isl', values='LoadMegawatts', aggfunc='sum')
    parts.append(load.add_prefix('L|'))
    parts.append(d[d.PointOfConnectionCode == tiwai].groupby('t').LoadMegawatts.sum().rename('T').to_frame())
    lf = pd.to_numeric(d['LocationFactor'], errors='coerce') if 'LocationFactor' in d else pd.Series(np.nan, index=d.index)
    for isl, node in refnode.items():
        direct = d[d.PointOfConnectionCode == node].groupby('t').DollarsPerMegawattHour.mean()
        ok = (d.isl == isl) & (d.get('IsDeadFlag', 'N') == 'N') & (lf > 0.5)
        derived = (d.DollarsPerMegawattHour[ok] / lf[ok]).groupby(d.t[ok]).median()
        parts.append(direct.combine_first(derived).rename(f'P|{isl}').to_frame())
    # more price nodes ([price_nodes]): bus rows, in the API but not the daily files (WKM2201 is in both)
    for k, node in O.get('price_nodes', {}).items():
        direct = d[d.PointOfConnectionCode == node].groupby('t').DollarsPerMegawattHour.mean()
        if len(direct):
            parts.append(direct.rename(f'P|{k}').to_frame())
    parts.append(d.groupby('t').size().rename('R').to_frame())
    s = pd.concat(parts, axis=1)
    unit_cols = [c for c in s.columns if c[:2] in ('U|', 'C|')]
    s[unit_cols] = s[unit_cols].fillna(0.0)  # a unit absent from a published interval was at zero
    return pd.concat([pd.Series(src, index=s.index, name='src'), s], axis=1).copy()


# A case can come back from the API incomplete: at 13:00 and 13:05 NZDT on 19 Oct 2026 (00:00 UTC, as the case
# numbering moved to a new day) whole islands' load and most generation were missing, so the charts dropped by 3 GW
# for ten minutes; the daily file's case for 13:00 was complete. Such intervals are marked 'partial', left out of the
# charts (interpolated like intervals with no case, and labelled so) and fetched again on later runs.
DROP = 0.75      # an island's load (less Tiwai) or the total generation below this share of its neighbours'
FEW_ROWS = 0.85  # or fewer than this share of the usual number of rows from the same source (daily files vary ±8%)
NEIGHBOURS = 3   # complete intervals each side the comparison uses


def _ref(v, good):
    """For each point, the median of the NEIGHBOURS good values before it and the NEIGHBOURS after it (the median
    of those two medians), never including the point itself."""
    x = v.to_numpy(float)
    g = [i for i in np.flatnonzero(good) if np.isfinite(x[i])]
    out = np.full(len(x), np.nan)
    gpos = np.array(g)
    for i in range(len(x)):
        k = np.searchsorted(gpos, i)
        before = [x[j] for j in gpos[max(0, k - NEIGHBOURS):k]]
        after = [x[j] for j in gpos[k:k + NEIGHBOURS + 1] if j != i][:NEIGHBOURS]
        sides = [np.median(p) for p in (before, after) if p]
        if sides:
            out[i] = np.median(sides)
    return out


def suspect(s, exclude=()):
    """Intervals among the real ones in state s ('api', 'file' or 'partial') that look incomplete, each judged against
    its neighbours other than those in exclude. A real event can't drop an island's load (Tiwai aside) or the country's
    generation by a quarter within five minutes, so a fall that sharp means rows are missing."""
    ok = s[s.src.isin(['api', 'file', 'partial'])]
    if len(ok) < 2 * NEIGHBOURS:
        return pd.DatetimeIndex([], tz='UTC')
    good = ~ok.index.isin(pd.DatetimeIndex(exclude))
    unit = [c for c in ok.columns if c.startswith('U|')]
    zero = pd.Series(0.0, index=ok.index)
    q = {'NI': ok.get('L|NI', zero), 'SI': ok.get('L|SI', zero) - ok.get('T', zero).fillna(0), 'gen': ok[unit].sum(axis=1)}
    bad = np.zeros(len(ok), bool)
    for v in q.values():
        ref = _ref(v, good)
        with np.errstate(invalid='ignore'):
            bad |= (v.to_numpy(float) < DROP * ref) & (ref > 100)
    if 'R' in ok:
        src = ok.src.replace('partial', 'api')   # the live job's partial cases came from the API
        for kind in ('api', 'file'):
            m = (src == kind).to_numpy() & ok.R.notna().to_numpy()
            if m.sum() >= 2 * NEIGHBOURS:
                usual = np.median(ok.R.to_numpy(float)[m & good])
                bad[m] |= ok.R.to_numpy(float)[m] < FEW_ROWS * usual
    return ok.index[bad]


def mark_partial(s, log=print):
    """Mark the intervals that look incomplete 'partial', and put back any marked earlier that now look complete
    (refetched, or judged again once a bad neighbour is left out). Run after every merge."""
    s = s.copy()
    first = suspect(s)
    bad = suspect(s, exclude=first)   # judged again without the first round's suspects dragging references down
    was = s.index[s.src == 'partial']
    s.loc[was.difference(bad), 'src'] = 'api'
    s.loc[bad, 'src'] = 'partial'
    new = bad.difference(was)
    if len(new):
        log(f'incomplete case at {", ".join(str(t) for t in new)}: left out until it can be fetched again')
    return s


def empty_rows(times):
    """Placeholder rows for intervals the API has no case for."""
    s = pd.DataFrame(index=pd.DatetimeIndex(times, tz='UTC', name='t'))
    s['src'] = 'empty'
    return s


def merge(old, new):
    """New rows replace old rows for the same interval; a real interval always beats an 'empty' marker (and a
    'partial' one is replaced by whatever comes next, then checked again by mark_partial)."""
    if old is None or old.empty:
        out = new
    else:
        new_real = new[new.src != 'empty']
        new_empty = new[(new.src == 'empty') & ~new.index.isin(old.index)]
        out = pd.concat([old[~old.index.isin(new_real.index)], new_real, new_empty])
    out = out.sort_index()
    out = out[out.index > out.index.max() - pd.Timedelta(days=KEEP_DAYS)]
    unit_cols = [c for c in out.columns if c[:2] in ('U|', 'C|')]
    real = out.src != 'empty'
    out.loc[real, unit_cols] = out.loc[real, unit_cols].fillna(0.0)  # units that started dispatching later
    return out


def dumps(s):
    buf = io.BytesIO()
    s.to_csv(buf, compression={'method': 'gzip', 'mtime': 0}, float_format='%.3f', index_label='t')
    return buf.getvalue()


def loads(b):
    s = pd.read_csv(io.BytesIO(b), compression='gzip', index_col='t')
    s.index = pd.to_datetime(s.index, utc=True)
    s['src'] = s['src'].fillna('api')
    return s
