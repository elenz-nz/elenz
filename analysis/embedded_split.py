"""facilities/embedded_registry_split.csv: the fuel split of other embedded generation at grid exit points that
facilities/embedded_points.csv gives no fuel for (6 Nov 2026).

The EA's distributed generation registry (EMI report GUEHMT, by Root NSP and fuel) gives installed capacity on local
networks. At each grid exit point: its capacity by fuel at the latest month, less the dispatched plant the EA register
has there, weighted by a typical capacity factor, as shares. Solar is left out (embedded solar is modelled). The
registry starts in August 2013, so the one split serves every year. Refresh about once a year and commit the CSV.

  python3 analysis/embedded_split.py [YYYY-MM]   (default: last month)
"""
import csv
import io
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
from common import FACILITIES  # noqa: E402
from embedded_backtest import get  # noqa: E402

GUEHMT = ('https://www.emi.ea.govt.nz/Retail/Download/DataReport/CSV/GUEHMT?DateFrom={d0}&DateTo={d1}'
          '&RegionType=NSP_ROOT&FuelType={fuel}&MarketSegment=All&Capacity=All_Total&seriesFilter=ALL')
# registry fuel -> tracker fuel key, typical capacity factor (analysis/embedded_other.py)
FUELS = {'fresh water': ('hydro', 0.5), 'geothermal': ('geo', 0.9), 'wind': ('wind', 0.33),
         'natural gas': ('gas', 0.5), 'liquid fuel': ('diesel', 0.02), 'other': ('other', 0.5),
         'industrial proc': ('other', 0.5)}
REGISTER_FUEL = {'Hydro': 'hydro', 'Wind': 'wind', 'Geothermal': 'geo', 'Gas': 'gas', 'Diesel': 'diesel'}


def main():
    m = pd.Period(sys.argv[1] if len(sys.argv) > 1 else str(pd.Timestamp.today().to_period('M') - 1))
    d0, d1 = f'{m.start_time:%Y%m%d}', f'{m.end_time:%Y%m%d}'
    caps = []
    for name, (k, _) in FUELS.items():
        raw = get(GUEHMT.format(d0=d0, d1=d1, fuel=name.replace(' ', '%20'))).decode('utf-8-sig').splitlines()
        head = next(i for i, line in enumerate(raw) if line.startswith('Month end,'))
        c = pd.read_csv(io.StringIO('\n'.join(raw[head:])))
        when = pd.to_datetime(c['Month end'], dayfirst=True)
        c = c[when == when.max()]
        caps.append(c.groupby(c['Region ID'].str[:7])['Total capacity installed (MW)'].sum().rename(name))
    cap = pd.concat(caps, axis=1).fillna(0)
    reg = pd.read_csv(os.path.join(FACILITIES, 'plant_register.csv'), dtype=str)
    now = reg[reg.EffectiveEndDate.str.startswith('9999')].copy()
    now['k'] = now.Fuel.map(REGISTER_FUEL)
    now['mw'] = pd.to_numeric(now.NameplateMegawatts, errors='coerce')
    disp = now.dropna(subset=['k']).groupby(['PointOfConnectionCode', 'k']).mw.sum().unstack(fill_value=0)
    rows = []
    for poc, r in cap.iterrows():
        w = {}
        for name, (k, cf) in FUELS.items():
            mw = r[name] - (disp.loc[poc, k] if poc in disp.index and k in disp.columns and k != 'other' else 0)
            if mw > 0:
                w[k] = w.get(k, 0) + mw * cf
        total = sum(w.values())
        keep = {k: v for k, v in w.items() if total > 0 and v / total >= 0.01}
        kept = sum(keep.values())
        for k, v in sorted(keep.items()):
            rows.append({'poc': poc, 'fuel': k, 'share': round(v / kept, 3), 'month': str(m)})
    path = os.path.join(FACILITIES, 'embedded_registry_split.csv')
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['poc', 'fuel', 'share', 'month'])
        w.writeheader()
        w.writerows(rows)
    print('wrote', path, len({r['poc'] for r in rows}), 'points')


if __name__ == '__main__':
    main()
