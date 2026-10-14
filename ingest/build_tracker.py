"""Build the tracker JSON the website reads: 5-minute island, fuel and plant series for the last 7 days.

build(state, irradiance) turns the compact state (state.py) into the tracker data. Run as a script, it builds the
state from whatever raw files are in data/raw (daily files and API CSVs) and writes site/static/data/tracker.json;
the scheduled job (update.py) calls build() directly instead.
"""
import glob
import json
import os
import sys

import numpy as np
import pandas as pd

from common import OUT, RAW_API, RAW_DAILY, REF, connection_islands, island_of, overrides
import state as st

WINDOW = 7 * 288
KEYS = ['coal', 'gas', 'diesel', 'geo', 'hydro', 'wind', 'solar', 'batt']
# rooftop solar model: Open-Meteo GHI for seven weighted cities (order matches sync.CITIES), installed MW, performance ratio
ROOF_W = [('NI', .22), ('NI', .14), ('NI', .16), ('NI', .16), ('SI', .18), ('SI', .09), ('SI', .05)]
ROOF_CAP = {'NI': 680, 'SI': 320}
ROOF_PR = 0.78


def register():
    """(POC, unit) -> fuel, plant name, nameplate MW: EA register plus facilities/overrides.toml.

    The register keeps dated rows, so retired units (Taranaki Combined Cycle) and old connections (Pātea on HWA1101)
    stay mapped for history; where a unit has several rows, the latest one wins."""
    O = overrides()
    plant = pd.read_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'facilities', 'plant_register.csv'))
    plant = plant.sort_values('EffectiveEndDate').drop_duplicates(['PointOfConnectionCode', 'UnitCode'], keep='last')
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
    names = {k: rename.get(n, n) for k, n in names.items()}
    return fuel, names, cap


def enc(s, dp=0):
    return [round(float(v), dp) if dp else int(round(float(v))) for v in s]


def rooftop(irr, full):
    out = {}
    idx = pd.DatetimeIndex(pd.to_datetime(irr[0]['minutely_15']['time'])).tz_localize('Pacific/Auckland', ambiguous='NaT', nonexistent='NaT')
    for isl in ['NI', 'SI']:
        acc, wsum = pd.Series(0.0, index=idx), 0
        for (i2, w), loc in zip(ROOF_W, irr):
            if i2 == isl:
                acc += pd.Series(loc['minutely_15']['shortwave_radiation'], index=idx, dtype=float).fillna(0) * w
                wsum += w
        acc = acc[acc.index.notna()].tz_convert('UTC')
        ghi = (acc / wsum).reindex(acc.index.union(full)).interpolate(limit_area='inside').reindex(full)
        out[isl] = (ROOF_CAP[isl] * ghi / 1000 * ROOF_PR).fillna(0)
    return out


def build(state, irr, log=print):
    real = state[state.src != 'empty']
    last = real.index.max()
    full = pd.date_range(last - pd.Timedelta(minutes=5 * (WINDOW - 1)), last, freq='5min')
    s = real[real.index >= full[0]].reindex(full)  # missing intervals become NaN rows, interpolated below
    js = assemble(s, full, rooftop(irr, full), log)
    src = s.src.dropna()
    api_t = src[src == 'api'].index
    t0 = js['t0']
    js['meta'] = {'intervals': int(s.src.notna().sum()), 'expected': len(full), 'end': t0 + (len(full) - 1) * 300000,
                  'api_from': int(api_t.min().timestamp() * 1000) if len(api_t) else None,
                  'built': int(pd.Timestamp.now(tz='UTC').timestamp() * 1000)}
    log(f'built {len(full)} intervals ({int(s.src.notna().sum())} with data) to {last}, {len(js["plants"])} plants')
    return js


def assemble(s, full, roof, log=print):
    """Rows of the compact state on a regular time grid (NaN rows where no data) -> the tracker data layout:
    island series by fuel, demand, Tiwai, prices, rooftop solar, estimated HVDC, and plant series.
    Shared by the live tracker (5-minute) and the history files (half-hourly)."""
    O = overrides()
    charge = O['battery_charging']
    isl_tab = connection_islands()
    fuel, names, cap = register()
    present = s.src.notna()
    gen_cols = [c for c in s.columns if c.startswith('U|')]
    chg_cols = [c for c in s.columns if c.startswith('C|')]

    def unit_info(col):
        poc, unit = col[2:].split(' ')
        return poc, unit, island_of(poc, isl_tab)

    lost, unmapped = set(), set()
    island_gen = {isl: {k: pd.Series(0.0, index=full) for k in KEYS} for isl in ['NI', 'SI']}
    plant_units = {}  # (plant, fuel, island) -> {unit key: series}
    for col in gen_cols + chg_cols:
        poc, unit, isl = unit_info(col)
        is_chg = col.startswith('C|')
        bunit = charge.get(unit, unit) if is_chg else unit
        f = fuel.get((poc, bunit))
        series = -s[col] if is_chg else s[col]
        if f is None:
            if not is_chg and (s[col].abs() > 0.5).any():
                unmapped.add(col[2:])
            continue
        if not isl:
            if (series.abs() > 0.5).any():
                lost.add(col[2:])
            continue
        island_gen[isl][f] = island_gen[isl][f] + series.fillna(0).where(present)
        if (series.fillna(0).abs() <= 0.5).all():
            continue  # idle all window (e.g. a unit's old connection point): not part of the plant here
        key = (names.get((poc, bunit), f'{poc} {bunit}'), f, isl)
        ukey = f'{poc} {bunit}'
        plant_units.setdefault(key, {})
        plant_units[key][ukey] = plant_units[key].get(ukey, 0) + series.fillna(0).where(present)
    if unmapped:
        log('WARNING unmapped generating units (add to [units] in facilities/overrides.toml):', sorted(unmapped))
    if lost:
        log('WARNING generation with no island (add to [islands] in facilities/overrides.toml):', sorted(lost))

    fill = lambda x: x.interpolate(limit_direction='both').fillna(0)
    out = {}
    for isl in ['NI', 'SI']:
        S = {k: fill(island_gen[isl][k]) for k in KEYS}
        S['metered'] = fill(s.get(f'L|{isl}', pd.Series(np.nan, index=full)))
        S['tiwai'] = fill(s['T']) if isl == 'SI' and 'T' in s else pd.Series(0.0, index=full)
        S['price'] = fill(s.get(f'P|{isl}', pd.Series(np.nan, index=full)))
        out[isl] = S
    # HVDC transfer, estimated from the island balance (not in the dispatch feed)
    genNI = sum(out['NI'][k] for k in KEYS)
    genSI = sum(out['SI'][k] for k in KEYS)
    hv = ((genSI - out['SI']['metered']) + (out['NI']['metered'] - genNI)) / 2
    for isl in ['NI', 'SI']:
        out[isl]['roof'] = roof[isl]
        out[isl]['underlying'] = out[isl]['metered'] + roof[isl]
    out['NI']['hvdc'] = hv
    out['SI']['hvdc'] = -hv

    t0 = int(full[0].timestamp() * 1000)
    js = {'t0': t0, 'step': int(full.freq.nanos // 1_000_000), 'N': len(full), 'hvdcN': enc(hv)}
    for isl in ['NI', 'SI']:
        js[isl] = {k: enc(v, 2 if k == 'price' else 0) for k, v in out[isl].items()}

    plants = []
    for (pname, f, isl), us in plant_units.items():
        us = {k: fill(v) for k, v in us.items()}
        total = sum(us.values())
        if total.abs().max() < 0.5:
            continue
        caps = [cap[tuple(k.split(' '))] for k in us if tuple(k.split(' ')) in cap]
        pocs = sorted({k.split(' ')[0] for k in us})
        entry = {'name': pname, 'fuel': f, 'isl': isl, 'poc': pocs, 'cap': round(sum(caps)) if caps else None, 's': enc(total)}
        if len(pocs) > 1:  # a plant on more than one bus (Arapuni, Roxburgh) can be split by grid connection
            entry['units'] = [{'name': k, 'cap': cap.get(tuple(k.split(' '))), 's': enc(us[k])} for k in sorted(us)]
        plants.append(entry)
    plants.sort(key=lambda p: (p['fuel'], -sum(p['s'])))
    js['plants'] = plants
    return js


def state_from_raw():
    """Compact state from the raw files in data/raw (local use)."""
    files = sorted(glob.glob(os.path.join(RAW_DAILY, '*.csv')) + glob.glob(os.path.join(RAW_API, '*_api.csv')),
                   key=lambda f: os.path.basename(f)[:8])[-18:]
    if not files:
        raise SystemExit('No dispatch data in data/raw. Run sync.py daily or emi_live.py first.')
    s = None
    for f in files:
        src = 'api' if f.endswith('_api.csv') else 'file'
        s = st.merge(s, st.compact(pd.read_csv(f, keep_default_na=False), src))
    return s


def write_json(js, path):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(js, f, separators=(',', ':'), allow_nan=False)
    os.replace(tmp, path)  # atomic, so a reader never sees a half-written file


if __name__ == '__main__':
    log = (lambda *a: None) if '--quiet' in sys.argv else print
    js = build(state_from_raw(), json.load(open(os.path.join(REF, 'irradiance.json'))), log)
    path = os.path.join(OUT, 'tracker.json')
    write_json(js, path)
    log('wrote', path, f'({os.path.getsize(path) // 1024} KB)')
