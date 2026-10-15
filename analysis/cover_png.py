"""Save an article's cover (ReviewCover) as a 1200 x 630 PNG for link previews (og:image), in site/static/articles/.

Needs the built site served locally, Pillow, and Playwright with Chromium (pip install pillow playwright;
playwright install chromium):

  cd site && npm run build && npx vite preview --port 4173 &
  python3 analysis/cover_png.py winter-2026

Then set `image: '/articles/winter-2026.png'` in the article's meta and commit the PNG.
"""
import os, sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(slug, base='http://localhost:4173'):
    out = os.path.join(ROOT, 'site', 'static', 'articles', f'{slug}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1280, 'height': 900})
        pg.goto(f'{base}/articles/{slug}')
        pg.wait_for_timeout(1500)  # web fonts
        w = pg.locator('figure.cover svg').bounding_box()['width']
        pg.close()
        pg = b.new_page(viewport={'width': 1280, 'height': 900}, device_scale_factor=1200 / w)
        pg.goto(f'{base}/articles/{slug}')
        pg.wait_for_timeout(1500)
        pg.locator('figure.cover svg').screenshot(path=out)
        b.close()
    # the screenshot can be a pixel or two off at fractional scales: make it exactly 1200 x 630
    Image.open(out).convert('RGB').resize((1200, 630), Image.LANCZOS).save(out, optimize=True)
    print(out)


if __name__ == '__main__':
    main(*sys.argv[1:])
