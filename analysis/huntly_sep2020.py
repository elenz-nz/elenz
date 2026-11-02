"""Huntly in September 2020: fills the month Generation_MD lacks. Writes facilities/metered_fill_202009.csv.

Generation_MD has no rows at HLY2201 for September 2020 (dispatch files start on 10 September), so the history had no
Huntly for 1-9 September, which also left North Island demand about 600 MW low and the renewable share about 10 points
high. Two public files cover it:

  Grid_import HLY2201   half-hourly kWh entering the grid at Huntly, every day of the month: the station's total,
                        net of its own load. Against Generation_MD in August and October 2020: correlation 0.9997,
                        4-13 MW lower on average.
  Offers                each unit's final offer for each trading period, in tranches of MW at a price.

The total is split by clearing it through the units' offers, cheapest first, sharing a price pro rata. Tested on
stretches where the true split is known: see the figures this prints.

  python3 analysis/huntly_sep2020.py     (about 600 MB of offers, kept in data/raw/huntly_offers)
"""
import csv
import io
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
from common import BLOB, DATA, FACILITIES, NZ  # noqa: E402

POC = 'HLY2201'
GROUP = {'HLY1': 'huntly_1_4', 'HLY2': 'huntly_1_4', 'HLY4': 'huntly_1_4', 'HLY5': 'huntly_e3p', 'HLY6': 'huntly_p40'}
CODES = ['huntly_1_4', 'huntly_e3p', 'huntly_p40']
RAW = os.path.join(DATA, 'raw', 'huntly_offers')
OFFERS = 'Datasets/Wholesale/BidsAndOffers/Offers'
WHOLESALE = 'Datasets/Wholesale'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'elenz'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def offers_of(d):
    """One day's final energy offers at Huntly, kept in RAW: rows of (trading period, group, MW, price)."""
    path = os.path.join(RAW, f'{d:%Y%m%d}.csv')
    if not os.path.exists(path):
        os.makedirs(RAW, exist_ok=True)
        f = pd.read_csv(io.BytesIO(get(f'{BLOB}/{OFFERS}/{d.year}/{d:%Y%m%d}_Offers.csv')), low_memory=False)
        f = f[(f.PointOfConnection == POC) & (f.ProductType == 'Energy') & (f.IsLatestYesNo == 'Y') & (f.Megawatts > 0)]
        f[['TradingPeriod', 'Unit', 'Megawatts', 'DollarsPerMegawattHour']].to_csv(path, index=False)
    f = pd.read_csv(path)
    f['group'] = f.Unit.map(GROUP)
    f['day'] = d
    return f


def long_tps(f, id_cols):
    tps = [c for c in f.columns if c.lower().startswith('tp') and c[2:].isdigit()]
    m = f.melt(id_vars=id_cols, value_vars=tps, var_name='tp', value_name='kwh').dropna(subset=['kwh'])
    m['tp'] = m.tp.str[2:].astype(int)
    m['mw'] = pd.to_numeric(m.kwh) / 500
    return m


def monthly(name, m):
    folder = f'Metered_data/Grid_import/{m}_Grid_import.csv' if name == 'import' else f'Generation/Generation_MD/{m}_Generation_MD.csv'
    f = pd.read_csv(io.BytesIO(get(f'{BLOB}/{WHOLESALE}/{folder}')), low_memory=False)
    f.columns = [c.strip() for c in f.columns]
    f['day'] = pd.to_datetime(f.Trading_Date.astype(str).str[:10]).dt.date
    return f


def grid_total(m):
    """{(day, trading period): MW entering the grid at Huntly} for month m ('YYYYMM')."""
    f = monthly('import', m)
    x = long_tps(f[f.POC == POC], ['day'])
    return x.groupby(['day', 'tp']).mw.sum().to_dict()


def clear(total, rows):
    """MW for each group: the total through the offers, cheapest first; a price shared pro rata to its MW. Anything
    beyond the offers (none in September 2020) goes pro rata too."""
    out = dict.fromkeys(CODES, 0.0)
    left = total
    for _, g in sorted(rows.groupby('DollarsPerMegawattHour'), key=lambda x: x[0]):
        size = float(g.Megawatts.sum())
        take = min(left, size)
        for code, mw in g.groupby('group').Megawatts.sum().items():
            out[code] += take * mw / size
        left -= take
        if left <= 1e-9:
            break
    if left > 1e-9:
        have = sum(out.values()) or 1.0
        out = {k: v * (1 + left / have) for k, v in out.items()}
    return out, max(0.0, left)


def split(totals, days):
    with ThreadPoolExecutor(6) as ex:
        off = pd.concat(list(ex.map(offers_of, days)))
    by = dict(tuple(off.groupby(['day', 'TradingPeriod'])))
    rows, over = {}, 0.0
    for key, total in totals.items():
        if key[0] not in days:
            continue
        o = by.get(key)
        if total <= 0 or o is None:
            rows[key] = dict.fromkeys(CODES, 0.0)
            continue
        rows[key], left = clear(total, o)
        over += left
    return rows, over


def score(name, est, truth):
    e = pd.DataFrame(est).T
    t = pd.DataFrame(truth).T.reindex(e.index).fillna(0)
    print(name, f'({len(e)} half-hours)')
    for c in CODES:
        print(f'  {c:11s} estimated {e[c].mean():6.1f}  actual {t[c].mean():6.1f} MW  mean error {(e[c] - t[c]).abs().mean():5.1f}  correlation {e[c].corr(t[c]):.3f}')


def main():
    sep = [date(2020, 9, 1) + timedelta(days=i) for i in range(30)]
    # the test: the last week of August, where Generation_MD gives each unit
    aug = [date(2020, 8, 25) + timedelta(days=i) for i in range(7)]
    g = monthly('gen', '202008')
    g = long_tps(g[g.POC_Code == POC], ['day', 'Gen_Code'])
    truth = {}
    for r in g.itertuples():
        if r.day in aug:
            truth.setdefault((r.day, r.tp), dict.fromkeys(CODES, 0.0))[r.Gen_Code] += r.mw
    est, _ = split(grid_total('202008'), aug)
    score('Tested on 25-31 August 2020, against Generation_MD', {k: v for k, v in est.items() if k in truth}, truth)

    totals = grid_total('202009')
    rows, over = split(totals, sep)
    print(f'September 2020: {len(rows)} half-hours, {sum(totals.values()) / 2000:.1f} GWh, {over:.1f} MW-periods beyond the offers')
    path = os.path.join(FACILITIES, 'metered_fill_202009.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['t', *CODES])
        for (day, tp), v in sorted(rows.items()):
            # as metered.read_emi: trading period k starts (k-1) half-hours after local midnight, straight through a clock change
            t = pd.Timestamp(day, tz=NZ).tz_convert('UTC') + pd.Timedelta(minutes=30 * (tp - 1))
            if t.tz_convert(NZ).date() == day:
                w.writerow([t.strftime('%Y-%m-%dT%H:%MZ'), *(round(v[c], 2) for c in CODES)])
    print('wrote', path)


if __name__ == '__main__':
    main()
