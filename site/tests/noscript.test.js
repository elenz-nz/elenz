// The no-JavaScript rule (RES-04) stays in app.html: run with `npm test`. A <noscript> style in a page's own head hid the
// charts in Chrome on every click between pages, because Svelte builds that markup itself on a click and Chrome then treats
// the style as real (2 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;
const svelteFiles = readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.svelte')).map((f) => join(SRC, f));

test('app.html holds the one no-JavaScript rule', () => {
  assert.match(readFileSync(join(SRC, 'app.html'), 'utf8'), /<noscript><style>\.js-only \{ display: none !important; \}<\/style><\/noscript>/);
});

test('no page puts a style inside <noscript>', () => {
  const bad = svelteFiles.filter((f) => /<noscript>\s*<style/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});
