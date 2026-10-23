"""Smoke test for the ingest code, run on every push (.github/workflows/checks.yml) and locally:

  python3 ingest/tests/smoke.py

Uses one hour of a real daily dispatch file (15 Oct 2026, 6:15-7:10 pm, sample_dispatch.csv.gz) and the matching
interim final prices for the reference and Prices-page nodes (sample_final.csv). No network, no keys, no store.
Checks that the live path (state.compact -> merge -> assemble) and the history path (half-hourly state -> final
prices -> build_month -> daily summary -> combine_days) still run and produce the fields the website reads.
"""
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp(prefix='elenz-smoke-')
os.environ['ELENZ_DATA'] = os.path.join(tmp, 'data')
os.environ['ELENZ_OUT'] = os.path.join(tmp, 'out')
sys.path.insert(0, os.path.dirname(HERE))

import json  # noqa: E402

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import build_tracker as bt  # noqa: E402
import history  # noqa: E402
import state as st  # noqa: E402
from common import overrides  # noqa: E402

failures = []


def check(cond, msg):
    print(('ok    ' if cond else 'FAIL  ') + msg)
    if not cond:
        failures.append(msg)


raw = pd.read_csv(os.path.join(HERE, 'sample_dispatch.csv.gz'), keep_default_na=False)

# ---------- live path ----------
s = st.merge(None, st.compact(raw, 'file'))
check(len(s) == 12, f'compact: 12 five-minute intervals ({len(s)})')
check({'P|NI', 'P|SI', 'L|NI', 'L|SI', 'T'} <= set(s.columns), 'compact: reference prices, island load, Tiwai')
check(s['P|NI'].between(-100, 20000).all() and s['P|SI'].between(-100, 20000).all(), 'compact: reference prices plausible')
check('P|WKM' in s and s['P|WKM'].notna().all(), 'compact: Whakamaru price (a generating node, in the daily files)')
s2 = st.loads(st.dumps(s))
check(s2.shape == s.shape, 'state: survives the gzip round trip')
check(not len(st.suspect(s)), 'partial: no complete interval flagged')
# an incomplete case (19 Oct 2026, 13:00 NZDT): most rows missing from one interval
t6 = sorted(raw.IntervalDateTime.unique())[6]
cut = raw[(raw.IntervalDateTime != t6) | (np.arange(len(raw)) % 4 == 0)]
sp = st.mark_partial(st.merge(None, st.compact(cut, 'file')), log=lambda *a: None)
check(list(sp.index[sp.src == 'partial']) == [s.index[6]], 'partial: the incomplete interval, and only it, marked')
sp = st.mark_partial(st.merge(sp, s.iloc[[6]]), log=lambda *a: None)
check(not (sp.src == 'partial').any(), 'partial: put back once the whole case arrives')
check(bt.runs(np.array([0, 1, 1, 0, 1], bool)) == [[1, 2], [4, 1]], 'partial: filled intervals listed as runs')

full = pd.date_range(s.index.min(), s.index.max(), freq='5min')
g = s.reindex(full)
zero = pd.Series(0.0, index=full)
js = bt.assemble(g, full, {'NI': zero, 'SI': zero}, log=lambda *a: None)
gen = sum(np.array(js[i][k]) for i in ('NI', 'SI') for k in bt.KEYS if k != 'batt')
check(js['N'] == len(full) and len(js['NI']['price']) == len(full), 'assemble: series on the time grid')
check(gen.min() > 2000, f'assemble: NZ generation above 2,000 MW at the evening peak ({gen.min():.0f})')
check(all(k in js['NI'] for k in bt.KEYS), 'assemble: every fuel key present, including bio and waste')
names = {p['name']: p['fuel'] for p in js['plants']}
check(names.get('Kinleith') == 'bio' and names.get('Kawerau Mill CoGen') == 'bio' and names.get('Glenbrook Steel') == 'waste',
      'assemble: Kinleith is bioenergy, Glenbrook waste heat')
check('WKM' in js.get('nodes', {}), 'assemble: node prices written')
json.dumps(js, allow_nan=False)
check(True, 'assemble: JSON has no NaN')

# ---------- history path ----------
hh = s.drop(columns=['src', 'R'])
tp = hh.index.floor('30min')
h = hh.groupby(tp).mean()
h.insert(0, 'n', hh.groupby(tp).size())
h.index.name = 't'
for c in history.irr_cols():
    h[c] = np.nan
with open(os.path.join(HERE, 'sample_final.csv'), 'rb') as f:
    fin = history.parse_final(f.read(), interim=True)
check(fin is not None and set(history.final_cols()) <= set(fin.columns), 'parse_final: reference and extra nodes')
h = h.join(fin, how='left')
cols = history.final_cols()
check(h[cols].notna().all().all(), 'parse_final: every half-hour of the sample priced')
cap = bt.default_capacity()
hhj, dd = history.build_month(h, '2026-10', cap, log=lambda *a: None)
json.dumps(hhj, allow_nan=False)
json.dumps(dd, allow_nan=False)
check(abs(hhj['NI']['price'][0] - float(fin['F|NI'].iloc[0])) < 0.01, 'build_month: history uses the final price')
check(set(overrides()['price_nodes']) <= set(hhj.get('nodes', {})), 'build_month: every extra node in the half-hourly file')
import tod  # noqa: E402
tp = tod.profile(hhj)
check(len(tp['NI']['hydro']) == 48 and len(tp['SI']['price']) == 48 and sum(x is not None for x in tp['NI']['hydro']) >= 1,
      'tod: a month by half-hour of the day (48 slots)')
for k in ('p10', 'p90', 'pmin', 'pmax', 'n500', 'n1000', 'rv_hydro', 'rv_geo', 'batt_d', 'batt_c', 'rv_battc'):
    check(k in dd['NI'] and len(dd['NI'][k]) == len(dd['t']), f'daily: {k}')
check(dd['NI']['pmin'][0] <= dd['NI']['p10'][0] <= dd['NI']['p90'][0] <= dd['NI']['pmax'][0], 'daily: pmin <= p10 <= p90 <= pmax')
cap_h = dd['NI']['rv_hydro'][0] / max(dd['NI']['hydro'][0], 1)
check(dd['NI']['pmin'][0] * 0.9 <= cap_h <= dd['NI']['pmax'][0] * 1.1, f'daily: hydro captured price within the day\'s range ({cap_h:.0f})')
day = history.combine_days([dd, dd])
check(day['N'] == 2 * len(dd['t']) and len(day['nodes']['OTA']) == day['N'], 'combine_days: node prices joined')
check(len(day['NI']['p10']) == day['N'], 'combine_days: price spread joined')

# ---------- metered history path (metered.py) ----------
# one day of each metered file (15 Sep 2026, and 15 Aug 1997 in the early file layouts), in sample_metered/
import gzip  # noqa: E402
from datetime import date  # noqa: E402

import hvdc  # noqa: E402
import metered as mt  # noqa: E402

MET = os.path.join(HERE, 'sample_metered')


def met_get(url, timeout=None):
    p = os.path.join(MET, url.split('/')[-1] + '.gz')
    return gzip.open(p).read() if os.path.exists(p) else None


ms = mt.fetch_month(met_get, date(2026, 9, 1), log=lambda *a: None)
check(ms is not None and len(ms) == 48, f'metered: one day of trading periods ({0 if ms is None else len(ms)})')
check(mt.complete(ms, date(2026, 9, 1)), 'metered: Generation_MD, grid flows and embedded generation all present')
mgen = mt.generation(ms, '2026-09', log=lambda *a: None)
mtot = sum(sum(v.values()) for v in mgen.values())
check(3500 < float(mtot.mean()) < 7000, f'metered: NZ generation plausible ({float(mtot.mean()):.0f} MW)')
mnames = {k[0] for k in mgen}
check({'Huntly Rankines', 'Manapōuri', 'Mangahao', 'Kinleith'} <= mnames, 'metered: stations mapped by metered_plants.csv')
mang = sum(mgen[[k for k in mgen if k[0] == 'Mangahao'][0]].values())
net = ms['M|MHO0331 mangahao'].mean()
check(float(mang.mean()) > 3 * net, f'metered: Mangahao gross from the embedded meter ({float(mang.mean()):.1f} MW, net {net:.1f})')
mfull = pd.date_range(ms.index.min(), ms.index.max(), freq='30min')
mg = ms.reindex(mfull)
mg['src'] = 'file'
mg['n'] = 0
mjs = bt.assemble(mg, mfull, {'NI': pd.Series(0.0, index=mfull), 'SI': pd.Series(0.0, index=mfull)}, log=lambda *a: None, metered=mgen)
dem = np.array(mjs['NI']['metered']) + np.array(mjs['SI']['metered'])
mgent = sum(np.array(mjs[i][k]) for i in ('NI', 'SI') for k in bt.KEYS)
check(0.9 < dem.mean() / mgent.mean() < 1.0, f'metered: demand a little under generation (losses; {dem.mean():.0f} vs {mgent.mean():.0f} MW)')
check(np.mean(mjs['SI']['tiwai']) > 300, 'metered: Tiwai from Grid_export_to_Tiwai')
hl = [p for p in mjs['plants'] if p['name'] == 'Huntly Rankines']
check(bool(hl) and hl[0]['cap'] and hl[0]['units'], 'metered: Huntly Rankines one plant with capacity and units')
o97 = mt.fetch_month(met_get, date(1997, 8, 1), log=lambda *a: None)
check(o97 is not None and len(o97) == 48 and mt.complete(o97, date(1997, 8, 1)), 'metered 1997: early layout (dd/mm/yyyy dates) read')
g97 = mt.generation(o97, '1997-08', log=lambda *a: None)
t97 = sum(sum(v.values()) for v in g97.values())
check(3000 < float(t97.mean()) < 6000, f'metered 1997: generation plausible ({float(t97.mean()):.0f} MW)')


def _clock_csv(day, n, missing=()):
    """A one-row Generation_MD day with TP k = k (blank for missing and beyond n), dd/mm/yyyy dates as before 2009."""
    vals = ['' if k in missing or k > n else str(k * 500) for k in range(1, 51)]
    return (f'POC_Code,Gen_Code,Trading_date,{",".join(f"TP{k}" for k in range(1, 51))}\n'
            f'ABC0111,abc,{day:%d/%m/%Y},{",".join(vals)}\n').encode()


fw = mt.read_emi(_clock_csv(date(2005, 10, 2), 46, missing=(5, 6))).set_index('t').mw   # clocks forward, by the clock
fw_mw = fw.tolist()
check(len(fw) == 46 and fw_mw[:4] == [1, 2, 3, 4] and fw_mw[4] == 7 and fw_mw[43] == 46 and fw_mw[44:] == [46, 46],
      'metered: clocks-forward day numbered by the clock renumbered straight (last hour from TP46)')
bk = mt.read_emi(_clock_csv(date(2005, 3, 20), 48)).set_index('t').mw.tolist()          # clocks back, 48 periods
check(len(bk) == 50 and bk[:6] == [1, 2, 3, 4, 5, 6] and bk[6:8] == [5, 6] and bk[49] == 48,
      'metered: clocks-back day numbered by the clock renumbered straight (repeated hour from TP5-6)')
st50 = mt.read_emi(_clock_csv(date(2026, 4, 5), 50)).set_index('t').mw.tolist()         # already straight: unchanged
check(st50 == [float(k) for k in range(1, 51)], 'metered: a straight-numbered clock-change day left as it is')
check(mt.clock_month(date(2005, 3, 1)) and not mt.clock_month(date(2005, 4, 1)) and not mt.clock_month(date(2009, 4, 1)),
      'metered: months with a clock-numbered change day are refetched')
h97 = hvdc.parse_metered(met_get('x/199708_HVDC_flows.csv'))
h26 = hvdc.parse_metered(met_get('x/202609_HVDC_flows.csv'))
check(len(h97) == 48 and h97['H|BEN'].abs().max() > 50, 'hvdc: 1997 layout (HVDC_BN/BS/HN/HS) parsed')
check(len(h26) == 48 and (h26['H|BEN'] - h26['H|HAY']).abs().mean() < 80, 'hvdc: current layout parsed, ends within link losses')
# the two-row months (HVDC_BN and HVDC_HS only, Dec 1997-Dec 2002): the receiving ends are estimated, not zero
_hdr = 'POC,NWK_Code,GENERATION_TYPE,TRADER,UNIT_MEASURE,FLOW_DIRECTION,STATUS,TRADING_DATE,' + ','.join(f'TP{i}' for i in range(1, 51))
_row = lambda poc, kwh: f'{poc},QQQQ,DC,TPNZ,kWh,X,F,01/06/2001,' + ','.join([str(kwh)] * 48) + ',,'   # noqa: E731
h2 = hvdc.parse_metered((_hdr + '\n' + _row('HVDC_BN', 500000) + '\n' + _row('HVDC_HS', 0) + '\n').encode())
_loss = hvdc.LOSS_NORTH[0] * 1000 + hvdc.LOSS_NORTH[1] * 1000 ** 2
check(abs(h2['H|BEN'].iloc[0] - 1000) < 1 and abs(h2['H|HAY'].iloc[0] - (1000 - _loss)) < 1,
      'hvdc: two-row layout, Haywards estimated as Benmore less the link losses (%.0f MW)' % h2['H|HAY'].iloc[0])
_mid = pd.Series([500.0, -500.0, 0.0])
_ben, _hay = hvdc.ends(_mid)
check(_ben[0] > 500 > _hay[0] and _hay[1] < -500 < _ben[1] and _ben[2] == _hay[2] == 0,
      'hvdc: the sending end carries the extra losses both ways (Benmore northward, Haywards southward)')

# the /now price explainer (explain.py): usual values from history, offer stacks, the live block and price setter
import explain as ex  # noqa: E402

base = ex.baseline([ex.factors(hhj)])
check(len(base['hi']['med']) == ex.SLOTS and len(base['NZ']['wind']) == ex.SLOTS and base['level'] > 0,
      'explain: usual values for every half-hour of the week, and a year median')
run = [p for p in js['plants'] if p['isl'] == 'NI' and p['fuel'] in ('hydro', 'gas', 'geo') and p['s'][-1] > 20]
pl = run[0]
mw, price = float(pl['s'][-1]), float(js['NI']['price'][-1])
tp = ex.trading_period(pd.Timestamp(js['t0'] + (js['N'] - 1) * js['step'], unit='ms', tz='UTC'))
rows = [f'2026-10-15,{tp},XX,XXX0001,U1,Energy,Injection,,,2026-10-14,00:00,1,Y,{i + 1},999,999,,999,,{m},{p}'
        for i, (m, p) in enumerate([(mw - 10, 0.01), (20, round(price * 1.05, 2)), (50, 9999)])]
rows.append(f'2026-10-15,{tp},XX,XXX0001,U1,Energy,Injection,,,2026-10-14,00:00,1,N,1,999,999,,999,,500,0.01')  # superseded
head = ('TradingDate,TradingPeriod,ParticipantCode,PointOfConnection,Unit,ProductType,ProductClass,ReserveType,'
        'ProductDescription,UTCSubmissionDate,UTCSubmissionTime,SubmissionOrder,IsLatestYesNo,Tranche,'
        'MaximumRampUpMegawattsPerHour,MaximumRampDownMegawattsPerHour,PartiallyLoadedSpinningReservePercent,'
        'MaximumOutputMegawatts,ForecastOfGenerationPotentialMegawatts,Megawatts,DollarsPerMegawattHour')
import io as _io  # noqa: E402
stacks = ex.reduce_offers(_io.StringIO('\n'.join([head] + rows)), {('XXX0001', 'U1'): pl['name']})
check(len(stacks.get(pl['name'], [])) == tp and len(stacks[pl['name']][tp - 1]) == 3, 'explain: offers reduced to a stack (final offers only)')
E = ex.live(js, base, {'day': '2026-10-15', 'plants': stacks})
check(E is not None and len(E['typ']['med']) >= 52 and set(E['now']) >= {'NZ', 'NI', 'SI', 'hvdc', 'gap'}, 'explain: live block written')
check((E['setter']['NI'] or {}).get('plant') == pl['name'], f'explain: price setter found part way up a tranche ({pl["name"]})')
json.dumps(E, allow_nan=False)
check(ex.live(js, None) is None, 'explain: no block without usual values')
wnd = (E.get('wind') or {}).get('NZ') or {}
check(base.get('v') == ex.VERSION and len(base['wind']['NZ']['s']) > 0 and wnd.get('side') in ('low', 'high') and wnd.get('med') is not None,
      'explain: wind against its four-week median, with recent half-hours')

# records (records.py): month summaries, official and provisional records, runs, settling a provisional record
import copy  # noqa: E402
import records as rc  # noqa: E402

m_off = copy.deepcopy(hhj)
m_off['meta'].update({'source': 'metered', 'final_prices': 1.0, 'hvdc_metered': 1.0})
s_off = rc.summarise(m_off)
nzd = np.array(m_off['NI']['metered']) + np.array(m_off['SI']['metered'])
R = rc.build([s_off], None, lambda m: m_off, now_ms=1)
dm = R['records']['demand_max']['NZ']
check(dm['v'] == int(np.nanmax(nzd)) and dm['steps'][-1] == [dm['t'], dm['v']], 'records: peak demand from the month (progression ends at the record)')
check('ctx' in dm and len(dm['ctx']['day']['v']) >= 1 and dm['ctx']['demand'] == dm['v'], 'records: context for the record half-hour')
check(R['runs']['low_price_run'].get('NZ') is not None or (np.maximum(np.array(m_off['NI']['price']), m_off['SI']['price']) >= rc.LOW_PRICE).all(),
      'records: runs joined')
json.dumps(R, allow_nan=False)
# a later month on dispatch data with higher demand: a provisional record, then confirmed once its metering is in
m_new = copy.deepcopy(m_off)
m_new['t0'] = m_off['t0'] + m_off['N'] * m_off['step']
m_new['meta'].update({'month': '2026-11', 'source': 'dispatch'})
for isl in ('NI', 'SI'):
    m_new[isl]['metered'] = [v + 500 for v in m_new[isl]['metered']]
s_new = rc.summarise(m_new)
R2 = rc.build([s_off, s_new], R, lambda m: m_new if m == '2026-11' else m_off, now_ms=2)
p2 = R2['records']['demand_max']['NZ'].get('prov')
check(p2 is not None and p2['v'] > dm['v'] and R2['records']['demand_max']['NZ']['v'] == dm['v'], 'records: dispatch month sets a provisional record only')
m_new['meta']['source'] = 'metered'
R3 = rc.build([s_off, rc.summarise(m_new)], R2, lambda m: m_new if m == '2026-11' else m_off, now_ms=3)
d3 = R3['records']['demand_max']['NZ']
check(d3['v'] == p2['v'] and d3.get('since') == 3 and any(x['k'] == 'demand_max' and x['r'] == 'NZ' and x['ok'] for x in R3['resolved']),
      'records: confirmed when the metered month arrives (new, and listed as settled)')
check(not rc.same(R2, R3) and rc.same(R3, {**R3, 'built': 0}), 'records: republished only when something changed')
# the current period so far (records.js pace): the newest day's period, each series' sum and count in half-hours
pc = R['pace']
dsum = pc['day']['sums']['NZ']['dem']
last_day = s_off['days']['t'][-1]
dn = [v for t, v in zip(np.array(m_off['t0']) + np.arange(m_off['N']) * m_off['step'], nzd) if t >= last_day and v == v]
check(pc['to'] == s_off['end'] + s_off['step'] and pc['day']['start'] == last_day and dsum[1] == len(dn) and abs(dsum[0] - sum(dn)) < 1,
      'records: the current day so far (pace)')
det = rc.build_detail([s_off], R, lambda m: m_off)
dser = det['period'].get('day', {}).get('demand_max', {}).get('NZ')
check(det['bg']['demand_max']['tp']['NZ'][0] == dm['v'] and (dser is None or (dser['t'] == R['periods']['day']['demand_max']['NZ']['t'] and len(dser['v']) >= 46)),
      'records: detail (best by month behind the progression, the record day itself)')
json.dumps(det, allow_nan=False)
check(R['records']['hydro_min']['NZ']['v'] <= R['records']['hydro_max']['NZ']['v'] and 'price_min' in R['records'] and 'fossil_max' in R['records'],
      'records: hydro high and low, most fossil, lowest price')

# offered capacity (offered.py): final energy offers summed by plant, the cheap part under $1,000, headroom lows
import io as _io  # noqa: E402
import time as _time  # noqa: E402
from datetime import date as _date  # noqa: E402

import offered as of  # noqa: E402
hdr = ('TradingDate,TradingPeriod,ParticipantCode,PointOfConnection,Unit,ProductType,ProductClass,ReserveType,'
       'ProductDescription,UTCSubmissionDate,UTCSubmissionTime,SubmissionOrder,IsLatestYesNo,Tranche,'
       'MaximumRampUpMegawattsPerHour,MaximumRampDownMegawattsPerHour,PartiallyLoadedSpinningReservePercent,'
       'MaximumOutputMegawatts,ForecastOfGenerationPotentialMegawatts,Megawatts,DollarsPerMegawattHour')
rows = [('MAN2201', 'MAN0', 'Energy', 'Injection', 'Y', 300, 10), ('MAN2201', 'MAN0', 'Energy', 'Injection', 'Y', 200, 2000),
        ('MAN2201', 'MAN0', 'Energy', 'Injection', 'N', 999, 1), ('HLY2201', 'HLY5', 'Energy', 'Injection', 'Y', 100, 500),
        ('HLY2201', 'HLY5', 'Reserve', 'Injection', 'Y', 50, 1), ('XXX0001', 'ZZZ0', 'Energy', 'Injection', 'Y', 40, 1)]
csv_text = hdr + '\n' + '\n'.join(f'2026-10-16,{tp},P,{poc},{u},{pt},{pc},,x,2026-10-15,00:00:00.000,1,{y},1,,,,,,{mw},{pr}'
                                     for tp in (1, 2) for poc, u, pt, pc, y, mw, pr in rows)
table = of.units()
unk = {}
red = of.reduce_day(_io.StringIO(csv_text), table, unk)
man = next(k for k in red if k.startswith('Manap'))
check(red[man][0][0] == 500 and red[man][1][0] == 300, f'offered: Manapōuri TP1 offered 500, under $1,000 300 ({red[man][0][0]}, {red[man][1][0]})')
check(red['Huntly 5'][0][1] == 100 and red['Huntly 5'][1][1] == 100, 'offered: Huntly 5 TP2 100 MW, all under $1,000; reserve and old offers ignored')
check('XXX0001 ZZZ0' in unk, 'offered: a unit the register lacks is skipped and reported')
of.fetch_day = lambda d, t, u: of.reduce_day(_io.StringIO(csv_text), t, u)
off, offp, added = of.build_month(_date(2026, 10, 1), None, None, table, [_date(2026, 10, 16)], lambda *a: None, _time.time() + 60)
i0 = of.day_index(_date(2026, 10, 16), off['t0'])
check(added == 1 and off['SI']['hydro']['o'][i0] == 500 and off['NI']['gas']['c'][i0 + 1] == 100 and off['SI']['hydro']['o'][i0 + 2] == 0
      and off['SI']['hydro']['o'][i0 - 1] is None, 'offered: month grid filled for the day (zero where nothing offered, null before)')
hh_fake = {'t0': off['t0'], 'N': off['N'], 'NI': {f: [0] * off['N'] for f in of.DISPATCH}, 'SI': {f: [0] * off['N'] for f in of.DISPATCH}}
hh_fake['SI']['hydro'] = [450] * off['N']
sm = of.summarise(off, hh_fake)
j = sm['t'].index(int(pd.Timestamp('2026-10-16', tz='Pacific/Auckland').timestamp() * 1000))
check(sm['lowO']['NZ'][j] == 0 and sm['lowC']['SI'][j] == 0 and sm['lowOx']['NI'][j] == 0 and sm['lowO']['SI'][j - 1] is None,
      'offered: daily lowest headroom (offered less output, never below zero; no offers, no figure)')

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
