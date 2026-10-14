"""Plant owner and hydro scheme lookup for the website's "By owner" and "By hydro scheme" views.

Reads the EA plant register (latest row per plant) and facilities/overrides.toml ([owners], [plant_owners],
[hydro_schemes], [plant_names]) and writes site/src/lib/tracker/plants.json: {plant name: {"owner": ..., "scheme": ...}}.
Plant names match the ones in tracker.json and the history files.

Run from the repo root after refreshing the register or editing those tables, then commit the JSON:
  python3 ingest/plant_meta.py
"""
import json
import os

import pandas as pd

from common import FACILITIES, ROOT, overrides

OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'tracker', 'plants.json')


def main():
    O = overrides()
    rename = O.get('plant_names', {})
    owners = O.get('owners', {})
    reg = pd.read_csv(os.path.join(FACILITIES, 'plant_register.csv'))
    reg = reg.sort_values('EffectiveEndDate').drop_duplicates('PlantName', keep='last')  # the current row per plant
    meta = {}
    for r in reg.itertuples():
        name = rename.get(r.PlantName, r.PlantName)
        meta[name] = {'owner': owners.get(r.PlantOperator, 'Other generators')}
    for unit in O.get('units', {}).values():
        meta.setdefault(unit['plant'], {'owner': 'Other generators'})
    for name, owner in O.get('plant_owners', {}).items():
        meta.setdefault(name, {})['owner'] = owner
    unknown = []
    for scheme, plants in O.get('hydro_schemes', {}).items():
        for p in plants:
            if p not in meta:
                unknown.append(p)
            meta.setdefault(p, {'owner': 'Other generators'})['scheme'] = scheme
    if unknown:
        print('WARNING hydro_schemes lists plants not in the register:', unknown)
    with open(OUT, 'w') as f:
        json.dump(dict(sorted(meta.items())), f, ensure_ascii=False, indent=0, separators=(',', ':'))
    counts = pd.Series([m['owner'] for m in meta.values()]).value_counts().to_dict()
    print(f'wrote {OUT}: {len(meta)} plants; owners {counts}')


if __name__ == '__main__':
    main()
