"""Checks on the metered history (BUILD 6, Oct 2026): yearly generation by fuel against MBIE's published figures.

MBIE's net generation (Energy in New Zealand, electricity data tables, sheet 2) covers all generation, including
industrial cogeneration and small embedded plant the EA's metering doesn't see, so it runs above the tracker; the
check is that the gap is small and steady, with no jumps where the sources change (2009, when Generation_MD starts
covering embedded stations; Sep 2020, when dispatch data appears).

  python3 analysis/metered_check.py <history store dir> <MBIE electricity xlsx>

The store dir is a local history store (data/store/hist); the xlsx is MBIE's "Data tables for electricity" (also
on Figure.NZ as "Energy in New Zealand: Electricity").
"""
import glob
import json
import os
import sys

import numpy as np
import pandas as pd

store, xlsx = sys.argv[1:3]
FUELS = ['hydro', 'geo', 'wind', 'solar', 'coal', 'gas', 'diesel', 'bio', 'waste', 'batt']
rows = []
for f in sorted(glob.glob(os.path.join(store, 'dd', '*.json'))):
    d = json.load(open(f))
    h = np.array(d['h'])
    r = {'month': d['month']}
    for k in FUELS:
        r[k] = sum(float(np.dot(np.clip(np.array(d[i].get(k, [0] * len(h)), float), 0, None) if k == 'batt' else np.array(d[i].get(k, [0] * len(h)), float), h)) for i in ('NI', 'SI')) / 1e6
    r['roof'] = sum(float(np.dot(np.array(d[i].get('roof', [0] * len(h)), float), h)) for i in ('NI', 'SI')) / 1e6
    r['demand'] = sum(float(np.dot(np.array(d[i]['metered'], float), h)) for i in ('NI', 'SI')) / 1e6
    rows.append(r)
m = pd.DataFrame(rows)
m['year'] = m.month.str[:4].astype(int)
y = m.groupby('year').sum(numeric_only=True)
y['total'] = y[FUELS].sum(axis=1)

x = pd.read_excel(xlsx, '2 - Annual GWh', header=None)
years = x.iloc[8, 1:].tolist()
lab = {'Hydro': 'hydro', 'Geothermal': 'geo', 'Wind': 'wind', 'Solar3': 'solar', 'Coal': 'coal', 'Gas': 'gas', 'Oil': 'oil',
       'Wood': 'wood', 'Biogas': 'biogas', 'Waste Heat4': 'waste', 'Net Generation (GWh)1,2': 'total'}
mb = {}
for i in range(9, 22):
    name = str(x.iloc[i, 0]).strip()
    if name in lab:
        mb[lab[name]] = pd.Series(x.iloc[i, 1:].values, index=years)
mb = pd.DataFrame(mb)
mb = mb[[isinstance(v, (int, float)) and v == v for v in mb.index]]
mb.index = mb.index.astype(int)
mb = mb / 1000

out = pd.DataFrame({
    'tracker TWh': y.total, 'MBIE TWh': mb.total,
    'hydro %': 100 * (y.hydro / mb.hydro - 1), 'geo %': 100 * (y.geo / mb.geo - 1),
    'wind %': 100 * (y.wind / mb.wind.replace(0, np.nan) - 1),
    'thermal %': 100 * ((y.coal + y.gas + y.diesel) / (mb.coal + mb.gas + mb.oil) - 1),
    'total %': 100 * (y.total / mb.total - 1), 'demand TWh': y.demand,
}).dropna(subset=['tracker TWh'])
full = m.groupby('year').month.nunique() == 12
pd.set_option('display.width', 200)
print(out[full.reindex(out.index).fillna(False)].round(1).to_string())
