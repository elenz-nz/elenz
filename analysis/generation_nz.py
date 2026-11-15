"""Figures and chart data for the article "Electricity generation in New Zealand"
(site/src/lib/articles/posts/electricity-generation-nz.svelte).

The article covers the latest 12 whole months of metered history (WINDOW), with calendar 2024 and 2025 for the
comparison with MBIE and the 12-month renewable share back to 1998 for the record.

Inputs:
  hist/day.json          daily history since 1 Aug 1997 (downloaded into data/articles/ if missing)
  hist/progress.json     the history job's state: embedded solar capacity by month (roof_mw)
  site/src/lib/tracker/capacity.json   installed capacity by fuel and island (ingest/capacity.py)

Sources follow the Tracker's fuels. Embedded solar (roof) is a calculated estimate, modelled. Other embedded generation
(oemb, from January 2009) is a calculated estimate from the EA's reconciliation data; its renewable part is hydro,
geothermal, wind and landfill gas (OEMB_REN in site/src/lib/tracker/oemb.js), and Ngāwhā's and Teviot's fill joins
their own fuel, as on the site. The renewable share counts geothermal, hydro, wind, grid and embedded solar, bioenergy
and that part of other embedded generation; waste heat, gas, the Huntly Rankines (coal/gas) and diesel are not
renewable (site/src/lib/tracker/fuels.js). Batteries store electricity rather than generate it, so they are left out.

Output: site/src/lib/articles/data/electricity-generation-nz.json, plus the figures quoted in the text, printed.

  python3 analysis/generation_nz.py    remove data/articles/hist/day.json and progress.json first to pick up newer data
"""
import json
import os
from collections import defaultdict
from datetime import date, datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'articles', 'hist')
CAPACITY = os.path.join(ROOT, 'site', 'src', 'lib', 'tracker', 'capacity.json')
OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'articles', 'data', 'electricity-generation-nz.json')
SITE = 'https://elenz.co.nz/data/history'
NZ = ZoneInfo('Pacific/Auckland')
ISLANDS = ('NI', 'SI')
WINDOW = (date(2025, 11, 1), date(2026, 10, 31))   # inclusive: the latest 12 whole months of metered history
YEARS = (2024, 2025)                                # calendar years compared with MBIE
MBIE = {2024: 85.5, 2025: 88.5}                     # MBIE, Energy in New Zealand 2026, renewable share of generation (%)

# the article's sources, in the order shown, each as (day.json fields, other embedded fuels)
SOURCES = {
    'hydro': (['hydro'], []),
    'geo': (['geo'], []),
    'wind': (['wind'], []),
    'solar': (['solar'], []),          # grid solar
    'roof': (['roof'], []),            # embedded solar, a calculated estimate
    'gas': (['gas'], []),
    'coal': (['coal'], []),            # the Huntly Rankines, coal/gas
    'diesel': (['diesel'], []),
    'bio': (['bio'], []),
    'waste': (['waste'], []),
    'oemb': ([], ['hydro', 'geo', 'wind', 'bio', 'gas', 'diesel', 'other']),   # other embedded generation
}
REN_FIELDS = {'hydro', 'geo', 'wind', 'solar', 'roof', 'bio'}
OEMB_REN = {'hydro', 'geo', 'wind', 'bio'}
NAMED = {'Ngāwhā': 'geo', 'Teviot': 'hydro'}       # their fill joins the plant's fuel, as in oemb.js
CAP_FUELS = {'hydro': ['hydro'], 'geo': ['geo'], 'wind': ['wind'], 'solar': ['solar'], 'gas': ['gas'],
             'coal': ['coal'], 'diesel': ['diesel'], 'bio': ['bio', 'waste']}


def fetch(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urlopen(Request(f'{SITE}/{name}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=300) as r:
            body = r.read()
        with open(path, 'wb') as f:
            f.write(body)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def local(ms):
    return datetime.fromtimestamp(ms / 1000, NZ).date()


def daily(day):
    """GWh by (day, island, source), and the renewable GWh by (day, island)."""
    gwh = defaultdict(float)
    ren = defaultdict(float)
    oe = day['oemb']
    for i, t in enumerate(day['t']):
        d = local(t)
        h = day['h'][i] / 1000
        for isl in ISLANDS:
            for src, (fields, ofuels) in SOURCES.items():
                for k in fields:
                    v = (day[isl][k][i] or 0) * h
                    gwh[d, isl, src] += v
                    if k in REN_FIELDS:
                        ren[d, isl] += v
                for f in ofuels:
                    s = oe[isl].get(f)
                    v = max(0, (s[i] or 0) if s else 0) * h
                    gwh[d, isl, src] += v
                    if f in OEMB_REN:
                        ren[d, isl] += v
        for name, fuel in NAMED.items():
            s = oe['named'].get(name)
            v = max(0, (s[i] or 0) if s else 0) * h
            isl = 'NI' if fuel == 'geo' else 'SI'
            gwh[d, isl, fuel] += v
            ren[d, isl] += v
    return gwh, ren


def total(gwh, keep):
    out = defaultdict(float)
    for (d, isl, src), v in gwh.items():
        if keep(d, isl):
            out[src] += v
    return out


def gwh_isl(gwh, isl, src):
    return sum(v for (d, i, s), v in gwh.items() if i == isl and s == src and in_window(d))


def in_window(d):
    return WINDOW[0] <= d <= WINDOW[1]


def capacity_at(cap, fuels, when, isl=None):
    """Installed MW of these fuels on a date, from capacity.json's steps."""
    ms = datetime(when.year, when.month, when.day, tzinfo=NZ).timestamp() * 1000
    mw = 0.0
    for i in ISLANDS if isl is None else (isl,):
        for f in fuels:
            last = 0.0
            for t, v in cap['steps'][i].get(f, []):
                if t <= ms:
                    last = v
            mw += last
    return mw


def capacity_mwh(cap, fuels, days, hours):
    return sum(capacity_at(cap, fuels, d) * hours[d] for d in days)


def roof_mw(progress, when):
    return progress['roof_mw'][f'{when.year}-{when.month:02d}']


def main():
    day = fetch('day.json')
    progress = fetch('progress.json')
    with open(CAPACITY, encoding='utf-8') as f:
        cap = json.load(f)
    gwh, ren = daily(day)
    hours = {local(t): h for t, h in zip(day['t'], day['h'])}
    days = sorted(d for d in hours if in_window(d))
    assert len(days) == (WINDOW[1] - WINDOW[0]).days + 1, 'the window runs past the history'
    print(f'Window {WINDOW[0]} to {WINDOW[1]}: {len(days)} days')

    # the mix over the window
    mix = total(gwh, lambda d, isl: in_window(d))
    tot = sum(mix.values())
    rsum = sum(v for (d, isl), v in ren.items() if in_window(d))
    print(f'\nTotal {tot:,.0f} GWh ({tot / 1000:.1f} TWh); renewable {100 * rsum / tot:.1f}%')
    for src, v in sorted(mix.items(), key=lambda kv: -kv[1]):
        print(f'  {src:7s} {v:8,.0f} GWh  {100 * v / tot:5.1f}%')
    fossil = mix['gas'] + mix['coal'] + mix['diesel']
    print(f'  gas, coal/gas and diesel together {fossil:,.0f} GWh, {100 * fossil / tot:.1f}%')
    big3 = mix['hydro'] + mix['geo'] + mix['wind']
    print(f'  hydro, geothermal and wind together {big3:,.0f} GWh, {100 * big3 / tot:.1f}%')
    print(f'  embedded solar and other embedded generation together {100 * (mix["roof"] + mix["oemb"]) / tot:.1f}%')
    print(f'  South Island share of hydro {100 * gwh_isl(gwh, "SI", "hydro") / mix["hydro"]:.1f}%; '
          f'North Island share of wind {100 * gwh_isl(gwh, "NI", "wind") / mix["wind"]:.1f}%; diesel {mix["diesel"]:.2f} GWh')
    print(f'  solar, grid and embedded {mix["solar"] + mix["roof"]:,.0f} GWh, '
          f'{100 * (mix["solar"] + mix["roof"]) / tot:.1f}%; embedded is {100 * mix["roof"] / (mix["solar"] + mix["roof"]):.0f}% of it')

    # islands
    isl_mix = {isl: total(gwh, lambda d, i, isl=isl: in_window(d) and i == isl) for isl in ISLANDS}
    for isl in ISLANDS:
        t = sum(isl_mix[isl].values())
        r = sum(v for (d, i), v in ren.items() if in_window(d) and i == isl)
        print(f'\n{isl}: {t:,.0f} GWh, {100 * t / tot:.1f}% of NZ; renewable {100 * r / t:.1f}%')
        for src, v in sorted(isl_mix[isl].items(), key=lambda kv: -kv[1]):
            if v > 0.5:
                print(f'  {src:7s} {v:8,.0f} GWh  {100 * v / t:5.1f}%')

    # the largest stations
    plants = []
    idx = [i for i, t in enumerate(day['t']) if in_window(local(t))]
    for p in day['plants']:
        s = p['s']
        plants.append((sum((s[i] or 0) * day['h'][i] for i in idx if i < len(s)) / 1000, p['name'], p['fuel'], p['isl']))
    plants.sort(reverse=True)
    print('\nLargest stations:')
    for v, name, fuel, isl in plants[:6]:
        print(f'  {name:16s} {fuel:6s} {isl} {v:7,.0f} GWh  {100 * v / tot:4.1f}% of NZ')
    top5 = sum(v for v, *_ in plants[:5])
    print(f'  the five largest together {100 * top5 / tot:.1f}%')

    # capacity on the window's last day, and capacity factors over the window
    end = WINDOW[1]
    caps = {src: capacity_at(cap, fuels, end) for src, fuels in CAP_FUELS.items()}
    caps['roof'] = roof_mw(progress, end)
    capsum = sum(caps.values())
    print(f'\nInstalled capacity on {end} (batteries left out): {capsum:,.0f} MW')
    cf = {}
    for src, fuels in CAP_FUELS.items():
        e = sum(mix[k] for k in (['bio', 'waste'] if src == 'bio' else [src]))
        cmwh = capacity_mwh(cap, fuels, days, hours)
        cf[src] = 100 * e * 1000 / cmwh
    roof_cmwh = sum(roof_mw(progress, d) * hours[d] for d in days)
    cf['roof'] = 100 * mix['roof'] * 1000 / roof_cmwh
    for src in caps:
        print(f'  {src:7s} {caps[src]:7,.0f} MW  {100 * caps[src] / capsum:5.1f}% of capacity; capacity factor {cf[src]:4.0f}%')
    print(f'  solar, grid and embedded {100 * (caps["solar"] + caps["roof"]) / capsum:.1f}% of capacity; '
          f'gas, coal/gas and diesel {100 * (caps["gas"] + caps["coal"] + caps["diesel"]) / capsum:.1f}%')
    batt = capacity_at(cap, ['batt'], end)
    batt_d = sum((day[isl]['batt_d'][i] or 0) * day['h'][i] for isl in ISLANDS for i in idx) / 1000
    print(f'  batteries {batt:,.0f} MW, discharged {batt_d:,.0f} GWh over the window')

    # month by month through the window
    months = []
    m = WINDOW[0]
    while m <= WINDOW[1]:
        months.append(m)
        m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    monthly = {src: [] for src in SOURCES}
    ren_m = []
    for m in months:
        mm = total(gwh, lambda d, isl, m=m: (d.year, d.month) == (m.year, m.month))
        for src in SOURCES:
            monthly[src].append(round(mm[src], 3))
        r = sum(v for (d, i), v in ren.items() if (d.year, d.month) == (m.year, m.month))
        ren_m.append(round(100 * r / sum(mm.values()), 1))
    solar_m = [monthly['solar'][j] + monthly['roof'][j] for j in range(len(months))]
    print(f'\nSolar by month (GWh): ' + ', '.join(f'{m:%b} {v:,.0f}' for m, v in zip(months, solar_m)))
    print('\nMonth by month (GWh):')
    for j, m in enumerate(months):
        row = ', '.join(f'{src} {monthly[src][j]:,.0f}' for src in ('hydro', 'geo', 'wind', 'solar', 'roof', 'gas', 'coal'))
        print(f'  {m:%b %Y}: renewable {ren_m[j]}%; {row}')

    # calendar years against MBIE, and the change from 2025 to the window
    years = {}
    for y in YEARS:
        ym = total(gwh, lambda d, isl, y=y: d.year == y)
        t = sum(ym.values())
        r = sum(v for (d, i), v in ren.items() if d.year == y)
        years[y] = {'gwh': t, 'ren': 100 * r / t, 'mix': ym}
        print(f'\n{y}: {t:,.0f} GWh, renewable {100 * r / t:.1f}% (MBIE {MBIE[y]}%)')
    print('\nCalendar 2025 against the window (GWh):')
    for src in SOURCES:
        y = years[2025]['mix'][src]
        print(f'  {src:7s} {y:8,.0f} -> {mix[src]:8,.0f}  {mix[src] - y:+8,.0f}')
    s25 = years[2025]['mix']['solar'] + years[2025]['mix']['roof']
    print(f'  solar, grid and embedded {s25:,.0f} -> {mix["solar"] + mix["roof"]:,.0f}  {mix["solar"] + mix["roof"] - s25:+,.0f}')
    up = sum(mix[k] - years[2025]['mix'][k] for k in ('hydro', 'geo', 'wind', 'solar', 'roof'))
    down = sum(years[2025]['mix'][k] - mix[k] for k in ('gas', 'coal'))
    print(f'  hydro, geothermal, wind and solar {up:+,.0f} (hydro {100 * (mix["hydro"] - years[2025]["mix"]["hydro"]) / up:.0f}% of it); '
          f'gas and coal/gas {-down:+,.0f}')

    # the HVDC link: net transfer north over the window (hvdcN, average MW each day)
    north = sum((v or 0) * h for t, h, v in zip(day['t'], day['h'], day['hvdcN']) if in_window(local(t))) / 1000
    north_days = sum(1 for t, v in zip(day['t'], day['hvdcN']) if in_window(local(t)) and (v or 0) > 0)
    print(f'\nHVDC: net {north:,.0f} GWh north over the window, {100 * north / sum(isl_mix["SI"].values()):.0f}% of the '
          f'South Island\'s generation; net northward on {north_days} of {len(days)} days')

    # the 12-month renewable share at each month end since July 1998, for the record
    mon = defaultdict(lambda: [0.0, 0.0])
    for (d, isl, src), v in gwh.items():
        mon[d.year, d.month][0] += v
    for (d, isl), v in ren.items():
        mon[d.year, d.month][1] += v
    keys = sorted(mon)
    roll = []
    for j in range(11, len(keys)):
        t = sum(mon[k][0] for k in keys[j - 11:j + 1])
        r = sum(mon[k][1] for k in keys[j - 11:j + 1])
        if date(*keys[j], 1) <= WINDOW[1]:
            roll.append((100 * r / t, keys[j]))
    best = max(roll)
    print('12-month renewable share, latest windows: ' + ', '.join(f'{v:.2f}% (to {k[0]}-{k[1]:02d})' for v, k in roll[-4:]))
    before = max(x for x in roll if x[1] < (WINDOW[0].year, WINDOW[0].month))   # windows ending before this one began
    pre2009 = max(x for x in roll if x[1] < (2009, 12))
    print(f'\n12-month renewable share: highest {best[0]:.1f}% (to {best[1]}); highest before the window '
          f'{before[0]:.1f}% (to {before[1]}); highest before other embedded generation was counted {pre2009[0]:.1f}% '
          f'(to {pre2009[1]})')
    monthly_share = sorted(((100 * mon[k][1] / mon[k][0], k) for k in keys if date(*k, 1) <= WINDOW[1] and k >= (1997, 8)),
                           reverse=True)
    print('Highest monthly renewable shares: ' + ', '.join(f'{v:.1f}% ({k[0]}-{k[1]:02d})' for v, k in monthly_share[:5]))
    fos = []
    for j in range(11, len(keys)):
        if date(*keys[j], 1) <= WINDOW[1]:
            f = sum(gwh[d, isl, s] for (d, isl, s) in gwh if s in ('gas', 'coal', 'diesel') and keys[j - 11] <= (d.year, d.month) <= keys[j])
            fos.append((f, keys[j]))
    fshare = []
    for j, (f, k) in enumerate(fos):
        t = sum(mon[q][0] for q in keys if keys[keys.index(k) - 11] <= q <= k)
        fshare.append((100 * f / t, k))
    print('12-month share of gas, coal/gas and diesel, lowest: ' + ', '.join(f'{v:.2f}% (to {k[0]}-{k[1]:02d})' for v, k in sorted(fshare)[:3]))
    print(f'12-month gas, coal/gas and diesel: highest {max(fos)[0]:,.0f} GWh (to {max(fos)[1]}), '
          f'lowest {min(fos)[0]:,.0f} GWh (to {min(fos)[1]})')

    out = {
        'about': 'Generated by analysis/generation_nz.py. Do not edit.',
        'window': [WINDOW[0].isoformat(), WINDOW[1].isoformat()],
        'total': round(tot, 1),
        'renewable': round(100 * rsum / tot, 1),
        'mix': {src: round(v, 3) for src, v in mix.items()},
        'islands': {isl: {src: round(v, 3) for src, v in isl_mix[isl].items()} for isl in ISLANDS},
        'capacity': {src: round(v, 3) for src, v in caps.items()},
        'cf': {src: round(v, 3) for src, v in cf.items()},
        'y2025': {src: round(v, 3) for src, v in years[2025]['mix'].items()},
        'months': [m.strftime('%b %Y') for m in months],
        'monthly': monthly,
        'ren_monthly': ren_m,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'\nWrote {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
