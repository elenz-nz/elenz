"""Save an article's cover (ReviewCover, PriceCover) as 1200 x 630 PNGs in site/static/articles/: <slug>.png, the dark
version, for link previews (og:image), and <slug>-light.png, the light version the landing page shows in light mode.

Needs the built site served locally, Pillow, and Playwright with Chromium (pip install pillow playwright;
playwright install chromium):

  cd site && npm run build && npx vite preview --port 4173 &
  python3 analysis/cover_png.py winter-2026

Then set `image: '/articles/winter-2026.png'` and `imageLight: '/articles/winter-2026-light.png'` in the article's
meta and commit both PNGs.
"""
import os, sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(slug, base='http://localhost:4173'):
    for scheme, name in (('dark', slug), ('light', f'{slug}-light')):
        shoot(slug, base, scheme, os.path.join(ROOT, 'site', 'static', 'articles', f'{name}.png'))


def shoot(slug, base, scheme, out):
    # the cover follows the site's theme, which follows the browser's colour scheme when no choice has been saved
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1280, 'height': 900}, color_scheme=scheme)
        pg.goto(f'{base}/articles/{slug}')
        pg.wait_for_timeout(1500)  # web fonts
        w = pg.locator('figure.cover svg').bounding_box()['width']
        pg.close()
        pg = b.new_page(viewport={'width': 1280, 'height': 900}, device_scale_factor=1200 / w, color_scheme=scheme)
        pg.goto(f'{base}/articles/{slug}')
        pg.wait_for_timeout(1500)
        pg.locator('figure.cover svg').screenshot(path=out)
        b.close()
    # the screenshot can be a pixel or two off at fractional scales: make it exactly 1200 x 630
    Image.open(out).convert('RGB').resize((1200, 630), Image.LANCZOS).save(out, optimize=True)
    print(out)


if __name__ == '__main__':
    main(*sys.argv[1:])
