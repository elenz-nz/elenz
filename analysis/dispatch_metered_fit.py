"""Corrections for records set in dispatch data (1 Nov 2026): reads analysis/dispatch_vs_metered.py's months and
writes facilities/dispatch_adjust.json, which ingest/records.py and the site's live-week check use.

Over months that have both versions (Sep 2020 on), dispatch and metered averages agree closely, but:
  - a few plants are systematically off (PLANTS): fixed by a factor on their dispatch output, from the latest
    FACTOR_MONTHS months;
  - dispatch half-hours are instant targets averaged, so a month's highest half-hour runs a little high (and its
    lowest a little low): each record's `shift` is the median of (dispatch - metered) at the month's extreme, after the
    plant factors, and its margin `m` the 90th percentile of how far a month strays from that;
  - the same for whole days, weeks and months (each period's average), for the period records.
A provisional record must beat the official one after the shift; within `m` either side it is "close".

Back-test (printed): month by month, would the dispatch version have claimed a record the metered data didn't
confirm, or missed one it did? Raw, and corrected with every month's factors fitted without that month.

  python3 analysis/dispatch_metered_fit.py <dir from dispatch_vs_metered.py> <records.json> [out json]

records.json is the published file (https://elenz.co.nz/data/history/records.json): the official progressions.
"""
import collections
import json
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), '..')
NZ = 'Pacific/Auckland'
# plants whose dispatch figure is systematically off their meter, and why (names as in tracker.json)
PLANTS = {
    'Ngāwhā': 'only Ngāwhā B is dispatched; the meter has the whole station',
    'Glenbrook Steel': 'dispatch sees part of the plant',
    'Kawerau (Onepu)': 'the meter is the site’s grid connection, not a generator’s',
    'Te Rapa': 'the meter is net of the dairy factory’s own load (closed 2023)',
}
FACTOR_MONTHS = 24
RECS = {   # record: (kind, series) as records.py; roof is modelled the same way in both versions, so left alone
    'demand_max': ('max', 'dem'), 'demand_min': ('min', 'dem'), 'ren_max': ('max', 'ren'), 'ren_min': ('min', 'ren'),
    'fossil_min': ('min', 'fossil'), 'fossil_max': ('max', 'fossil'), 'hydro_max': ('max', 'hydro'),
    'hydro_min': ('min', 'hydro'), 'wind_max': ('max', 'wind'), 'solar_max': ('max', 'solar'),
}
REGIONS = {'demand_max': 'NZ NI SI', 'fossil_max': 'NZ NI'}
FOSSIL = {'coal', 'gas', 'diesel', 'waste'}
REN = {'geo', 'bio', 'hydro', 'wind', 'solar'}
PERIODS = ('day', 'week', 'month')
DP = {'ren': 1}


def load(d, m):
    z = np.load(os.path.join(d, f'{m}.npz'))
    t0, n0, t0d, n0d = (int(z[k]) for k in ('t0', 'N', 't0d', 'Nd'))
    a, b = max(t0, t0d), min(t0 + n0 * 1800000, t0d + n0d * 1800000)
    i0, j0, n = (a - t0) // 1800000, (a - t0d) // 1800000, (b - a) // 1800000
    met = lambda k: z[k + '|met'][i0:i0 + n].astype(float)    # noqa: E731
    dis = lambda k: z[k + '|disp'][j0:j0 + n].astype(float)   # noqa: E731
    rec = {k[4:-4]: (met(k[:-4]), dis(k[:-4])) for k in z.files if k.startswith('rec|') and k.endswith('|met')}
    plants = {}
    for k in z.files:
        if k.startswith('plant|') and k.endswith('|disp'):
            _, name, fuel, isl = k[:-5].split('|')
            if name in PLANTS:
                m_ = met(k[:-5]) if k[:-5] + '|met' in z.files else np.zeros(n)
                plants[name] = (fuel, isl, m_, dis(k[:-5]))
    t = a + np.arange(n) * 1800000
    return t, rec, plants


def factors(data, months):
    out = {}
    for name in PLANTS:
        a = b = 0.0
        for m in months[-FACTOR_MONTHS:]:
            p = data[m][2].get(name)
            if p:
                a += np.nansum(np.clip(p[2], 0, None))
                b += np.nansum(np.clip(p[3], 0, None))
        if a > 0 and b > 0:
            out[name] = round(a / b, 3)
    return out


def series(rec, plants, k, r, fac, which):
    """The month's series for record k, region r: metered (which=0), dispatch (1) or dispatch with plant factors (2)."""
    if which < 2:
        return rec[f'{k}|{r}'][which]
    v = rec[f'{k}|{r}'][1].copy()
    d = collections.defaultdict(float)
    for name, (fuel, isl, _, b) in plants.items():
        if (r == 'NZ' or isl == r) and name in fac:
            d[fuel] = d[fuel] + (fac[name] - 1) * np.nan_to_num(np.clip(b, 0, None))
    s = RECS[k][1]
    if s == 'ren':
        g, re_ = rec[f'gen|{r}'][1], rec[f'renE|{r}'][1]
        dg, dr = sum(d.values(), 0.0), sum((x for f, x in d.items() if f in REN), 0.0)
        return np.where(g + dg > 0, 100 * (re_ + dr) / np.where(g + dg > 0, g + dg, 1), np.nan)
    if s == 'fossil':
        return v + sum((x for f, x in d.items() if f in FOSSIL), 0.0)
    if s in ('hydro', 'wind', 'solar'):
        return v + d.get(s, 0.0)
    return v


def period_values(t, rec, plants, k, r, fac, which, period):
    """Whole periods' averages inside the month: [(start, value)]."""
    tt = pd.to_datetime(t, unit='ms', utc=True).tz_convert(NZ)
    key = {'day': tt.normalize(), 'week': (tt.normalize() - pd.to_timedelta(tt.weekday, unit='D')),
           'month': tt.normalize().map(lambda x: x.replace(day=1))}[period]
    if RECS[k][1] == 'ren':
        if which == 2:
            sh = series(rec, plants, k, r, fac, 2)
            g = rec[f'gen|{r}'][1]
            # renewable and total energy with the plant factors: rebuild from the corrected share and corrected total
            d = sum(((fac[n] - 1) * np.nan_to_num(np.clip(p[3], 0, None)) for n, p in plants.items()
                     if (r == 'NZ' or p[1] == r) and n in fac), np.zeros(len(t)))
            gen = g + d
            ren = sh * gen / 100
        else:
            gen, ren = rec[f'gen|{r}'][which], rec[f'renE|{r}'][which]
        df = pd.DataFrame({'k': key, 'g': gen, 'r': ren})
        out = []
        for kk, grp in df.groupby('k'):
            full = {'day': 48, 'week': 336, 'month': None}[period]
            if (full and grp.g.notna().sum() < 0.9 * full) or (period == 'month' and len(grp) < 0.9 * len(df)):
                continue
            out.append((kk, 100 * grp.r.sum() / grp.g.sum()))
        return out
    v = series(rec, plants, k, r, fac, which)
    df = pd.DataFrame({'k': key, 'v': v})
    out = []
    for kk, grp in df.groupby('k'):
        full = {'day': 48, 'week': 336, 'month': None}[period]
        if (full and grp.v.notna().sum() < 0.9 * full) or (period == 'month' and len(grp) < 0.9 * len(df)):
            continue
        out.append((kk, grp.v.mean()))
    return out


def main():
    d, recfile = sys.argv[1:3]
    dest = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, 'facilities', 'dispatch_adjust.json')
    months = json.load(open(os.path.join(d, 'months.json')))
    data = {m: load(d, m) for m in months}
    R = json.load(open(recfile))['records']
    fac = factors(data, months)
    print('plant factors (metered / dispatch, latest', FACTOR_MONTHS, 'months):', fac)

    # half-hour extremes per month: errors and the back-test rows
    rows = []
    for m in months:
        t, rec, plants = data[m]
        ms = int(pd.Timestamp(m + '-01', tz=NZ).timestamp() * 1000)
        for k, (kind, _) in RECS.items():
            for r in REGIONS.get(k, 'NZ NI SI').split():
                if f'{k}|{r}' not in rec or k.startswith('ren') and r == 'SI':
                    continue
                f = np.nanmax if kind == 'max' else np.nanmin
                sg = 1 if kind == 'max' else -1
                vals = [f(series(rec, plants, k, r, fac, w)) for w in (0, 1, 2)]
                steps = [s for s in R.get(k, {}).get(r, {}).get('steps', []) if s[0] < ms]
                before = steps[-1][1] if steps else None
                rows.append(dict(m=m, k=k, r=r, sg=sg, met=vals[0], raw=vals[1], cor=vals[2], before=before))
    hh = pd.DataFrame(rows)
    hh['err_raw'] = hh.sg * (hh.raw - hh.met)
    hh['err_cor'] = hh.sg * (hh.cor - hh.met)

    def fit(err):
        e = err.dropna()
        b = float(e.median())
        return b, float((e - b).abs().quantile(0.9))

    out = {'v': 1, 'months': [months[0], months[-1]], 'plants': fac, 'hh': {}, 'period': {}}
    for (k, r), g in hh.groupby(['k', 'r']):
        b, m_ = fit(g.err_cor)
        dp = 1 if k.startswith('ren') else 0
        out['hh'].setdefault(k, {})[r] = {'shift': round(g.sg.iloc[0] * b, dp + 1), 'm': round(m_, dp + 1)}

    # back-test, leave one month out
    tally = collections.Counter()
    for (k, r), g in hh.groupby(['k', 'r']):
        g = g.dropna(subset=['before'])
        for i, row in g.iterrows():
            o = g.drop(i)
            b, m_ = fit(o.err_cor)
            true = row.sg * (row.met - row.before) > 0
            raw = row.sg * (row.raw - row.before) > 0
            gap = row.sg * (row.cor - row.before) - b
            cor, close = gap > m_, abs(gap) <= m_
            tally['true'] += true
            tally['raw_wrong'] += raw and not true
            tally['raw_missed'] += true and not raw
            tally['cor_wrong'] += cor and not true
            tally['cor_missed'] += true and not cor and not close
            tally['close'] += close
            tally['close_confirmed'] += close and true
    print('half-hour back-test, 73 months x every record and region:', dict(tally))

    for p in PERIODS:
        prow = []
        for m in months:
            t, rec, plants = data[m]
            for k, (kind, _) in RECS.items():
                for r in REGIONS.get(k, 'NZ NI SI').split():
                    if f'{k}|{r}' not in rec or k.startswith('ren') and r == 'SI':
                        continue
                    a = dict(period_values(t, rec, plants, k, r, fac, 0, p))
                    c = dict(period_values(t, rec, plants, k, r, fac, 2, p))
                    for kk in a.keys() & c.keys():
                        prow.append(dict(k=k, r=r, err=c[kk] - a[kk]))
        pf = pd.DataFrame(prow)
        for (k, r), g in pf.groupby(['k', 'r']):
            b, m_ = fit(g.err)
            dp = 1 if k.startswith('ren') else 0
            out['period'].setdefault(p, {}).setdefault(k, {})[r] = {'shift': round(b, dp + 1), 'm': round(m_, dp + 1)}
    out['period']['year'] = out['period']['month']
    with open(dest, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('wrote', dest)


if __name__ == '__main__':
    main()
