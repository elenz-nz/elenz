// The <meta> Content-Security-Policy's script-src, for kit.csp in vite.config.ts (design decision, 26 Nov 2026).
// static/_headers sends the site-wide policy: which origins may serve scripts, styles, images, fonts and connections. It
// has to allow inline scripts, because SvelteKit writes a different start-up script into every page. So SvelteKit also
// writes a <meta> policy into each page (mode 'hash') that allows only that page's own inline script by its hash, plus
// the inline scripts in src/app.html (hashed here, so editing them needs no other change), the site's own files and
// the two counters. A browser applies both, so an inline script that isn't ours runs nowhere. SCRIPT_ORIGINS must
// match the script-src in static/_headers; the browser tests (tests/e2e/csp.js) fail on anything either blocks.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SCRIPT_ORIGINS = ['https://static.cloudflareinsights.com', 'https://cloud.umami.is'];

/** The inline scripts' hashes in src/app.html, as CSP sources. */
export function appScriptHashes(html = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8')) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => `sha256-${createHash('sha256').update(m[1]).digest('base64')}`);
}

/** @type {any[]} the sources, as kit.csp takes them ('self', hashes, origins) */
export const SCRIPT_SRC = ['self', ...appScriptHashes(), ...SCRIPT_ORIGINS];
