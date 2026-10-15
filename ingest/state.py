"""The compact 7-day state: one row per 5-minute interval, one column per measured quantity.

Raw dispatch rows (daily files or API) are reduced to what the tracker needs:
  U|POC UNIT   generation MW for every dispatched unit (mapped to plant and fuel later, so register fixes apply retroactively)
  C|POC UNIT   battery charging load MW (netted against the battery when building)
  L|NI, L|SI   island grid load MW, excluding battery charging
  T            Tiwai smelter load MW
  P|NI, P|SI   island reference price $/MWh
plus 'src' ('api', 'file', or 'empty' for intervals with no dispatch case, so they aren't fetched again).
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
    s = pd.concat(parts, axis=1)
    unit_cols = [c for c in s.columns if c[:2] in ('U|', 'C|')]
    s[unit_cols] = s[unit_cols].fillna(0.0)  # a unit absent from a published interval was at zero
    return pd.concat([pd.Series(src, index=s.index, name='src'), s], axis=1).copy()


def empty_rows(times):
    """Placeholder rows for intervals the API has no case for."""
    s = pd.DataFrame(index=pd.DatetimeIndex(times, tz='UTC', name='t'))
    s['src'] = 'empty'
    return s


def merge(old, new):
    """New rows replace old rows for the same interval; a real interval always beats an 'empty' marker."""
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
