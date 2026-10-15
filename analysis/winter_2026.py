"""Figures and chart data for the article "Winter 2026" (site/src/lib/articles/posts/winter-2026.svelte).

Winter is 1 June to 31 August. Winter 2026 is compared with the five winters before it (2021-2025); a "record" in
the article means the highest or lowest of those six winters. All figures are half-hourly.

Inputs (downloaded into data/articles/ if missing):
  hist/hh/YYYY-MM.json   the site's half-hourly history (https://elenz.elenz.workers.dev/data/history/hh/...)
  hvdc/YYYYMM.csv        EMI Metered_data/HVDC_Flows, used for every HVDC figure (the site's history for 2022-2026
                         carried the older island-balance estimate while the BUILD 4 rebuild was under way)

Output: site/src/lib/articles/data/winter-2026.json, plus the figures quoted in the text, printed.

  python3 analysis/winter_2026.py
"""
import glob, json, os, sys
from urllib.request import urlopen

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'ingest'))
import hvdc  # noqa: E402

DATA = os.path.join(ROOT, 'data', 'articles')
OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'articles', 'data', 'winter-2026.json')
SITE = 'https://elenz.elenz.workers.dev/data/history'
EMI = 'https://emidatasets.blob.core.windows.net/publicdata/Datasets/Wholesale/Metered_data/HVDC_Flows'
NZ = 'Pacific/Auckland'
YEARS = list(range(2021, 2027))
GEN = ['geo', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar']
REN = ['geo', 'hydro', 'wind', 'solar']
SCHEMES = {  # the main schemes in facilities/overrides.toml [hydro_schemes], with each scheme's island (the small
    # Waipori and Rangitaiki schemes are left out)
    'Waitaki': 'SI', 'Manapōuri': 'SI', 'Clutha': 'SI', 'Tekapo': 'SI',
    'Waikato': 'NI', 'Tongariro': 'NI', 'Waikaremoana': 'NI'}


def fetch(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urlopen(url, timeout=120) as r, open(path, 'wb') as f:
            f.write(r.read())


def months():
    return [f'{y}-{m:02d}' for y in range(2020, 2027) for m in range(1, 13) if '2020-09' <= f'{y}-{m:02d}' <= '2026-08']


def load_history():
    frames, plants = [], {}
    for m in months():
        p = os.path.join(DATA, 'hist', 'hh', f'{m}.json')
        fetch(f'{SITE}/hh/{m}.json', p)
        d = json.load(open(p))
        idx = pd.to_datetime(d['t0'] + np.arange(d['N']) * d['step'], unit='ms', utc=True).tz_convert(NZ)
        frames.append(pd.DataFrame({f'{i}_{k}': v for i in ('NI', 'SI') for k, v in d[i].items()}, index=idx))
        for q in d['plants']:
            plants.setdefault((q['name'], q['fuel'], q['isl']), []).append(pd.Series(q['s'], index=idx[:len(q['s'])]))
    df = pd.concat(frames).sort_index()
    df = df[~df.index.duplicated()]
    for k in GEN + ['batt', 'metered', 'tiwai']:
        df[f'NZ_{k}'] = df[f'NI_{k}'] + df[f'SI_{k}']
    P = pd.DataFrame({k: pd.concat(v) for k, v in plants.items()}).reindex(df.index)
    return df, P


def load_hvdc():
    out = []
    for m in months() + ['2020-01', '2020-06', '2020-07', '2020-08']:
        p = os.path.join(DATA, 'hvdc', m.replace('-', '') + '.csv')
        try:
            fetch(f"{EMI}/{m.replace('-', '')}_HVDC_flows.csv", p)
        except Exception:
            continue
        out.append(hvdc.parse_metered(open(p, 'rb').read()))
    h = pd.concat(out).sort_index()
    h = h[~h.index.duplicated()]
    h.index = h.index.tz_convert(NZ)
    return (h['H|BEN'] + h['H|HAY']) / 2


def winter(idx, y):
    return (idx.year == y) & idx.month.isin([6, 7, 8])


def gwh(s):
    return float(s.sum()) / 2 / 1000


def main():
    df, P = load_history()
    hv = load_hvdc()
    F = {}  # figures quoted in the text
    J = {'years': YEARS}

    inw = np.zeros(len(df), bool)
    for y in YEARS:
        inw |= winter(df.index, y)
    W = df[inw]  # every half-hour of the six winters

    # ---- demand: distinct peaks (one per morning and one per evening) across the six winters
    s = W.NZ_metered
    g = s.groupby([s.index.date, s.index.hour < 12]).agg(['max', 'idxmax']).sort_values('max', ascending=False).head(12)
    J['peaks'] = [{'t': r['idxmax'].strftime('%-d %b %Y, %-I:%M %p').replace('AM', 'am').replace('PM', 'pm'),
                   'y': r['idxmax'].year, 'mw': int(r['max'])} for _, r in g.iterrows()]
    F['peaks'] = J['peaks'][:10]
    F['halfhours_7000'] = {y: int((s[s.index.year == y] >= 7000).sum()) for y in YEARS}
    F['peak_NI'] = (int(W.NI_metered.max()), str(W.NI_metered.idxmax()))
    F['peak_SI'] = (int(W.SI_metered.max()), str(W.SI_metered.idxmax()))
    for k in ('NZ_hydro', 'SI_hydro', 'NZ_batt', 'NZ_wind', 'NZ_solar'):
        F[f'max_{k}'] = (int(W[k].max()), str(W[k].idxmax()))
    xt = s - W.SI_tiwai
    F['peak_ex_tiwai'] = (int(xt.max()), str(xt.idxmax()))
    morning = {}
    for y in YEARS:
        w = s[winter(s.index, y)]
        pk = w.groupby(w.index.date).idxmax()
        morning[y] = round(100 * float(np.mean([t.hour < 12 for t in pk])))
    J['morning'] = [morning[y] for y in YEARS]
    F['winter_peak'] = {y: int(s[winter(s.index, y)].max()) for y in YEARS}
    F['winter_demand_gwh'] = {y: round(gwh(s[winter(s.index, y)])) for y in YEARS}
    J['demand_gwh'] = [F['winter_demand_gwh'][y] for y in YEARS]

    # ---- the cold snap: Mon 3 to Sat 8 Aug 2026, half-hourly
    c = df['2026-08-03':'2026-08-08']
    J['snap'] = {'t0': int(c.index[0].timestamp() * 1000), 'step': 1800000,
                 'fuels': {k: [int(round(v)) for v in c[f'NZ_{k}'].clip(lower=0)] for k in GEN + ['batt']},
                 'demand': [int(v) for v in c.NZ_metered], 'price': [round(float(v), 2) for v in c.NI_price]}
    at = df.loc['2026-08-06 07:30']
    F['at_peak'] = {k: int(at[f'NZ_{k}']) for k in GEN + ['batt', 'metered']}
    F['at_peak'].update({'NI_hydro': int(at.NI_hydro), 'SI_hydro': int(at.SI_hydro), 'HAY': float(at.NI_price), 'BEN': float(at.SI_price)})
    F['snap_hay_max'] = (float(c.NI_price.max()), str(c.NI_price.idxmax()))
    F['snap_thermal_max'] = int((c.NZ_coal + c.NZ_gas + c.NZ_diesel).max())

    # ---- generation mix and prices by winter
    mix, price = {k: [] for k in GEN}, {'HAY': [], 'BEN': []}
    for y in YEARS:
        w = df[winter(df.index, y)]
        for k in GEN:
            mix[k].append(round(gwh(w[f'NZ_{k}'].clip(lower=0))))
        price['HAY'].append(round(float(w.NI_price.mean()), 1))
        price['BEN'].append(round(float(w.SI_price.mean()), 1))
    J['mix'], J['price'] = mix, price
    tot = [sum(mix[k][i] for k in GEN) for i in range(len(YEARS))]
    F['renewable_pct'] = {y: round(100 * sum(mix[k][i] for k in REN) / tot[i], 1) for i, y in enumerate(YEARS)}
    F['mix'] = mix
    th = df.NZ_coal + df.NZ_gas + df.NZ_diesel
    F['thermal_days_under_200'] = {y: int((th[winter(th.index, y)].resample('D').mean() < 200).sum()) for y in YEARS}
    F['thermal_max'] = {y: int(th[winter(th.index, y)].max()) for y in YEARS}
    F['price'] = price
    F['hay_over_ben_10'] = {y: round(100 * float(((df.NI_price - df.SI_price)[winter(df.index, y)] > 10).mean()), 1) for y in YEARS}
    # what changed at each wind and geothermal plant, winter 2025 to winter 2026
    F['plants'] = {}
    for fuel in ('wind', 'geo'):
        rows = []
        for (name, f, isl) in P.columns:
            if f != fuel:
                continue
            x = P[(name, f, isl)]
            on = x[x > 0.5]
            g25, g26 = gwh(x[winter(x.index, 2025)]), gwh(x[winter(x.index, 2026)])
            rows.append((round(g26 - g25, 1), name, isl, str(on.index.min().date()) if len(on) else None, round(g25, 1), round(g26, 1),
                         int(x[winter(x.index, 2025)].fillna(0).max()), int(x[winter(x.index, 2026)].fillna(0).max())))
        F['plants'][fuel] = sorted(rows, reverse=True)[:5] + sorted(rows)[:3]
    F['si_wind_gwh'] = {y: round(gwh(df.SI_wind[winter(df.index, y)])) for y in YEARS}

    # ---- hydro by island and scheme
    J['hydro'] = {i: [round(gwh(df[f'{i}_hydro'][winter(df.index, y)])) for y in YEARS] for i in ('NI', 'SI')}
    plant_scheme = {}
    import tomllib
    for sch, names in tomllib.load(open(os.path.join(ROOT, 'facilities', 'overrides.toml'), 'rb'))['hydro_schemes'].items():
        for n in names:
            plant_scheme[n] = sch
    by = {sch: {y: 0.0 for y in YEARS} for sch in SCHEMES}
    for (name, fuel, isl) in P.columns:
        sch = plant_scheme.get(name)
        if fuel == 'hydro' and sch in by:
            for y in YEARS:
                by[sch][y] += gwh(P[(name, fuel, isl)][winter(P.index, y)])
    rows = []
    for sch, isl in SCHEMES.items():
        base = np.mean([by[sch][y] for y in range(2021, 2026)])
        rows.append({'name': sch, 'isl': isl, 'gwh': round(by[sch][2026]), 'base': round(base),
                     'pct': round(100 * (by[sch][2026] / base - 1), 1)})
    J['schemes'] = sorted(rows, key=lambda r: -r['pct'])

    # ---- HVDC (metered, mid-link)
    J['hvdc_net'] = [round(gwh(hv[winter(hv.index, y)])) for y in YEARS]
    J['hvdc_years'] = YEARS
    dur = {}
    for y in YEARS:
        x = np.sort(hv[winter(hv.index, y)].values)[::-1]
        # duration curve: the transfer reached or exceeded in c trading periods, sampled at ~200 values of c
        cs = sorted(set(np.linspace(1, len(x), 201).round().astype(int)))
        dur[y] = [int(round(x[c - 1])) for c in cs]
    J['hvdc_duration'] = dur
    J['hvdc_duration_tp'] = [int(c) for c in cs]   # every winter has 4,416 trading periods (92 days)
    F['hvdc'] = {y: {'net_gwh': round(gwh(hv[winter(hv.index, y)])),
                     'north_pct': round(100 * float((hv[winter(hv.index, y)] > 0).mean())),
                     'hh_1000': int((hv[winter(hv.index, y)] >= 1000).sum()),
                     'hh_900': int((hv[winter(hv.index, y)] >= 900).sum())} for y in YEARS}
    w26 = hv[winter(hv.index, 2026)]
    F['hvdc_days_no_south'] = int((w26.groupby(w26.index.date).min() > 0).sum())
    mo = hv['2021-01':].resample('MS').sum() / 2 / 1000  # every month since 2021
    F['hvdc_top_months'] = {str(k.date()): round(v) for k, v in mo.sort_values(ascending=False).head(4).items()}

    # ---- grid solar: monthly energy since Jan 2024, and when each farm first generated
    sol = df.NZ_solar['2024-01':]
    ms = sol.resample('MS').sum() / 2 / 1000
    J['solar_months'] = [{'m': k.strftime('%Y-%m'), 'gwh': round(float(v), 1), 'mw': int(sol[k.strftime('%Y-%m')].max())} for k, v in ms.items()]
    farms = []
    for (name, fuel, isl) in P.columns:
        if fuel != 'solar':
            continue
        x = P[(name, fuel, isl)]
        on = x[x > 0.5]
        if len(on):
            w = x[winter(x.index, 2026)]
            farms.append({'name': name, 'isl': isl, 'first': str(on.index.min().date()), 'max': int(x.max()), 'w26_gwh': round(gwh(w), 1)})
    J['farms'] = sorted(farms, key=lambda f: f['first'])
    F['solar_winter_gwh'] = {y: round(gwh(df.NZ_solar[winter(df.index, y)]), 1) for y in YEARS}
    F['solar_best'] = (int(df.NZ_solar.max()), str(df.NZ_solar.idxmax()))
    dd = df.NZ_solar.resample('D').sum() / 2
    F['solar_best_days_ever'] = {str(k.date()): round(float(v)) for k, v in dd.sort_values(ascending=False).head(6).items()}
    F['solar_best_day_before_winter'] = (round(float(dd[:'2026-05'].max())), str(dd[:'2026-05'].idxmax().date()))
    pre = df.NZ_solar[:'2026-05']
    F['solar_best_before_winter'] = (int(pre.max()), str(pre.idxmax()))
    d = W.NZ_solar.resample('D').sum() / 2
    F['solar_best_day_mwh'] = (round(float(d.max())), str(d.idxmax().date()))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(J, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(F, indent=1, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
