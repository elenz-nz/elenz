"""Build the tracker JSON the website reads: 5-minute island, fuel and plant series for the last 7 days.

build(state, irradiance, capacity) turns the compact state (state.py) into the tracker data. Run as a script, it
builds the state from whatever raw files are in data/raw (daily files and API CSVs) and writes
site/static/data/tracker.json; the scheduled job (update.py) calls build() directly instead.
"""
import glob
import json
import os
import sys

import numpy as np
import pandas as pd

from common import FACILITIES, OUT, RAW_API, RAW_DAILY, REF, connection_islands, island_of, overrides
import hvdc
import rooftop
import state as st

WINDOW = 7 * 288
KEYS = ['coal', 'gas', 'diesel', 'geo', 'bio', 'waste', 'hydro', 'wind', 'solar', 'batt']   # bio: bioenergy; waste: waste heat



# register names spelled wrongly, corrected for display only (the register's name stays the key)
SPELLING = {'Pirirpaua': 'Piripaua'}

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


def plant_capacity():
    """Plant (shown) name -> the most nameplate MW it ever had installed at once, from the register's dated rows
    (Whirinaki's re-registered units aren't counted twice; Stratford counts Taranaki Combined Cycle and the peakers
    while both ran). For plants the metered history shows outside the dispatch data's lifetime."""
    O = overrides()
    reg = pd.read_csv(os.path.join(FACILITIES, 'plant_register.csv'))
    rename, groups = O.get('plant_names', {}), plant_groups()
    reg['plant'] = [groups.get(rename.get(n, n), rename.get(n, n)) for n in reg.PlantName]
    reg = reg.dropna(subset=['NameplateMegawatts'])
    out = {}
    for p, d in reg.groupby('plant'):
        best = 0.0
        for t in d.EffectiveStartDate:
            on = d[(d.EffectiveStartDate <= t) & (d.EffectiveEndDate > t)]
            best = max(best, float(on.drop_duplicates(['PointOfConnectionCode', 'UnitCode']).NameplateMegawatts.sum()))
        out[p] = best
    return out


def plant_groups():
    """Register plant name -> the station it is shown as ([plant_groups] in overrides.toml): stations the metered
    history can only see as a whole (Huntly's Rankines, Stratford, Waikaremoana, Te Mihi) are one plant everywhere,
    with the register's plants as its units."""
    return {m: g for g, members in overrides().get('plant_groups', {}).items() for m in members}


def enc(s, dp=0):
    return [round(float(v), dp) if dp else int(round(float(v))) for v in s]


def enc_na(s, dp=2):
    """Like enc, but a missing value is written as null (the page leaves a gap) rather than failing."""
    return [None if v != v else round(float(v), dp) for v in s]


def default_capacity():
    """Rooftop solar capacity by point when the store has none yet (facilities/rooftop_capacity.json, a snapshot;
    the history job keeps the current table in the store as hist/roof_cap.json)."""
    with open(os.path.join(FACILITIES, 'rooftop_capacity.json')) as f:
        return json.load(f)


def runs(mask):
    """[[first index, length], ...] of the True stretches in mask: the intervals the page shows as interpolated."""
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            out.append([i, j - i])
            i = j
        else:
            i += 1
    return out


def build(state, irr, cap=None, log=print):
    """irr: (satellite, forecast fallback) irradiance DataFrames (rooftop.irr_loads); cap: rooftop capacity by point."""
    real = state[~state.src.isin(['empty', 'partial'])]   # incomplete cases are interpolated like missing ones
    last = real.index.max()
    full = pd.date_range(last - pd.Timedelta(minutes=5 * (WINDOW - 1)), last, freq='5min')
    s = real[real.index >= full[0]].reindex(full)  # missing intervals become NaN rows, interpolated below
    sat, fc = irr
    roof, n_now = rooftop.live(sat, fc, full, cap or default_capacity())
    js = assemble(s, full, roof, log)
    src = s.src.dropna()
    api_t = src[src == 'api'].index
    t0 = js['t0']
    sat_end = sat.dropna(how='all').index.max() if sat is not None and not sat.empty else None
    js['meta'] = {'intervals': int(s.src.notna().sum()), 'expected': len(full), 'end': t0 + (len(full) - 1) * 300000,
                  'filled': runs(s.src.isna().to_numpy()),
                  'api_from': int(api_t.min().timestamp() * 1000) if len(api_t) else None,
                  'sat_end': int(sat_end.timestamp() * 1000) if sat_end is not None else None,
                  'built': int(pd.Timestamp.now(tz='UTC').timestamp() * 1000)}
    log(f'built {len(full)} intervals ({int(s.src.notna().sum())} with data) to {last}, {len(js["plants"])} plants; '
        f'embedded solar now {js["NI"]["roof"][-1] + js["SI"]["roof"][-1]} MW'
        + (f' (satellite to {sat_end}, {n_now} intervals carried forward)' if sat_end is not None else ' (no satellite data)'))
    return js


def assemble(s, full, roof, log=print, metered=None):
    """Rows of the compact state on a regular time grid (NaN rows where no data) -> the tracker data layout:
    island series by fuel, demand, Tiwai, prices, rooftop solar, estimated HVDC, and plant series.
    Shared by the live tracker (5-minute) and the history files (half-hourly).

    metered: for history months with metered data (metered.py), {(plant, fuel, island): {POC: MW}}. Plants then come
    from the metering; a plant's dispatch series replaces it only where the metering lacks it (a battery, a plant not
    in the metered data yet, or metered energy under half the dispatch energy over the dispatch intervals). Demand is
    then the metered demand, and Tiwai the metered smelter load."""
    O = overrides()
    charge = O['battery_charging']
    isl_tab = connection_islands()
    fuel, names, cap = register()
    groups = plant_groups()
    group_names = set(groups.values())
    present = s.src.notna()
    gen_cols = [c for c in s.columns if c.startswith('U|')]
    chg_cols = [c for c in s.columns if c.startswith('C|')]

    def unit_info(col):
        poc, unit = col[2:].split(' ')
        return poc, unit, island_of(poc, isl_tab)

    lost, unmapped = set(), set()
    island_gen = {isl: {k: pd.Series(0.0, index=full) for k in KEYS} for isl in ['NI', 'SI']}
    plant_units = {}  # (plant, fuel, island) -> {unit key: series}
    member_of = {}    # unit key -> register plant name (a group's member)
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
        member = names.get((poc, bunit), f'{poc} {bunit}')
        key = (groups.get(member, member), f, isl)
        ukey = f'{poc} {bunit}'
        member_of[ukey] = member
        plant_units.setdefault(key, {})
        plant_units[key][ukey] = plant_units[key].get(ukey, 0) + series.fillna(0).where(present)
    if unmapped:
        log('WARNING unmapped generating units (add to [units] in facilities/overrides.toml):', sorted(unmapped))
    if lost:
        log('WARNING generation with no island (add to [islands] in facilities/overrides.toml):', sorted(lost))

    fill = lambda x: x.interpolate(limit_direction='both').fillna(0)
    if metered is not None:
        # metered month: plants from the metering, dispatch where the metering lacks a plant (see above)
        dpres = (s['n'].fillna(0) > 0) if 'n' in s else present
        mpres = (s['mg'] == 1) if 'mg' in s else pd.Series(True, index=full)
        final = {k: {poc: v.where(mpres) for poc, v in by_poc.items()} for k, by_poc in metered.items()}
        for k, us in plant_units.items():
            d = sum(us.values())
            ed = float(d[dpres].sum())
            m = sum(final[k].values()) if k in final else None
            em = float(m[dpres].sum()) if m is not None else 0.0
            # batteries: always dispatch where it has them (net of charging, which the metering doesn't net)
            if (k[1] == 'batt' and bool(dpres.any())) or (ed > 0 and em < 0.5 * ed):
                new = {u: v.where(dpres) for u, v in us.items()}
                if m is not None:   # metered output outside the dispatch intervals (before 10 Sep 2020)
                    new.update({poc: v.where(~dpres) for poc, v in final[k].items()})
                final[k] = new
        plant_units = {k: {u: v.fillna(0) for u, v in us.items()} for k, us in final.items()}
        island_gen = {isl: {k: pd.Series(0.0, index=full) for k in KEYS} for isl in ['NI', 'SI']}
        for (pname, f, isl), us in plant_units.items():
            if isl in island_gen and f in island_gen[isl]:
                island_gen[isl][f] = island_gen[isl][f] + sum(us.values())
        fill_plant = lambda x: x
    else:
        fill_plant = fill

    out = {}
    for isl in ['NI', 'SI']:
        S = {k: fill(island_gen[isl][k]) for k in KEYS}
        S['metered'] = fill(s.get(f'L|{isl}', pd.Series(np.nan, index=full)))
        S['tiwai'] = fill(s['T']) if isl == 'SI' and 'T' in s else pd.Series(0.0, index=full)
        S['price'] = fill(s.get(f'P|{isl}', pd.Series(np.nan, index=full)))
        out[isl] = S
    if metered is not None:
        import metered as mt   # history only
        dem = mt.demand(s, {isl: sum(out[isl][k] for k in KEYS) for isl in ['NI', 'SI']})
        for isl in ['NI', 'SI']:
            out[isl]['metered'] = fill(dem[isl])
        if 'MT' in s and s['MT'].notna().any():
            out['SI']['tiwai'] = fill(s['MT'])
    # HVDC transfer: metered where the state has it (history, once EMI publishes HVDC_Flows), otherwise estimated
    # from the island balances (the dispatch feed has no HVDC row). NI gets what arrives at Haywards, the SI gives
    # what leaves Benmore; the headline figure is the mid-link transfer.
    genNI = sum(out['NI'][k] for k in KEYS)
    genSI = sum(out['SI'][k] for k in KEYS)
    hv = hvdc.estimate(genNI, genSI, out['NI']['metered'], out['SI']['metered'])
    ben, hay = hvdc.ends(hv)
    if 'H|BEN' in s and 'H|HAY' in s:
        ok = s['H|BEN'].notna() & s['H|HAY'].notna()
        ben = ben.where(~ok, s['H|BEN'])
        hay = hay.where(~ok, s['H|HAY'])
        hv = hv.where(~ok, (s['H|BEN'] + s['H|HAY']) / 2)
    for isl in ['NI', 'SI']:
        # short gaps in irradiance are bridged; anything else without irradiance shows as zero, never extrapolated
        r = roof[isl].interpolate(limit_area='inside', limit=6).fillna(0).clip(lower=0)
        out[isl]['roof'] = r
        out[isl]['underlying'] = out[isl]['metered'] + r
        if isl + 'u' in roof:
            out[isl]['roofU'] = roof[isl + 'u'].interpolate(limit_area='inside', limit=6).fillna(0).clip(lower=0)
    out['NI']['hvdc'] = hay
    out['SI']['hvdc'] = -ben
    # more price nodes (the Prices page): gaps up to 12 points bridged, longer ones left empty (intervals filled from
    # the daily files, which have no bus rows)
    nodes = {}
    for k in O.get('price_nodes', {}):
        c = s.get(f'P|{k}')
        if c is not None and c.notna().any():
            nodes[k] = c.interpolate(limit=12, limit_area='inside')

    t0 = int(full[0].timestamp() * 1000)
    js = {'t0': t0, 'step': int(full.freq.nanos // 1_000_000), 'N': len(full), 'hvdcN': enc(hv)}
    for isl in ['NI', 'SI']:
        js[isl] = {k: enc(v, 2 if k == 'price' else 0) for k, v in out[isl].items()}
    if nodes:
        js['nodes'] = {k: enc_na(v) for k, v in nodes.items()}

    # nameplate MW for plants seen only in metered data: the most the register ever had installed at once
    plant_cap = plant_capacity() if metered is not None else {}
    if metered is not None:
        import metered as mt
        plant_cap.update({p: c for p, c in mt.capacities().items() if p not in plant_cap})
    plants = []
    for (pname, f, isl), us in plant_units.items():
        us = {k: fill_plant(v) for k, v in us.items()}
        total = sum(us.values())
        if total.abs().max() < 0.5:
            continue
        caps = [cap[tuple(k.split(' '))] for k in us if tuple(k.split(' ')) in cap]
        pocs = sorted({k.split(' ')[0] for k in us})
        pcap = round(sum(caps)) if caps else (round(plant_cap[pname]) if pname in plant_cap else None)
        entry = {'name': pname, 'fuel': f, 'isl': isl, 'poc': pocs, 'cap': pcap, 's': enc(total)}
        if pname in group_names:
            # a station shown as one plant: its register plants as units; metered output (station total) as one
            by = {}
            for k, v in us.items():
                m = member_of.get(k, 'All units') if ' ' in k else 'All units'
                by.setdefault(m, []).append((k, v))
            entry['units'] = [{'name': m if m != 'All units' else f'{pname} (all units)', 'label': SPELLING.get(m, m),
                               'cap': (sum(cap.get(tuple(k.split(' ')), 0) for k, _ in kv) or None) if m != 'All units' else pcap,
                               's': enc(sum(v for _, v in kv))} for m, kv in sorted(by.items())]
        elif len(pocs) > 1:  # a plant on more than one bus (Arapuni, Roxburgh) can be split by grid connection
            by = {}
            for k, v in us.items():
                by.setdefault(k.split(' ')[0], []).append((k, v))
            # each connection's nameplate: the register units this plant has there (present or not)
            conn_cap = lambda poc: sum(c for (p, u), c in cap.items() if p == poc and groups.get(names.get((p, u)), names.get((p, u))) == pname)
            entry['units'] = [{'name': poc, 'cap': round(conn_cap(poc)) or None,
                               's': enc(sum(v for _, v in kv))} for poc, kv in sorted(by.items())]
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
    sat, fc, _ = rooftop.irr_loads(open(os.path.join(REF, 'irradiance.json'), 'rb').read())
    js = build(state_from_raw(), (sat, fc), None, log)
    path = os.path.join(OUT, 'tracker.json')
    write_json(js, path)
    log('wrote', path, f'({os.path.getsize(path) // 1024} KB)')
