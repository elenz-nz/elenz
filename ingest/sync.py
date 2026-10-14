"""Download reference and backfill files from the EMI public data container (no key needed).

Usage (from the repo root):
  python3 ingest/sync.py plants                       # latest DispatchedGenerationPlant.csv -> facilities/plant_register.csv
  python3 ingest/sync.py daily 2026-10-06 2026-10-12  # NodalPricesAndVolumes daily files for a date range
  python3 ingest/sync.py irradiance                   # satellite irradiance for the rooftop solar points, last 8 days
  python3 ingest/sync.py all                          # plants + irradiance + the last 7 days of daily files that exist
"""
import os
import re
import sys
from datetime import date, timedelta
from urllib.error import HTTPError
from urllib.request import urlopen, urlretrieve

from common import BLOB, FACILITIES, RAW_DAILY, REF

DISPATCH = 'Datasets/Wholesale/DispatchAndPricing/NodalPricesAndVolumes'
FLEET = 'Datasets/Wholesale/Generation/GenerationFleet/Existing'



def list_blobs(prefix):
    xml = urlopen(f'{BLOB}?restype=container&comp=list&prefix={prefix}', timeout=60).read().decode()
    return re.findall(r'<Name>([^<]+)</Name>', xml)


def plants():
    name = sorted(n for n in list_blobs(FLEET + '/') if n.endswith('_DispatchedGenerationPlant.csv'))[-1]
    urlretrieve(f'{BLOB}/{name}', os.path.join(FACILITIES, 'plant_register.csv'))
    print('plant register:', os.path.basename(name), '-> facilities/plant_register.csv (review the diff, then commit)')


def daily(start, end):
    d = start
    while d <= end:
        path = os.path.join(RAW_DAILY, d.strftime('%Y%m%d') + '.csv')
        if not os.path.exists(path):
            try:
                urlretrieve(f'{BLOB}/{DISPATCH}/{d.year}/{d:%Y%m%d}_DispatchNodalPricesAndVolumes.csv', path)
                print('downloaded', os.path.basename(path))
            except HTTPError as e:
                print(f'{d}: not published yet ({e.code})')
        d += timedelta(days=1)


def irradiance():
    import time
    import rooftop
    get = lambda url, timeout=120: urlopen(url, timeout=timeout).read()
    sat = rooftop.satellite(get, past_hours=8 * 24)
    with open(os.path.join(REF, 'irradiance.json'), 'wb') as f:
        f.write(rooftop.irr_dumps(sat, None, time.time()))
    print('irradiance updated, satellite to', sat.dropna(how='all').index.max())


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if cmd == 'plants':
        plants()
    elif cmd == 'daily':
        daily(date.fromisoformat(sys.argv[2]), date.fromisoformat(sys.argv[3]))
    elif cmd == 'irradiance':
        irradiance()
    elif cmd == 'all':
        plants()
        irradiance()
        daily(date.today() - timedelta(days=8), date.today() - timedelta(days=1))
    else:
        print(__doc__)
