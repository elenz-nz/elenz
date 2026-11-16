"""Save the link-preview images of the two dashboards: site/static/og/dashboard.png (the big-number dashboard's
wall-screen view, 2400 x 1260, twice the usual size like the site's card) and site/static/og/landscape.png (the power
landscape's picture, 1200 x 630). Each is a picture of the real page on live data, so it isn't dated. The pages name them in their
<Preview> (site/src/routes/dashboard, site/src/routes/landscape) with `?v=<n>`: bump it after redoing an image, so
LinkedIn and others fetch the new one rather than their copy.

  python3 analysis/dashboard_og_png.py                          from the live site
  python3 analysis/dashboard_og_png.py http://localhost:4173    from `npm run preview` (its /data comes from the live site)

Needs Pillow, and Playwright with Chromium (pip install pillow playwright; playwright install chromium).
"""
import io
import os
import sys
import urllib.request

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'site', 'static', 'og')
LIVE = 'https://elenz.co.nz'
SIZE = (2400, 1260)
# the dashboard as a wall screen: generation and renewable share large, over Lines at sunset, Simple (no clock to date it)
DASHBOARD = '/dashboard?bg=pylons&view=simple&big=gen:NZ,ren:NZ&small=wind:NZ:mw,price:NI,hvdc,co2:NZ&kiosk=1'
# the landscape on Right now, with names and numbers, no pop-up cards or birds caught mid-flight
LANDSCAPE = '/landscape?mode=now&cards=0&birds=0&kiosk=1'


def page_for(browser, base):
    ctx = browser.new_context(viewport={'width': 1200, 'height': 630}, device_scale_factor=2, color_scheme='dark')
    ctx.route(lambda u: 'cloudflareinsights' in u or 'umami' in u, lambda r: r.abort())
    if base != LIVE:
        cache = {}

        def data(route):
            path = route.request.url.split('/data/', 1)[1]
            if path not in cache:
                req = urllib.request.Request(f'{LIVE}/data/{path}', headers={'User-Agent': 'Mozilla/5.0'})
                cache[path] = urllib.request.urlopen(req, timeout=60).read()
            route.fulfill(status=200, content_type='application/json', body=cache[path])
        ctx.route('**/data/**', data)
    # no heartbeat from a picture being taken
    ctx.route('**/data/beat', lambda r: r.fulfill(status=204))
    return ctx.new_page()


def save(png, name, size=SIZE):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    # fill the size from the middle, cropping whatever is over
    scale = max(size[0] / im.width, size[1] / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    x, y = (im.width - size[0]) // 2, (im.height - size[1]) // 2
    path = os.path.join(OUT, f'{name}.png')
    im.crop((x, y, x + size[0], y + size[1])).save(path, optimize=True)
    print(path, os.path.getsize(path) // 1024, 'KB')


def main(base=LIVE):
    base = base.rstrip('/')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = page_for(b, base)
        pg.goto(base + DASHBOARD)
        pg.wait_for_function("document.querySelector('.kiosk .live') && /Live|Delayed/.test(document.querySelector('.kiosk .live').textContent)", timeout=30000)
        pg.wait_for_timeout(3000)   # fonts, the background and the values filling in
        save(pg.screenshot(), 'dashboard')
        pg = page_for(b, base)
        pg.goto(base + LANDSCAPE)
        pg.wait_for_function("document.querySelector('#when') && !/Loading/.test(document.querySelector('#when').textContent)", timeout=30000)
        pg.wait_for_timeout(4000)   # the scene settles on the live dials
        # 1200 x 630: the painted scene is ~3 MB at twice that, and 256 colours shift the fuel colours
        save(pg.locator('#stage').screenshot(), 'landscape', (1200, 630))
        b.close()


if __name__ == '__main__':
    main(*sys.argv[1:])
