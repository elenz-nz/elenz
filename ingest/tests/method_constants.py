"""The numbers the method pages quote, against the Python that uses them, run on every push (checks.yml) and locally:

  python3 ingest/tests/method_constants.py

Emissions and the price explainer import their figures from the site's own code, so only figures held in Python, or
typed into a page by hand, are checked here. Constants are read from the source files, not imported, so this needs
nothing installed. A failure means a constant changed: update the page and its `reviewed` date, or the check below.
"""
import ast
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGES = os.path.join(ROOT, 'site', 'src', 'lib', 'methods', 'pages')


def constants(path):
    """Every plain constant assigned at the top of a source file, without running it."""
    out = {}
    for node in ast.parse(open(os.path.join(ROOT, path), encoding='utf8').read()).body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            try:
                out[node.targets[0].id] = ast.literal_eval(node.value)
            except ValueError:
                pass    # worked out when it runs, so not a constant
    return out


def page(slug):
    return open(os.path.join(PAGES, f'{slug}.svelte'), encoding='utf8').read()


failures = []


def says(slug, text, what):
    if text not in page(slug):
        failures.append(f'{slug}: should say "{text}" ({what})')


pc = lambda v: f'{100 * v:g}%'    # noqa: E731

# ---------- HVDC transfer ----------
h = constants('ingest/hvdc.py')
for name, v in zip(('South Island balance', 'North Island balance', 'South Island demand', 'North Island demand'), h['FIT']):
    says('hvdc', f'{abs(v):.3f} ×', f'{name} coefficient, hvdc.FIT')
says('hvdc', f'{h["FIT"][4]:.1f}', 'constant, hvdc.FIT')
says('hvdc', f'{h["LOSS"]:.7f}', 'hvdc.LOSS')

# ---------- embedded solar ----------
r = constants('ingest/rooftop.py')
u = r['UNCERTAINTY']
says('embedded-solar', f'<td>Capacity</td><td>{pc(u["capacity"])}</td>', 'UNCERTAINTY capacity')
says('embedded-solar', f'<td>Calibration</td><td>{pc(u["calibration"])}</td>', 'UNCERTAINTY calibration')
says('embedded-solar', f'{pc(u["clear"])} at a clear-sky index', 'UNCERTAINTY clear')
says('embedded-solar', f'to {pc(u["cloudy"])} at 0.3', 'UNCERTAINTY cloudy')
says('embedded-solar', f'A further {pc(u["nowcast"])}', 'UNCERTAINTY nowcast')
says('embedded-solar', f'for up to {r["EXTRAPOLATE_DAYS"]} days', 'EXTRAPOLATE_DAYS')
says('embedded-solar', f'averaged {r["GROUND_KW"] / 1000:g} MW or more', 'GROUND_KW')
says('embedded-solar', f'The test is {r["GROUND_KW_AT"]["ASB0661EASHGN"]} kW at Ashburton', 'GROUND_KW_AT')
for kind, name in (('small', 'Small'), ('large', 'Large'), ('ground', 'Small solar farms')):
    row = next((x for x in page('embedded-solar').split('<tr>') if x.startswith(f'<td>{name}</td><td>') and 'DC/AC' not in x and 'class="n">' + f'{r["DC_AC"][kind]:g}' in x), '')
    for v, what in ((f'{r["DC_AC"][kind]:g}', 'DC_AC'), (pc(r['LOSSES'][kind]), 'LOSSES'), (f'{r["CAL"][kind]:.2f}'.rstrip('0') if kind != 'ground' else '1.0', 'CAL')):
        if f'class="n">{v}<' not in row:
            failures.append(f'embedded-solar: the {name} row should show {v} ({what})')

# ---------- other embedded generation ----------
e = constants('ingest/embedded.py')
says('other-embedded', f'under {pc(e["NIGHT_SHARE"])} of its energy', 'NIGHT_SHARE')
if e['LAYER_FROM'] != '2009-01':
    failures.append('other-embedded: the pages say January 2009, embedded.LAYER_FROM has moved')
for label, (shown, factor) in constants('analysis/embedded_split.py')['FUELS'].items():
    says('other-embedded', f'<td class="n">{factor:.2f}</td>', f'capacity factor for {label}')
oemb = open(os.path.join(ROOT, 'site', 'src', 'lib', 'tracker', 'oemb.js'), encoding='utf8').read()
gas = float(re.search(r'gas: ([\d.]+)', oemb).group(1))
says('emissions', f'Other embedded generation: gas</td><td class="n">{gas:.2f}</td>', 'oemb.js EF')

# ---------- plants dispatch reads differently, and the corrections for records ----------
adj = json.load(open(os.path.join(ROOT, 'facilities', 'dispatch_adjust.json'), encoding='utf8'))
glen, onepu = adj['plants']['Glenbrook Steel'], adj['plants']['Kawerau (Onepu)']
says('records', f'Glenbrook is multiplied by {glen}', 'dispatch_adjust.json')
says('records', f'Kawerau (Onepu) by {onepu}', 'dispatch_adjust.json')
for slug in ('generation', 'history', 'other-embedded'):
    says(slug, f'about {glen:.2f} times', 'Glenbrook, dispatch_adjust.json')
says('history', f'about {onepu:.2f} times', 'Kawerau (Onepu), dispatch_adjust.json')

# ---------- the price explainer ----------
x = constants('ingest/explain.py')
says('price-explainer', f'last {x["DAYS"]} days', 'explain.DAYS')
if x['POOL'] != 2:
    failures.append('price-explainer: the page says within an hour, explain.POOL has moved')

if failures:
    print('\n'.join(failures))
    sys.exit(1)
print('method pages agree with the constants in the code')
