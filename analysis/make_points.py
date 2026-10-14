"""Make facilities/rooftop_points.csv (irradiance points for the rooftop solar model) and facilities/rooftop_nsp.csv
(every grid-connected NSP -> its point), from EMI's NetworkSupplyPointsTable and installed solar by Root NSP.

One point per network reporting region (a distribution company's area), placed at the region's capacity-weighted
centre; regions under MIN_MW are merged into the nearest region on the same island. Rerun if the spread of rooftop
solar changes a lot (development only: needs pyproj).

  python3 analysis/make_points.py <NetworkSupplyPointsTable.csv> <GUEHMT NSP_ROOT small.csv> <... large.csv>
"""
import os, sys
import numpy as np, pandas as pd
from pyproj import Transformer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
import rooftop

MIN_MW = 2.0
nsp_csv, small, large = sys.argv[1:4]
t = pd.read_csv(nsp_csv)
t = t[(t['Current flag'] == 1) & (t['Reconciliation type'] == 'GN') & t['NZTM easting'].notna()].drop_duplicates('NSP')
lon, lat = Transformer.from_crs(2193, 4326, always_xy=True).transform(t['NZTM easting'].values, t['NZTM northing'].values)
t = t.assign(lat=lat, lon=lon, region=t['Network reporting region'])
t = t[t.region.notna()]
cap = rooftop.capacity_table(open(small, 'rb').read(), open(large, 'rb').read(), log=lambda *a: None)
mw = {n: cap['small'][n][-1] + cap['large'][n][-1] for n in cap['nsps']}
t['mw'] = t.NSP.map(mw).fillna(0)
# NSPs with solar but no coordinates in the table, placed by hand (region from the same network)
manual = {'HTU0331WAIPGN': 'Waipa (Waipa Networks)', 'NWD0661ORONGN': 'Central Canterbury (Orion New Zealand)',
          'HAM0331RUAKGN': 'Waikato (WEL Networks)'}
print('NSPs with solar but no location:', sorted(set(n for n, v in mw.items() if v > 0.5) - set(t.NSP)))

reg = t.groupby(['Island', 'region']).apply(lambda d: pd.Series({
    'mw': d.mw.sum(), 'lat': np.average(d.lat, weights=d.mw + 0.01), 'lon': np.average(d.lon, weights=d.mw + 0.01)}),
    include_groups=False).reset_index()
reg['into'] = reg.region
for i, r in reg[reg.mw < MIN_MW].iterrows():
    big = reg[(reg.Island == r.Island) & (reg.mw >= MIN_MW)]
    d = (big.lat - r.lat) ** 2 + ((big.lon - r.lon) * np.cos(np.radians(r.lat))) ** 2
    reg.loc[i, 'into'] = big.loc[d.idxmin(), 'region']
    print(f'merged {r.region} ({r.mw:.1f} MW) into {reg.loc[d.idxmin(), "region"]}')
# regions centred within ~5 km of a bigger one (e.g. Frankton and Queenstown) share its point
for i, r in reg.sort_values('mw').iterrows():
    other = reg[(reg.Island == r.Island) & (reg.region != r.region) & (reg.mw > r.mw) & (reg.into == reg.region)]
    d = np.sqrt((other.lat - r.lat) ** 2 + ((other.lon - r.lon) * np.cos(np.radians(r.lat))) ** 2) * 111
    if len(d) and d.min() < 5 and reg.loc[i, 'into'] == r.region:
        reg.loc[i, 'into'] = other.loc[d.idxmin(), 'region']
        print(f'merged {r.region} into {reg.loc[i, "into"]} (same place)')
t['point_region'] = t.region.map(dict(zip(reg.region, reg.into)))
pts = t.groupby(['Island', 'point_region']).apply(lambda d: pd.Series({
    'mw': d.mw.sum(), 'lat': np.average(d.lat, weights=d.mw + 0.01), 'lon': np.average(d.lon, weights=d.mw + 0.01)}),
    include_groups=False).reset_index()
pts = pts.sort_values(['Island', 'lat'], ascending=[True, False])
pts['point'] = [f'{i}{n + 1:02d}' for i, grp in pts.groupby('Island', sort=False) for n in range(len(grp))]
pid = dict(zip(pts.point_region, pts.point))
rows = [dict(nsp=n, point=pid[r]) for n, r in zip(t.NSP, t.point_region)]
rows += [dict(nsp=n, point=pid[r]) for n, r in manual.items()]
out = os.path.join(os.path.dirname(__file__), '..', 'facilities')
pts = pts.rename(columns={'Island': 'island', 'point_region': 'name'})
pts[['lat', 'lon']] = pts[['lat', 'lon']].round(3); pts['mw'] = pts.mw.round(1)
pts[['point', 'island', 'lat', 'lon', 'name', 'mw']].to_csv(os.path.join(out, 'rooftop_points.csv'), index=False)
pd.DataFrame(rows).drop_duplicates('nsp').sort_values('nsp').to_csv(os.path.join(out, 'rooftop_nsp.csv'), index=False)
print(pts[['point', 'island', 'lat', 'lon', 'name', 'mw']].to_string(index=False))
print(f'{cap["months"][-1]}: {sum(mw.values()):.0f} MW, {len(pts)} points, {len(rows)} NSPs')
