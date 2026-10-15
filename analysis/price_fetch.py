"""Download the EA's monthly final energy prices (Oct 1996 on) and keep a compact copy for the pricing article.

For each month, EMI FinalEnergyPrices/ByMonth/YYYYMM_FinalEnergyPrices.csv (~10 MB, every node, every trading period)
is reduced to:
  data/articles/fep/ref/YYYYMM.csv    every trading period at a few reference nodes (KEEP)
  data/articles/fep/node/YYYYMM.csv   each node's mean price and trading-period count for the month
The full file is not kept. Months already reduced are skipped, except the newest two (they can still be revised).

  python3 analysis/price_fetch.py [workers]
"""
import io, os, re, sys
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'articles', 'fep')
BLOB = 'https://emidatasets.blob.core.windows.net/publicdata'
PREFIX = 'Datasets/Wholesale/DispatchAndPricing/FinalEnergyPrices/ByMonth/'
KEEP = ['HAY2201', 'BEN2201', 'OTA2201', 'ISL2201', 'INV2201', 'WKM2201', 'HLY2201', 'SFD2201', 'TIW2201', 'WRK2201']


def names():
    """Monthly file names. A month published as YYYYMM_FinalEnergyPrices_incomplete.csv (Dec 2025: days were under
    review when it was made) is rebuilt from that month's daily files instead, final ones only."""
    xml = urlopen(f'{BLOB}?restype=container&comp=list&prefix={PREFIX}', timeout=60).read().decode()
    return sorted(re.findall(r'<Name>([^<]*_FinalEnergyPrices(?:_incomplete)?\.csv)</Name>', xml))


def get(path):
    for attempt in range(4):
        try:
            return urlopen(f'{BLOB}/{path}', timeout=300).read()
        except Exception as e:  # noqa: BLE001
            err = e
    raise err


def daily(ym):
    """A month assembled from the daily final-price files (YYYYMMDD_FinalEnergyPrices.csv, not the interim _I)."""
    base = PREFIX.replace('ByMonth/', '')
    xml = urlopen(f'{BLOB}?restype=container&comp=list&prefix={base}{ym}', timeout=60).read().decode()
    days = sorted(re.findall(r'<Name>([^<]*/\d{8}_FinalEnergyPrices\.csv)</Name>', xml))
    return pd.concat([pd.read_csv(io.BytesIO(get(n)), dtype={'PointOfConnection': str}) for n in days]), len(days)


def one(name):
    ym = os.path.basename(name)[:6]
    ref, node = os.path.join(OUT, 'ref', ym + '.csv'), os.path.join(OUT, 'node', ym + '.csv')
    if os.path.exists(ref) and os.path.exists(node) and ym < RECENT:
        return ym, 'kept'
    try:
        if name.endswith('_incomplete.csv'):
            d, n = daily(ym)
            if n != pd.Period(f'{ym[:4]}-{ym[4:]}', 'M').days_in_month:
                return ym, f'incomplete: {n} final daily files'
        else:
            d = pd.read_csv(io.BytesIO(get(name)), dtype={'PointOfConnection': str})
    except Exception as e:  # noqa: BLE001
        return ym, f'failed: {e}'
    d.columns = ['date', 'tp', 'poc', 'price']
    d[d.poc.isin(KEEP)].to_csv(ref, index=False)
    d.groupby('poc').price.agg(['mean', 'count']).round(3).to_csv(node)
    return ym, f'{len(d):,} rows'


if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'ref'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'node'), exist_ok=True)
    ns = names()
    RECENT = sorted(os.path.basename(n)[:6] for n in ns)[-2]
    with ThreadPoolExecutor(int(sys.argv[1]) if len(sys.argv) > 1 else 8) as ex:
        for ym, msg in ex.map(one, ns):
            print(ym, msg, flush=True)
