"""The scheduled job: bring the 7-day state up to date from the EMI API and rebuild the tracker data.

Each run:
  1. loads the state (and irradiance) from the store (Cloudflare KV, or data/store locally)
  2. fetches the newest intervals, re-reads the last two in case they were re-run, then fills older gaps in the
     7-day window, newest first, up to a per-run budget (so the first runs fill the week over ~30-40 minutes)
  3. refreshes irradiance if it is more than an hour old
  4. builds tracker.json and saves it and the state back to the store

Run from the repo root:  python3 ingest/update.py   (needs EMI_KEY; uses Cloudflare KV when CF_ACCOUNT_ID and
CF_API_TOKEN are set, otherwise data/store and site/static/data/tracker.json).
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.request import urlopen

import pandas as pd

import emi_live
import state as st
from build_tracker import WINDOW, build, write_json
from common import NZ, OUT
from store import LocalStore, open_store
from sync import CITIES

BUDGET = 220          # API calls per run for filling older gaps (~4-5 minutes at the 50/min pace)
IRRADIANCE_MAX_AGE = 3600


def fetch_interval(t_utc):
    """State rows for one interval (UTC timestamp); an 'empty' marker if the API has no case for it."""
    local = t_utc.tz_convert(NZ).tz_localize(None).to_pydatetime()
    rows = emi_live.fetch(local)
    if not rows:
        return st.empty_rows([t_utc])
    return st.compact(emi_live.to_frame(rows), 'api')


def fetch_many(times):
    if not times:
        return []
    with ThreadPoolExecutor(4) as ex:
        return list(ex.map(fetch_interval, times))


def irradiance(store, log):
    raw = store.get('irradiance.json')
    meta = json.loads(store.get('irradiance.meta') or b'{}')
    if raw is None or time.time() - meta.get('fetched', 0) > IRRADIANCE_MAX_AGE:
        lat = ','.join(str(c[0]) for c in CITIES)
        lon = ','.join(str(c[1]) for c in CITIES)
        url = (f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&past_days=9&forecast_days=1'
               '&minutely_15=shortwave_radiation&timezone=Pacific%2FAuckland')
        try:
            fresh = urlopen(url, timeout=60).read()
            json.loads(fresh)[0]['minutely_15']  # check it parses before replacing the old copy
            raw = fresh
            store.put('irradiance.json', raw, 'application/json')
            store.put('irradiance.meta', json.dumps({'fetched': time.time()}).encode(), 'application/json')
            log('irradiance refreshed')
        except Exception as e:
            log('irradiance refresh failed, keeping the previous copy:', e)
    if raw is None:
        raise SystemExit('No irradiance data available yet.')
    return json.loads(raw)


def main(log=print):
    started = time.time()
    if os.environ.get('GITHUB_ACTIONS') and not all(os.environ.get(k) for k in ('EMI_KEY', 'CF_ACCOUNT_ID', 'CF_API_TOKEN')):
        # not set up yet: finish quietly rather than failing (and emailing) every 5 minutes
        print('::notice::Skipped: add the EMI_KEY, CF_ACCOUNT_ID and CF_API_TOKEN secrets to turn on data updates.')
        return
    store = open_store()
    raw = store.get('state.csv.gz')
    s = st.loads(raw) if raw else None
    log('state:', 'none yet' if s is None else f'{len(s)} intervals to {s.index.max()}')
    before = None if s is None else (len(s), s.index[s.src != 'empty'].max())

    latest = st.compact(emi_live.to_frame(emi_live.fetch()), 'api')
    t_latest = latest.index.max()
    s = st.merge(s, latest)

    # newest first: everything after the last stored real interval, plus the two before it (possible re-runs)
    have = set(s.index[s.src != 'empty']) | set(s.index[s.src == 'empty'])
    window = pd.date_range(t_latest - pd.Timedelta(minutes=5 * (WINDOW - 1)), t_latest, freq='5min')
    recent = [t for t in window if t > t_latest - pd.Timedelta(minutes=15) and t != t_latest]
    missing = [t for t in reversed(window) if t not in have and t not in recent]
    todo = recent + missing[:BUDGET]
    for part in fetch_many(todo):
        s = st.merge(s, part)
    log(f'latest {t_latest}, fetched {len(todo)} intervals, {max(0, len(missing) - BUDGET)} older gaps left for later runs')

    if before == (len(s), s.index[s.src != 'empty'].max()):
        # nothing new (e.g. two triggers fired close together): skip the writes to stay inside KV's free daily limit
        log(f'no new intervals since the last run (latest {t_latest}); nothing saved')
        return
    js = build(s, irradiance(store, log), log)
    body = json.dumps(js, separators=(',', ':'), allow_nan=False).encode()
    store.put('state.csv.gz', st.dumps(s))
    store.put('tracker.json', body, 'application/json')
    if isinstance(store, LocalStore):
        write_json(js, os.path.join(OUT, 'tracker.json'))
    log(f'saved tracker.json ({len(body) // 1024} KB) in {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
