"""The pictures of Now, the tracker and Records in the article "Welcome to Elenz", in light and dark:
site/static/guide/welcome-<name>-light.webp and -dark.webp, with their sizes merged into site/src/lib/methods/shots.json.
Redo them when these pages change, and the week the article goes out.

  python3 analysis/welcome_shots.py                        from the live site
  python3 analysis/welcome_shots.py http://localhost:4173  from `npm run preview` (its /data comes from the live site)

Needs what guide_shots.py needs. The Beta line is left out, since the article goes out after it has gone.
"""
import json
import os

from playwright.sync_api import sync_playwright

from guide_shots import BASE, SIZES, clip_of, context, save, sizes

W, H = 1180, 700
PAGES = (('now', '/now', '.gtab'), ('tracker', '/tracker?range=7d', '#mix-body tr'), ('records', '/records', '.paces'))


def shots(browser, theme):
    kw = {'ignore_https_errors': True} if os.environ.get('HTTPS_PROXY') else {}
    page = context(browser, theme, viewport={'width': W, 'height': 950}, device_scale_factor=1.5, **kw).new_page()
    for name, path, sel in PAGES:
        page.goto(BASE + path)
        page.wait_for_selector(sel, timeout=45000)
        page.add_style_tag(content='.beta-note { display: none !important; }')
        page.wait_for_timeout(3000)
        page.evaluate('window.scrollTo(0, 0)')
        top = page.evaluate("document.querySelector('.mast-wrap')?.getBoundingClientRect().bottom ?? 90")
        save(page.screenshot(clip={'x': 0, 'y': top, 'width': W, 'height': H}), f'welcome-{name}', theme)
    # a pinned time, as in guide_shots.py's tracker-pin, for the tip on zooming and pinning
    page.goto(BASE + '/tracker?range=7d')
    page.wait_for_selector('#mix-body tr', timeout=45000)
    page.add_style_tag(content='.beta-note { display: none !important; }')
    page.wait_for_timeout(3000)
    c = page.locator('.chart.gen canvas').first.bounding_box()
    page.mouse.click(c['x'] + c['width'] * .62, c['y'] + c['height'] * .4)
    page.wait_for_timeout(300)
    page.mouse.move(5, 5)
    page.wait_for_timeout(300)
    save(page.screenshot(clip=clip_of(page, [".toolbar", ".chart.gen", "#summary .mix"], pad=2)), 'welcome-pin', theme)
    page.context.close()


if __name__ == '__main__':
    with sync_playwright() as p:
        kw = {'proxy': {'server': os.environ['HTTPS_PROXY']}} if os.environ.get('HTTPS_PROXY') else {}
        browser = p.chromium.launch(**kw)
        for theme in ('light', 'dark'):
            shots(browser, theme)
        browser.close()
    with open(SIZES) as f:
        merged = json.load(f)
    with open(SIZES, 'w') as f:
        json.dump({**merged, **sizes}, f, indent=0, sort_keys=True)
        f.write('\n')
