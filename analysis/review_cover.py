"""Data for a quarterly review's cover image (site/src/lib/articles/ReviewCover.svelte): each day's generation by
fuel over the quarter, one column per day.

  python3 analysis/review_cover.py 2026-06 2026-08 winter-2026

Reads the site's half-hourly history (downloaded into data/articles/hist/hh/ if missing) and writes
site/src/lib/articles/covers/<slug>.json: {"days": ["2026-06-01", ...], "fuels": {"geo": [GWh per day], ...}}.
"""
import json, os, sys
from urllib.request import urlopen

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HH = os.path.join(ROOT, 'data', 'articles', 'hist', 'hh')
SITE = 'https://elenz.elenz.workers.dev/data/history/hh'
FUELS = ['geo', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar']  # stack order, bottom to top


def month_range(a, b):
    out, y, m = [], int(a[:4]), int(a[5:])
    while f'{y}-{m:02d}' <= b:
        out.append(f'{y}-{m:02d}')
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def main(first, last, slug):
    frames = []
    for mo in month_range(first, last):
        p = os.path.join(HH, f'{mo}.json')
        if not os.path.exists(p):
            os.makedirs(HH, exist_ok=True)
            with urlopen(f'{SITE}/{mo}.json', timeout=120) as r, open(p, 'wb') as f:
                f.write(r.read())
        d = json.load(open(p))
        idx = pd.to_datetime(d['t0'] + np.arange(d['N']) * d['step'], unit='ms', utc=True).tz_convert('Pacific/Auckland')
        frames.append(pd.DataFrame({k: np.add(d['NI'][k], d['SI'][k]) for k in FUELS}, index=idx).clip(lower=0))
    df = pd.concat(frames)
    day = df.groupby(df.index.date).sum() / 2 / 1000   # MW per half-hour -> GWh per day
    out = {'days': [str(x) for x in day.index], 'fuels': {k: [round(float(v), 2) for v in day[k]] for k in FUELS}}
    path = os.path.join(ROOT, 'site', 'src', 'lib', 'articles', 'covers', f'{slug}.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    tot = day.sum(axis=1)
    print(f'{path}: {len(day)} days, {tot.min():.1f}-{tot.max():.1f} GWh/day')


if __name__ == '__main__':
    main(*sys.argv[1:4])
