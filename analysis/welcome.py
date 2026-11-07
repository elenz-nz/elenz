"""Figures and chart data for the article "Welcome to Elenz" (site/src/lib/articles/posts/welcome-to-elenz.svelte).

Inputs (downloaded into data/articles/ if missing), all from Elenz's own history:
  hist/day.json          daily history since 1 Aug 1997
  hist/records.json      the records
  hist/hh/YYYY-MM.json   the half-hourly months around Christmas 2025

Output: site/src/lib/articles/data/welcome-to-elenz.json, plus the figures quoted in the text, printed.

  python3 analysis/welcome.py          remove data/articles/hist/day.json and records.json first to pick up newer data
"""
import json
import os
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'articles', 'hist')
OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'articles', 'data', 'welcome-to-elenz.json')
SITE = 'https://elenz.co.nz/data/history'
NZ = ZoneInfo('Pacific/Auckland')
ISLANDS = ('NI', 'SI')
# the mix chart's layers: the tracker's fuels, with grid and embedded solar joined and the smallest as Other.
# oemb is other embedded generation from January 2009, a calculated estimate (site/src/lib/tracker/oemb.js)
MIX = {'geo': ['geo'], 'other': ['bio', 'waste', 'diesel', 'oemb'], 'coal': ['coal'], 'gas': ['gas'], 'hydro': ['hydro'],
       'wind': ['wind'], 'solar': ['solar', 'roof']}
NAMED = {'Ngāwhā': ('geo', 'NI'), 'Teviot': ('hydro', 'SI')}   # their fill joins the plant's fuel, as in oemb.js
FIRST_YEAR, LAST_YEAR = 1998, 2025   # whole calendar years
STACK = ['geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar', 'batt']
WINDOW = (datetime(2025, 12, 21, tzinfo=NZ), datetime(2026, 1, 8, tzinfo=NZ))   # the Christmas chart


def fetch(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urlopen(Request(f'{SITE}/{name}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=120) as r:
            body = r.read()
        with open(path, 'wb') as f:
            f.write(body)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def local(ms):
    return datetime.fromtimestamp(ms / 1000, NZ)


def stamp(ms):
    return local(ms).strftime('%a %d %b %Y %H:%M')


def mix(day):
    """TWh by layer for each whole calendar year, and each fuel's GWh for the text."""
    gwh = defaultdict(lambda: defaultdict(float))
    oe = day['oemb']
    for i, t in enumerate(day['t']):
        y = local(t).year
        h = day['h'][i] / 1000
        for isl in ISLANDS:
            for k in sum(MIX.values(), []):
                v = day[isl][k][i] if k != 'oemb' else sum(max(0, s[i] or 0) for s in oe[isl].values())
                if v:
                    gwh[y][k] += v * h
        for name, (fuel, isl) in NAMED.items():
            gwh[y][fuel] += (oe['named'].get(name, [0] * (i + 1))[i] or 0) * h
    years = list(range(FIRST_YEAR, LAST_YEAR + 1))
    return years, {name: [round(sum(gwh[y][k] for k in ks) / 1000, 2) for y in years] for name, ks in MIX.items()}, gwh


def hvdc_months(day):
    """Average net northward transfer of each month, up to the last month with final data."""
    final_to = local(fetch('records.json')['final_to']['hvdc'])
    sums = defaultdict(lambda: [0.0, 0.0])
    for t, h, v in zip(day['t'], day['h'], day['hvdcN']):
        d = local(t)
        if v is not None and d <= final_to:
            s = sums[d.strftime('%Y-%m')]
            s[0] += v * h
            s[1] += h
    months = sorted(sums)
    return months, [round(sums[m][0] / sums[m][1], 1) for m in months], sums


def hvdc_recent(day):
    """The latest months' average transfer north, past the last month with final data: calculated estimates from dispatch
    data (hvdc.estimate) until the EA publishes the metered flows. Ranked against every month and 3 months in a row."""
    final_to = local(fetch('records.json')['final_to']['hvdc'])
    sums = defaultdict(lambda: [0.0, 0.0])
    for t, h, v in zip(day['t'], day['h'], day['hvdcN']):
        if v is not None:
            s = sums[local(t).strftime('%Y-%m')]
            s[0] += v * h
            s[1] += h
    ms = sorted(sums)
    avg = {m: sums[m][0] / sums[m][1] for m in ms}
    whole = ms[:-1]   # the last month is still running
    last_day = local(day['t'][-1]).strftime('%d %b %Y')
    three = {ms[i + 2]: sum(sums[m][0] for m in ms[i:i + 3]) / sum(sums[m][1] for m in ms[i:i + 3]) for i in range(len(whole) - 2)}
    end = whole[-1]
    return {
        'months': {m: (round(avg[m]), 'estimate' if m > final_to.strftime('%Y-%m') else 'metered') for m in ms[-6:]},
        'running_month_to': last_day,
        'three_to_' + end: round(three[end]),
        'last_three_above': max((e for e, v in three.items() if v > three[end] and e != end), default=None),
        'running_month_beats_every_whole_month_since': max((m for m in whole if avg[m] > avg[ms[-1]]), default=None),
        'month_ranks_since_2013_06': [(m, round(avg[m])) for m in sorted((m for m in whole if m >= '2013-06'), key=lambda m: -avg[m])[:6]],
    }


def peaks(day):
    best = defaultdict(float)
    for t, v in zip(day['t'], day['peak']['NZ']['metered']):
        y = local(t).year
        if v and y >= FIRST_YEAR and v > best[y]:   # year first, so a year before FIRST_YEAR never gets a 0 entry
            best[y] = v
    years = sorted(best)
    return years, [int(best[y]) for y in years]


def christmas():
    months = [fetch(f'hh/{m}.json') for m in ('2025-12', '2026-01')]
    a, b = [int(w.timestamp() * 1000) for w in WINDOW]
    rows = []
    for m in months:
        assert m['step'] == 1800000
        rows += [(m, i) for i in range(m['N']) if a <= m['t0'] + i * m['step'] < b]
    at = lambda f: [f(m, i) for m, i in rows]
    both = lambda k: at(lambda m, i: sum(m[isl][k][i] or 0 for isl in ISLANDS))
    out = {'t0': a, 'step': 1800000,
           'fuels': {k: [round(v) for v in both(k)] for k in STACK},
           'demand': [round(v) for v in both('metered')],
           'price': [round(v, 2) for v in at(lambda m, i: m['SI']['price'][i])],
           'hay': [round(v, 2) for v in at(lambda m, i: m['NI']['price'][i])]}
    assert len(out['demand']) == (b - a) / 1800000
    return out


def main():
    day, rec = fetch('day.json'), fetch('records.json')
    J, F = {}, {}

    F['trading_periods'] = int(sum(day['h']) * 2)
    names = {p['name'] for p in day['plants']}
    F['plants'] = len(names | set(day['oemb']['named']))   # Teviot joins as a plant from the fill
    F['history_to'] = stamp(day['meta']['end'])
    J['stats'] = {'tps': F['trading_periods'], 'plants': F['plants']}

    J['years'], J['mix'], gwh = mix(day)
    F['geo'] = {y: round(gwh[y]['geo']) for y in (1998, 2025)}
    F['wind_1998'], F['solar_1998'] = gwh[1998]['wind'], gwh[1998]['solar'] + gwh[1998]['roof']
    F['wind_grid_solar_2025'] = round(gwh[2025]['wind'] + gwh[2025]['solar'])
    F['2025'] = {k: round(gwh[2025][k]) for k in ('wind', 'solar', 'roof', 'oemb', 'hydro', 'coal')}
    F['all_2025'] = round(sum(gwh[2025][k] for ks in MIX.values() for k in ks))
    gas = {y: gwh[y]['gas'] for y in J['years']}
    gas_peak = max(gas, key=gas.get)
    F['gas'] = {'peak_year': gas_peak, 'peak': round(gas[gas_peak]), '2025': round(gas[2025])}
    hydro = {y: gwh[y]['hydro'] / sum(gwh[y][k] for ks in MIX.values() for k in ks) for y in J['years']}
    F['hydro_share'] = {'lowest': min(round(v * 100, 1) for v in hydro.values()),
                        'highest': max(round(v * 100, 1) for v in hydro.values()), '2025': round(hydro[2025] * 100, 1)}

    ms, means, sums = hvdc_months(day)
    F['hvdc_top_months'] = sorted(zip(means, ms), reverse=True)[:4]
    three = [(round(sum(sums[m][0] for m in ms[i:i + 3]) / sum(sums[m][1] for m in ms[i:i + 3]), 1), ms[i], ms[i + 2])
             for i in range(len(ms) - 2)]
    F['hvdc_top_three_months'] = sorted(three, reverse=True)[:3]
    best = {}   # each year's highest three months in a row, by the year they start in
    for v, first, _ in three:
        y = int(first[:4])
        if v > best.get(y, (-1e9,))[0]:
            best[y] = (v, first)
    J['hvdc_months'], J['hvdc_monthly'] = ms, [round(v) for v in means]   # the monthly line, Feb-Apr 1998 shaded
    F['hvdc_recent'] = hvdc_recent(day)
    F['hvdc_best3_next'] = sorted(((v, y) for y, (v, _) in best.items() if y != 1998), reverse=True)[:3]

    J['peak_years'], J['peaks'] = peaks(day)
    J['peak_record'] = [max(J['peaks'][:i + 1]) for i in range(len(J['peaks']))]   # the record at each year's end
    F['peak_record_steps'] = [(y, v) for i, (y, v) in enumerate(zip(J['peak_years'], J['peak_record']))
                              if not i or v > J['peak_record'][i - 1]]
    F['peak_top'] = sorted(zip(J['peaks'], J['peak_years']), reverse=True)[:3]
    d = rec['records']['demand_max']['NZ']
    F['demand_record'] = (d['v'], stamp(d['t']))

    J['xmas'] = c = christmas()
    F['xmas_price_max'] = {'Benmore': max(c['price']), 'Haywards': max(c['hay'])}
    run = rec['runs']['low_price_run']
    si = run['SI']
    start, hours = si['t'], si['v']
    F['run'] = {'SI': (hours, stamp(start), 'ends', stamp(start + hours * 3.6e6)), 'days': round(hours / 24, 2),
                'NZ': run['NZ']['top'][0][1], 'next_longest': (si['top'][1][1], stamp(si['top'][1][0]))}
    run_prices = [p for i, p in enumerate(c['price']) if start <= c['t0'] + i * c['step'] < start + hours * 3.6e6]
    F['run_at_1c'] = (sum(p == 0.01 for p in run_prices), len(run_prices))
    idx = [i for i in range(len(c['demand'])) if start <= c['t0'] + i * c['step'] < start + hours * 3.6e6]
    F['run_mean'] = {'demand': round(statistics.mean(c['demand'][i] for i in idx)),
                     'hydro': round(statistics.mean(c['fuels']['hydro'][i] for i in idx)),
                     'median_price': statistics.median(c['price'][i] for i in idx), 'n': len(idx)}
    gen = [sum(c['fuels'][k][i] for k in STACK if k != 'batt') for i in idx]
    F['run_mean']['hydro_share'] = round(100 * sum(c['fuels']['hydro'][i] for i in idx) / sum(gen), 1)

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(J, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(F, indent=1, ensure_ascii=False, default=str))
    print(f'built {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC; wrote {OUT}')


if __name__ == '__main__':
    main()
