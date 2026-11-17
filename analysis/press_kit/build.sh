#!/usr/bin/env bash
# Builds the press kit, site/static/press/elenz-press-kit.zip (served at elenz.co.nz/press/elenz-press-kit.zip):
# README.txt (this folder: descriptions, credit line, key facts), the Elenz mark as SVG and 1024 px PNG for light and
# dark backgrounds (colours as tracker.css's --f-* tokens, light and dark), the site card and screenshots taken from
# the guide's pictures (static/guide) and the generation article's cover. Rerun after the guide's screenshots or
# README.txt change. Needs rsvg-convert, ImageMagick (convert) and zip. Run from the repository root.
set -euo pipefail
S=site/static
T=$(mktemp -d); K=$T/elenz-press-kit; mkdir -p "$K/screenshots"
mark() {  # file, geothermal, hydro, wind, solar
  cat > "$1" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 30 30">
<title>Elenz mark</title>
<rect x="3" y="17" width="5" height="10" rx="1" fill="$2"/><rect x="3" y="9" width="5" height="7" rx="1" fill="$3"/>
<rect x="9.5" y="17" width="5" height="10" rx="1" fill="$2"/><rect x="9.5" y="5" width="5" height="11" rx="1" fill="$3"/>
<rect x="16" y="17" width="5" height="10" rx="1" fill="$2"/><rect x="16" y="8" width="5" height="8" rx="1" fill="$3"/><rect x="16" y="4" width="5" height="3" rx="1" fill="$4"/>
<rect x="22.5" y="17" width="5" height="10" rx="1" fill="$2"/><rect x="22.5" y="11" width="5" height="5" rx="1" fill="$3"/><rect x="22.5" y="6" width="5" height="4" rx="1" fill="$5"/>
</svg>
SVG
}
mark "$K/elenz-mark.svg" '#a63a78' '#2f6db8' '#2f9a78' '#c48e10'
mark "$K/elenz-mark-on-dark.svg" '#c4508f' '#4f8bd6' '#2fa883' '#bb8c18'
rsvg-convert -w 1024 -h 1024 "$K/elenz-mark.svg" -o "$K/elenz-mark-1024.png"
rsvg-convert -w 1024 -h 1024 "$K/elenz-mark-on-dark.svg" -o "$K/elenz-mark-on-dark-1024.png"
cp "$S/og/elenz.png" "$K/elenz-card-2400x1260.png"
cp analysis/press_kit/README.txt "$K/README.txt"
i=1
for n in welcome-now-light welcome-tracker-light welcome-records-light prices-fuel-light dashboard-dark landscape-light tracker-phone-light; do
  convert "$S/guide/$n.webp" "$K/screenshots/$(printf %02d $i)-$n.png"; i=$((i + 1))
done
cp "$S/articles/electricity-generation-nz-light.png" "$K/screenshots/08-article-cover-generation-nz.png"
mkdir -p "$S/press"; rm -f "$S/press/elenz-press-kit.zip"
(cd "$T" && zip -qr -X - elenz-press-kit) > "$S/press/elenz-press-kit.zip"
rm -rf "$T"
ls -l "$S/press/elenz-press-kit.zip"
