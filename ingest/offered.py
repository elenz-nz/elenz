"""Offered capacity: what generators offered for each half-hour, from the EA's final energy offers (EMI
BidsAndOffers/Offers, one file a day from 1 Jan 2013, published the day after). The Generation tab's dispatchable
headroom chart compares it with output; plant pages can later show capacity not offered.

A unit's offer for a trading period is a set of tranches (MW at a price); the final one (IsLatestYesNo = Y) is what
the dispatch used. Offered MW is the sum of its tranches, "cheap" MW the tranches priced under CHEAP $/MWh. Plant that
is off and slow to start (Huntly's Rankines most days), out for maintenance, or short of fuel isn't offered, so offered
MW is a closer guide to what could have run than installed capacity. It doesn't say why MW wasn't offered.

KV keys (the site reads hist/off/*.json through the Worker):
  hist/off/YYYY-MM.json      the month on the half-hourly grid hist/hh uses (t0 = the month's first local midnight,
                             step 30 minutes, N): each island's offered MW by dispatchable fuel, NI.hydro.o (all
                             tranches) and NI.hydro.c (under CHEAP), null where the day's file isn't in yet; days: the
                             trading days included; sum: each day's lowest headroom and mean offered MW (summarise)
  hist/offp/YYYY-MM.json.gz  the same for every plant (all fuels), gzipped: {plants: {name: {fuel, isl, o, c}}}
  hist/off/days.json         every day from 2013: the month summaries joined (the 1-year and All views)
  hist/off/progress.json     the job's own record: days stored by month, KV writes today

Headroom (summarise, and the site's #lib/generation/data.js the same way): for each island and fuel, offered MW less
output, never below zero, then added up. Output comes from hist/hh (metered or dispatch, as the tracker shows it).

Run: python3 ingest/offered.py [--budget minutes] [--from YYYY-MM] [--resummarise]
Newest months first, so recent ranges fill in first; a backfill of everything since 2013 (~230 GB of files, most of
it 2025-26 since real-time pricing keeps every revision) takes a few days of runs and ~350 KV writes.
"""
import gzip
import io
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from urllib.request import urlopen

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BLOB, NZ, island_of  # noqa: E402
from store import open_store  # noqa: E402

OFFERS = 'Datasets/Wholesale/BidsAndOffers/Offers'
FIRST = date(2013, 1, 1)          # first daily offers file
CHEAP = 1000                      # $/MWh: tranches priced under this count as offered at a reasonable price
DISPATCH = ('hydro', 'gas', 'coal', 'diesel', 'batt')   # as DISPATCHABLE in site/src/lib/tracker/series.js
WRITE_BUDGET = 100                # KV writes a day (UTC) for this job: live ~600 and history 280 of the 1,000
RECENT_DAYS = 100                 # months this recent are summarised again each run (metered output arrives late)
HH = 1800_000
COLS = ['TradingPeriod', 'PointOfConnection', 'Unit', 'ProductType', 'ProductClass', 'IsLatestYesNo', 'Megawatts',
        'DollarsPerMegawattHour']


def units():
    """(POC, unit) -> (plant shown, fuel, island), from the register (dated rows, so retired units stay mapped) and
    overrides.toml, as the tracker groups and names them."""
    from build_tracker import plant_groups, register
    from metered import islands
    fuel, names, _ = register()
    groups, isl = plant_groups(), islands()
    return {k: (groups.get(n, n), fuel.get(k), island_of(k[0], isl)) for k, n in names.items()}


def published(years):
    """Trading dates with an offers file, for the given years."""
    out = set()
    for y in years:
        marker = ''
        while True:
            xml = urlopen(f'{BLOB}?restype=container&comp=list&prefix={OFFERS}/{y}/' + (f'&marker={marker}' if marker else ''),
                          timeout=60).read().decode()
            out |= {date(int(a), int(b), int(c)) for a, b, c in re.findall(r'/(\d{4})(\d{2})(\d{2})_Offers\.csv</Name>', xml)}
            m = re.search(r'<NextMarker>(.+?)</NextMarker>', xml)
            if not m:
                break
            marker = m.group(1)
    return out


def reduce_day(f, table, unknown=None):
    """A daily offers CSV (file-like) -> {plant: (offered MW, cheap MW) arrays by trading period (index 0 = TP1, 50
    long)}. Units the register doesn't know are skipped (and counted in `unknown`)."""
    parts = []
    for ch in pd.read_csv(f, usecols=COLS, chunksize=1_000_000, dtype={'PointOfConnection': str, 'Unit': str}):
        ch = ch[(ch.ProductType == 'Energy') & (ch.ProductClass == 'Injection') & (ch.IsLatestYesNo == 'Y')]
        if len(ch):
            cheap = ch.Megawatts.where(ch.DollarsPerMegawattHour < CHEAP, 0)
            parts.append(ch.assign(c=cheap).groupby(['PointOfConnection', 'Unit', 'TradingPeriod'])[['Megawatts', 'c']].sum())
    out = {}
    if not parts:
        return out
    d = pd.concat(parts).groupby(level=[0, 1, 2]).sum()
    for (poc, unit), g in d.groupby(level=[0, 1]):
        info = table.get((poc, unit))
        if not info or not info[1]:
            if unknown is not None:
                unknown[f'{poc} {unit}'] = unknown.get(f'{poc} {unit}', 0) + float(g.Megawatts.max())
            continue
        tp = g.index.get_level_values(2).to_numpy(int)
        ok = (tp >= 1) & (tp <= 50)
        o, c = out.setdefault(info[0], (np.zeros(50), np.zeros(50)))
        np.add.at(o, tp[ok] - 1, g.Megawatts.to_numpy()[ok])
        np.add.at(c, tp[ok] - 1, g.c.to_numpy()[ok])
    return out


def month_grid(m):
    """(t0 ms, N): the month's half-hours from its first local midnight to the next month's, as hist/hh has them."""
    a = pd.Timestamp(m.year, m.month, 1, tz=NZ)
    b = pd.Timestamp(m.year + (m.month == 12), m.month % 12 + 1, 1, tz=NZ)
    return int(a.timestamp() * 1000), int((b - a).total_seconds() // 1800)


def day_index(d, t0):
    """Grid index of trading period 1 on day d (TP k starts k-1 half-hours after local midnight, counting through a
    clock change, as the EA numbers them)."""
    return int((pd.Timestamp(d, tz=NZ).timestamp() * 1000 - t0) // HH)


def fetch_day(d, table, unknown):
    with urlopen(f'{BLOB}/{OFFERS}/{d.year}/{d:%Y%m%d}_Offers.csv', timeout=900) as r:
        return reduce_day(io.BufferedReader(r, 1 << 20), table, unknown)


def enc(a):
    return [None if v != v else int(round(v)) for v in a]


def dec(a):
    return np.array([np.nan if v is None else v for v in a], float)


def summarise(off, hh):
    """Each local day of the month: the lowest headroom (offered less output, by island and fuel, never below zero),
    for all offered MW (O) and offered under CHEAP (C), with and without hydro (x), for NZ and each island; and each
    island's mean offered MW by fuel. hh: the month's hist/hh file (output), or None."""
    t0, N = off['t0'], off['N']
    t = t0 + np.arange(N) * HH
    loc = pd.to_datetime(t, unit='ms', utc=True).tz_convert(NZ)
    day = np.asarray(loc.normalize().tz_localize(None).date)
    days = sorted(set(day))
    out = {'t': [int(pd.Timestamp(d, tz=NZ).timestamp() * 1000) for d in days]}

    def series(isl, f, k):
        return dec(off[isl][f][k]) if f in off[isl] else np.full(N, np.nan)

    def output(isl, f):
        if not hh or f not in hh[isl] or hh['t0'] != t0:
            return np.full(N, np.nan)
        a = dec(hh[isl][f])[:N]
        a = np.concatenate([a, np.full(N - len(a), np.nan)])
        return np.maximum(a, 0) if f == 'batt' else a

    have = {isl: {f: output(isl, f) for f in DISPATCH} for isl in ('NI', 'SI')}
    for lvl, k in (('O', 'o'), ('C', 'c')):
        for x, fuels in (('', DISPATCH), ('x', tuple(f for f in DISPATCH if f != 'hydro'))):
            room = {}
            for isl in ('NI', 'SI'):
                # missing where the day's offers or the output aren't in yet (a stored day has every fuel, zeros included)
                r = np.zeros(N)
                for f in fuels:
                    r = r + np.maximum(0, series(isl, f, k) - have[isl][f])
                room[isl] = r
            room['NZ'] = room['NI'] + room['SI']
            for reg, r in room.items():
                s = pd.Series(r).groupby(day).min().reindex(days)   # pandas skips NaN; a day with none stays NaN
                out.setdefault(f'low{lvl}{x}', {})[reg] = enc(s.to_numpy())
    for isl in ('NI', 'SI'):
        out[isl] = {f: {k: enc(pd.Series(series(isl, f, k)).groupby(day).mean().reindex(days).to_numpy()) for k in 'oc'}
                    for f in DISPATCH}
    return out


def plant_info(table):
    """Plant shown -> (fuel, island), from its units."""
    out = {}
    for name, fuel, isl in table.values():
        if fuel and name not in out:
            out[name] = (fuel, isl)
    return out


def build_month(m, have_off, have_p, table, todo, log, deadline):
    """Add the days in todo to the month's files (have_off, have_p: what's stored, or None). Stops at the deadline
    with the days done so far. Returns (off, offp, days added)."""
    t0, N = month_grid(m)
    plants = (have_p or {}).get('plants', {})
    for p in plants.values():
        p['o'], p['c'] = dec(p['o']), dec(p['c'])
    got = set((have_off or {}).get('days', []))
    added = 0
    unknown = {}
    info = plant_info(table)
    for d in todo:
        if time.time() > deadline:
            break
        t = time.time()
        try:
            day = fetch_day(d, table, unknown)
        except Exception as e:  # noqa: BLE001 - a bad or missing file shouldn't stop the month
            log(f'  {d}: offers file failed ({e})')
            continue
        i0 = day_index(d, t0)
        nxt = day_index(d + timedelta(days=1), t0)
        n = min(nxt, N) - i0
        for name, (o, c) in day.items():
            fuel, isl = info.get(name, (None, None))
            p = plants.setdefault(name, {'fuel': fuel, 'isl': isl, 'o': np.full(N, np.nan), 'c': np.full(N, np.nan)})
            p['o'][i0:i0 + n], p['c'][i0:i0 + n] = o[:n], c[:n]
        got.add(d.day)
        added += 1
        log(f'  {d}: {len(day)} plants offered, {time.time() - t:.0f} s')
    if unknown:
        top = sorted(unknown.items(), key=lambda kv: -kv[1])[:8]
        log('  units not in the register (skipped): ' + ', '.join(f'{k} ({v:.0f} MW)' for k, v in top))
    # on a stored day a plant with no offer offered nothing (zero); days not stored yet are missing (null)
    stored = np.zeros(N, bool)
    for dd in got:
        d = date(m.year, m.month, dd)
        stored[max(0, day_index(d, t0)):min(N, day_index(d + timedelta(days=1), t0))] = True
    off = {'t0': t0, 'step': HH, 'N': N, 'cheap': CHEAP, 'days': sorted(got), 'NI': {}, 'SI': {}}
    for isl in ('NI', 'SI'):
        for f in DISPATCH:
            o, c = np.zeros(N), np.zeros(N)
            for p in plants.values():
                if p['fuel'] == f and p['isl'] == isl:
                    o += np.nan_to_num(p['o'])
                    c += np.nan_to_num(p['c'])
            off[isl][f] = {'o': enc(np.where(stored, o, np.nan)), 'c': enc(np.where(stored, c, np.nan))}
    offp = {'t0': t0, 'step': HH, 'N': N, 'cheap': CHEAP, 'days': sorted(got),
            'plants': {n: {'fuel': p['fuel'], 'isl': p['isl'], 'o': enc(np.where(stored, np.nan_to_num(p['o']), np.nan)),
                           'c': enc(np.where(stored, np.nan_to_num(p['c']), np.nan))} for n, p in sorted(plants.items())}}
    return off, offp, added


def months_between(a, b):
    m = date(a.year, a.month, 1)
    while m <= b:
        yield m
        m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)


def main(budget_min=300, start=None, resummarise=False, log=print):
    t_start = time.time()
    deadline = t_start + budget_min * 60
    if os.environ.get('GITHUB_ACTIONS') and not all(os.environ.get(k) for k in ('CF_ACCOUNT_ID', 'CF_API_TOKEN')):
        print('::notice::Skipped: add the CF_ACCOUNT_ID and CF_API_TOKEN secrets to turn on the offers job.')
        return
    store = open_store()
    prog = json.loads(store.get('hist/off/progress.json') or b'{}')
    today_utc = pd.Timestamp.now(tz='UTC').strftime('%Y-%m-%d')
    used = prog.get('writes', {}).get(today_utc, 0)
    have = {k: set(v) for k, v in prog.get('days', {}).items()}   # month -> days of the month stored
    summed = dict(prog.get('summed', {}))                          # month -> when its summary was made (ms)

    def room(n):
        return used + n <= WRITE_BUDGET

    def put(key, body, ctype):
        nonlocal used
        store.put(key, body, ctype)
        used += 1

    today = datetime.now(NZ).date()
    avail = published(range((start or FIRST).year, today.year + 1))
    table = units()
    changed = False
    stopped = ''
    recent = today - timedelta(days=RECENT_DAYS)
    for m in sorted(months_between(start or FIRST, today), reverse=True):   # newest first
        month = f'{m:%Y-%m}'
        todo = sorted(d for d in avail if (d.year, d.month) == (m.year, m.month) and d.day not in have.get(month, set()))
        last = date(m.year + (m.month == 12), m.month % 12 + 1, 1) - timedelta(days=1)
        resum = bool(have.get(month)) and (resummarise or last >= recent) and summed.get(month, 0) < time.time() * 1000 - 6 * 3600e3
        if not todo and not resum:
            continue
        if stopped:
            continue
        if time.time() > deadline - 60:
            stopped = f'time budget used at {month}'
            continue
        if not room(2 + 2):   # the month's two files, then days.json and progress
            stopped = f'daily KV write allowance used at {month}'
            continue
        raw = store.get(f'hist/off/{month}.json')
        off_old = json.loads(raw) if raw else None
        rawp = store.get(f'hist/offp/{month}.json.gz')
        offp_old = json.loads(gzip.decompress(rawp)) if rawp else None
        if todo:
            log(f'{month}: {len(todo)} days of offers to add')
            off, offp, added = build_month(m, off_old, offp_old, table, todo, log, deadline - 60)
        else:
            off, offp, added = off_old, None, 0
        if off is None:
            continue
        hh = store.get(f'hist/hh/{month}.json')
        new_sum = summarise(off, json.loads(hh) if hh else None)
        summed[month] = int(time.time() * 1000)
        if not added and new_sum == off.get('sum'):
            continue   # nothing new and the summary is the same: no write
        off['sum'] = new_sum
        put(f'hist/off/{month}.json', json.dumps(off, separators=(',', ':')).encode(), 'application/json')
        if added:
            put(f'hist/offp/{month}.json.gz', gzip.compress(json.dumps(offp, separators=(',', ':')).encode()), 'application/gzip')
            have[month] = set(off['days'])
        changed = True
        if time.time() > deadline - 60 and len(off['days']) < len([d for d in avail if (d.year, d.month) == (m.year, m.month)]):
            stopped = f'time budget used part way through {month}'

    if changed:
        days = {'t': []}
        for month in sorted(have):
            raw = store.get(f'hist/off/{month}.json')
            if not raw:
                continue
            s = json.loads(raw).get('sum')
            if not s:
                continue
            days['t'] += s['t']
            for k, v in s.items():
                if k == 't':
                    continue
                for a, b in v.items():
                    if isinstance(b, dict):
                        for c, arr in b.items():
                            days.setdefault(k, {}).setdefault(a, {}).setdefault(c, []).extend(arr)
                    else:
                        days.setdefault(k, {}).setdefault(a, []).extend(b)
        days['cheap'] = CHEAP
        days['built'] = int(time.time() * 1000)
        put('hist/off/days.json', json.dumps(days, separators=(',', ':')).encode(), 'application/json')
    prog = {'days': {k: sorted(v) for k, v in sorted(have.items())}, 'summed': summed,
            'writes': {today_utc: used + 1}, 'at': int(time.time() * 1000)}
    if changed or stopped:
        put('hist/off/progress.json', json.dumps(prog, separators=(',', ':')).encode(), 'application/json')
    n = sum(len(v) for v in have.values())
    log(f'offers: {n} days stored in {len(have)} months' + (f'; {stopped}, continues next run' if stopped else '')
        + f'; {used} KV writes today, {time.time() - t_start:.0f} s')


if __name__ == '__main__':
    a = sys.argv[1:]
    budget = float(a[a.index('--budget') + 1]) if '--budget' in a else 300
    frm = date.fromisoformat(a[a.index('--from') + 1] + '-01') if '--from' in a else None
    main(budget, frm, '--resummarise' in a)
