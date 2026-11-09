// The fallback icons (favicon.ico, apple-touch-icon.png) exist, are the right kind and size, and the root layout links
// them: run with `npm test`. Remade from favicon.svg by analysis/site_icons.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STATIC = new URL('../static/', import.meta.url);
const layout = readFileSync(new URL('../src/routes/+layout.svelte', import.meta.url), 'utf8');

test('favicon.ico is an icon file holding 16, 32 and 48 px', () => {
  const b = readFileSync(new URL('favicon.ico', STATIC));
  assert.equal(b.readUInt16LE(0), 0); // reserved
  assert.equal(b.readUInt16LE(2), 1); // type 1 = icon
  const n = b.readUInt16LE(4);
  const sizes = Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((x, y) => x - y);
  assert.deepEqual(sizes, [16, 32, 48]);
});

test('apple-touch-icon.png is a 180 px PNG with no transparency', () => {
  const b = readFileSync(new URL('apple-touch-icon.png', STATIC));
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(b.readUInt32BE(16), 180); // width
  assert.equal(b.readUInt32BE(20), 180); // height
  assert.ok([0, 2].includes(b[25]), 'colour type should be grey or RGB, without alpha'); // iOS shows alpha as black
});

test('the root layout links both icons and the SVG', () => {
  assert.match(layout, /<link rel="icon" href="\/favicon\.ico" sizes="32x32" \/>/);
  assert.match(layout, /<link rel="icon" href=\{favicon\} type="image\/svg\+xml" \/>/);
  assert.match(layout, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/);
});
