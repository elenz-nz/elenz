"""Save the site's link-preview image (site/src/lib/site/SiteCard.svelte, drawn at /og/card from the live week) as
site/static/og/elenz.png, 1200 x 630, dark. Every page without its own image uses it (site/src/lib/site/Preview.svelte).

Needs the built site served locally with live data at /data/tracker.json, Pillow, and Playwright with Chromium
(pip install pillow playwright; playwright install chromium):

  cd site && npm run build && npx vite preview --port 4173 &
  python3 analysis/site_card_png.py [http://localhost:4173]

Then commit the PNG. Redo it now and then if the week drawn on it looks unusual; the picture isn't dated.
"""
import os, sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'site', 'static', 'og', 'elenz.png')


def main(base='http://localhost:4173'):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1200, 'height': 630}, color_scheme='dark')
        pg.goto(f'{base}/og/card')
        pg.wait_for_selector('figure.site-card svg path')
        pg.wait_for_timeout(1500)  # web fonts
        pg.locator('figure.site-card svg').screenshot(path=OUT)
        b.close()
    Image.open(OUT).convert('RGB').resize((1200, 630), Image.LANCZOS).save(OUT, optimize=True)
    print(OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main(*sys.argv[1:])
