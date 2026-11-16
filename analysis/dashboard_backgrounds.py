"""Draw the big-number dashboard's map and scene backgrounds (site/src/lib/dashboard/backgrounds.js): Contours
(Ruapehu), Cook Strait (the coastline, with the HVDC cable and its overland lines), Lines at sunset (a 220 kV
double-circuit lattice line) and Southern Alps at dusk (its snow, and the range raised clear of the cards). Aurora is
kept as it is. Each keeps its main feature clear of the cards, which sit in the middle of the screen.

Contours and the coastline come from LINZ's New Zealand Contour-Interpolated 8m DEM (CC BY 4.0, credited on the screen
and on /methods/sources), read straight from LINZ's open elevation bucket on AWS, no account needed. The tiles (Topo50
sheets, ~25 MB each) are cached in data/linz/. Each 8 m grid is averaged to 40 m and smoothed, contoured, simplified
and drawn as quadratic curves through the midpoints, so the lines are smooth.

    pip install rasterio scikit-image shapely scipy numpy
    python3 analysis/dashboard_backgrounds.py           # rewrites backgrounds.js (the scenes it doesn't draw are kept)
    python3 analysis/dashboard_backgrounds.py --look strait   # draws one to /tmp/strait.svg, to try a change
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
STRAIT_AT = (174.713, -41.515, 160000)    # Cook Strait's centre (lon, lat) and width, m
RUAPEHU_AT = (175.62, -39.383, 70000)    # Contours' centre and width: Ruapehu's summit above the cards
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
    """Ruapehu, 70 km across, its summit above the cards: a line every 100 m, every 500 m bolder."""
    a, x0, y0 = mosaic([r + c for r in ('BG', 'BH', 'BJ', 'BK') for c in ('33', '34', '35', '36', '37')])
    (r0, r1, c0, c1), sx, sy, _ = frame(x0, y0, *RUAPEHU_AT, 2)
    Z = gaussian_filter(np.where(np.isnan(a), 0, a), 4)[r0:r1, c0:c1]
    thin = lines_at(Z, [v for v in range(100, 2800, 100) if v % 500], sx, sy, 2, 2.4, 90)
    bold = lines_at(Z, range(500, 2800, 500), sx, sy, 2, 2.4, 90)
    return ('<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            '<rect width="1600" height="900" fill="#0c2628"></rect>'
            f'<path d="{thin}" fill="none" stroke="#6fd0bf" stroke-opacity="0.16" stroke-width="1.3" stroke-linejoin="round"></path>'
            f'<path d="{bold}" fill="none" stroke="#6fd0bf" stroke-opacity="0.38" stroke-width="2.2" stroke-linejoin="round"></path></svg>')


def route(a, x0, y0, land, pts):
    """The overhead line between points (lon, lat), over land only: the cheapest path on the 40 m grid, dearer near the
    coast so it keeps inland, as the real line does. Returns NZTM (x, y) points."""
    from scipy.ndimage import distance_transform_edt
    from skimage.graph import route_through_array
    cells = []
    for lon, lat in pts:
        x, y = nztm(lon, lat)
        cells.append((int((y0 - y) / RES), int((x - x0) / RES)))
    r0 = max(0, min(r for r, _ in cells) - 150); r1 = max(r for r, _ in cells) + 150
    c0 = max(0, min(c for _, c in cells) - 150); c1 = max(c for _, c in cells) + 150
    L = land[r0:r1, c0:c1]
    d = distance_transform_edt(L)
    cost = np.where(L, 1 + 6 * np.exp(-d / 20), 1e5)
    out = []
    for (ra, ca), (rb, cb) in zip(cells, cells[1:]):
        snap = lambda r, c: min(zip(*np.nonzero(L[max(0, r - r0 - 40):r - r0 + 40, max(0, c - c0 - 40):c - c0 + 40])),
                                key=lambda q: (q[0] - 40) ** 2 + (q[1] - 40) ** 2)
        sa = snap(ra, ca); sb = snap(rb, cb)
        a_ = (sa[0] + max(0, ra - r0 - 40), sa[1] + max(0, ca - c0 - 40)); b_ = (sb[0] + max(0, rb - r0 - 40), sb[1] + max(0, cb - c0 - 40))
        path, _ = route_through_array(cost, a_, b_, fully_connected=True, geometric=True)
        out += [(x0 + (c + c0) * RES, y0 - (r + r0) * RES) for r, c in path]
    return out


def strait():
    """Cook Strait, 160 km across, the cable above the cards: the coastline (land above 0.5 m, rocks under ~6 ha
    dropped), faint land contours at 400, 800 and 1,200 m, and the HVDC: overland from Benmore's direction to Fighting
    Bay, under the strait to Oteranga Bay, and overland to Haywards, where it stops. The overland lines keep to land."""
    sheets = ['BN28', 'BN29', 'BN32', 'BN33', 'BN34', 'BP27', 'BP28', 'BP29', 'BP30', 'BP31', 'BP32', 'BP33', 'BP34', 'BQ27',
              'BQ28', 'BQ29', 'BQ30', 'BQ31', 'BQ32', 'BQ33', 'BQ34', 'BR27', 'BR28', 'BR29', 'BR33', 'BR34', 'BS27', 'BS28', 'BS29']
    a, x0, y0 = mosaic(sheets)
    land = (~np.isnan(a)) & (a > 0.5)
    lab, _ = label(land)
    size = np.bincount(lab.ravel()); size[0] = 0
    land = np.isin(lab, np.where(size >= 40)[0])
    pad = 24
    (r0, r1, c0, c1), sx, sy, (X0, Y1) = frame(x0, y0, STRAIT_AT[0], STRAIT_AT[1], STRAIT_AT[2], pad)
    M = gaussian_filter(land[r0:r1, c0:c1].astype(float), 1.2)
    Z = gaussian_filter(np.where(land, np.nan_to_num(a), 0)[r0:r1, c0:c1], 3)
    fill = ''
    for c in find_contours(np.pad(M, 1), 0.5):
        ls = LineString([((col - 1 - pad) * sx, (row - 1 - pad) * sy) for row, col in c]).simplify(1.5)
        if ls.length >= 12:
            fill += curve(ls.coords, edges=True)
    relief = lines_at(Z, (400, 800, 1200), sx, sy, pad, 2, 50)
    px = lambda x, y: ((x - X0) / RES * sx, (Y1 - y) / RES * sy)
    def xy(lon, lat):
        return px(*nztm(lon, lat))
    def overland(pts):
        line = LineString([px(x, y) for x, y in route(a, x0, y0, land, pts)]).simplify(6)
        return curve(line.coords)
    FB, OB, HW = (174.245, -41.29), (174.617, -41.303), (174.975, -41.152)
    fx, fy = xy(*FB); ox, oy = xy(*OB); hx, hy = xy(*HW)
    cable = f'M{fx:.0f} {fy:.0f} C {fx + 130:.0f} {fy + 14:.0f}, {ox - 130:.0f} {oy + 14:.0f}, {ox:.0f} {oy:.0f}'
    north = overland([OB, HW])
    south = overland([FB, (173.97, -41.47), (173.72, -41.99)])
    swell = ''.join(f'<path d="M-100 {y} q 50 -7 100 0' + ' t 100 0' * 17 + f'" fill="none" stroke="#9fd6ea" '
                    f'stroke-opacity="{0.05 + 0.025 * (i % 4):.3f}" stroke-width="1.4"></path>' for i, y in enumerate(range(30, 900, 42)))
    return ('<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            '<defs><linearGradient id="stsea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#062038"></stop>'
            '<stop offset="1" stop-color="#0b3a56"></stop></linearGradient><filter id="stglow" x="-10%" y="-10%" width="120%" '
            'height="120%"><feGaussianBlur stdDeviation="6"></feGaussianBlur></filter></defs>'
            f'<rect width="1600" height="900" fill="url(#stsea)"></rect><g class="swell">{swell}</g>'
            f'<path d="{fill}" fill="#0f2b29" fill-rule="evenodd" stroke="#7fc6c0" stroke-opacity=".35" stroke-width="1.4" stroke-linejoin="round"></path>'
            f'<path d="{relief}" fill="none" stroke="#7fc6c0" stroke-opacity=".12" stroke-width="1.1" stroke-linejoin="round"></path>'
            f'<path d="{north}{south}" fill="none" stroke="#ffd166" stroke-opacity=".6" stroke-width="2.2" stroke-dasharray="1 7" stroke-linecap="round"></path>'
            f'<path d="{cable}" fill="none" stroke="#ffd166" stroke-opacity=".35" stroke-width="10" filter="url(#stglow)"></path>'
            f'<path class="cable" d="{cable}" fill="none" stroke="#ffd166" stroke-width="3" stroke-dasharray="14 18" stroke-linecap="round"></path>'
            f'<circle cx="{fx:.0f}" cy="{fy:.0f}" r="6" fill="#ffd166"></circle><circle cx="{ox:.0f}" cy="{oy:.0f}" r="6" fill="#ffd166"></circle>'
            f'<circle cx="{hx:.0f}" cy="{hy:.0f}" r="5.5" fill="#0f2b29" stroke="#ffd166" stroke-width="2.4"></circle></svg>')


def pylons():
    """A 220 kV double-circuit steel lattice line receding into a sunset, after a photo of a New Zealand line: a narrow
    lattice column with legs splaying out below the lowest crossarm, three crossarms each side (a little longer lower
    down), vertical insulator strings, and a short earth-wire arm on top. Every tower is the same tower scaled towards
    one vanishing point on the horizon, so each conductor and earth wire runs from the same point on one tower to the
    same point on the next, and the line runs on towards the viewer (off the frame) the same way. The near ground is
    drawn over the towers' feet, so none stands in the air."""
    C = '#140c1e'
    f = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
    V = (330, 772)                 # the vanishing point, at the sun on the horizon
    B0, H0 = (1300, 880), 700      # the nearest tower's base and height
    ARMS = ((0.54, 0.152), (0.72, 0.139), (0.896, 0.126))    # crossarm height and reach, share of the tower's height
    EARTH = (0.985, 0.09)
    INS = 0.065                    # insulator length
    def leg_hw(t):                 # half-width of the body at height t
        return 0.10 - (0.10 - 0.033) * t / 0.42 if t <= 0.42 else 0.033 - (0.033 - 0.024) * (t - 0.42) / 0.565
    def scale(k):
        return 1 / (1 + 0.8 * k)
    def place(k):
        r = scale(k)
        bx, by = V[0] + (B0[0] - V[0]) * r, V[1] + (B0[1] - V[1]) * r
        return bx, by, H0 * r
    def to_xy(k, u, t):            # local (u across, t up, both as shares of the height) to the picture
        bx, by, H = place(k)
        return bx + u * H, by - t * H
    def attach(k):
        """The tower's wire points: six conductors at the insulators' feet, then two earth wires at the top arm's tips."""
        pts = [to_xy(k, sd * reach, t - INS) for t, reach in ARMS for sd in (-1, 1)]
        return pts + [to_xy(k, sd * EARTH[1], EARTH[0]) for sd in (-1, 1)]
    def tower(k):
        bx, by, H = place(k)
        sw = max(0.5, H / 300)
        g = []; ins = []
        P = lambda u, t: f'{f(bx + u * H)} {f(by - t * H)}'
        L = lambda pts: g.append('M' + ' L'.join(P(u, t) for u, t in pts))
        fine = H > 140
        legs = [0, 0.09, 0.18, 0.26, 0.34, 0.42] if fine else [0, 0.14, 0.28, 0.42]
        col = ([0.42, 0.48, 0.54, 0.575, 0.63, 0.68, 0.72, 0.755, 0.81, 0.855, 0.896, 0.931, 0.985] if fine
               else [0.42, 0.54, 0.63, 0.72, 0.81, 0.896, 0.985])
        ts = legs + col[1:]
        for sd in (-1, 1):
            L([(sd * leg_hw(t), t) for t in ts])
        for a, b in zip(ts, ts[1:]):
            L([(-leg_hw(a), a), (leg_hw(b), b)]); L([(leg_hw(a), a), (-leg_hw(b), b)]); L([(-leg_hw(b), b), (leg_hw(b), b)])
        top = EARTH[0]
        # the peak: the column closes in a little above the earth-wire arm
        L([(-leg_hw(top), top + 0.012), (0, top + 0.026), (leg_hw(top), top + 0.012)])
        for t, reach in ARMS + (EARTH,):
            depth = 0.035 if t < 0.95 else 0.012
            for sd in (-1, 1):
                w = leg_hw(t)
                L([(sd * w, t), (sd * reach, t), (sd * w, t + depth)])          # bottom chord, then top chord back to the body
                n = 3 if fine else 1
                for m in range(n):
                    a = w + (reach - w) * m / n; b = w + (reach - w) * (m + 0.5) / n
                    ta = t + depth * (1 - (a - w) / (reach - w)); tb = t
                    L([(sd * a, ta), (sd * b, tb)])
                    c = w + (reach - w) * (m + 1) / n
                    tc = t + depth * (1 - (c - w) / (reach - w))
                    L([(sd * b, tb), (sd * c, tc)])
                if t < 0.95:
                    ins.append(f'M{P(sd * reach, t)} L{P(sd * reach, t - INS)}')
        disc = max(0.7, H / 230)
        return (f'<path d="{"".join(g)}" fill="none" stroke="{C}" stroke-width="{f(sw)}" stroke-linejoin="round" stroke-linecap="round"></path>'
                f'<path d="{"".join(ins)}" fill="none" stroke="{C}" stroke-width="{f(sw * 2.2)}" stroke-dasharray="{f(disc * 0.8)} {f(disc * 0.6)}"></path>')
    N = 12
    def sag(p, q, k):
        (x1, y1), (x2, y2) = p, q
        return f'M{f(x1)} {f(y1)} Q{f((x1 + x2) / 2)} {f((y1 + y2) / 2 + k * math.hypot(x2 - x1, y2 - y1))} {f(x2)} {f(y2)}'
    wires = []
    for k in range(-1, N - 1):     # k = -1: the next tower, behind the viewer, off the frame
        a, b = attach(k), attach(k + 1)
        wires += [sag(p, q, 0.05 if i < 6 else 0.04) for i, (p, q) in enumerate(zip(a, b))]
    # the near ground: its edge runs just above each tower's base, so the feet are in the grass
    edge = []
    for x in range(0, 1601, 20):
        r = max(0.0, (x - V[0]) / (B0[0] - V[0]))
        y = V[1] + (B0[1] - V[1]) * r - 0.012 * H0 * r - 3 * abs(math.sin(x * 0.011)) - 2
        edge.append((x, y))
    ground = 'M' + ' L'.join(f'{x} {f(y)}' for x, y in edge) + ' L1600 900 L0 900 Z'
    far = ('<path d="M0 778 C 120 760, 240 768, 330 764 C 470 758, 620 776, 780 770 C 980 762, 1180 784, 1400 776 S 1560 770, 1600 772 '
           'L1600 900 L0 900 Z" fill="#3a2038" fill-opacity=".85"></path>')
    return ('<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            '<defs><linearGradient id="pysky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1238"></stop><stop offset=".45" stop-color="#5a2a5c"></stop>'
            '<stop offset=".72" stop-color="#d4664c"></stop><stop offset=".86" stop-color="#f2a85a"></stop><stop offset="1" stop-color="#f7cf7a"></stop></linearGradient>'
            '<radialGradient id="pysun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".8"></stop><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"></stop></radialGradient></defs>'
            f'<rect width="1600" height="900" fill="url(#pysky)"></rect><circle cx="{V[0]}" cy="{V[1] - 4}" r="210" fill="url(#pysun)"></circle><circle cx="{V[0]}" cy="{V[1] + 6}" r="58" fill="#ffd98a" fill-opacity=".9"></circle>'
            + far +
            f'<path d="{"".join(wires)}" fill="none" stroke="{C}" stroke-width="1.4" stroke-opacity=".9"></path>' +
            ''.join(tower(k) for k in reversed(range(N))) +
            f'<path d="{ground}" fill="#241426"></path>'
            '<path d="M0 892 C 400 884, 900 896, 1600 886 L1600 900 L0 900 Z" fill="#140c1e"></path></svg>')


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
    if 'id="alrise"' not in s:
        # the range raised 200 so its snow shows above the cards (centred since 16 Nov 2026): the sky's sunset colours
        # and the sun move up with it, and the lake runs down to the foot
        sky = '<rect width="1600" height="900" fill="url(#alsky)"></rect>'
        s = s.replace(sky, sky + '<g id="alrise" transform="translate(0 -200)">', 1)
        s = s[:s.rindex('</svg>')] + '</g></svg>'
        s = s.replace('<rect x="0" y="720" width="1600" height="180" fill="url(#allake)">', '<rect x="0" y="720" width="1600" height="380" fill="url(#allake)">')
        s = s.replace('<stop offset=".5" stop-color="#8a6a8e">', '<stop offset=".3" stop-color="#8a6a8e">').replace(
            '<stop offset=".78" stop-color="#e59b7c">', '<stop offset=".5" stop-color="#e59b7c">').replace(
            '<stop offset="1" stop-color="#f4c995">', '<stop offset=".62" stop-color="#f4c995">')
    return s


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--look':          # draw one, to a file in /tmp, without touching backgrounds.js
        open(f'/tmp/{sys.argv[2]}.svg', 'w').write(globals()[sys.argv[2]]())
        sys.exit()
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
