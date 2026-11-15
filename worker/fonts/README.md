# Fonts for the Worker's images

The site's two fonts, as TTF for resvg (it doesn't read WOFF2), for the record preview images the Worker draws
(`worker/og.js`): Schibsted Grotesk 400, 500, 600 and 800, and IBM Plex Mono 400 and 600, Latin subset. Made from the
site's own `@fontsource` WOFF2 files with fontTools, with each file's family name set to the plain family
("Schibsted Grotesk", not "Schibsted Grotesk Medium") so the SVG can pick a weight by `font-weight`:

    from fontTools.ttLib import TTFont
    f = TTFont('schibsted-grotesk-latin-600-normal.woff2'); f.flavor = None
    for r in f['name'].names:
        if r.nameID in (1, 16): f['name'].setName('Schibsted Grotesk', r.nameID, r.platformID, r.platEncID, r.langID)
    f.save('SchibstedGrotesk-600.ttf')

Licence: SIL Open Font License 1.1 (`OFL-SchibstedGrotesk.txt`, `OFL-IBMPlexMono.txt`).
