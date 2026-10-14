"""Build the tracker JSON the website reads: 5-minute island, fuel and plant series for the last 7 days.

Inputs (data/, not committed):
  raw/daily/*.csv     EMI NodalPricesAndVolumes daily files (sync.py daily)
  raw/api/*_api.csv   real-time dispatch API intervals (emi_live.py)
  ref/DispatchedGenerationPlant.csv, ref/irradiance.json (sync.py plants / irradiance)
Curated: facilities/overrides.toml, facilities/connection_points.csv
Output: site/static/data/tracker.json (or $ELENZ_OUT/tracker.json)

Both sources come from the same real-time dispatch case, so they are merged and de-duplicated.
"""
import glob
import json
import os
import sys

import numpy as np
import pandas as pd

from common import OUT, RAW_API, RAW_DAILY, REF, connection_islands, overrides

QUIET = '--quiet' in sys.argv
log = (lambda *a: None) if QUIET else print
WINDOW = 7 * 288
KEYS = ['coal', 'gas', 'diesel', 'geo', 'hydro', 'wind', 'solar', 'batt']

O = overrides()
CHARGE = O['battery_charging']                     # charging unit -> battery unit
REFNODE = O['reference_nodes']
TIWAI = O['loads']['tiwai']
ISL = connection_islands()

# ---------- plant register + curated units ----------
plant = pd.read_csv(os.path.join(REF, 'DispatchedGenerationPlant.csv'))
plant = plant[plant.EffectiveEndDate.str.startswith('9999')]
fuel = {(r.PointOfConnectionCode, r.UnitCode): O['fuels'][r.Fuel] for r in plant.itertuples() if r.Fuel in O['fuels']}
names = {(r.PointOfConnectionCode, r.UnitCode): r.PlantName for r in plant.itertuples()}
cap = {(r.PointOfConnectionCode, r.UnitCode): float(r.NameplateMegawatts) for r in plant.itertuples() if r.NameplateMegawatts == r.NameplateMegawatts}
for k, v in O['units'].items():
    poc, unit = k.split(' ')
    fuel[(poc, unit)] = v['fuel']
    names[(poc, unit)] = v['plant']
    if 'cap' in v:
        cap[(poc, unit)] = float(v['cap'])
rename = O.get('plant_names', {})

# ---------- dispatch rows ----------
USE = ['IntervalDateTime', 'RunDateTime', 'PointOfConnectionCode', 'UnitCode', 'Island', 'LoadMegawatts',
       'GenerationMegawatts', 'LocationFactor', 'DollarsPerMegawattHour', 'IsDeadFlag']
files = sorted(glob.glob(os.path.join(RAW_DAILY, '*.csv'))) + sorted(glob.glob(os.path.join(RAW_API, '*_api.csv')))
if not files:
    raise SystemExit('No dispatch data in data/raw. Run sync.py daily or emi_live.py first.')
# only the newest ~9 days of files matter for a 7-day window
files = sorted(files, key=lambda f: os.path.basename(f)[:8])[-18:]
frames = []
for f in files:
    d = pd.read_csv(f, keep_default_na=False, usecols=lambda c: c in USE)
    d['src'] = 'api' if f.endswith('_api.csv') else 'file'
    frames.append(d)
d = pd.concat(frames, ignore_index=True)
d['LocationFactor'] = pd.to_numeric(d['LocationFactor'], errors='coerce') if 'LocationFactor' in d else np.nan
d['t'] = pd.to_datetime(d.IntervalDateTime, utc=True)
d = d.sort_values(['RunDateTime', 'src']).drop_duplicates(['t', 'PointOfConnectionCode', 'UnitCode'], keep='last')
last = d.t.max()
d = d[d.t > last - pd.Timedelta(minutes=5 * WINDOW)]
refrows = d[d.PointOfConnectionCode.isin(REFNODE.values())]

d['isl'] = [ISL.get(p) or {'North Island': 'NI', 'South Island': 'SI'}.get(i, '') for p, i in zip(d.PointOfConnectionCode, d.Island)]
lost = d[(d.isl == '') & (d.GenerationMegawatts.abs() > 0.5)]
if len(lost):
    print('WARNING generation with no island (add to [islands] in overrides.toml):',
          lost[['PointOfConnectionCode', 'UnitCode']].drop_duplicates().values.tolist())
d = d[d.isl != '']
d['fuel'] = [fuel.get((p, u)) for p, u in zip(d.PointOfConnectionCode, d.UnitCode)]
unmapped = d[(d.UnitCode != 'N/A') & d.fuel.isna() & ~d.UnitCode.isin(CHARGE) & (d.GenerationMegawatts > 0.5)]
if len(unmapped):
    print('WARNING unmapped generating units (add to [units] in overrides.toml):',
          unmapped[['PointOfConnectionCode', 'UnitCode']].drop_duplicates().values.tolist())

times = pd.DatetimeIndex(sorted(d.t.unique()))
full = pd.date_range(times[0], times[-1], freq='5min')
log('intervals', len(times), 'of', len(full), '|', times[0], '→', times[-1])

# ---------- island series ----------
out = {}
for isl in ['NI', 'SI']:
    x = d[d.isl == isl]
    fix = lambda s: s.reindex(times).fillna(0).reindex(full)  # absent rows in a published interval mean zero
    gen = x[x.fuel.notna()].pivot_table(index='t', columns='fuel', values='GenerationMegawatts', aggfunc='sum')
    gen = gen.reindex(times).fillna(0).reindex(full)
    charge = fix(x[x.UnitCode.isin(CHARGE)].groupby('t').LoadMegawatts.sum())
    load = fix(x[~x.UnitCode.isin(CHARGE)].groupby('t').LoadMegawatts.sum())
    tiwai = fix(x[x.PointOfConnectionCode == TIWAI].groupby('t').LoadMegawatts.sum())
    # reference-node price where present (API); otherwise nodal price / location factor across live nodes (daily files)
    direct = refrows[refrows.PointOfConnectionCode == REFNODE[isl]].groupby('t').DollarsPerMegawattHour.mean()
    ok = x[(x.IsDeadFlag == 'N') & (x.LocationFactor > 0.5)]
    derived = (ok.DollarsPerMegawattHour / ok.LocationFactor).groupby(ok.t).median()
    price = direct.combine_first(derived).reindex(full)
    S = {}
    for k in KEYS:
        s = gen[k] if k in gen else pd.Series(0.0, index=full)
        if k == 'batt':
            s = s - charge
        S[k] = s.interpolate(limit_direction='both').fillna(0)  # whole missing intervals are interpolated
    S['metered'] = load.interpolate(limit_direction='both')
    S['tiwai'] = tiwai.interpolate(limit_direction='both')
    S['price'] = price.interpolate(limit_direction='both')
    out[isl] = S

# HVDC transfer, estimated from the island balance until metered HVDC_Flows arrive (~2 weeks later)
genNI = sum(out['NI'][k] for k in KEYS)
genSI = sum(out['SI'][k] for k in KEYS)
hv = ((genSI - out['SI']['metered']) + (out['NI']['metered'] - genNI)) / 2

# Rooftop solar, modelled: capacity × irradiance (Open-Meteo 15-min GHI, weighted cities) × performance ratio
irr = json.load(open(os.path.join(REF, 'irradiance.json')))
W = [('NI', .22), ('NI', .14), ('NI', .16), ('NI', .16), ('SI', .18), ('SI', .09), ('SI', .05)]
CAP_ROOF = {'NI': 680, 'SI': 320}
PR = 0.78
idx = pd.DatetimeIndex(pd.to_datetime(irr[0]['minutely_15']['time']).tz_localize('Pacific/Auckland', ambiguous='NaT', nonexistent='NaT'))
for isl in ['NI', 'SI']:
    acc, wsum = pd.Series(0.0, index=idx), 0
    for (i2, w), loc in zip(W, irr):
        if i2 == isl:
            acc += pd.Series(loc['minutely_15']['shortwave_radiation'], index=idx, dtype=float).fillna(0) * w
            wsum += w
    acc = acc[acc.index.notna()].tz_convert('UTC')
    ghi = (acc / wsum).reindex(acc.index.union(full)).interpolate().reindex(full).fillna(0)
    out[isl]['roof'] = CAP_ROOF[isl] * ghi / 1000 * PR
    out[isl]['underlying'] = out[isl]['metered'] + out[isl]['roof']
out['NI']['hvdc'] = hv
out['SI']['hvdc'] = -hv


def enc(s, dp=0):
    return [round(float(v), dp) if dp else int(round(float(v))) for v in s]


t0 = int(full[0].timestamp() * 1000)
js = {'t0': t0, 'step': 300000, 'N': len(full), 'hvdcN': enc(hv)}
for isl in ['NI', 'SI']:
    js[isl] = {k: enc(v, 2 if k == 'price' else 0) for k, v in out[isl].items()}

# ---------- plants (and grid connections, where a plant feeds more than one bus) ----------
u = d[(d.UnitCode != 'N/A') & (d.fuel.notna() | d.UnitCode.isin(CHARGE))].copy()
u['unit'] = [CHARGE.get(x, x) for x in u.UnitCode]
u['mw'] = np.where(u.UnitCode.isin(CHARGE), -u.LoadMegawatts, u.GenerationMegawatts)
u['key'] = u.PointOfConnectionCode + ' ' + u.unit
u['plant'] = [rename.get(n, n) for n in (names.get(tuple(k.split(' ')), k) for k in u.key)]
u['fuel'] = [fuel.get(tuple(k.split(' '))) for k in u.key]
units = u.pivot_table(index='t', columns='key', values='mw', aggfunc='sum').reindex(times).fillna(0).reindex(full).interpolate(limit_direction='both')
plants = []
for (pname, fu, isl), grp in u.groupby(['plant', 'fuel', 'isl']):
    keys = sorted(grp.key.unique())
    s = units[keys].sum(axis=1)
    if s.abs().max() < 0.5:
        continue
    caps = [cap[tuple(k.split(' '))] for k in keys if tuple(k.split(' ')) in cap]
    pocs = sorted({k.split(' ')[0] for k in keys})
    entry = {'name': pname, 'fuel': fu, 'isl': isl, 'poc': pocs, 'cap': round(sum(caps)) if caps else None, 's': enc(s)}
    if len(pocs) > 1:  # e.g. Arapuni (two 110 kV buses), Roxburgh (220 kV and 110 kV)
        entry['units'] = [{'name': k, 'cap': cap.get(tuple(k.split(' '))), 's': enc(units[k])} for k in keys]
    plants.append(entry)
plants.sort(key=lambda p: (p['fuel'], -sum(p['s'])))
js['plants'] = plants

src_t = d.drop_duplicates('t').set_index('t').src
js['meta'] = {'intervals': len(times), 'expected': len(full), 'end': t0 + (len(full) - 1) * 300000,
              'api_from': int(src_t[src_t == 'api'].index.min().timestamp() * 1000) if (src_t == 'api').any() else None,
              'built': int(pd.Timestamp.now(tz='UTC').timestamp() * 1000)}

path = os.path.join(OUT, 'tracker.json')
tmp = path + '.tmp'
with open(tmp, 'w') as f:
    json.dump(js, f, separators=(',', ':'))
os.replace(tmp, path)  # atomic, so the site never reads a half-written file
log('wrote', path, f'({os.path.getsize(path) // 1024} KB, {len(plants)} plants)')
