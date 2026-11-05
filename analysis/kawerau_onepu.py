"""Kawerau (Onepu), KAW0112 ONU0: what the EA's public meters say this connection is.

Prints, from the monthly Grid_import, Grid_export and Generation_MD files (EMI, CC BY 4.0):

  - each year's energy into and out of the grid at KAW0112, and out at its neighbour KAW0113
  - when power first went into the grid there in a sustained way
  - how often it flows both ways in the same half-hour
  - that Generation_MD equals Grid_import to the half-hour, in the months both have it

  python3 analysis/kawerau_onepu.py     (keeps only the KAW rows, in data/raw/kawerau)
"""
import collections
import csv
import io
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from urllib.error import HTTPError
from urllib.request import urlopen

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
from common import BLOB  # noqa: E402

RAW = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw', 'kawerau')
FILES = {'Grid_import': 'Metered_data', 'Grid_export': 'Metered_data', 'Generation_MD': 'Generation'}
FIRST, LAST = 200501, 202609
SAMPLES = (202001, 202106, 202504, 202609)   # months Generation_MD is compared in


def months():
    for y in range(FIRST // 100, LAST // 100 + 1):
        for m in range(1, 13):
            if FIRST <= y * 100 + m <= LAST:
                yield y * 100 + m


def fetch(job):
    """Keep one file's header and KAW rows on disk; path, or None if the EA doesn't have it."""
    name, tag = job
    path = os.path.join(RAW, f'{tag}_{name}.csv')
    if not os.path.exists(path):
        url = f'{BLOB}/Datasets/Wholesale/{FILES[name]}/{name}/{tag}_{name}.csv'
        try:
            text = urlopen(url, timeout=180).read().decode('utf-8', 'replace')
        except HTTPError:
            return None
        rows = [ln for i, ln in enumerate(text.splitlines()) if i == 0 or 'KAW' in ln]
        with open(path, 'w') as f:
            f.write('\n'.join(rows) + '\n')
    return path


def day_of(s):
    return datetime.strptime(s[:10], '%d/%m/%Y' if s[2] == '/' else '%Y-%m-%d').date()


def read(path, pocs):
    """{(POC, date): [MW by trading period]} from a metered CSV, summing rows that share a connection point."""
    out = {}
    with open(path) as f:
        r = csv.reader(f)
        head = [c.strip().lower() for c in next(r)]
        tps = [i for i, c in enumerate(head) if re.fullmatch(r'tp\d+', c)]
        poc_i = head.index('poc') if 'poc' in head else head.index('poc_code')
        day_i = head.index('trading_date')
        for x in r:
            if len(x) <= day_i or x[poc_i] not in pocs:
                continue
            mw = [float(x[i]) / 500 if i < len(x) and x[i] not in ('', 'NA') else None for i in tps]
            k = (x[poc_i], day_of(x[day_i]))
            old = out.get(k)
            out[k] = mw if old is None else [(a or 0) + (b or 0) for a, b in zip(old, mw)]
    return out


def main():
    os.makedirs(RAW, exist_ok=True)
    jobs = [(n, t) for t in months() for n in ('Grid_import', 'Grid_export')] + [('Generation_MD', t) for t in SAMPLES]
    with ThreadPoolExecutor(5) as ex:
        paths = dict(zip(jobs, ex.map(fetch, jobs)))
    imp, exp, gmd = {}, {}, {}
    for (name, _), p in paths.items():
        if p:
            {'Grid_import': imp, 'Grid_export': exp, 'Generation_MD': gmd}[name].update(read(p, {'KAW0112', 'KAW0113'}))

    gwh = collections.defaultdict(lambda: [0.0, 0.0, 0.0])
    for src, poc, col in ((imp, 'KAW0112', 0), (exp, 'KAW0112', 1), (exp, 'KAW0113', 2)):
        for (p, d), v in src.items():
            if p == poc:
                gwh[d.year][col] += sum(x for x in v if x is not None) / 2000
    print('GWh     into grid   out of grid   KAW0113 out')
    for y in sorted(gwh):
        print(f'{y}   {gwh[y][0]:9.0f} {gwh[y][1]:13.0f} {gwh[y][2]:13.0f}')

    by_month = collections.defaultdict(list)
    for (p, d), v in imp.items():
        if p == 'KAW0112':
            by_month[d.year * 100 + d.month] += [x for x in v if x is not None]
    print('\ninto the grid, monthly average MW, 2012-14:')
    print(' '.join(f'{m % 100:02d}/{m // 100 % 100}:{sum(v) / len(v):.1f}' for m, v in sorted(by_month.items()) if 2012 <= m // 100 <= 2014))

    both = total = 0
    for (p, d), v in imp.items():
        if p == 'KAW0112' and d >= date(2026, 1, 1) and (p, d) in exp:
            for a, b in zip(v, exp[(p, d)]):
                if a is not None and b is not None:
                    total += 1
                    both += a > 0.05 and b > 0.05
    print(f'\n2026: both ways at once in {both} of {total} half-hours ({100 * both / total:.0f}%)')

    n = differ = 0
    for k, v in gmd.items():
        for a, b in zip(v, imp.get(k, [])):
            if a is not None and b is not None:
                n += 1
                differ += abs(a - b) > 0.01
    print(f'Generation_MD against Grid_import, {len(SAMPLES)} months: {n} half-hours, {differ} differ')
    before = fetch(('Generation_MD', 201912))
    with open(before) as f:
        print('Generation_MD rows at KAW0112 in December 2019:', sum('KAW0112' in ln for ln in io.StringIO(f.read())))


if __name__ == '__main__':
    main()
