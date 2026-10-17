"""The price explainer on /now ("Why is the price high?"): what's usual, and what the latest offers say.

History job (update(), every run, a few KV writes a day):
  hist/explain.json   "usual" for each half-hour of the week (NZ clock, Monday 0:00 = slot 0, 336 slots): the median,
                      25th and 75th percentile of max(Haywards, Benmore), pooled over the same kind of day (weekday or
                      weekend) within POOL half-hours of the time of day (as analysis/price_triggers.py tests it), and
                      the median of each factor below at that half-hour, over the last DAYS days of half-hourly history; plus `level`, the median of max(HAY, BEN) over the last
                      365 days. The page's rules compare the live price with both (analysis/price_triggers.py).
                      Wind follows the weather, not the clock, so it also gets `wind`: each region's median over the
                      whole four weeks and its half-hourly averages (for "lowest in N days"). `v` = VERSION.
  hist/offers.json    the newest day of generator energy offers (EMI BidsAndOffers/Offers, published the day after,
                      ~290 MB): each plant's offer stack per trading period, cumulative MW against $/MWh, final
                      offers only (IsLatestYesNo = Y). Fetched once a day, when a newer file appears.

Live job (live(), every 5 minutes, no extra writes): tracker.json gains `explain`:
  level, base_end, offers_day
  typ        {t0, step, med, p25, p75}: usual max(HAY, BEN) for each half-hour of the last 26 hours (the page's
             triggers and its 24-hour chart)
  usual/now  {NZ|NI|SI: {wind, solar, hydro, thermal, peakers, demand}, hvdc, gap}: each factor's usual value for
             this half-hour of the week, and its value in the newest interval
  wind       {NZ|NI|SI: {now, med, side, days, at_least}}: wind (30-minute average) against its four-week median, and
             how long before the current calm (or windy) spell it was last this low (or high) (wind_since)
  peakers    running peaking plants, [{name, mw}]
  setter     {NI|SI: {plant, fuel, mw, cap, price}}: the possible price setter, an estimate: a plant running part
             way up an offer tranche (in the latest offers, same trading period) priced near its island's price now

Factors: wind; solar = grid solar + embedded solar; hydro; thermal = coal + gas + diesel (Huntly's Rankines burn
either); peakers = the plants in PEAKERS; demand = grid demand; hvdc = mid-link transfer, northward positive;
gap = |HAY − BEN|.
"""
import gzip
import io
import json
import re
import time
from urllib.request import urlopen

import numpy as np
import pandas as pd

from common import BLOB, NZ

DAYS = 28                  # "usual": the last four weeks of history
SLOTS = 7 * 48             # half-hours in a week
REGIONS = ('NZ', 'NI', 'SI')
FACTORS = ('wind', 'solar', 'hydro', 'thermal', 'peakers', 'demand')
# fast-start plants that run mostly when prices are high (both the grouped and the register names)
PEAKERS = {'Junction Road', 'McKee', 'Stratford', 'Stratford Peaker 1', 'Stratford Peaker 2', 'Huntly 6', 'Whirinaki'}
OFFERS = 'Datasets/Wholesale/BidsAndOffers/Offers'
# the price setter: the tranche's price within this share of the island price (offers are a day old and nodes'
# prices differ from the reference node's by losses), and at least this far inside the tranche (MW)
SETTER_TOL, SETTER_INSIDE = 0.25, 1.0


def _arr(x):
    return np.array([np.nan if v is None else v for v in x], dtype=float)


def factors(js):
    """A tracker-layout dict (tracker.json or a hist/hh month) -> DataFrame by UTC time: hay, ben, hi, gap, hvdc and
    <region>_<factor> for each region and factor."""
    n = js['N']
    t = pd.to_datetime(js['t0'] + np.arange(n) * js['step'], unit='ms', utc=True)
    out = {}
    for isl in ('NI', 'SI'):
        S = js[isl]
        get = lambda k: _arr(S[k]) if k in S else np.zeros(n)   # noqa: E731
        out[f'{isl}_wind'] = get('wind')
        out[f'{isl}_solar'] = get('solar') + get('roof')
        out[f'{isl}_hydro'] = get('hydro')
        out[f'{isl}_thermal'] = get('coal') + get('gas') + get('diesel')
        out[f'{isl}_demand'] = get('metered')
        out[f'{isl}_peakers'] = sum((_arr(p['s']) for p in js.get('plants', []) if p['isl'] == isl and p['name'] in PEAKERS),
                                    np.zeros(n))
    for f in FACTORS:
        out[f'NZ_{f}'] = out[f'NI_{f}'] + out[f'SI_{f}']
    out['hay'], out['ben'] = _arr(js['NI']['price']), _arr(js['SI']['price'])
    out['hvdc'] = _arr(js['hvdcN']) if 'hvdcN' in js else np.full(n, np.nan)
    d = pd.DataFrame(out, index=t)
    d['hi'] = d[['hay', 'ben']].max(axis=1)
    d['gap'] = (d.hay - d.ben).abs()
    return d


def slot(t):
    """Half-hour of the week on the NZ clock (Monday 0:00 = 0) for a DatetimeIndex."""
    loc = t.tz_convert(NZ)
    return np.asarray(loc.dayofweek * 48 + loc.hour * 2 + (loc.minute >= 30), dtype=int)


def _r(x, dp=0):
    return [None if v != v else (round(float(v), dp) if dp else int(round(float(v)))) for v in x]


VERSION = 3   # bump when hist/explain.json changes, so the history job rewrites it on its next run
POOL = 2      # the price's usual pools half-hours within this many trading periods either side (an hour)


def baseline(frames, now=None):
    """Half-hourly history frames (factors()) -> the hist/explain.json dict."""
    d = pd.concat(frames).sort_index()
    d = d[~d.index.duplicated(keep='last')].dropna(subset=['hi'])
    end = d.index.max()
    level = float(d.hi[d.index > end - pd.Timedelta(days=365)].median())
    w = d[d.index > end - pd.Timedelta(days=DAYS)]
    g = w.groupby(slot(w.index))
    full = lambda s: s.reindex(range(SLOTS))   # noqa: E731
    med = g.median()
    # the price's usual: pooled over the same kind of day (weekday or weekend) within an hour of the time of day, so 40
    # to 100 prices rather than the same half-hour's four (two spill nights in four made $72 look "6x usual")
    ws = slot(w.index)
    kind, tod, v = ws // 48 >= 5, ws % 48, w.hi.to_numpy()
    pq = np.full((SLOTS, 3), np.nan)
    for k in range(SLOTS):
        near = (kind == (k // 48 >= 5)) & (np.abs((tod - k % 48 + 24) % 48 - 24) <= POOL)
        if near.sum() >= 20:
            pq[k] = np.percentile(v[near], [50, 25, 75])
    out = {
        'v': VERSION, 'built': int(time.time() * 1000), 'end': int(end.timestamp() * 1000) + 1800000, 'days': DAYS,
        'level': round(level, 2), 'peakers': sorted(PEAKERS),
        'hi': {'med': _r(pq[:, 0], 2), 'p25': _r(pq[:, 1], 2), 'p75': _r(pq[:, 2], 2)},
        'gap': _r(full(med.gap), 2), 'hvdc': _r(full(med.hvdc)),
    }
    for r in REGIONS:
        out[r] = {f: _r(full(med[f'{r}_{f}'])) for f in FACTORS}
    # wind follows the weather, not the clock: its "usual" is the median over the whole four weeks, and the live job
    # says how long since it was last this low (or high), from these half-hours and the live week
    grid = pd.date_range(w.index.min().floor('30min'), end, freq='30min')
    out['wind'] = {'t0': int(grid[0].timestamp() * 1000), 'step': 1800000,
                   **{r: {'med': _r([w[f'{r}_wind'].median()])[0],
                          's': _r(w[f'{r}_wind'].resample('30min').mean().reindex(grid))} for r in REGIONS}}
    return out


def months_back(today, n):
    m = pd.Period(today, 'M')
    return [str(m - i) for i in range(n - 1, -1, -1)]


def build_baseline(store, log=print):
    """hist/explain.json from the stored half-hourly months (hist/hh), or None if there's no history yet."""
    frames = []
    for m in months_back(pd.Timestamp.now(tz=NZ), 13):
        raw = store.get(f'hist/hh/{m}.json')
        if raw:
            frames.append(factors(json.loads(raw)))
    if not frames:
        return None
    b = baseline(frames)
    old = store.get('hist/explain.json')
    if old and (o := json.loads(old)).get('end') == b['end'] and o.get('v') == VERSION:
        return None   # history hasn't moved on (and the layout hasn't changed): keep the stored file (saves a KV write)
    log(f'explain: usual values from {DAYS} days of history to {pd.Timestamp(b["end"], unit="ms", tz="UTC").tz_convert(NZ):%d %b %H:%M}, '
        f'year median ${b["level"]:.2f}/MWh')
    return b


# --- offers ---------------------------------------------------------------------------------------------------

def latest_offers_name(today):
    """Newest daily offers file in the EMI container (this year's folder, or last year's in early January)."""
    for y in (today.year, today.year - 1):
        xml = urlopen(f'{BLOB}?restype=container&comp=list&prefix={OFFERS}/{y}/', timeout=60).read().decode()
        names = sorted(re.findall(r'<Name>([^<]*/\d{8}_Offers\.csv)</Name>', xml))
        if names:
            return names[-1]
    return None


def unit_plants():
    """(POC, unit) -> the plant name the site shows (register name, renamed, grouped)."""
    from build_tracker import plant_groups, register
    _, names, _ = register()
    groups = plant_groups()
    return {k: groups.get(n, n) for k, n in names.items()}


def reduce_offers(csv, plants):
    """A daily Offers CSV (file-like) -> {plant: [stack for trading period 1, 2, ...]}, each stack [[cum MW, $/MWh], ...]
    sorted by price: every unit's final energy offers combined."""
    cols = ['TradingPeriod', 'PointOfConnection', 'Unit', 'ProductType', 'ProductClass', 'IsLatestYesNo', 'Megawatts',
            'DollarsPerMegawattHour']
    keep = []
    for ch in pd.read_csv(csv, usecols=cols, chunksize=500_000, dtype={'PointOfConnection': str, 'Unit': str}):
        ch = ch[(ch.ProductType == 'Energy') & (ch.ProductClass == 'Injection') & (ch.IsLatestYesNo == 'Y') & (ch.Megawatts > 0)]
        keep.append(ch[['TradingPeriod', 'PointOfConnection', 'Unit', 'Megawatts', 'DollarsPerMegawattHour']])
    d = pd.concat(keep)
    d['plant'] = [plants.get((p, u)) for p, u in zip(d.PointOfConnection, d.Unit)]
    d = d.dropna(subset=['plant'])
    ntp = int(d.TradingPeriod.max())
    out = {}
    for plant, g in d.groupby('plant'):
        stacks = []
        for tp in range(1, ntp + 1):
            x = g[g.TradingPeriod == tp].sort_values('DollarsPerMegawattHour')
            cum = x.Megawatts.cumsum().to_numpy()
            stacks.append([[round(float(c), 1), round(float(p), 2)] for c, p in zip(cum, x.DollarsPerMegawattHour)])
        out[plant] = stacks
    return out


def build_offers(store, log=print):
    """hist/offers.json for the newest published day, or None if it's already stored (or nothing is published)."""
    have = store.get('hist/offers.json')
    have_day = json.loads(gzip.decompress(have))['day'] if have else None
    name = latest_offers_name(pd.Timestamp.now(tz=NZ))
    if not name:
        return None
    day = re.search(r'(\d{8})_Offers', name).group(1)
    day = f'{day[:4]}-{day[4:6]}-{day[6:]}'
    if day == have_day:
        return None
    t0 = time.time()
    with urlopen(f'{BLOB}/{name}', timeout=600) as r:
        stacks = reduce_offers(io.BufferedReader(r, 1 << 20), unit_plants())
    log(f'explain: offers for {day}, {len(stacks)} plants, in {time.time() - t0:.0f} s')
    return {'day': day, 'plants': stacks}


def update(store, log=print):
    """History job: refresh hist/explain.json (every run) and hist/offers.json (when a new day is published), within
    the job's KV write allowance (store.room)."""
    for key, make in (('hist/explain.json', build_baseline), ('hist/offers.json', build_offers)):
        if not store.room(1):
            log(f'explain: no KV writes left today for {key}; next run')
            return
        try:
            obj = make(store, log)
        except Exception as e:  # noqa: BLE001  (the explainer must never stop the history job)
            log(f'explain: {key} not updated ({type(e).__name__}: {e})')
            continue
        if obj is None:
            continue
        body = json.dumps(obj, separators=(',', ':'), allow_nan=False).encode()
        if key.endswith('offers.json'):
            store.put(key, gzip.compress(body), 'application/gzip')
        else:
            store.put(key, body, 'application/json')


# --- live -----------------------------------------------------------------------------------------------------

def trading_period(t):
    """Trading period (1-based) of a UTC timestamp on the NZ clock (clock-change days: off by one hour)."""
    loc = t.tz_convert(NZ)
    return loc.hour * 2 + (loc.minute >= 30) + 1


def setter(js, d, offers, isl):
    """The possible price setter in island `isl` for the newest interval, or None."""
    price = float(d[{'NI': 'hay', 'SI': 'ben'}[isl]].iloc[-1])
    if not offers or not price == price or price < 5:   # near zero there is no single marginal plant to name
        return None
    tp = trading_period(d.index[-1])
    best = None
    for p in js.get('plants', []):
        if p['isl'] != isl or p['name'] not in offers['plants']:
            continue
        mw = float(p['s'][-1] or 0)
        stacks = offers['plants'][p['name']]
        if mw < SETTER_INSIDE or tp > len(stacks):
            continue
        prev = 0.0
        for cum, pr in stacks[tp - 1]:
            if cum > mw + SETTER_INSIDE:
                if mw > prev + SETTER_INSIDE:   # part way up this tranche: marginal
                    score = abs(pr - price) / max(price, 10.0)
                    if score <= SETTER_TOL and (best is None or score < best[0]):
                        best = (score, {'plant': p['name'], 'fuel': p['fuel'], 'mw': round(mw), 'cap': p.get('cap'), 'price': pr})
                break
            prev = cum
    return best[1] if best else None


def wind_since(base, d, r):
    """Region r's wind now (30-minute average) against its four-week median and the recent past: {now, med, side, days,
    at_least}. side: 'low' below the median, 'high' above. The current spell is the run of half-hours on that side of
    the median up to now; days: how long before this spell wind was last as low (or as high) as now, over the stored
    four weeks and the live week, if at least a day (else None); at_least: never in that window (days = its length)."""
    W = base['wind']
    hist = pd.Series(W[r]['s'], index=pd.to_datetime(W['t0'] + np.arange(len(W[r]['s'])) * W['step'], unit='ms', utc=True), dtype=float)
    livew = d[f'{r}_wind'].resample('30min').mean()
    s = pd.concat([hist[hist.index < livew.index[0]], livew]).dropna()
    nw, med = float(d[f'{r}_wind'].iloc[-6:].mean()), W[r]['med']
    before = s[s.index < d.index[-1].floor('30min')]   # half-hours before the current one
    if before.empty or med is None:
        return None
    low = nw < med
    v = before.to_numpy()
    same = v < med if low else v > med
    k = len(v)
    while k > 0 and same[k - 1]:   # back to the start of this spell
        k -= 1
    hit = np.flatnonzero((v[:k] <= nw) if low else (v[:k] >= nw))
    t_end = d.index[-1]
    if len(hit) == 0:
        days, at_least = (t_end - before.index[0]).total_seconds() / 86400, True
    else:
        days, at_least = (t_end - before.index[hit[-1]]).total_seconds() / 86400, False
    return {'now': int(round(nw)), 'med': med, 'side': 'low' if low else 'high',
            'days': round(days, 1) if days >= 1 else None, 'at_least': at_least and days >= 1}


def live(js, base, offers=None):
    """tracker.json's `explain` block from the live data, hist/explain.json and hist/offers.json (dicts)."""
    if not base:
        return None
    d = factors(js)
    now = d.index[-1]
    k = int(slot(d.index[-1:])[0])
    # usual max(HAY, BEN) for each half-hour from 26 hours ago to now
    t0 = (now - pd.Timedelta(hours=26)).floor('30min')
    hh = pd.date_range(t0, now.floor('30min'), freq='30min')
    ks = slot(hh)
    pick = lambda xs: [xs[i] for i in ks]   # noqa: E731
    block = {
        'level': base['level'], 'base_end': base['end'], 'offers_day': offers['day'] if offers else None,
        'typ': {'t0': int(hh[0].timestamp() * 1000), 'step': 1800000,
                'med': pick(base['hi']['med']), 'p25': pick(base['hi']['p25']), 'p75': pick(base['hi']['p75'])},
        'usual': {r: {f: base[r][f][k] for f in FACTORS} for r in REGIONS},
        'now': {r: {f: _r([d[f'{r}_{f}'].iloc[-1]])[0] for f in FACTORS} for r in REGIONS},
        'peakers': sorted(({'name': p['name'], 'mw': int(round(p['s'][-1] or 0))} for p in js.get('plants', [])
                           if p['name'] in PEAKERS and (p['s'][-1] or 0) >= 5), key=lambda x: -x['mw']),
        'setter': {isl: setter(js, d, offers, isl) for isl in ('NI', 'SI')},
    }
    if 'wind' in base:
        block['wind'] = {r: wind_since(base, d, r) for r in REGIONS}
    block['usual'].update({'hvdc': base['hvdc'][k], 'gap': base['gap'][k]})
    block['now'].update({'hvdc': _r([d.hvdc.iloc[-1]])[0], 'gap': _r([d.gap.iloc[-1]], 2)[0]})
    return block


def load(store):
    """(hist/explain.json, hist/offers.json) from the store as dicts (None where missing)."""
    b, o = store.get('hist/explain.json'), store.get('hist/offers.json')
    return (json.loads(b) if b else None), (json.loads(gzip.decompress(o)) if o else None)
