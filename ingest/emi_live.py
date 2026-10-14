"""EMI real-time dispatch client.

Fetches 5-minute dispatch intervals from https://emi.azure-api.net/real-time-dispatch/ and stores them in
data/raw/api/ using the same column layout as the EMI daily NodalPricesAndVolumes files, so the tracker
build treats both alike. The API and the daily files come from the same real-time dispatch case and match exactly.

Limits: 60 calls/minute and 60 MB/hour. Responses are requested gzipped (~11 KB per interval).
History: the API keeps roughly the last month of intervals; older data comes from the daily files (sync.py).

Usage (from the repo root):
  python3 ingest/emi_live.py latest                                   # fetch the newest interval
  python3 ingest/emi_live.py range 2026-10-13T00:00 2026-10-14T12:00  # backfill a NZ-local range
  python3 ingest/emi_live.py watch                                    # run forever, one interval every 5 minutes
  python3 ingest/emi_live.py watch --build                            # ...and rebuild the tracker JSON after each
"""
import gzip
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import pandas as pd

from common import NZ, RAW_API, connection_islands, island_of, key

URL = 'https://emi.azure-api.net/real-time-dispatch/'
COLS = ['TradingDate', 'TradingPeriodNumber', 'IntervalDateTime', 'RunDateTime', 'PointOfConnectionCode', 'UnitCode',
        'PlantName', 'Island', 'LoadMegawatts', 'GenerationMegawatts', 'DollarsPerMegawattHour', 'IsDeadFlag']
ISLAND_NAME = {'NI': 'North Island', 'SI': 'South Island', '': ''}


class RateLimit:
    """Spaces calls to stay under the 60-per-minute policy."""
    def __init__(self, per_min=50):
        self.gap, self.next, self.lock = 60.0 / per_min, 0.0, threading.Lock()

    def wait(self):
        with self.lock:
            t = max(time.monotonic(), self.next)
            self.next = t + self.gap
        time.sleep(max(0.0, t - time.monotonic()))


LIMIT = RateLimit()


def fetch(interval_nz=None, tries=6):
    """Raw rows for one interval (naive NZ-local datetime), or the latest interval when None."""
    url = URL
    if interval_nz is not None:
        url += '?' + quote("$filter=FiveMinuteIntervalDatetime eq datetime'%s'" % interval_nz.strftime('%Y-%m-%dT%H:%M'), safe="=&$'")
    for attempt in range(tries):
        LIMIT.wait()
        try:
            req = Request(url, headers={'Ocp-Apim-Subscription-Key': key(), 'Accept-Encoding': 'gzip'})
            with urlopen(req, timeout=60) as r:
                body = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
                return json.loads(body)
        except HTTPError as e:
            if e.code in (401, 403):
                raise SystemExit(f'EMI API refused the key (HTTP {e.code}). Check the subscription is approved and the key is current.')
            wait = int(e.headers.get('Retry-After') or 0) or 2 ** attempt * 3
        except (URLError, TimeoutError, json.JSONDecodeError):
            wait = 2 ** attempt * 3
        time.sleep(wait)
    raise RuntimeError(f'EMI API failed after {tries} tries for {interval_nz}')


_isl = None
def to_frame(rows):
    """API rows -> DataFrame in the daily-file layout."""
    global _isl
    _isl = _isl or connection_islands()
    out = []
    for r in rows:
        poc, _, unit = r['PointOfConnectionCode'].partition(' ')
        local = datetime.fromisoformat(r['FiveMinuteIntervalDatetime']).replace(tzinfo=NZ)       # NZ local, no offset
        run = datetime.fromisoformat(r['RunDateTime']).replace(tzinfo=ZoneInfo('UTC')).astimezone(NZ)  # UTC, no marker
        out.append({
            'TradingDate': local.date().isoformat(), 'TradingPeriodNumber': (local.hour * 60 + local.minute) // 30 + 1,
            'IntervalDateTime': local.isoformat(timespec='milliseconds'), 'RunDateTime': run.isoformat(timespec='milliseconds'),
            'PointOfConnectionCode': poc, 'UnitCode': unit or 'N/A', 'PlantName': 'N/A',
            'Island': ISLAND_NAME[island_of(poc, _isl)],
            'LoadMegawatts': r['SPDLoadMegawatt'], 'GenerationMegawatts': r['SPDGenerationMegawatt'],
            'DollarsPerMegawattHour': r['DollarsPerMegawattHour'], 'IsDeadFlag': 'N'})
    return pd.DataFrame(out, columns=COLS)


def save(df):
    """Merge into one CSV per NZ trading date, keeping the latest run for each interval."""
    for day, part in df.groupby('TradingDate'):
        path = os.path.join(RAW_API, day.replace('-', '') + '_api.csv')
        if os.path.exists(path):
            part = pd.concat([pd.read_csv(path, keep_default_na=False), part])
        part = part.sort_values('RunDateTime').drop_duplicates(['IntervalDateTime', 'PointOfConnectionCode', 'UnitCode'], keep='last')
        part.sort_values(['IntervalDateTime', 'PointOfConnectionCode', 'UnitCode']).to_csv(path, index=False)


def backfill(start_nz, end_nz, workers=4):
    times, t = [], start_nz
    while t <= end_nz:
        times.append(t)
        t += timedelta(minutes=5)
    done = 0
    with ThreadPoolExecutor(workers) as ex:
        for i in range(0, len(times), 48):
            frames = [f for f in ex.map(lambda x: to_frame(fetch(x)), times[i:i + 48]) if len(f)]
            if frames:
                save(pd.concat(frames))
            done += min(48, len(times) - i)
            print(f'{done}/{len(times)} intervals', flush=True)


def build():
    here = os.path.dirname(os.path.abspath(__file__))
    subprocess.run([sys.executable, os.path.join(here, 'build_tracker.py'), '--quiet'], check=False)


def watch(rebuild=False):
    # Each case runs about a minute before its interval starts (the 11:35 case runs at 11:34:01), so poll
    # 40 s after minutes 4, 9, 14 ... and re-read the previous interval in case it was re-run.
    last = None
    while True:
        now = datetime.now(NZ)
        nxt = now.replace(second=40, microsecond=0) + timedelta(minutes=(4 - now.minute % 5) % 5)
        if nxt <= now:
            nxt += timedelta(minutes=5)
        time.sleep((nxt - now).total_seconds())
        try:
            df = to_frame(fetch())
            t = datetime.fromisoformat(df.IntervalDateTime.iloc[0])
            if last and t - last > timedelta(minutes=10):  # fill intervals missed while down
                backfill((last + timedelta(minutes=5)).replace(tzinfo=None), (t - timedelta(minutes=10)).replace(tzinfo=None))
            prev = to_frame(fetch((t - timedelta(minutes=5)).replace(tzinfo=None)))
            save(pd.concat([prev, df]))
            last = t
            print(datetime.now(NZ).strftime('%H:%M:%S'), 'saved interval', t.strftime('%H:%M'), flush=True)
            if rebuild:
                build()
        except Exception as e:  # keep running; the next poll catches up
            print(datetime.now(NZ).strftime('%H:%M:%S'), 'poll failed:', e, flush=True)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'latest'
    if cmd == 'latest':
        df = to_frame(fetch())
        save(df)
        print(df.IntervalDateTime.iloc[0], len(df), 'rows')
    elif cmd == 'range':
        backfill(datetime.fromisoformat(sys.argv[2]), datetime.fromisoformat(sys.argv[3]))
    elif cmd == 'watch':
        watch(rebuild='--build' in sys.argv)
    else:
        print(__doc__)
