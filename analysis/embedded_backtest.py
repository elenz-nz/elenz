"""Other embedded generation (ingest/embedded.py): monthly totals, the back-test of the live estimate, where the
reconciliation data becomes consistent, and the step in totals where the layer starts (6 Nov 2026).

For each month: the month's latest reconciliation file from the EA's store and the site's own half-hourly month
(https://elenz.co.nz/data/history/hh/YYYY-MM.json, i.e. what the history already counts), both cached; then the
residual by grid exit point. Results in analysis/README.md ("Other embedded generation"). In metered months the named plants' points
leave next to nothing (the history has the whole plant), so the layer is the residual at every point.

  python3 analysis/embedded_backtest.py summary YYYY-MM [YYYY-MM ...]   months' totals, largest points, unmatched meters
  python3 analysis/embedded_backtest.py backtest FIRST LAST [LAG]      each month predicted from the profile of the
                                                                       month LAG before (default 2)
  python3 analysis/embedded_backtest.py step [YEAR]                    a year against total generation (default 2009)
  python3 analysis/embedded_backtest.py compare FIRST LAST            four ways of estimating the live week
  python3 analysis/embedded_backtest.py match YYYY-MM [...]            candidate meter rows for unmatched points

Cache: data/raw/embedded (ELENZ_DATA). Development only; ~30 MB a month of reconciliation data.
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
import embedded as e  # noqa: E402
from common import BLOB, DATA  # noqa: E402

CACHE = os.path.join(DATA, 'raw', 'embedded')
SITE = 'https://elenz.co.nz/data/history/hh/'
KEYS = ['coal', 'gas', 'diesel', 'geo', 'bio', 'waste', 'hydro', 'wind', 'solar', 'batt']
os.makedirs(CACHE, exist_ok=True)


def get(url):
    for attempt in range(5):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'elenz-analysis'}), timeout=300) as r:
                return r.read()
        except HTTPError as err:
            if err.code == 404:
                return None
            if attempt == 4:
                raise
        except (URLError, TimeoutError, ConnectionError):
            if attempt == 4:
                raise
        time.sleep(2 ** attempt)


def latest_name(m):
    """The month's newest reconciliation file name, looked up once and kept in the cache."""
    path = os.path.join(CACHE, 'names.json')
    names = json.load(open(path)) if os.path.exists(path) else {}
    if m not in names:
        names[m] = e.latest_name(get, m)
        with open(path, 'w') as f:
            json.dump(names, f)
    return names[m]


def cached(name, fetch):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        data = fetch()
        if data is None:
            return None
        with open(path, 'wb') as f:
            f.write(data)
    with open(path, 'rb') as f:
        return f.read()


def month(m):
    """(residual by point, sorted series, the month's tracker layout, total generation MW series) for 'YYYY-MM',
    with the residual cached as CSV."""
    js = json.loads(cached(f'hh_{m}.json', lambda: get(SITE + m + '.json')))
    out = os.path.join(CACHE, f'o_{m}.csv.gz')
    if os.path.exists(out):
        o = pd.read_csv(out, index_col=0, parse_dates=True)
        s = pd.read_csv(os.path.join(CACHE, f's_{m}.csv'), index_col=[0, 1, 2])
    else:
        name = latest_name(m)
        raw = cached(os.path.basename(name), lambda: get(f'{BLOB}/{name}'))
        inj = e.read_recon(raw)
        o, s = e.residual(inj, js)
        o.to_csv(out)
        s.to_csv(os.path.join(CACHE, f's_{m}.csv'))
        unmatched = sorted(set(e.counted(js).columns) - set(inj.poc.unique()))
        if unmatched:
            c = e.counted(js)
            print(f'  {m}: counted points not in the reconciliation data:',
                  {p: round(c[p].sum() / 2000, 2) for p in unmatched if c[p].sum() > 1})
    gen = sum(np.asarray(js[isl][k], float) for isl in ('NI', 'SI') for k in KEYS if k in js[isl])
    gen = gen + sum(np.asarray(js[isl].get('roof', [0] * js['N']), float) for isl in ('NI', 'SI'))
    return o, s, js, pd.Series(gen, index=e.counted(js).index)


def match(m, least_gwh=0.5):
    """For a month's counted points the reconciliation data doesn't use (old embedded meter codes): the injection
    series that track them, half-hour by half-hour, as candidate role "meter" rows for facilities/embedded_points.csv."""
    _, _, js, _ = month(m)
    name = latest_name(m)
    inj = e.read_recon(cached(os.path.basename(name), lambda: get(f'{BLOB}/{name}')))
    c = e.counted(js)
    series = inj.pivot_table(index='t', columns=['poc', 'network', 'trader'], values='mw', aggfunc='sum').reindex(c.index)
    out = []
    for p in sorted(set(c.columns) - set(inj.poc.unique())):
        x = c[p]
        if x.sum() / 2000 < least_gwh:
            continue
        r = series.corrwith(x).dropna().sort_values(ascending=False).head(3)
        for k, v in r.items():
            ratio = series[k].sum() / x.sum()
            out.append((m, p, round(x.sum() / 2000, 2), k, round(v, 3), round(ratio, 2)))
    for row in out:
        print(row)
    return out


def months(a, b):
    return [str(p) for p in pd.period_range(a, b, freq='M')]


def prefetch(ms):
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(month, ms))


def summary(ms):
    prefetch(ms)
    for m in ms:
        o, s, js, gen = month(m)
        layer = o
        mw = layer.sum(axis=1)
        print(f'{m}: {mw.sum() / 2000:.1f} GWh, {mw.mean():.0f} MW, {100 * mw.sum() / gen.sum():.2f}% of generation '
              f'({gen.sum() / 2000:.0f} GWh); hour of day {mw.groupby(mw.index.tz_convert(e.NZ).hour).mean().round().astype(int).tolist()}')
        print('   largest:', (layer.sum() / 2000).sort_values(ascending=False).head(8).round(2).to_dict())


def plant_series(js, name):
    for p in js['plants']:
        if p['name'] == name:
            return pd.Series(np.asarray(p['s'], float), index=e.counted(js).index)
    return None


def backtest(a, b, lag=2):
    ms = months(a, b)
    prev = months(str(pd.Period(a) - lag), str(pd.Period(b) - lag))
    prefetch(sorted(set(ms + prev)))
    rows = []
    for m, p in zip(ms, prev):
        o, _, js, _ = month(m)
        po, _, pjs, _ = month(p)
        act = o.sum(axis=1)
        pred = e.carry(e.profile(po), o.index).sum(axis=1)
        r = {'month': m, 'actual_mw': act.mean(), 'pred_mw': pred.mean(),
             'month_err': pred.mean() / act.mean() - 1, 'hh_mae_mw': (pred - act).abs().mean()}
        for plant in ('Teviot', 'Ngāwhā'):
            a_, p_ = plant_series(js, plant), plant_series(pjs, plant)
            if a_ is not None and p_ is not None:
                pp = e.carry(e.profile(p_.to_frame('x')), a_.index)['x']
                r[plant + '_mw'] = a_.mean()
                r[plant + '_dmw'] = pp.mean() - a_.mean()
        rows.append(r)
    t = pd.DataFrame(rows).set_index('month')
    print(t.round(3).to_string())
    c = 'month_err'
    print(f'{c}: mean {t[c].mean():+.3f}, mean absolute {t[c].abs().mean():.3f}, 90th percentile absolute '
          f'{t[c].abs().quantile(0.9):.3f}')
    for plant in ('Teviot', 'Ngāwhā'):
        if plant + '_dmw' in t:
            d = t[plant + '_dmw']
            print(f'{plant} (average {t[plant + "_mw"].mean():.1f} MW): month mean error {d.mean():+.1f} MW, mean absolute '
                  f'{d.abs().mean():.1f} MW, 90th percentile {d.abs().quantile(0.9):.1f} MW')
    print(f'half-hourly mean absolute error {t.hh_mae_mw.mean():.1f} MW against an average {t.actual_mw.mean():.0f} MW')


def compare(a, b):
    """The live estimate four ways, each month a..b: the average day of the month two before (A), of the same month a
    year before (B), B scaled by the change from fourteen to two months before (C), and the mean of A and B (D)."""
    rows = []
    for m in months(a, b):
        P = pd.Period(m)
        o = month(m)[0]
        act = o.sum(axis=1)
        prof = {k: e.profile(month(str(P - k))[0]) for k in (2, 12, 14)}
        lay = {k: e.carry(v, o.index).sum(axis=1) for k, v in prof.items()}
        A, B = lay[2], lay[12]
        C = B * (month(str(P - 2))[0].sum(axis=1).mean() / month(str(P - 14))[0].sum(axis=1).mean())
        D = (A + B) / 2
        r = {'month': m, 'actual': act.mean()}
        for k, v in (('A', A), ('B', B), ('C', C), ('D', D)):
            r[k] = v.mean() / act.mean() - 1
            r[k + '_hh'] = (v - act).abs().mean()
        rows.append(r)
    t = pd.DataFrame(rows).set_index('month')
    for k in 'ABCD':
        print(f'{k}: month mean {t[k].mean():+.3f}, mean absolute {t[k].abs().mean():.3f}, 90th percentile '
              f'{t[k].abs().quantile(0.9):.3f}; half-hourly mean absolute {t[k + "_hh"].mean():.1f} MW')
    print(f'average {t.actual.mean():.0f} MW')
    return t


def step(year='2009'):
    ms = months(f'{year}-01', f'{year}-12')
    prefetch(ms)
    tot = lay = 0.0
    for m in ms:
        o, _, js, gen = month(m)
        layer = o.sum(axis=1)
        tot += gen.sum()
        lay += layer.sum()
        print(f'{m}: {layer.mean():.0f} MW, {100 * layer.sum() / gen.sum():.2f}% of generation')
    print(f'{year}: {100 * lay / tot:.2f}% of generation, {lay / 2000 / 8760 * 1000:.0f} MW on average')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'summary':
        summary(sys.argv[2:])
    elif cmd == 'backtest':
        backtest(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 2)
    elif cmd == 'match':
        for m in sys.argv[2:]:
            match(m)
    elif cmd == 'compare':
        compare(sys.argv[2], sys.argv[3])
    elif cmd == 'step':
        step(*sys.argv[2:3])
