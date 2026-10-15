"""The scheduled job: bring the 7-day state up to date from the EMI API and rebuild the tracker data.

Each run:
  1. loads the state (and irradiance) from the store (Cloudflare KV, or data/store locally)
  2. fetches the newest intervals, re-reads the last two in case they were re-run, then fills older gaps in the
     7-day window, newest first, up to a per-run budget (so the first runs fill the week over ~30-40 minutes)
  3. refreshes irradiance if it is more than half an hour old (Himawari satellite for the rooftop solar points,
     about an hour behind; the forecast service only if the satellite feed is down)
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
from urllib.request import Request, urlopen

import pandas as pd

import emi_live
import rooftop
import state as st
from build_tracker import WINDOW, build, write_json
from common import NZ, OUT
from store import LocalStore, open_store

BUDGET = 220          # API calls per run for filling older gaps (~4-5 minutes at the 50/min pace)
IRRADIANCE_MAX_AGE = 1800     # one store write per refresh: 48 a day


def fetch_interval(t_utc):
    """State rows for one interval (UTC timestamp); an 'empty' marker if the API has no case for it."""
    local = t_utc.tz_convert(NZ).tz_localize(None).to_pydatetime()
    rows = emi_live.fetch(local)
    f = emi_live.to_frame(rows, local) if rows else None
    if f is None or f.empty:
        return st.empty_rows([t_utc])
    return st.compact(f, 'api')


def fetch_many(times):
    if not times:
        return []
    with ThreadPoolExecutor(4) as ex:
        return list(ex.map(fetch_interval, times))


def fetch(url, timeout=60):
    return urlopen(Request(url, headers={'User-Agent': 'elenz-update'}), timeout=timeout).read()


def irradiance(store, log):
    """(satellite, forecast fallback) irradiance for the rooftop solar points, refreshed every half hour."""
    raw = store.get('irradiance.json')
    sat = fc = fetched = None
    if raw:
        try:
            sat, fc, fetched = rooftop.irr_loads(raw)
        except Exception:
            pass   # the older city-based format: replaced below
    if fetched is None or time.time() - fetched > IRRADIANCE_MAX_AGE:
        new_sat = new_fc = None
        try:
            new_sat = rooftop.satellite(fetch, past_hours=(WINDOW // 12) + 3)
        except Exception as e:
            log('satellite irradiance refresh failed:', e)
        latest = new_sat.dropna(how='all').index.max() if new_sat is not None and not new_sat.empty else None
        if latest is None or latest < pd.Timestamp.now(tz='UTC') - pd.Timedelta(hours=2):
            try:
                new_fc = rooftop.forecast(fetch)
                log('satellite irradiance missing or more than two hours old: using the forecast service as well')
            except Exception as e:
                log('forecast irradiance failed:', e)
        if new_sat is not None or new_fc is not None:
            sat = new_sat if new_sat is not None else sat
            fc = new_fc
            store.put('irradiance.json', rooftop.irr_dumps(sat, fc, time.time()), 'application/json')
            log('irradiance refreshed' + (f' (satellite to {latest})' if latest is not None else ''))
    if sat is None and fc is None:
        log('no irradiance data yet: rooftop solar shows as zero')
    return sat, fc


def capacity(store):
    """Rooftop solar capacity by point: the history job's latest table, or the committed snapshot."""
    raw = store.get('hist/roof_cap.json')
    return json.loads(raw) if raw else None


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

    latest = emi_live.to_frame(emi_live.fetch())
    if len(latest):
        latest = st.compact(latest, 'api')
        s = st.merge(s, latest)
    elif s is None:
        raise SystemExit('the API returned no usable rows and there is no stored state yet')
    else:
        log('the API returned no usable rows for its latest interval; asking for each newer interval by time instead')
    t_latest = s.index[s.src != 'empty'].max()
    # intervals after the newest stored one, up to now, asked for by time: covers a broken "latest" reply, and a run
    # that comes after more than one new interval. Ones not published yet are left alone (no 'empty' marker).
    now5 = pd.Timestamp.now(tz='UTC').floor('5min')
    newer = list(pd.date_range(t_latest + pd.Timedelta(minutes=5), now5, freq='5min'))[-6:]
    for part in fetch_many(newer):
        if (part.src != 'empty').any():
            s = st.merge(s, part)
    t_latest = s.index[s.src != 'empty'].max()

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
    js = build(s, irradiance(store, log), capacity(store), log)
    body = json.dumps(js, separators=(',', ':'), allow_nan=False).encode()
    store.put('state.csv.gz', st.dumps(s))
    store.put('tracker.json', body, 'application/json')
    if isinstance(store, LocalStore):
        write_json(js, os.path.join(OUT, 'tracker.json'))
    log(f'saved tracker.json ({len(body) // 1024} KB) in {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
