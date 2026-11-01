"""Dispatch against metered, month by month, as the site builds them (1 Nov 2026): the evidence for correcting
provisional records.

Every stored month since Sep 2020 holds both the dispatch data and, once published, the metered data, final prices
and metered HVDC. For each month that has its metering, this builds the month twice with history.build_month():
  met    as the site publishes it (metered generation and demand, final prices, metered HVDC)
  disp   as the site had it before any of that arrived: dispatch data, dispatch prices, estimated HVDC
and saves, per month, each record series (records.series()) and each plant's half-hourly output from both.

Read-only: the store's put is disabled. In GitHub Actions it reads KV (CF_ACCOUNT_ID, CF_API_TOKEN); locally,
data/store. Run from the repo root:

  python3 analysis/dispatch_vs_metered.py <out dir> [first YYYY-MM] [last YYYY-MM]

Writes <out>/<YYYY-MM>.npz (series: rec|<record>|<region>|met / |disp; plants: plant|<name>|<fuel>|<isl>|met / |disp)
and <out>/months.json. analysis/dispatch_metered_fit.py reads them.
"""
import json
import os
import sys
from datetime import date

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
import history as hi   # noqa: E402
import metered as mt   # noqa: E402
import records as rc   # noqa: E402
from store import open_store   # noqa: E402


class ReadOnly:
    def __init__(self, s):
        self.s = s

    def get(self, key):
        return self.s.get(key)

    def put(self, *a, **k):
        raise RuntimeError('read-only')


def plants(js):
    n = js['N']
    return {f"plant|{p['name']}|{p['fuel']}|{p['isl']}": rc._arr(p['s'], n) for p in js.get('plants', [])}


def main():
    out = sys.argv[1]
    first = sys.argv[2] if len(sys.argv) > 2 else '2020-09'
    last = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    store = ReadOnly(open_store())
    cap = json.loads(store.get('hist/roof_cap.json'))
    months, done = hi.months_between(date.fromisoformat(first + '-01'), date.today()), []
    real_complete = mt.complete
    for m0 in months:
        month = f'{m0:%Y-%m}'
        if last and month > last:
            break
        s = hi.load_state(store, f'hist/state/{month}.csv.gz')
        if s is None or not real_complete(s, m0):
            print(month, 'no metered data: stop')
            break
        met, _ = hi.build_month(s, month, cap, lambda *a: None)
        # dispatch only: no metering, no final prices, no metered HVDC
        drop = [c for c in s.columns if c.startswith(('F|', 'H|')) or c == 'fi']
        mt.complete = lambda *a: False
        try:
            disp, _ = hi.build_month(s.drop(columns=drop), month, cap, lambda *a: None)
        finally:
            mt.complete = real_complete
        if met['t0'] != disp['t0'] or met['N'] != disp['N']:
            print(month, f"grids differ: met {met['t0']} x{met['N']}, disp {disp['t0']} x{disp['N']}")
        arr = {'t0': np.array(met['t0']), 'N': np.array(met['N']), 't0d': np.array(disp['t0']), 'Nd': np.array(disp['N'])}
        for tag, js in (('met', met), ('disp', disp)):
            S = rc.series(js)
            for k, by in S.items():
                if k == 'sums':
                    continue
                for r, v in by.items():
                    arr[f'rec|{k}|{r}|{tag}'] = np.asarray(v, dtype=np.float32)
            for k, v in plants(js).items():
                arr[f'{k}|{tag}'] = v.astype(np.float32)
        np.savez_compressed(os.path.join(out, f'{month}.npz'), **arr)
        done.append(month)
        print(month, 'ok', flush=True)
    with open(os.path.join(out, 'months.json'), 'w') as f:
        json.dump(done, f)


if __name__ == '__main__':
    main()
