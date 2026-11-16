// The power landscape's view settings (lib/landscape/prefs.js): links and storage round-trip, junk is cleaned, and the
// pop-up cards follow the mode unless the viewer chose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, fromQuery, toQuery, cardsOn, DEFAULT } from '#lib/landscape/prefs.js';

test('a plain view makes a plain link, and an address with no view says so', () => {
  assert.equal(toQuery(DEFAULT), '');
  assert.equal(fromQuery(new URLSearchParams('')), null);
  assert.equal(toQuery(DEFAULT, { kiosk: '1' }), '?kiosk=1');
});

test('a view goes into a link and comes back the same', () => {
  const v = { mode: 'replay', names: false, numbers: true, birds: false, calm: true, cards: true, speed: 3 };
  const q = toQuery(v);
  assert.equal(q, '?mode=replay&names=0&birds=0&calm=1&cards=1&speed=3');
  assert.deepEqual(fromQuery(new URLSearchParams(q)), v);
});

test('junk falls back to the default', () => {
  assert.deepEqual(clean({ mode: 'party', names: 'yes', speed: 7, cards: 'x' }), { ...DEFAULT });
  assert.deepEqual(clean(null), { ...DEFAULT });
});

test('the cards are off in the replay and on otherwise, unless chosen', () => {
  assert.equal(cardsOn(clean({ mode: 'now' })), true);
  assert.equal(cardsOn(clean({ mode: 'replay' })), false);
  assert.equal(cardsOn(clean({ mode: 'replay', cards: true })), true);
  assert.equal(cardsOn(clean({ mode: 'play', cards: false })), false);
});
