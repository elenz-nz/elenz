"""Plant owner and hydro scheme lookup for the website's "By owner" and "By hydro scheme" views.

Reads the EA plant register (latest row per plant) and facilities/overrides.toml ([owners], [plant_owners],
[hydro_schemes], [plant_names], [plant_groups], [plant_aka], [plant_metering]) and facilities/metered_plants.csv, and
writes site/src/lib/tracker/plants.json: {plant name: {"owner": ..., "scheme": ..., "river": n, "aka": [...],
"metered": "..."}}. `aka` is a plant's other names (the tracker's filter and /now's search match them; the tracker's
drill-down lists them); `metered` says what the metered history counts where it differs from the dispatch data.
Plant names match the ones in tracker.json and the history files.

Run from the repo root after refreshing the register or editing those tables, then commit the JSON:
  python3 ingest/plant_meta.py
"""
import csv
import json
import os
import re
import unicodedata

import pandas as pd

from common import FACILITIES, ROOT, overrides

OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'tracker', 'plants.json')
SPELLING = {'Pirirpaua': 'Piripaua'}   # as in build_tracker.py


def _norm(t):
    return unicodedata.normalize('NFD', t).encode('ascii', 'ignore').decode().lower().strip()


def other_names(O):
    """Shown plant -> its other names: [plant_groups] members and [plant_names] register names, then [plant_aka].
    A numbered part of the plant's own name ("Te Mihi 1", "Patea unit 2", "West Wind 1") is left out."""
    rename = O.get('plant_names', {})
    out = {}
    pairs = [(m, g) for g, ms in O.get('plant_groups', {}).items() for m in ms] + list(rename.items())
    for name, plant in pairs:
        plant = rename.get(plant, plant)
        base = re.sub(r'(\s+unit)?\s+\d+$', '', name)
        if _norm(base).rstrip('s') == _norm(plant).rstrip('s') or _norm(name) == _norm(plant):
            continue
        out.setdefault(plant, []).append(SPELLING.get(name, name))
    for plant, names in O.get('plant_aka', {}).items():
        out.setdefault(plant, []).extend(names)
    return {p: list(dict.fromkeys(ns)) for p, ns in out.items()}


def main():
    O = overrides()
    rename = O.get('plant_names', {})
    owners = O.get('owners', {})
    reg = pd.read_csv(os.path.join(FACILITIES, 'plant_register.csv'))
    reg = reg.sort_values('EffectiveEndDate').drop_duplicates('PlantName', keep='last')  # the current row per plant
    groups = {m: g for g, members in O.get('plant_groups', {}).items() for m in members}
    meta = {}
    for r in reg.itertuples():
        name = rename.get(r.PlantName, r.PlantName)
        meta[groups.get(name, name)] = {'owner': owners.get(r.PlantOperator, 'Other generators')}
    for unit in O.get('units', {}).values():
        meta.setdefault(unit['plant'], {'owner': 'Other generators'})
    with open(os.path.join(FACILITIES, 'metered_plants.csv'), encoding='utf-8') as f:   # plants only in metered history
        for r in csv.DictReader(f):
            if r['plant'] != '-':
                meta.setdefault(r['plant'], {'owner': 'Other generators'})
    for name, owner in O.get('plant_owners', {}).items():
        meta.setdefault(name, {})['owner'] = owner
    unknown = []
    for scheme, plants in O.get('hydro_schemes', {}).items():
        for p in plants:
            if p not in meta:
                unknown.append(p)
            meta.setdefault(p, {'owner': 'Other generators'})['scheme'] = scheme
            meta[p]['river'] = plants.index(p)  # position on the river, upstream first
    if unknown:
        print('WARNING hydro_schemes lists plants not in the register:', unknown)
    for plant, names in other_names(O).items():
        if plant not in meta:
            print('WARNING plant_aka/plant_groups names a plant the site has no row for:', plant)
            continue
        meta[plant]['aka'] = names
    for plant, note in O.get('plant_metering', {}).items():
        if plant not in meta:
            print('WARNING plant_metering names a plant the site has no row for:', plant)
            continue
        meta[plant]['metered'] = note
    with open(OUT, 'w') as f:
        json.dump(dict(sorted(meta.items())), f, ensure_ascii=False, indent=0, separators=(',', ':'))
    counts = pd.Series([m['owner'] for m in meta.values()]).value_counts().to_dict()
    print(f'wrote {OUT}: {len(meta)} plants; owners {counts}')


if __name__ == '__main__':
    main()
