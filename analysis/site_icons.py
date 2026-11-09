"""Make the site's fallback icons from the logo mark, site/src/lib/assets/favicon.svg:

  site/static/favicon.ico           16, 32 and 48 px, transparent (browsers and tools that skip SVG icons)
  site/static/apple-touch-icon.png  180 px, the mark on white with a 10% margin (iOS Add to Home Screen; iOS fills
                                    transparency with black and rounds the corners itself)

Needs rsvg-convert (librsvg) and Pillow. Run after changing favicon.svg, then commit both files:

  python3 analysis/site_icons.py
"""
import os, subprocess, tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, 'site', 'src', 'lib', 'assets', 'favicon.svg')
STATIC = os.path.join(ROOT, 'site', 'static')


def render(size, tmp):
    out = os.path.join(tmp, f'{size}.png')
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), SVG, '-o', out], check=True)
    return Image.open(out).convert('RGBA')


with tempfile.TemporaryDirectory() as tmp:
    small = [render(n, tmp) for n in (16, 32, 48)]
    small[2].save(os.path.join(STATIC, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)],
                  append_images=small[:2])
    mark = render(144, tmp)
    touch = Image.new('RGB', (180, 180), 'white')
    touch.paste(mark, (18, 18), mark)
    touch.save(os.path.join(STATIC, 'apple-touch-icon.png'), optimize=True)

print('wrote site/static/favicon.ico and site/static/apple-touch-icon.png')
