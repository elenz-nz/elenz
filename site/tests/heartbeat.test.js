// Tests for the heartbeat's message (#lib/site/beat.js, read by the Worker too), when a visit is counted
// (#lib/site/heartbeat.js) and the throttle on Umami events (#lib/site/track.js). Run with `npm test`.
// worker/tests/worker.test.js covers what the Worker stores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatBody, readBeat, newBeatId, BEAT_PAGES } from '#lib/site/beat.js';
import { counting } from '#lib/site/heartbeat.js';
import { throttled } from '#lib/site/track.js';

test('a beat reads back as it was sent', () => {
  for (const p of BEAT_PAGES) {
    const b = readBeat(beatBody(p, '00ff00ff00ff00ff', 12.9, false, true));
    assert.deepEqual(b, { page: p, id: '00ff00ff00ff00ff', minutes: 12, visible: false, kiosk: true });
  }
  assert.equal(readBeat(beatBody('now', '00ff00ff00ff00ff', 0, true, false)).visible, true);
});

test('anything that is not a beat is null', () => {
  const ok = { p: 'now', s: 'abcdefabcdefabcd', m: 5, v: 1, k: 0 };
  assert.ok(readBeat(JSON.stringify(ok)));
  for (const change of [{ p: 'tracker' }, { s: 'ABCDEFABCDEFABCD' }, { s: 'abc' }, { m: -1 }, { m: 2.5 }, { m: '5' }, { v: true }, { k: 2 }])
    assert.equal(readBeat(JSON.stringify({ ...ok, ...change })), null, JSON.stringify(change));
  for (const text of ['', 'null', '[]', '{', 'x'.repeat(300), undefined]) assert.equal(readBeat(text), null);
});

test("each page load's ID is 16 hex digits", () => {
  assert.match(newBeatId(), /^[0-9a-f]{16}$/);
  assert.equal(newBeatId(() => new Uint8Array([0, 1, 2, 3, 250, 251, 254, 255])), '00010203fafbfeff');
  assert.notEqual(newBeatId(), newBeatId());
});

test('only visits to elenz.co.nz without Do Not Track are counted', () => {
  const site = { hostname: 'elenz.co.nz' };
  assert.equal(counting(site, {}, {}), true);
  assert.equal(counting(site, { doNotTrack: '0' }, {}), true);
  assert.equal(counting(site, { doNotTrack: '1' }, {}), false);
  assert.equal(counting(site, {}, { doNotTrack: '1' }), false);
  assert.equal(counting({ hostname: 'beats-elenz.elenz.workers.dev' }, {}, {}), false);
  assert.equal(counting({ hostname: 'localhost' }, {}, {}), false);
});

test('a browser that has opted out (umami.disabled, as Umami reads it) sends no beats', () => {
  const site = { hostname: 'elenz.co.nz' };
  const stored = (v) => ({ localStorage: { getItem: (k) => (k === 'umami.disabled' ? v : null) } });
  assert.equal(counting(site, {}, stored('1')), false);
  assert.equal(counting(site, {}, stored('true')), false);
  assert.equal(counting(site, {}, stored(null)), true);
  assert.equal(counting(site, {}, { localStorage: { getItem: () => { throw new Error('blocked'); } } }), true);
});

test('a throttled event goes at once, then the last of a burst at the end of the wait', async () => {
  const sent = [];
  const ev = throttled(40, (n, d) => sent.push(d.i));
  for (let i = 1; i <= 5; i++) ev('layout-change', { i });
  assert.deepEqual(sent, [1]);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(sent, [1, 5]);
  await new Promise((r) => setTimeout(r, 60));
  ev('layout-change', { i: 6 });
  assert.deepEqual(sent, [1, 5, 6]);
});
