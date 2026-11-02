"""Embedded generation other than solar that the dispatch data doesn't see (1 Nov 2026).

For one month: the EA's reconciled injection (every trader at every connection point, metered) less the dispatch
data's generation at the same connection point. Injection series that are solar-shaped (under 5% of their energy
between 9 pm and 5 am) are left out, as are dispatched solar units, so what is left is non-solar generation the live
week shows only as lower demand. Points whose non-solar injection is all on a generator's own network (grid-connected
stations: differences there are block dispatch and terminal-vs-connection metering, not missing plant) and Glenbrook
(its meter runs ~1.45 x dispatch) are reported but left out of the total.

Fuel split: known plants by point (KNOWN), otherwise the point's distributed generation registry capacity by fuel
(EMI report GUEHMT, Root NSP, less dispatched plant at that point) weighted by a typical capacity factor.

  python3 analysis/embedded_other.py YYYY-MM [cache dir]

Downloads the month's latest reconciliation revision, its daily dispatch files (~11 MB a day) and GUEHMT by fuel
into the cache dir (default data/raw/embedded_other), then prints the total, its daily shape and fuel split, and
writes <cache>/<YYYYMM>_points.csv. Development only. Results in analysis/README.md.
"""
import io
import os
import re
import sys
import tomllib
import urllib.request

import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), '..')
BLOB = 'https://emidatasets.blob.core.windows.net/publicdata'
GUEHMT = ('https://www.emi.ea.govt.nz/Retail/Download/DataReport/CSV/GUEHMT?DateFrom={d0}&DateTo={d1}'
          '&RegionType=NSP_ROOT&FuelType={fuel}&MarketSegment=All&Capacity=All_Total&seriesFilter=ALL')
# reconciliation networks that belong to generators (their grid-connected stations), not to local networks
GEN_NETWORKS = {'MERI', 'CTCT', 'MRPL', 'GENE', 'NAPJ', 'TAOM', 'TODD', 'WPWF', 'KRGL', 'TUAR', 'CHHE', 'NZST', 'KIWI', 'RUAK'}
SKIP = {'GLN0332'}   # Glenbrook: metered ~1.45 x dispatch (a known difference, not a missing plant)
# GUEHMT fuel -> key, and a typical capacity factor for weighting a point's mix
FUELS = {'wind': ('wind', 0.33), 'fresh water': ('hydro', 0.5), 'geothermal': ('geo', 0.9), 'other': ('other', 0.5),
         'natural gas': ('gas', 0.5), 'industrial proc': ('industrial', 0.5), 'liquid fuel': ('diesel', 0.02)}
# points whose residual is known plant (the registry files some of them under "other")
KNOWN = {
    'KOE1101': 'geo',      # Ngāwhā's original units (only Ngāwhā B is dispatched)
    'CYD0331': 'hydro',    # Teviot and other Pioneer hydro at Clyde
    'HWB0331': 'hydro',    # Waipori stations not in dispatch
    'KUM0661': 'hydro',    # Kūmara scheme beyond the dispatched unit
    'NMA0331': 'hydro',    # Pioneer injection beside White Hill
    'CML0331': 'hydro',    # Roaring Meg
    'SVL0331': 'biogas',   # flat output sold through Contact: landfill gas (Silverdale)
    'TAK0331': 'biogas',   # landfill gas (Takapu Road)
    'BOB1101': 'biogas',   # landfill gas (Bombay; the registry says natural gas)
}


def get(url, path):
    if not os.path.exists(path):
        with urllib.request.urlopen(url, timeout=600) as r:
            data = r.read()
        with open(path, 'wb') as f:
            f.write(data)
    return path


def unit_fuels():
    reg = pd.read_csv(os.path.join(ROOT, 'facilities', 'plant_register.csv'), dtype=str)
    fuel = {(r.PointOfConnectionCode, r.UnitCode): r.Fuel for r in reg.itertuples()}
    with open(os.path.join(ROOT, 'facilities', 'overrides.toml'), 'rb') as f:
        for k, v in tomllib.load(f)['units'].items():
            fuel[tuple(k.split())] = v['fuel'].capitalize()
    return fuel, reg


def main():
    month = sys.argv[1]
    tag = month.replace('-', '')
    cache = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'data', 'raw', 'embedded_other')
    os.makedirs(cache, exist_ok=True)
    days = pd.date_range(month + '-01', periods=pd.Period(month, 'M').days_in_month)
    hours = len(days) * 24

    # reconciled injection, latest revision
    listing = urllib.request.urlopen(f'{BLOB}?restype=container&comp=list&prefix=Datasets/Wholesale/Volumes/Reconciliation/'
                                     f'{month[:4]}/ReconciledInjectionAndOfftake_{tag}_', timeout=60).read().decode()
    name = sorted(re.findall(r'<Name>([^<]+)</Name>', listing))[-1]
    x = pd.read_csv(get(f'{BLOB}/{name}', os.path.join(cache, os.path.basename(name))))
    inj = x[x.FlowDirection == 'Injection'].copy()
    inj['h'] = inj.TradingPeriodStartTime.str[:2].astype(int)
    key = ['PointOfConnection', 'Network', 'Participant']
    tot = inj.groupby(key).KilowattHours.sum()
    night = inj[(inj.h <= 4) | (inj.h >= 21)].groupby(key).KilowattHours.sum().reindex(tot.index).fillna(0)
    s = pd.DataFrame({'gwh': tot / 1e6, 'night': (night / tot.replace(0, np.nan)).fillna(1)}).reset_index()
    s['solar'] = s.night < 0.05
    s['gen_net'] = s.Network.isin(GEN_NETWORKS)
    ns = s[~s.solar]

    # dispatch generation by point, non-solar units only
    fuel, reg = unit_fuels()
    parts = []
    for d in days:
        f = f'{d:%Y%m%d}_DispatchNodalPricesAndVolumes.csv'
        p = get(f'{BLOB}/Datasets/Wholesale/DispatchAndPricing/NodalPricesAndVolumes/{d:%Y}/{f}', os.path.join(cache, f))
        dd = pd.read_csv(p, usecols=['TradingDate', 'TradingPeriodNumber', 'PointOfConnectionCode', 'UnitCode', 'GenerationMegawatts'])
        dd = dd[dd.UnitCode != 'N/A']
        parts.append(dd.groupby(['TradingDate', 'TradingPeriodNumber', 'PointOfConnectionCode', 'UnitCode']).GenerationMegawatts.mean().reset_index())
    disp = pd.concat(parts)
    disp = disp[[fuel.get((p, u), '') != 'Solar' for p, u in zip(disp.PointOfConnectionCode, disp.UnitCode)]]
    disp_total = disp.GenerationMegawatts.sum() / 2000

    t = pd.DataFrame({'recon': ns.groupby('PointOfConnection').gwh.sum(),
                      'disp': disp.groupby('PointOfConnectionCode').GenerationMegawatts.sum() / 2000}).fillna(0)
    grid = ns.groupby('PointOfConnection').gen_net.all()
    t['grid'] = grid.reindex(t.index).fillna(False) | ((t.recon == 0) & (t.disp > 0))
    t['resid'] = t.recon - t.disp
    use = t[~t.grid & (t.resid > 0) & ~t.index.isin(SKIP)]

    # registry capacity by fuel at each point, less dispatched plant there
    caps = []
    d0, d1 = f'{days[0]:%Y%m%d}', f'{days[-1]:%Y%m%d}'
    for g, (k, _) in FUELS.items():
        raw = open(get(GUEHMT.format(d0=d0, d1=d1, fuel=g.replace(' ', '%20')), os.path.join(cache, f'guehmt_{tag}_{k}.csv')),
                   encoding='utf-8-sig').read().splitlines()
        head = next(i for i, line in enumerate(raw) if line.startswith('Month end,'))
        c = pd.read_csv(io.StringIO('\n'.join(raw[head:])))
        c = c[pd.to_datetime(c['Month end'], dayfirst=True) == pd.to_datetime(c['Month end'], dayfirst=True).max()]
        caps.append(c.groupby(c['Region ID'].str[:7])['Total capacity installed (MW)'].sum().rename(k))
    cap = pd.concat(caps, axis=1).fillna(0)
    now = reg[reg.EffectiveEndDate.str.startswith('9999')].copy()
    now['k'] = now.Fuel.map({'Hydro': 'hydro', 'Wind': 'wind', 'Geothermal': 'geo', 'Gas': 'gas'})
    now['mw'] = pd.to_numeric(now.NameplateMegawatts, errors='coerce')
    dcap = now.dropna(subset=['k']).groupby(['PointOfConnectionCode', 'k']).mw.sum().unstack(fill_value=0)
    rem = cap.sub(dcap.reindex(index=cap.index, columns=cap.columns).fillna(0)).clip(lower=0)
    cf = pd.Series({k: v for k, v in FUELS.values()})

    split = {}
    use = use.copy()
    use['fuel'] = ''
    for p, r in use.resid.items():
        if p in KNOWN:
            split[KNOWN[p]] = split.get(KNOWN[p], 0) + r
            use.loc[p, 'fuel'] = KNOWN[p]
            continue
        w = rem.reindex([p]).fillna(0).iloc[0] * cf
        if w.sum() == 0:
            split['unknown'] = split.get('unknown', 0) + r
            use.loc[p, 'fuel'] = 'unknown'
            continue
        for k, v in (w / w.sum() * r).items():
            split[k] = split.get(k, 0) + v
        use.loc[p, 'fuel'] = 'registry: ' + ', '.join(f'{k} {v:.0f}' for k, v in (w / w.sum() * 100).items() if v >= 5) + '%'

    total = use.resid.sum()
    print(f'{month}: {total:.1f} GWh, {total * 1000 / hours:.0f} MW average, {100 * total / disp_total:.1f}% of dispatched '
          f'generation ({disp_total:.0f} GWh), at {len(use)} points; {use[use.disp == 0].resid.sum():.1f} GWh at points with no dispatched unit')
    for p in sorted(SKIP):
        if p in t.index:
            print(f'  left out: {p} metered {t.recon[p]:.1f} GWh, dispatched {t.disp[p]:.1f} GWh')
    print('  by fuel (GWh):', {k: round(v, 1) for k, v in sorted(split.items(), key=lambda kv: -kv[1])})

    # daily shape: injection at the points used, less dispatch there, by hour of day
    ii = inj.set_index(key)
    ii = ii[ii.index.get_level_values(0).isin(use.index) & ii.index.isin(ns.set_index(key).index)].reset_index()
    hh = ii.groupby(['TradingDate', 'TradingPeriod']).KilowattHours.sum() / 500
    dd = disp[disp.PointOfConnectionCode.isin(use.index)].groupby(['TradingDate', 'TradingPeriodNumber']).GenerationMegawatts.sum()
    dd.index.names = hh.index.names
    hh = hh.sub(dd, fill_value=0).reset_index(name='mw')
    print('  MW by hour of day:', hh.groupby((hh.TradingPeriod - 1) // 2).mw.mean().round().astype(int).tolist())
    print('  largest points (GWh):', use.resid.sort_values(ascending=False).head(10).round(1).to_dict())

    out = os.path.join(cache, f'{tag}_points.csv')
    use.assign(mw=use.resid * 1000 / hours).round(3).to_csv(out)
    print('  wrote', out)


if __name__ == '__main__':
    main()
