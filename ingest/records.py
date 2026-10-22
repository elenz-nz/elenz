"""Records: the highest and lowest half-hours, the best and worst months, and the longest runs since 1 August 1997,
for New Zealand and each island (the Records pages, /records).

The history job calls update() on every run. Each month's half-hourly file (hist/hh/YYYY-MM.json) is boiled down to a
small summary (summarise()):
  half-hour records  the month's running best: every half-hour that beat everything earlier in the month. A record
                     beats everything before it, so it is always in its month's running best, and joining the months'
                     sequences in time order gives every record ever set and the order they fell in (the progression).
  month records      the month's figure (renewable share of generation, wind energy).
  runs               the run going at the month's start and end, and the longest runs inside it, so runs that cross
                     month boundaries join up.
Stored:
  hist/rec/months.json.gz   every month's summary (internal). A month's summary is remade whenever the month is
                            rebuilt, and every month's when VERSION changes (read back from hist/hh, a few minutes).
  hist/records.json         the public file the pages read (build() describes its layout). Written only while the
                            history is complete, as hist/day.json is, and only when something in it has changed.

Official and provisional. A record is official once it rests on final data: metered generation and demand (the EA
publishes a month's metering 5-6 weeks after it ends: meta.source == 'metered'), final prices, metered HVDC. Months
after that (dispatch data) can set provisional records, shown as such until the metered month confirms them or
doesn't: dispatch runs 1-2% above metered (wind ~3.5%), so near misses often don't survive. When a provisional record
is settled, `resolved` says which way it went for NEW_DAYS. The website also checks the live week itself.

Definitions follow the rest of the site (src/lib/home/now.js): generation is each fuel's output summed, battery
discharge only, no HVDC; the renewable share is of that total less battery discharge (geothermal, bioenergy, hydro, wind, grid and embedded
solar); fossil generation is the Rankines (coal or gas), gas, diesel and waste heat; demand is metered grid demand;
prices are the island reference nodes (Haywards, Benmore), New Zealand's the higher of the two; HVDC is the mid-link
transfer, northward positive. Embedded solar is modelled, so its records are estimates (the page says so).

Run from the repo root to try it on downloaded months:  python3 ingest/records.py <folder of YYYY-MM.json> [out.json]
"""
import gzip
import json
import os
import sys
import time

import numpy as np
import pandas as pd

from common import NZ

VERSION = 3                # bump when summarise() changes: every month's summary is remade (2: per-day sums for periods;
                           # 3: renewable share without battery discharge)
REGIONS = ('NZ', 'NI', 'SI')
GEN = ('geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar', 'roof', 'batt')
REN = ('geo', 'bio', 'hydro', 'wind', 'solar', 'roof')
FOSSIL = ('coal', 'gas', 'diesel', 'waste')
LOW_PRICE = 5.0            # $/MWh: "near zero" (the price explainer's new-low threshold)
REN_RUN = 90.0             # % renewable for the renewable run
RUNNING = 1.0              # MW: a Huntly Rankine counts as running above this
TOP_RUNS = 10              # longest runs kept, per month and overall
NEW_DAYS = 30              # a record is "new" this long after it is first published; resolved provisional records too
MONTH_LIMIT = 12 * 60      # seconds update() may spend reading months it has no summary for

# Each record: kind (max or min), the data it rests on (gen: metered generation and demand; price: final prices;
# hvdc: metered HVDC), the regions it is kept for, decimal places. Names and wording live on the site
# (src/lib/records/records.js).
HALF_HOURS = {
    'demand_max': ('max', 'gen', REGIONS, 0),
    'demand_min': ('min', 'gen', REGIONS, 0),
    'ren_max': ('max', 'gen', REGIONS, 1),
    'ren_min': ('min', 'gen', REGIONS, 1),
    'fossil_min': ('min', 'gen', REGIONS, 0),
    'wind_max': ('max', 'gen', REGIONS, 0),
    'solar_max': ('max', 'gen', REGIONS, 0),
    'roof_max': ('max', 'gen', REGIONS, 0),
    'price_max': ('max', 'price', REGIONS, 2),
    'gap_max': ('max', 'price', ('NZ',), 2),
    'hvdc_n_max': ('max', 'hvdc', ('NZ',), 0),
    'hvdc_s_max': ('max', 'hvdc', ('NZ',), 0),
}
MONTHS = {
    'ren_month_max': ('max', 'gen', REGIONS, 1),
    'ren_month_min': ('min', 'gen', REGIONS, 1),
    'wind_month_max': ('max', 'gen', REGIONS, 1),          # GWh
}
RUNS = {
    'low_price_run': ('price', REGIONS),                    # under LOW_PRICE (New Zealand: both islands)
    'ren_run': ('gen', ('NZ', 'NI')),                       # at or above REN_RUN % renewable (the South Island always is)
    'huntly_off_run': ('gen', ('NZ',)),                     # no Huntly Rankine running
}
FUEL_OF = {'wind_max': 'wind', 'solar_max': 'solar'}       # records whose context lists the biggest plants

# Periods: every half-hour record also has its highest (or lowest) day, week (Monday to Sunday), calendar month and
# calendar year. A period's figure is its average over the half-hours it has (MW, %, $/MWh), so periods of different
# lengths compare fairly (a February isn't the lowest month just for being short); the renewable share is renewable
# energy over all generation. Only whole periods count: none before the data starts or after it ends, and a day needs
# 90% of its half-hours. A period
# is official when every day in it is; a newer one beyond the record is provisional.
PERIODS = ('day', 'week', 'month', 'year')
DAY_SUMS = ('dem', 'gen', 'ren', 'fossil', 'wind', 'solar', 'roof', 'price', 'gap', 'hvdc')
DAY_MIN_SHARE = 0.9
# each record's figure from a period's sums: (sum key, sign) for an average, or 'ren' for the renewable share
PERIOD_OF = {
    'demand_max': ('dem', 1), 'demand_min': ('dem', 1), 'ren_max': 'ren', 'ren_min': 'ren', 'fossil_min': ('fossil', 1),
    'wind_max': ('wind', 1), 'solar_max': ('solar', 1), 'roof_max': ('roof', 1), 'price_max': ('price', 1),
    'gap_max': ('gap', 1), 'hvdc_n_max': ('hvdc', 1), 'hvdc_s_max': ('hvdc', -1),
}
SUM_FAM = {'dem': 'gen', 'gen': 'gen', 'ren': 'gen', 'fossil': 'gen', 'wind': 'gen', 'solar': 'gen', 'roof': 'gen',
           'price': 'price', 'gap': 'price', 'hvdc': 'hvdc'}


# ---------- one month ----------

def _arr(x, n):
    return np.array([np.nan if v is None else v for v in x], float) if x is not None else np.zeros(n)


def series(js):
    """A month in the tracker layout -> {record id: {region: array}} for the half-hour records and runs, plus 'gen' and
    'ren' energy sums by region for the month records."""
    n = js['N']
    a = lambda isl, k: _arr(js[isl].get(k), n)   # noqa: E731
    fu = {isl: {f: a(isl, f) for f in GEN} for isl in ('NI', 'SI')}
    fu['NZ'] = {f: fu['NI'][f] + fu['SI'][f] for f in GEN}
    nip, sip = a('NI', 'price'), a('SI', 'price')
    hv = _arr(js.get('hvdcN'), n)
    huntly = sum((_arr(p['s'], n) for p in js.get('plants', []) if p['name'].startswith('Huntly Rankine')), np.zeros(n))
    out = {k: {} for k in list(HALF_HOURS) + list(RUNS) + ['gen', 'renE', 'windE']}
    for r in REGIONS:
        F = {f: np.maximum(v, 0) for f, v in fu[r].items()}   # as the site: each fuel's output, battery discharge only
        # the renewable share is of generation less battery discharge (as em6 and the site): that energy was generated,
        # and counted, once already when the battery charged
        gen = sum(v for f, v in F.items() if f != 'batt')
        ren = sum(F[f] for f in REN)
        share = np.where(gen > 0, 100 * ren / np.where(gen > 0, gen, 1), np.nan)
        dem = a('NI', 'metered') + a('SI', 'metered') if r == 'NZ' else a(r, 'metered')
        price = np.maximum(nip, sip) if r == 'NZ' else (nip if r == 'NI' else sip)
        S = {
            'demand_max': dem, 'demand_min': dem,
            'ren_max': share, 'ren_min': share, 'fossil_min': sum(F[f] for f in FOSSIL),
            'wind_max': F['wind'], 'solar_max': F['solar'], 'roof_max': F['roof'],
            'price_max': price, 'gap_max': np.abs(nip - sip), 'hvdc_n_max': hv, 'hvdc_s_max': -hv,
            'low_price_run': price < LOW_PRICE, 'ren_run': share >= REN_RUN, 'huntly_off_run': huntly < RUNNING,
        }
        for k, v in S.items():
            regions = HALF_HOURS[k][2] if k in HALF_HOURS else RUNS[k][1]
            if r not in regions:
                continue
            out[k][r] = v
        out['gen'][r], out['renE'][r], out['windE'][r] = gen, ren, F['wind']
        # per-day sums for the period records
        out.setdefault('sums', {})[r] = {
            'dem': out['demand_max'][r], 'gen': gen, 'ren': ren,
            'fossil': out['fossil_min'][r], 'wind': out['wind_max'][r], 'solar': out['solar_max'][r], 'roof': out['roof_max'][r],
            'price': price, 'gap': np.abs(nip - sip) if r == 'NZ' else None, 'hvdc': hv if r == 'NZ' else None,
        }
    return out


def day_sums(js, S=None):
    """Each NZ day in a month: its start, half-hours, and per region the sum and count of every DAY_SUMS series
    ({'t': [...], 'n': [...], 's': {region: {key: [[sum, count], ...]}}})."""
    n, t0, step = js['N'], js['t0'], js['step']
    S = S or series(js)
    tt = pd.to_datetime(t0 + np.arange(n) * step, unit='ms', utc=True).tz_convert(NZ)
    day = tt.normalize()
    starts = np.flatnonzero(np.r_[True, day[1:] != day[:-1]])
    bounds = list(starts) + [n]
    # half-hours a whole day has (46, 48 or 50), from its local midnights
    full = []
    for i in starts:
        d0 = day[i]
        d1 = (d0.tz_localize(None) + pd.Timedelta(days=1)).tz_localize(NZ)
        full.append(int(round((d1 - d0).total_seconds() * 1000 / step)))
    out = {'t': [int(day[i].tz_convert('UTC').timestamp() * 1000) for i in starts], 'n': full, 's': {}}
    for r in REGIONS:
        out['s'][r] = {}
        for k in DAY_SUMS:
            v = S['sums'][r].get(k)
            if v is None:
                continue
            rows = []
            for a, b in zip(bounds[:-1], bounds[1:]):
                x = v[a:b]
                ok = ~np.isnan(x)
                rows.append([round(float(x[ok].sum()), 1), int(ok.sum())])
            out['s'][r][k] = rows
    return out


def running(t, v, kind, dp):
    """Each point that beats everything before it: [[t, value], ...] (values rounded first, so a tie isn't a record)."""
    x = np.round(v, dp)
    s = -x if kind == 'min' else x
    acc = np.fmax.accumulate(s)   # NaN (a gap) never counts
    prev = np.r_[-np.inf, acc[:-1]]
    idx = np.flatnonzero(s > prev)
    return [[int(t[i]), float(x[i]) if dp else int(x[i])] for i in idx]


def run_parts(flag):
    """A boolean array -> (head, tail, internal runs as [start index, length]): the run going at its start and at its
    end (the whole length if it is all True), and the runs that touch neither end, longest first."""
    f = np.asarray(flag, bool)
    n = len(f)
    if f.all():
        return n, n, []
    starts = np.flatnonzero(f & ~np.r_[False, f[:-1]])
    ends = np.flatnonzero(f & ~np.r_[f[1:], False])
    head = int(ends[0] + 1) if f[0] else 0
    tail = int(n - starts[-1]) if f[-1] else 0
    inner = [[int(s), int(e - s + 1)] for s, e in zip(starts, ends) if s > 0 and e < n - 1]
    inner.sort(key=lambda x: -x[1])
    return head, tail, inner[:TOP_RUNS]


def official(meta):
    """Which kinds of data in a month are final: metered generation and demand, final prices, metered HVDC."""
    return {'gen': meta.get('source') == 'metered',
            'price': meta.get('final_prices', 0) >= 0.99,
            'hvdc': meta.get('hvdc_metered', 0) >= 0.99}


def summarise(js):
    """One month (hist/hh layout) -> its summary (see the module docstring)."""
    n, t0, step = js['N'], js['t0'], js['step']
    t = t0 + np.arange(n) * step
    S = series(js)
    hh = {}
    for k, (kind, _, regions, dp) in HALF_HOURS.items():
        hh[k] = {}
        for r in regions:
            v = S[k][r]
            ok = v[~np.isnan(v)]
            hh[k][r] = {'seq': running(t, v, kind, dp),
                        'lo': round(float(ok.min()), dp) if len(ok) else None,
                        'hi': round(float(ok.max()), dp) if len(ok) else None}
    mo = {k: {} for k in MONTHS}
    for r in REGIONS:
        gen, ren = float(np.nansum(S['gen'][r])), float(np.nansum(S['renE'][r]))
        share = round(100 * ren / gen, 1) if gen > 0 else None
        mo['ren_month_max'][r] = mo['ren_month_min'][r] = share
        mo['wind_month_max'][r] = round(float(np.nansum(S['windE'][r])) * step / 3.6e6 / 1000, 1)   # MW x ms -> GWh
    runs = {}
    for k, (_, regions) in RUNS.items():
        runs[k] = {}
        for r in regions:
            head, tail, inner = run_parts(S[k][r])
            runs[k][r] = {'head': head, 'tail': tail, 'top': [[int(t[i]), m] for i, m in inner]}
    return {'v': VERSION, 'month': js['meta']['month'], 't0': t0, 'step': step, 'n': n,
            'end': t0 + (n - 1) * step, 'ok': official(js['meta']), 'hh': hh, 'mo': mo, 'run': runs,
            'days': day_sums(js, S)}


# ---------- all months ----------

def _month_start(month):
    return int(pd.Timestamp(month + '-01', tz=NZ).tz_convert('UTC').timestamp() * 1000)


def _better(kind, a, b):
    return a > b if kind == 'max' else a < b


def half_hour_record(sums, k, r, kind, fam):
    """Official record, progression, everything kept for the page, and any provisional record beyond it."""
    steps, best, lo, hi = [], None, None, None
    prov = None
    for s in sums:
        e = s['hh'].get(k, {}).get(r)
        if e is None:
            continue
        if s['ok'][fam]:
            for tv in e['seq']:
                if best is None or _better(kind, tv[1], best):
                    best = tv[1]
                    steps.append(tv)
            if e['lo'] is not None:
                lo = e['lo'] if lo is None else min(lo, e['lo'])
                hi = e['hi'] if hi is None else max(hi, e['hi'])
        elif e['seq']:
            tv = e['seq'][-1]   # the month's best
            if best is not None and _better(kind, tv[1], best) and (prov is None or _better(kind, tv[1], prov[1])):
                prov = tv
    if not steps:
        return None
    out = {'t': steps[-1][0], 'v': steps[-1][1], 'n': len(steps) - 1,
           'prev': steps[-2] if len(steps) > 1 else None, 'steps': steps,
           'constant': lo is not None and lo == hi}
    if prov and _better(kind, prov[1], best):   # a later official month may have beaten it since
        out['prov'] = {'t': prov[0], 'v': prov[1]}
    return out


def month_record(sums, k, r, kind):
    steps, best = [], None
    for s in sums:
        v = s['mo'].get(k, {}).get(r)
        if v is None or not s['ok'][MONTHS[k][1]]:
            continue
        if best is None or _better(kind, v, best):
            best = v
            steps.append([_month_start(s['month']), v])
    if not steps:
        return None
    return {'t': steps[-1][0], 'v': steps[-1][1], 'n': len(steps) - 1,
            'prev': steps[-2] if len(steps) > 1 else None, 'steps': steps}


def all_runs(sums, k, r):
    """Every run that matters across the months, joined over month boundaries: [[start, half-hours, ongoing]]."""
    out, carry, last_end, step = [], None, None, None
    for s in sums:
        e = s['run'].get(k, {}).get(r)
        if e is None:
            continue
        step = s['step']
        joined = last_end is not None and s['t0'] - last_end == step
        if carry and not joined:
            out.append(carry + [False])
            carry = None
        if e['head'] == s['n']:   # the whole month
            carry = [carry[0], carry[1] + s['n']] if carry else [s['t0'], s['n']]
            last_end = s['end']
            continue
        if carry:
            out.append([carry[0], carry[1] + e['head'], False])
            carry = None
        elif e['head']:
            out.append([s['t0'], e['head'], False])
        out += [[a, m, False] for a, m in e['top']]
        if e['tail']:
            carry = [s['t0'] + (s['n'] - e['tail']) * step, e['tail']]
        last_end = s['end']
    if carry:
        out.append(carry + [True])   # still going at the end of the data
    return out


def run_record(sums, k, r, fam):
    off = [s for s in sums if s['ok'][fam]]
    # official months up to the first that isn't: later official months (prices finalise out of order) wait for it
    upto = []
    for s in sums:
        if not s['ok'][fam]:
            break
        upto.append(s)
    runs = all_runs(upto, k, r)
    if not runs or not off:
        return None
    top = sorted(runs, key=lambda x: -x[1])[:TOP_RUNS]
    steps, best = [], 0
    for a, m, ong in sorted(runs, key=lambda x: x[0]):
        if m > best:
            best = m
            steps.append([a, m])
    out = {'top': [[a, m / 2, ong] for a, m, ong in top], 't': top[0][0], 'v': top[0][1] / 2, 'ongoing': top[0][2],
           'n': len(steps) - 1, 'steps': [[a, m / 2] for a, m in steps]}
    prov = sorted(all_runs(sums, k, r), key=lambda x: -x[1])
    if prov and prov[0][1] > top[0][1]:
        out['prov'] = {'t': prov[0][0], 'v': prov[0][1] / 2, 'ongoing': prov[0][2]}
    return out


def by_month_of_year(sums, k, r, kind, fam, monthly=False):
    """The best for each calendar month (1-12): [[t, value] or None] x 12."""
    best = [None] * 12
    for s in sums:
        if not s['ok'][fam]:
            continue
        if monthly:
            v = s['mo'].get(k, {}).get(r)
            tv = [_month_start(s['month']), v] if v is not None else None
        else:
            e = s['hh'].get(k, {}).get(r)
            tv = e['seq'][-1] if e and e['seq'] else None
        if tv is None:
            continue
        i = int(s['month'][5:]) - 1
        if best[i] is None or _better(kind, tv[1], best[i][1]):
            best[i] = tv
    return best


def _period_start(t, period):
    """The start (ms) of the day, week (Monday), month or year that contains NZ day t."""
    d = pd.Timestamp(t, unit='ms', tz='UTC').tz_convert(NZ).normalize()
    if period == 'week':
        d = d - pd.Timedelta(days=d.weekday())
        d = d.tz_localize(None).tz_localize(NZ)
    elif period == 'month':
        d = pd.Timestamp(year=d.year, month=d.month, day=1, tz=NZ)
    elif period == 'year':
        d = pd.Timestamp(year=d.year, month=1, day=1, tz=NZ)
    return int(d.tz_convert('UTC').timestamp() * 1000)


def _period_days(start, period):
    """How many NZ days the period starting at `start` has."""
    d = pd.Timestamp(start, unit='ms', tz='UTC').tz_convert(NZ)
    if period == 'day':
        return 1
    if period == 'week':
        return 7
    if period == 'month':
        return d.days_in_month
    return 366 if d.is_leap_year else 365


def period_figures(sums, now_ms=None):
    """Every whole day, week, month and year in the history -> {period: {record: {region: [[start, value, official]]}}},
    oldest first. A day counts when it has DAY_MIN_SHARE of its half-hours for that series."""
    days = []   # (t, half-hours, {region: {key: [sum, count]}}, ok)
    for s in sorted(sums, key=lambda x: x['month']):
        dd = s.get('days')
        if not dd:
            continue
        for i, t in enumerate(dd['t']):
            days.append((t, dd['n'][i], {r: {k: v[i] for k, v in dd['s'][r].items()} for r in dd['s']}, s['ok']))
    if not days:
        return {}
    # the first and last days are whole only if the data covers them: drop a part day at either end
    out = {p: {k: {} for k in PERIOD_OF} for p in PERIODS}
    for p in PERIODS:
        groups = {}
        for d in days:
            groups.setdefault(_period_start(d[0], p), []).append(d)
        for start in sorted(groups):
            ds = groups[start]
            whole = len({d[0] for d in ds}) == _period_days(start, p)
            if not whole:
                continue
            for k, how in PERIOD_OF.items():
                for r in HALF_HOURS[k][2]:
                    keys = ('ren', 'gen') if how == 'ren' else (how[0],)
                    tot, ok, good = {}, True, True
                    for key in keys:
                        a = c = 0.0
                        for t, nh, S, okd in ds:
                            sc = S.get(r, {}).get(key)
                            if sc is None or sc[1] < DAY_MIN_SHARE * nh:
                                if p == 'day' or SUM_FAM[key] != 'gen':
                                    good = False
                                continue   # a short day inside a longer period: the rest stands
                            a += sc[0]; c += sc[1]
                            ok = ok and okd[SUM_FAM[key]]
                        if c == 0:
                            good = False
                        tot[key] = (a, c)
                    if not good:
                        continue
                    if how == 'ren':
                        v = 100 * tot['ren'][0] / tot['gen'][0] if tot['gen'][0] > 0 else None
                    else:
                        v = how[1] * tot[how[0]][0] / tot[how[0]][1]
                    if v is None or v != v:
                        continue
                    out[p][k].setdefault(r, []).append([start, round(v, HALF_HOURS[k][3]), ok])
    return out


def period_record(figs, kind):
    """[[start, value, official]] oldest first -> the official record, its progression, and a provisional one beyond it."""
    steps, best, prov = [], None, None
    for t, v, ok in figs:
        if ok:
            if best is None or _better(kind, v, best):
                best = v
                steps.append([t, v])
        elif best is not None and _better(kind, v, best) and (prov is None or _better(kind, v, prov[1])):
            prov = [t, v]
    if not steps:
        return None
    out = {'t': steps[-1][0], 'v': steps[-1][1], 'n': len(steps) - 1, 'prev': steps[-2] if len(steps) > 1 else None,
           'steps': steps}
    if prov and _better(kind, prov[1], best):
        out['prov'] = {'t': prov[0], 'v': prov[1]}
    return out


def context(js, k, r, t):
    """The record's half-hour in its setting: that NZ day's series of the record, and what else was happening."""
    n, t0, step = js['N'], js['t0'], js['step']
    i = int(round((t - t0) / step))
    if not 0 <= i < n:
        return None
    S = series(js)
    tt = pd.to_datetime(t0 + np.arange(n) * step, unit='ms', utc=True).tz_convert(NZ)
    day = np.flatnonzero(tt.normalize() == tt[i].normalize())
    v = S[k][r]
    dp = HALF_HOURS[k][3]
    out = {'day': {'t0': int(t0 + day[0] * step), 'step': step,
                   'v': [None if x != x else (round(float(x), dp) if dp else int(round(x))) for x in v[day]]}}
    a = lambda isl, kk: _arr(js[isl].get(kk), n)[i]   # noqa: E731
    gen = float(S['gen'][r][i])
    out['gen'] = int(round(gen))
    out['ren'] = round(float(100 * S['renE'][r][i] / gen), 1) if gen > 0 else None
    out['demand'] = int(round(a('NI', 'metered') + a('SI', 'metered') if r == 'NZ' else a(r, 'metered')))
    out['hay'], out['ben'] = round(float(a('NI', 'price')), 2), round(float(a('SI', 'price')), 2)
    hv = js.get('hvdcN')
    out['hvdc'] = int(hv[i]) if hv and hv[i] is not None else None
    fuel = FUEL_OF.get(k)
    if fuel:
        ps = [(p['name'], p['s'][i]) for p in js.get('plants', [])
              if p['fuel'] == fuel and (r == 'NZ' or p['isl'] == r) and p['s'][i] is not None]
        out['top'] = [[nm, int(round(mw))] for nm, mw in sorted(ps, key=lambda x: -x[1])[:3] if mw >= 1]
    return out


def build(sums, old=None, read_month=None, now_ms=None):
    """Month summaries (oldest first) -> the public records file. old: the last published file (keeps each record's
    `since` and context, and tells which provisional records have been settled); read_month(month) -> that month's
    hist/hh dict, for the context of a record that has changed."""
    now_ms = now_ms or int(time.time() * 1000)
    old = old or {}
    sums = sorted(sums, key=lambda s: s['month'])
    first_pub = not old.get('records')
    last_ok = {fam: max((s['end'] for s in sums if s['ok'][fam]), default=None) for fam in ('gen', 'price', 'hvdc')}
    recent_from = {fam: (v - 62 * 864e5) if v else None for fam, v in last_ok.items()}   # first publish: the last two months
    cache = {}

    def month_of(t):
        m = pd.Timestamp(t, unit='ms', tz='UTC').tz_convert(NZ).strftime('%Y-%m')
        if m not in cache and read_month:
            cache[m] = read_month(m)
        return cache.get(m)

    def keep(group, k, r, rec, fam):
        """Carry over `since` (when it first became the record) and, for the same half-hour, its context."""
        prev = old.get(group, {}).get(k, {}).get(r) or {}
        if prev.get('t') == rec['t']:
            if prev.get('since'):
                rec['since'] = prev['since']
            if prev.get('ctx'):
                rec['ctx'] = prev['ctx']
        elif prev:
            rec['since'] = now_ms
        elif first_pub and recent_from[fam] is not None and rec['t'] >= recent_from[fam]:
            rec['since'] = now_ms
        if rec.get('since') and now_ms - rec['since'] > 365 * 864e5:
            rec['since'] = None   # only "new" matters; old dates are noise
        return rec

    out = {'v': VERSION, 'built': now_ms, 'first': sums[0]['t0'] if sums else None, 'final_to': last_ok,
           'end': sums[-1]['end'] if sums else None, 'records': {}, 'months': {}, 'runs': {}, 'moy': {}, 'resolved': []}
    for k, (kind, fam, regions, _) in HALF_HOURS.items():
        out['records'][k], out['moy'][k] = {}, {}
        for r in regions:
            rec = half_hour_record(sums, k, r, kind, fam)
            if rec is None:
                continue
            rec = keep('records', k, r, rec, fam)
            if 'ctx' not in rec:
                js = month_of(rec['t'])
                c = context(js, k, r, rec['t']) if js else None
                if c:
                    rec['ctx'] = c
            out['records'][k][r] = rec
            out['moy'][k][r] = by_month_of_year(sums, k, r, kind, fam)
    for k, (kind, fam, regions, _) in MONTHS.items():
        out['months'][k], out['moy'][k] = {}, {}
        for r in regions:
            rec = month_record(sums, k, r, kind)
            if rec is None:
                continue
            out['months'][k][r] = keep('months', k, r, rec, fam)
            out['moy'][k][r] = by_month_of_year(sums, k, r, kind, fam, monthly=True)
    # the same records by day, week, month and year
    figs = period_figures(sums)
    out['periods'] = {}
    for p in PERIODS:
        out['periods'][p] = {}
        for k, (kind, fam, regions, _) in HALF_HOURS.items():
            out['periods'][p][k] = {}
            for r in regions:
                rec = period_record(figs.get(p, {}).get(k, {}).get(r, []), kind)
                if rec is not None:
                    prev = (old.get('periods') or {}).get(p, {}).get(k, {}).get(r) or {}
                    if prev.get('t') == rec['t'] and prev.get('since'):
                        rec['since'] = prev['since']
                    elif prev:
                        rec['since'] = now_ms
                    if rec.get('since') and now_ms - rec['since'] > 365 * 864e5:
                        rec['since'] = None
                    out['periods'][p][k][r] = rec
    for k, (fam, regions) in RUNS.items():
        out['runs'][k] = {}
        for r in regions:
            rec = run_record(sums, k, r, fam)
            if rec is not None:
                out['runs'][k][r] = keep('runs', k, r, rec, fam)

    # provisional records settled since the last publish: confirmed if the record moved into that month, otherwise not
    resolved = [x for x in old.get('resolved', []) if now_ms - x['at'] < NEW_DAYS * 864e5]
    by_month = {s['month']: s for s in sums}
    for k, regions in old.get('records', {}).items():
        if k not in HALF_HOURS:
            continue
        fam = HALF_HOURS[k][1]
        for r, o in regions.items():
            p = o.get('prov')
            if not p:
                continue
            m = pd.Timestamp(p['t'], unit='ms', tz='UTC').tz_convert(NZ).strftime('%Y-%m')
            s = by_month.get(m)
            if s is None or not s['ok'][fam]:
                continue   # not settled yet
            new = out['records'].get(k, {}).get(r)
            confirmed = bool(new and new['t'] != o['t'] and pd.Timestamp(new['t'], unit='ms', tz='UTC').tz_convert(NZ).strftime('%Y-%m') == m)
            e = s['hh'].get(k, {}).get(r)
            resolved.append({'k': k, 'r': r, 'pt': p['t'], 'pv': p['v'], 'ok': confirmed,
                             'v': new['v'] if confirmed else (e['seq'][-1][1] if e and e['seq'] else None),
                             'rec': o['v'], 'at': now_ms})
    out['resolved'] = resolved
    return out


def same(a, b):
    """True if two records files differ only in when they were built."""
    strip = lambda x: {k: v for k, v in (x or {}).items() if k != 'built'}   # noqa: E731
    return strip(a) == strip(b)


# ---------- the history job's step ----------

def update(store, fresh, months, publish, log=print, room=lambda n: True):
    """fresh: {month: summary} for months rebuilt this run; months: every month in the history. Fills in summaries for
    months without one (reading hist/hh, within MONTH_LIMIT), saves them, and publishes hist/records.json when the
    history is complete (publish) and every month has a summary."""
    t_start = time.time()
    raw = store.get('hist/rec/months.json.gz')
    saved = json.loads(gzip.decompress(raw)) if raw else {}
    have = {m: s for m, s in saved.get('months', {}).items() if s.get('v') == VERSION and m in months}
    changed = set(fresh) | (set(saved.get('months', {})) - set(have))
    have.update(fresh)
    missing = [m for m in months if m not in have]
    for m in missing:
        if time.time() - t_start > MONTH_LIMIT:
            break
        body = store.get(f'hist/hh/{m}.json')
        if body:
            have[m] = summarise(json.loads(body))
            changed.add(m)
    left = [m for m in months if m not in have]
    if changed and room(1):
        body = gzip.compress(json.dumps({'v': VERSION, 'months': have}, separators=(',', ':')).encode(), mtime=0)
        store.put('hist/rec/months.json.gz', body, 'application/gzip')
        log(f'records: {len(changed)} month summaries updated, {len(have)} stored' + (f', {len(left)} still to read' if left else ''))
    if not publish or left or not have:
        return
    old_raw = store.get('hist/records.json')
    old = json.loads(old_raw) if old_raw else None

    def read_month(m):
        b = store.get(f'hist/hh/{m}.json')
        return json.loads(b) if b else None
    rec = build(list(have.values()), old, read_month)
    if same(rec, old):
        return
    if not room(1):
        log('records: no KV writes left today; published next run')
        return
    store.put('hist/records.json', json.dumps(rec, separators=(',', ':'), allow_nan=False).encode(), 'application/json')
    log(f'records: published ({sum(len(v) for v in rec["records"].values())} half-hour records, '
        f'{sum(1 for g in rec["records"].values() for x in g.values() if x.get("prov"))} provisional)')


if __name__ == '__main__':
    folder = sys.argv[1]
    files = sorted(f for f in os.listdir(folder) if len(f) == 12 and f.endswith('.json') and f[4] == '-')
    sums = []
    for f in files:
        with open(os.path.join(folder, f)) as fh:
            sums.append(summarise(json.load(fh)))
    read = lambda m: json.load(open(os.path.join(folder, f'{m}.json'))) if os.path.exists(os.path.join(folder, f'{m}.json')) else None   # noqa: E731
    rec = build(sums, None, read)
    fmt = lambda t: pd.Timestamp(t, unit='ms', tz='UTC').tz_convert(NZ).strftime('%-I:%M %p %d %b %Y')   # noqa: E731
    for k, regions in rec['records'].items():
        for r, x in regions.items():
            print(f'{k:16s} {r} {x["v"]:>10} {fmt(x["t"]):>22s}  broken {x["n"]:3d}'
                  + (f'  prev {x["prev"][1]} {fmt(x["prev"][0])}' if x['prev'] else '')
                  + ('  constant' if x['constant'] else '') + (f'  PROV {x["prov"]["v"]} {fmt(x["prov"]["t"])}' if x.get('prov') else ''))
    for k, regions in rec['months'].items():
        for r, x in regions.items():
            print(f'{k:16s} {r} {x["v"]:>10} {fmt(x["t"])[-8:]:>22s}  broken {x["n"]:3d}')
    for k, regions in rec['runs'].items():
        for r, x in regions.items():
            print(f'{k:16s} {r} {x["v"]:>8} h from {fmt(x["t"])}' + (' (ongoing)' if x['ongoing'] else '')
                  + (f'  PROV {x["prov"]["v"]} h' if x.get('prov') else ''))
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w') as fh:
            json.dump(rec, fh, separators=(',', ':'), allow_nan=False)
        print('wrote', sys.argv[2], os.path.getsize(sys.argv[2]) // 1024, 'KB')
