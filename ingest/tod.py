"""Time of day by month: each month's average for every half-hour of the day, for the heat maps on the long ranges.

The tracker's heat maps show one row per day up to a year, built in the browser from the half-hourly months. All
history (~29 years) would mean loading every month (~45 MB), so for All they show one row per month from this file
instead: hist/tod.json, {"v": VERSION, "months": {"YYYY-MM": {"NI": {series: [48]}, "SI": {...}, "nodes": {...}}}}.
Series are each fuel's MW (the tracker.json keys) and the island price; nodes the other price nodes. Slot k is the
half-hour starting k × 30 minutes after NZ local midnight, so a clock-change day's extra or missing hour falls where
the clock put it.

Kept up to date by the history job (update(), after the months): a month rebuilt this run is redone from its new
JSON; a month the file lacks is read back from hist/hh (at most READS a run, newest first, so the first runs fill it
in over a few days). One KV write when anything changed.

Try it on downloaded months:  python3 ingest/tod.py <folder of YYYY-MM.json> [out.json]
"""
import json
import os
import sys

import numpy as np
import pandas as pd

from common import NZ

VERSION = 1
READS = 120          # months read back from hist/hh per run while the file is being filled in
KEY = 'hist/tod.json'
SKIP = {'roofU', 'metered', 'underlying', 'tiwai', 'hvdc'}   # not needed by the heat maps


def profile(js):
    """One month's half-hourly JSON (tracker layout) -> its average for each of the 48 half-hours of the day."""
    n = js['N']
    t = pd.to_datetime(js['t0'] + np.arange(n) * js['step'], unit='ms', utc=True).tz_convert(NZ)
    slot = (t.hour * 2 + t.minute // 30).to_numpy()

    def mean(arr, dp=0):
        a = pd.Series(np.asarray([np.nan if x is None else x for x in arr], dtype=float))
        m = a.groupby(slot).mean().reindex(range(48))
        return [None if not np.isfinite(x) else (round(float(x), dp) if dp else int(round(float(x)))) for x in m]

    out = {}
    for isl in ('NI', 'SI'):
        out[isl] = {k: mean(v, 2 if k == 'price' else 0) for k, v in js[isl].items()
                    if k not in SKIP and isinstance(v, list) and len(v) == n}
    nodes = {k: mean(v, 2) for k, v in (js.get('nodes') or {}).items() if isinstance(v, list) and len(v) == n}
    if nodes:
        out['nodes'] = nodes
    return out


def update(store, fresh, months, room=lambda n: True, log=print):
    """fresh: {month: hh JSON} rebuilt this run; months: every month stored. Saves hist/tod.json if it changed."""
    try:
        old = json.loads(store.get(KEY) or b'{}')
    except ValueError:
        old = {}
    have = old.get('months', {}) if old.get('v') == VERSION else {}
    out = {m: have[m] for m in months if m in have}
    for m, js in fresh.items():
        out[m] = profile(js)
    missing = [m for m in reversed(months) if m not in out][:READS]
    for m in missing:
        raw = store.get(f'hist/hh/{m}.json')
        if raw:
            out[m] = profile(json.loads(raw))
    if out == have:
        return
    if not room(1):
        log('time of day: no KV writes left today; saved next run')
        return
    body = json.dumps({'v': VERSION, 'months': dict(sorted(out.items()))}, separators=(',', ':'), allow_nan=False).encode()
    store.put(KEY, body, 'application/json')
    left = len([m for m in months if m not in out])
    log(f'time of day: {len(out)} months ({len(body) // 1024} KB)' + (f', {left} still to read' if left else ''))


if __name__ == '__main__':
    folder = sys.argv[1]
    res = {}
    for f in sorted(os.listdir(folder)):
        if f.endswith('.json') and len(f) == 12:
            with open(os.path.join(folder, f)) as fh:
                res[f[:7]] = profile(json.load(fh))
    body = json.dumps({'v': VERSION, 'months': res}, separators=(',', ':'))
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w') as fh:
            fh.write(body)
    print(f'{len(res)} months, {len(body) // 1024} KB')
