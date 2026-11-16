"""Draw the big-number dashboard's map and scene backgrounds (site/src/lib/dashboard/backgrounds.js): Contours (Ruapehu,
Tongariro and Ngauruhoe), Cook Strait (the coastline, with the HVDC cable), Lines at sunset (a 220 kV double-circuit
lattice line) and Southern Alps at dusk (its snow). Aurora is kept as it is.

Contours and the coastline come from LINZ's New Zealand Contour-Interpolated 8m DEM (CC BY 4.0, credited on the screen
and on /methods/sources), read straight from LINZ's open elevation bucket on AWS, no account needed. The tiles (Topo50
sheets, ~25 MB each) are cached in data/linz/. Each 8 m grid is averaged to 40 m and smoothed, contoured, simplified
and drawn as quadratic curves through the midpoints, so the lines are smooth.

    pip install rasterio scikit-image shapely scipy numpy
    python3 analysis/dashboard_backgrounds.py           # rewrites backgrounds.js (the scenes it doesn't draw are kept)
"""
import json, math, os, re, sys, urllib.request
import numpy as np, rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.warp import transform
from scipy.ndimage import gaussian_filter, label
from shapely.geometry import LineString, Polygon
from skimage.measure import find_contours

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'site/src/lib/dashboard/backgrounds.js')
CACHE = os.path.join(ROOT, 'data/linz')
DEM = 'https://nz-elevation.s3.ap-southeast-2.amazonaws.com/new-zealand/new-zealand-contour/dem_8m/2193/'
W, H = 1600, 900     # every background's viewBox
RES = 40             # metres per cell after averaging


def mosaic(sheets):
    os.makedirs(CACHE, exist_ok=True)
    for s in sheets:
        f = os.path.join(CACHE, s + '.tiff')
        if not os.path.exists(f):
            print('fetching', s, file=sys.stderr)
            urllib.request.urlretrieve(DEM + s + '.tiff', f)
    src = [rasterio.open(os.path.join(CACHE, s + '.tiff')) for s in sheets]
    arr, tr = merge(src, res=RES, resampling=Resampling.average, nodata=-9999)
    a = arr[0].astype('float32')
    a[a <= -9000] = np.nan
    return a, tr.c, tr.f       # grid, west edge (m), north edge (m), NZTM


def nztm(lon, lat):
    x, y = transform('EPSG:4326', 'EPSG:2193', [lon], [lat])
    return x[0], y[0]


def frame(x0, y0, lon, lat, width_m, pad):
    """The rows and columns of a 16:9 view centred on lon, lat, with pad cells round it."""
    cx, cy = nztm(lon, lat)
    h = width_m * 9 / 16
    c0 = int((cx - width_m / 2 - x0) / RES); c1 = int((cx + width_m / 2 - x0) / RES)
    r0 = int((y0 - (cy + h / 2)) / RES); r1 = int((y0 - (cy - h / 2)) / RES)
    return (r0 - pad, r1 + pad, c0 - pad, c1 + pad), W / (c1 - c0), H / (r1 - r0), (cx - width_m / 2, cy + h / 2)


def dens(pts, step=24):
    """Extra points along long straight runs (a frame edge), so the smoothing rounds only their very ends."""
    out = [pts[0]]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        n = int(math.hypot(x2 - x1, y2 - y1) // step)
        out += [(x1 + (x2 - x1) * k / (n + 1), y1 + (y2 - y1) * k / (n + 1)) for k in range(1, n + 1)]
        out.append((x2, y2))
    return out


def curve(pts, edges=False):
    """A smooth SVG path through the points: quadratic curves between midpoints, whole numbers. edges: shapes cut by
    the frame (the coastline), whose long straight runs need extra points."""
    pts = dens(list(pts)) if edges else list(pts)
    p = [(round(x), round(y)) for x, y in pts]
    if len(p) < 3:
        return ''
    closed = p[0] == p[-1]
    m = [((p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2) for i in range(len(p) - 1)]
    f = lambda v: str(round(v))
    if closed:
        d = f'M{f(m[-1][0])} {f(m[-1][1])}'
        for i in range(len(m)):
            d += f'Q{p[i][0]} {p[i][1]} {f(m[i][0])} {f(m[i][1])}'
        return d + 'Z'
    d = f'M{p[0][0]} {p[0][1]}'
    for i in range(1, len(p) - 1):
        d += f'Q{p[i][0]} {p[i][1]} {f(m[i][0])} {f(m[i][1])}'
    return d + f'L{p[-1][0]} {p[-1][1]}'


def lines_at(Z, levels, sx, sy, pad, tol, min_len):
    out = []
    for lv in levels:
        for c in find_contours(Z, lv):
            ls = LineString([((col - pad) * sx, (row - pad) * sy) for row, col in c]).simplify(tol)
            if ls.length >= min_len:
                out.append(curve(ls.coords))
    return ''.join(out)


def contours():
    """Ruapehu, Tongariro and Ngauruhoe, 70 km across, Ruapehu above the cards: a line every 100 m, every 500 m bolder."""
    a, x0, y0 = mosaic([r + c for r in ('BG', 'BH', 'BJ') for c in ('33', '34', '35', '36', '37')])
    (r0, r1, c0, c1), sx, sy, _ = frame(x0, y0, 175.60, -39.30, 70000, 2)
    Z = gaussian_filter(np.where(np.isnan(a), 0, a), 4)[r0:r1, c0:c1]
    thin = lines_at(Z, [v for v in range(100, 2800, 100) if v % 500], sx, sy, 2, 2.4, 90)
    bold = lines_at(Z, range(500, 2800, 500), sx, sy, 2, 2.4, 90)
    return ('<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            '<rect width="1600" height="900" fill="#0c2628"></rect>'
            f'<path d="{thin}" fill="none" stroke="#6fd0bf" stroke-opacity="0.16" stroke-width="1.3" stroke-linejoin="round"></path>'
            f'<path d="{bold}" fill="none" stroke="#6fd0bf" stroke-opacity="0.38" stroke-width="2.2" stroke-linejoin="round"></path></svg>')


def strait():
    """Cook Strait, 128 km across, set south so the cable sits above the cards: the coastline (land above 0.5 m, rocks
    under ~6 ha dropped), faint land contours at 400, 800 and 1,200 m, and the HVDC from Benmore's direction to
    Fighting Bay, under the strait to Oteranga Bay, and on to Haywards."""
    sheets = ['BN28', 'BN29', 'BN32', 'BN33', 'BP27', 'BP28', 'BP29', 'BP30', 'BP31', 'BP32', 'BP33', 'BQ27', 'BQ28',
              'BQ29', 'BQ30', 'BQ31', 'BQ32', 'BQ33', 'BR27', 'BR28', 'BR29', 'BR33']
    a, x0, y0 = mosaic(sheets)
    land = (~np.isnan(a)) & (a > 0.5)
    lab, _ = label(land)
    size = np.bincount(lab.ravel()); size[0] = 0
    land = np.isin(lab, np.where(size >= 40)[0])
    pad = 24
    (r0, r1, c0, c1), sx, sy, (X0, Y1) = frame(x0, y0, 174.56, -41.40, 128000, pad)
    M = gaussian_filter(land[r0:r1, c0:c1].astype(float), 1.2)
    Z = gaussian_filter(np.where(land, np.nan_to_num(a), 0)[r0:r1, c0:c1], 3)
    fill = ''
    for c in find_contours(np.pad(M, 1), 0.5):
        ls = LineString([((col - 1 - pad) * sx, (row - 1 - pad) * sy) for row, col in c]).simplify(1.5)
        if ls.length >= 12:
            fill += curve(ls.coords, edges=True)
    relief = lines_at(Z, (400, 800, 1200), sx, sy, pad, 2, 50)
    def xy(lon, lat):
        x, y = nztm(lon, lat)
        return (x - X0) / RES * sx, (Y1 - y) / RES * sy
    fx, fy = xy(174.245, -41.29); ox, oy = xy(174.617, -41.303); hx, hy = xy(174.98, -41.153); bx, by = xy(173.95, -41.53)
    cable = f'M{fx:.0f} {fy:.0f} C {fx + 130:.0f} {fy + 14:.0f}, {ox - 130:.0f} {oy + 14:.0f}, {ox:.0f} {oy:.0f}'
    north = f'M{ox:.0f} {oy:.0f} C {ox + 90:.0f} {oy - 60:.0f}, {hx - 150:.0f} {hy + 90:.0f}, {hx:.0f} {hy:.0f}'
    south = f'M{fx:.0f} {fy:.0f} C {fx - 90:.0f} {fy + 80:.0f}, {bx + 150:.0f} {by - 140:.0f}, {bx - 60:.0f} 960'
    swell = ''.join(f'<path d="M-100 {y} q 50 -7 100 0' + ' t 100 0' * 17 + f'" fill="none" stroke="#9fd6ea" '
                    f'stroke-opacity="{0.05 + 0.025 * (i % 4):.3f}" stroke-width="1.4"></path>' for i, y in enumerate(range(30, 900, 42)))
    return ('<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            '<defs><linearGradient id="stsea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#062038"></stop>'
            '<stop offset="1" stop-color="#0b3a56"></stop></linearGradient><filter id="stglow" x="-10%" y="-10%" width="120%" '
            'height="120%"><feGaussianBlur stdDeviation="6"></feGaussianBlur></filter></defs>'
            f'<rect width="1600" height="900" fill="url(#stsea)"></rect><g class="swell">{swell}</g>'
            f'<path d="{fill}" fill="#0f2b29" fill-rule="evenodd" stroke="#7fc6c0" stroke-opacity=".35" stroke-width="1.4" stroke-linejoin="round"></path>'
            f'<path d="{relief}" fill="none" stroke="#7fc6c0" stroke-opacity=".12" stroke-width="1.1" stroke-linejoin="round"></path>'
            f'<path d="{north}{south}" fill="none" stroke="#ffd166" stroke-opacity=".55" stroke-width="2.2" stroke-dasharray="1 7" stroke-linecap="round"></path>'
            f'<path d="{cable}" fill="none" stroke="#ffd166" stroke-opacity=".35" stroke-width="10" filter="url(#stglow)"></path>'
            f'<path class="cable" d="{cable}" fill="none" stroke="#ffd166" stroke-width="3" stroke-dasharray="14 18" stroke-linecap="round"></path>'
            f'<circle cx="{fx:.0f}" cy="{fy:.0f}" r="6" fill="#ffd166"></circle><circle cx="{ox:.0f}" cy="{oy:.0f}" r="6" fill="#ffd166"></circle></svg>')


def pylons():
    """A 220 kV double-circuit steel lattice line receding into a sunset: tapered legs, X-braced panels, three crossarms
    each side (the middle one longest), an earth-wire peak, insulator strings, and conductors sagging between towers."""
    C = '#140c1e'
    f = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
    def tower(x, base, Ht):
        g = []; ins_d = []; sw = max(0.6, Ht / 260)
        L = lambda pts: g.append('M' + ' L'.join(f'{f(a)} {f(b)}' for a, b in pts))
        y = lambda t: base - t * Ht
        hw = lambda t: (0.16 - 0.12 * min(t, 0.58) / 0.58) * Ht if t <= 0.58 else 0.04 * Ht
        ts = [0, 0.08, 0.17, 0.27, 0.38, 0.5, 0.58, 0.64, 0.7, 0.76, 0.82, 0.88, 0.94]
        L([(x - hw(t), y(t)) for t in ts] + [(x - 0.02 * Ht, y(1.0))]); L([(x + hw(t), y(t)) for t in ts] + [(x + 0.02 * Ht, y(1.0))])
        for a, b in zip(ts, ts[1:]):
            L([(x - hw(a), y(a)), (x + hw(b), y(b))]); L([(x + hw(a), y(a)), (x - hw(b), y(b))]); L([(x - hw(b), y(b)), (x + hw(b), y(b))])
        tips = []
        for t, span in ((0.64, 0.2), (0.76, 0.25), (0.88, 0.21)):
            top = y(t); bot = y(t - 0.045); inner = hw(t)
            for s in (-1, 1):
                tip = (x + s * (inner + span * Ht), top)
                L([(x + s * inner, top), tip, (x + s * inner, bot)])
                for k in range(1, 4):
                    L([(x + s * (inner + span * Ht * k / 4), top), (x + s * (inner + span * Ht * (k - 0.5) / 4), top + (bot - top) * (1 - (k - 0.5) / 4))])
                ins = 0.05 * Ht
                ins_d.append(f'M{f(tip[0])} {f(tip[1] + 0.006 * Ht)} L{f(tip[0])} {f(tip[1] + ins)}')
                tips.append((tip[0], tip[1] + ins))
        pk = y(1.0)
        L([(x - 0.02 * Ht, pk), (x, pk - 0.02 * Ht), (x + 0.02 * Ht, pk)])
        for s in (-1, 1):
            L([(x + s * 0.02 * Ht, pk), (x + s * 0.07 * Ht, pk - 0.005 * Ht), (x + s * 0.02 * Ht, pk + 0.02 * Ht)])
        ew = [(x - 0.07 * Ht, pk - 0.005 * Ht), (x + 0.07 * Ht, pk - 0.005 * Ht)]
        disc = max(0.8, Ht / 200)
        svg = (f'<path d="{"".join(g)}" fill="none" stroke="{C}" stroke-width="{f(sw)}" stroke-linejoin="round" stroke-linecap="round"></path>'
               f'<path d="{"".join(ins_d)}" fill="none" stroke="{C}" stroke-width="{f(sw * 3.2)}" stroke-dasharray="{f(disc)} {f(disc * 0.55)}"></path>')
        return svg, tips, ew
    towers = [(1380, 872, 640), (980, 812, 400), (735, 786, 262), (580, 772, 178), (478, 764, 124), (410, 760, 88)]
    out = []; att = []
    for x, b, Ht in towers:
        s, tips, ew = tower(x, b, Ht); out.append(s); att.append((tips, ew))
    def sag(p, q, k):
        (x1, y1), (x2, y2) = p, q
        return f'M{f(x1)} {f(y1)} Q{f((x1 + x2) / 2)} {f((y1 + y2) / 2 + k * abs(x2 - x1))} {f(x2)} {f(y2)}'
    wires = []
    for (ta, ea), (tb, eb) in zip(att, att[1:]):
        wires += [sag(p, q, 0.07) for p, q in zip(ta, tb)] + [sag(p, q, 0.05) for p, q in zip(ea, eb)]
    wires += [sag(p, (1700, p[1] + 40), 0.06) for p in att[0][0] + att[0][1]]
    return ('<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            '<defs><linearGradient id="pysky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1238"></stop><stop offset=".45" stop-color="#5a2a5c"></stop>'
            '<stop offset=".72" stop-color="#d4664c"></stop><stop offset=".86" stop-color="#f2a85a"></stop><stop offset="1" stop-color="#f7cf7a"></stop></linearGradient>'
            '<radialGradient id="pysun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".8"></stop><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"></stop></radialGradient></defs>'
            '<rect width="1600" height="900" fill="url(#pysky)"></rect><circle cx="260" cy="760" r="210" fill="url(#pysun)"></circle><circle cx="260" cy="772" r="62" fill="#ffd98a" fill-opacity=".9"></circle>'
            '<path d="M0 800 C 160 770, 300 778, 420 770 C 560 760, 700 790, 860 782 C 1040 772, 1200 800, 1600 786 L1600 900 L0 900 Z" fill="#3a2038" fill-opacity=".85"></path>'
            '<path d="M0 840 C 300 822, 700 850, 1000 838 S 1400 852, 1600 836 L1600 900 L0 900 Z" fill="#241426"></path>'
            f'<path d="{"".join(wires)}" fill="none" stroke="{C}" stroke-width="1.6" stroke-opacity=".9"></path>' + ''.join(out) +
            '<path d="M0 878 C 400 862, 900 886, 1600 868 L1600 900 L0 900 Z" fill="#140c1e"></path></svg>')


def alps(old):
    """Southern Alps at dusk with deep snow: the main range white down a ragged snowline, shaded on the faces away
    from the setting sun, and snow on the second ridge's higher peaks. The rest of the scene is kept from `old`."""
    back = [(0, 520), (120, 430), (210, 470), (330, 330), (420, 400), (520, 300), (610, 380), (720, 340), (830, 420), (940, 360),
            (1060, 440), (1180, 400), (1300, 470), (1420, 390), (1520, 450), (1600, 420)]
    mid = [(0, 593), (80, 600), (160, 582), (240, 561), (320, 549), (400, 541), (480, 556), (560, 590), (640, 599), (720, 584),
           (800, 549), (880, 540), (960, 549), (1040, 573), (1120, 594), (1200, 599), (1280, 577), (1360, 541), (1440, 519),
           (1520, 549), (1600, 569)]
    def snow(ridge, base, line, ragged):
        landp = Polygon(ridge + [(1600, base), (0, base)])
        pts = [(x, line + ragged * (1.3 * math.sin(x * 0.029 + 0.4) + 0.55 * math.sin(x * 0.093 + 1.3) + 0.22 * math.sin(x * 0.31)
                                    + 0.12 * math.sin(x * 0.83))) for x in range(0, 1601, 5)]
        return landp.intersection(Polygon(pts + [(1600, 0), (0, 0)]))
    def shade(ridge, sn):
        out = []
        for (x0, y0), (x1, y1), (x2, y2) in zip(ridge, ridge[1:], ridge[2:]):
            if y1 < y0 and y1 < y2:
                out.append(Polygon([(x1, y1), (x2, y2), (x1 + (x2 - x1) * 0.15, y1 + 260)]).intersection(sn))
        return out
    def d(g):
        r = ''
        for p in getattr(g, 'geoms', [g]):
            if not p.is_empty and p.geom_type == 'Polygon':
                r += 'M' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in p.exterior.coords) + 'Z'
        return r
    S1 = snow(back, 640, 448, 15); S2 = snow(mid, 760, 562, 5)
    new1 = f'<path d="{d(S1)}" fill="#f3eef6" fill-opacity=".95"></path><path d="{"".join(d(t) for t in shade(back, S1))}" fill="#a9a3c8" fill-opacity=".55"></path>'
    new2 = f'<path d="{d(S2)}" fill="#e9dfea" fill-opacity=".82"></path><path d="{"".join(d(t) for t in shade(mid, S2))}" fill="#8f87b0" fill-opacity=".45"></path>'
    s = re.sub(r'<path d="[^"]*" fill="#f3eef6"[^>]*></path><path d="[^"]*" fill="#a9a3c8"[^>]*></path>', '', old)   # a previous run's snow
    s = re.sub(r'<path d="[^"]*" fill="#e9dfea"[^>]*></path><path d="[^"]*" fill="#8f87b0"[^>]*></path>', '', s)
    s = re.sub(r'<path d="M\d+ \d+ L\d+ \d+ L\d+ \d+ L\d+ \d+ L\d+ \d+ Z" fill="#f3f1f7" fill-opacity=".92"></path>', '', s)  # the first small caps
    for mark, new in (('fill="#6d7aa6"></path>', new1), ('fill="#4f5a86"></path>', new2)):
        i = s.index(mark) + len(mark)
        s = s[:i] + new + s[i:]
    return s


if __name__ == '__main__':
    js = open(OUT).read()
    kept = {k: json.loads(v) for k, v in re.findall(r'export const (\w+) = (".*?");\n', js)}
    svg = {'AURORA': kept['AURORA'], 'ALPS': alps(kept['ALPS']), 'CONTOURS': contours(), 'STRAIT': strait(), 'PYLONS': pylons()}
    head = ('// The big-number dashboard\'s drawn backgrounds (/dashboard), as SVG markup: the scenes that don\'t follow the data,\n'
            '// loaded only when one is picked. Horizon, Horizon light, Live mix and Plain colour are drawn in Stage.svelte. Each\n'
            '// is 1600 x 900, cropped to fit (xMidYMid slice); the classes tw, sway, sway2, blade, ripple, swell and cable are\n'
            '// animated in Stage.svelte, and stand still for viewers who ask for less motion. Contours, Cook Strait, Lines at\n'
            '// sunset and the Alps\' snow are drawn by analysis/dashboard_backgrounds.py (Contours and the coastline from LINZ\'s\n'
            '// 8 m DEM, CC BY 4.0, credited on the screen): rerun it rather than editing them here.\n\n')
    body = ''.join(f'export const {k} = {json.dumps(v, ensure_ascii=False)};\n' for k, v in svg.items())
    open(OUT, 'w').write(head + body + '\nexport const SVG = { aurora: AURORA, alps: ALPS, contours: CONTOURS, strait: STRAIT, pylons: PYLONS };\n')
    print({k: len(v) for k, v in svg.items()})
