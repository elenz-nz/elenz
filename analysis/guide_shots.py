"""The screenshots on /guide, in light and dark: site/static/guide/<name>-light.webp and -dark.webp.

  python3 analysis/guide_shots.py                          from the live site
  python3 analysis/guide_shots.py http://localhost:4173    from `npm run preview` (its /data comes from the live site)

Needs Python's playwright and Pillow. Redo them when a layout they show changes; site/src/routes/(docs)/guide/+page.svelte
holds each image's width and height, so it doesn't jump as they load. Every shot is a crop of a real page.
"""
import io
import os
import sys
import urllib.request

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://elenz.co.nz').rstrip('/')
OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'static', 'guide')
LIVE = 'https://elenz.co.nz'
MAX_W = 1600


def save(png, name, theme):
    im = Image.open(io.BytesIO(png)).convert('RGB')
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, f'{name}-{theme}.webp'), quality=82, method=6)
    print(f'{name}-{theme}: {im.width} x {im.height}')


def clip_of(page, selectors, pad=8):
    boxes = [b for b in (page.locator(s).first.bounding_box() for s in selectors) if b]
    x, y = max(0, min(b['x'] for b in boxes) - pad), max(0, min(b['y'] for b in boxes) - pad)
    return {'x': x, 'y': y, 'width': max(b['x'] + b['width'] for b in boxes) + pad - x,
            'height': max(b['y'] + b['height'] for b in boxes) + pad - y}


def context(browser, theme, **kw):
    ctx = browser.new_context(**kw)
    ctx.add_init_script(f"try {{ localStorage.setItem('elenz-theme', '{theme}'); }} catch (e) {{}}")
    ctx.route('**/*cloudflareinsights*/**', lambda r: r.abort())
    if BASE != LIVE:
        cache = {}

        def data(route):
            path = route.request.url.split('/data/', 1)[1]
            if path not in cache:
                req = urllib.request.Request(f'{LIVE}/data/{path}', headers={'User-Agent': 'Mozilla/5.0'})
                cache[path] = urllib.request.urlopen(req, timeout=60).read()
            route.fulfill(status=200, content_type='application/json', body=cache[path])
        ctx.route('**/data/**', data)
    return ctx


def desktop(browser, theme):
    page = context(browser, theme, viewport={'width': 1180, 'height': 900}, device_scale_factor=1.5).new_page()

    def go(path, sel, wait=1400):
        page.goto(BASE + path)
        page.wait_for_selector(sel, timeout=30000)
        page.wait_for_timeout(wait)
        page.evaluate('window.scrollTo(0, 0)')

    def shot(name, selectors=None, clip=None):
        save(page.screenshot(clip=clip or clip_of(page, selectors)), name, theme)

    # a pinned time: the bar's chip, the line and the list at that time
    go('/tracker?range=7d', '#mix-body tr')
    c = page.locator('#cv-gen').bounding_box()
    page.mouse.click(c['x'] + c['width'] * .62, c['y'] + c['height'] * .4)
    page.wait_for_timeout(300)
    page.mouse.move(5, 5)
    page.wait_for_timeout(200)
    shot('tracker-pin', ['.toolbar', '.chart.gen', '#summary .mix'])
    # part way through a drag to zoom
    go('/tracker?range=3d&int=30m', '#mix-body tr')
    c = page.locator('#cv-gen').bounding_box()
    page.mouse.move(c['x'] + c['width'] * .35, c['y'] + 90)
    page.mouse.down()
    page.mouse.move(c['x'] + c['width'] * .62, c['y'] + 90, steps=8)
    page.wait_for_timeout(250)
    shot('tracker-zoom', ['.chart.gen'])
    page.mouse.up()
    # a fuel's plants in the list
    go('/tracker?range=7d&fuel=wind', '#mix-body tr')
    b = page.locator('#summary').bounding_box()
    shot('tracker-plants', clip={'x': b['x'] - 8, 'y': b['y'] - 8, 'width': b['width'] + 16, 'height': 560})
    # the Controls panel
    go('/tracker?range=7d', '#mix-body tr')
    page.click('button.ctl-btn')
    page.wait_for_timeout(250)
    shot('tracker-controls', ['#sum-help'])
    # Prices on a long range
    go('/tracker/prices?range=1y', '.layout .chart', 3000)
    shot('prices-range', ['.layout .chart'])
    # Every generator right now, by island then MW
    go('/now?sort=island,mw', '.gtab', 1500)
    page.locator('.gtab').first.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    g = page.locator('.gtab').first.bounding_box()
    shot('now-generators', clip={'x': g['x'] - 8, 'y': max(0, g['y'] - 100), 'width': g['width'] + 16, 'height': 420})
    # the top of Records
    go('/records', '.paces', 1500)
    shot('records-list', ['.paces'])
    # a pin and a hover on a record's chart
    go('/records/wind_max', 'svg.chart', 2200)
    sv = page.locator('svg.chart').first
    sv.scroll_into_view_if_needed()
    b = sv.bounding_box()
    page.mouse.move(b['x'] + b['width'] * .45, b['y'] + b['height'] * .5)
    page.mouse.click(b['x'] + b['width'] * .45, b['y'] + b['height'] * .5)
    page.wait_for_timeout(200)
    page.mouse.move(b['x'] + b['width'] * .8, b['y'] + b['height'] * .5, steps=4)
    page.wait_for_timeout(300)
    shot('record-compare', clip={'x': b['x'] - 8, 'y': b['y'] - 8, 'width': b['width'] + 16, 'height': b['height'] + 16})
    page.context.close()


def phone(browser, theme):
    page = context(browser, theme, viewport={'width': 390, 'height': 780}, device_scale_factor=2, has_touch=True, is_mobile=True).new_page()
    page.goto(BASE + '/tracker?range=3d')
    page.wait_for_selector('#mix-body tr', timeout=30000)
    page.wait_for_timeout(1500)
    page.evaluate("window.scrollTo(0, document.querySelector('.tabline, .toolbar').getBoundingClientRect().top + scrollY - 8)")
    page.wait_for_timeout(300)
    save(page.screenshot(), 'tracker-phone', theme)
    page.context.close()


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for theme in ('light', 'dark'):
            desktop(browser, theme)
            phone(browser, theme)
        browser.close()
