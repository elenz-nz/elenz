"""Evidence for facilities/plant_capacity.csv (Oct 2026): each plant's yearly output against its capacity.

For every plant in facilities/metered_plants.csv, reads the metered history (Generation_MD from Aug 1997, and
Embedded_generation for the embedded meters listed there), and prints, by year, its peak half-hour (99.5th
percentile, so a stray reading doesn't count) and capacity factor against the capacity in plant_capacity.csv. It
lists the plant-years where the peak runs more than 8% above capacity, or the capacity factor is over 98%: a missing
upgrade, a wrong date, or a meter problem.

Per plant it takes the larger of the Generation_MD codes and the embedded meters at a connection point, which is
close to what ingest/metered.py does but not the same (it adds an embedded meter's residual over Generation_MD).
Known false alarms from that, and from the meters themselves:
  - Trustpower's embedded meters read double until Jul 2005 (Kaimai, Highbank, Paerau, Rotokawa, Tararua, Deep
    Stream: the build halves them, this script doesn't)
  - shared embedded meters (WRK0331 Rotokawa and Te Huka, TWH0331 Te Rapa and Te Uku, TWC2201 Tararua 3 and Te Rere
    Hau, KOE1101 Ngāwhā and two solar farms) count both plants here
  - West Wind's two connections each carry more than half the farm at times (142.6 MW in all)

  python3 analysis/capacity_check.py            downloads the monthly files to data/metered/ (~550 MB) on first run
  python3 analysis/capacity_check.py --years    also prints every plant's yearly peaks
"""
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from datetime import date

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ingest'))
from common import BLOB  # noqa: E402
from metered import read_emi, GMD, MD  # noqa: E402

DATA = os.path.join(HERE, '..', 'data', 'metered')
FAC = os.path.join(HERE, '..', 'facilities')


def months():
    y, m = 1997, 8
    today = date.today()
    while (y, m) < (today.year, today.month):
        yield f'{y}{m:02d}'
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def fetch(url, path):
    if os.path.exists(path):
        return path
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            body = r.read()
    except Exception:
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(body)
    return path


def download():
    jobs = []
    for t in months():
        jobs.append((f'{BLOB}/{GMD}/{t}_Generation_MD.csv', os.path.join(DATA, 'gmd', f'{t}.csv')))
        if t >= '199810':
            jobs.append((f'{BLOB}/{MD}/Embedded_generation/{t}_Embedded_generation.csv', os.path.join(DATA, 'emb', f'{t}.csv')))
    with ThreadPoolExecutor(12) as ex:
        list(ex.map(lambda j: fetch(*j), jobs))


MP = pd.read_csv(os.path.join(FAC, 'metered_plants.csv'), dtype=str).fillna('')
MP = MP[~MP.plant.isin(['-', ''])]


def month(tag):
    """{plant: half-hourly MW Series} for one month."""
    got = {}
    for kind in ('md', 'emb'):
        f = os.path.join(DATA, 'gmd' if kind == 'md' else 'emb', f'{tag}.csv')
        if not os.path.exists(f):
            continue
        m = read_emi(open(f, 'rb').read())
        if kind == 'md':
            m = m.rename(columns={'poc_code': 'poc'})
            m['code'] = m.gen_code.astype(str)
        else:
            m = m[m.flow_direction == 'I']
            m['code'] = '*'
        s = m.groupby(['poc', 'code', 't']).mw.sum()
        for r in MP.itertuples():
            if (r.code == '*') != (kind == 'emb'):
                continue
            fr, to = r._6.replace('-', '') or '000000', r.to.replace('-', '') or '999999'
            if not fr <= tag <= to:
                continue
            try:
                x = s.loc[(r.poc, r.code)] * (float(r.share) if r.share else 1)
            except KeyError:
                continue
            k = (r.plant, kind)
            got[k] = x if k not in got else got[k].add(x, fill_value=0)
    out = {}
    for p in {k[0] for k in got}:
        a, b = got.get((p, 'md')), got.get((p, 'emb'))
        out[p] = a if b is None else b if a is None else pd.concat([a, b], axis=1, sort=True).max(axis=1)
    return tag, out


def capacity_by_year():
    c = pd.read_csv(os.path.join(FAC, 'plant_capacity.csv'), dtype=str).fillna('')
    c = c[c.basis != 'pending']
    c['mw'] = c.mw.astype(float)

    def cap(p, y):
        days = pd.date_range(f'{y}-01-01', f'{y}-12-31', freq='D').strftime('%Y-%m-%d')
        v = np.zeros(len(days))
        for r in c[c.plant == p].itertuples():
            m = np.ones(len(days), bool)
            if r.start:
                m &= days >= r.start
            if r.end:
                m &= days <= r.end
            v[m] += r.mw
        return v.mean(), v.max()
    return cap


if __name__ == '__main__':
    download()
    tags = [t for t in months() if os.path.exists(os.path.join(DATA, 'gmd', f'{t}.csv'))]
    acc = {}
    with ProcessPoolExecutor(8) as ex:
        for tag, res in ex.map(month, tags):
            for p, v in res.items():
                acc.setdefault((p, int(tag[:4])), []).append(v.values)
    cap = capacity_by_year()
    rows = []
    for (p, y), vs in sorted(acc.items()):
        v = np.concatenate(vs)
        v = v[v > 0.05]
        if not len(v):
            continue
        mean, mx = cap(p, y)
        rows.append(dict(plant=p, year=y, gwh=v.sum() / 2000, p995=np.percentile(v, 99.5), cap=mx,
                         cf=v.sum() / 2 / (8760 * mean) if mean else np.nan))
    o = pd.DataFrame(rows)
    o['peak/cap'] = o.p995 / o.cap.replace(0, np.nan)
    pd.set_option('display.width', 220)
    pd.set_option('display.max_rows', 500)
    if '--years' in sys.argv:
        pv = o.pivot(index='plant', columns='year', values='p995').round(0)
        print(pv.fillna(-1).astype(int).replace(-1, '').to_string(), '\n')
    full = o[(o.year > 1997) & (o.year < date.today().year)]
    bad = full[(full.cf > 0.98) | (full['peak/cap'] > 1.08) | full.cap.eq(0)]
    print('Plant-years to look at (peak over capacity by more than 8%, capacity factor over 98%, or output with no capacity):')
    print(bad.groupby('plant').agg(years=('year', lambda y: f'{y.min()}-{y.max()} ({len(y)})'), cf_max=('cf', 'max'),
                                   peak_over_cap=('peak/cap', 'max'), cap=('cap', 'max')).round(2).to_string())
