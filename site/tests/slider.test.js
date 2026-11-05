// Tests for the time slider's rules (src/lib/site/slider.js): run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spanView, snapSpan, trackFor, ticksFor, spanLabel, windowOf } from '#lib/site/slider.js';
import { addDays, midnightOf } from '#lib/site/viewurl.js';

const HOUR = 36e5, DAY = 864e5;
const first = Date.UTC(1997, 6, 31, 12), latest = Date.UTC(2026, 10, 5, 8, 0);   // 9 pm NZDT, 5 Nov 2026
const today = midnightOf(latest), o = (range) => ({ range, latest, first });

test('the same range and a whole-day end needs no zoom', () => {
  const end = addDays(today, -3), [a, b] = windowOf('7d', end, latest, first);
  assert.deepEqual(spanView(a, b, o('7d')), { range: '7d', end, zoom: null });
});

test('up to the newest data is live', () => {
  assert.deepEqual(spanView(latest - DAY, latest, o('1d')), { range: '1d', end: null, zoom: null });
  assert.deepEqual(spanView(latest - 3 * HOUR, latest, o('1d')), { range: '1d', end: null, zoom: { span: 3 } });
});

test('a stretch inside the range is a zoom, and the range holds', () => {
  const to = addDays(today, -2) + 10 * HOUR, from = to - 5 * HOUR;
  assert.deepEqual(spanView(from, to, o('1d')), { range: '1d', end: addDays(today, -1), zoom: { from, to } });
});

test('a stretch across midnight widens the range; from the drag\'s first range it comes back', () => {
  const mid = addDays(today, -2), from = mid - 2 * HOUR, to = mid + 2 * HOUR;
  assert.equal(spanView(from, to, o('1d')).range, '3d');
  assert.equal(spanView(latest - 5 * HOUR, latest, o('1d')).range, '1d');
});

test('the whole history is All', () => {
  assert.deepEqual(spanView(first, latest, o('1y')), { range: 'all', end: null, zoom: null });
  const z = spanView(latest - 900 * DAY, latest, o('all'));
  assert.equal(z.range, 'all'); assert.ok(z.zoom);
});

test('a window of whole days moves by whole days, and a year keeps to the calendar', () => {
  const [a, b] = snapSpan(today - 3.4 * DAY, today - 0.4 * DAY, { mode: 'move', latest, first });
  assert.equal(b, midnightOf(b));
  assert.equal(a, addDays(b, -3));
  const [c, d] = snapSpan(today - 400 * DAY, today - 35 * DAY, { mode: 'move', latest, first });
  assert.equal(new Date(c).getUTCDate(), new Date(d).getUTCDate());
});

test('a window at the newest data stays there, whatever the time of day', () => {
  for (const h of [1, 9, 20]) {
    const now = today + h * HOUR;
    assert.deepEqual(snapSpan(now - DAY, now, { mode: 'move', latest: now, first }), [now - DAY, now]);
  }
});

test('near the newest data a window goes to it; a short one moves by 5 minutes', () => {
  assert.deepEqual(snapSpan(latest - DAY - HOUR, latest - HOUR, { mode: 'move', latest, first }), [latest - DAY, latest]);
  const [a, b] = snapSpan(today - 7 * HOUR + 1000, today - 4 * HOUR + 1000, { mode: 'move', latest, first });
  assert.equal(b % 3e5, 0); assert.equal(b - a, 3 * HOUR);
});

test('the grips keep to the shortest and longest lengths allowed', () => {
  const to = today - DAY;
  assert.equal(to - snapSpan(to - 60e3, to, { mode: 'a', latest, first, min: HOUR })[0], HOUR);
  assert.equal(snapSpan(to - 40 * DAY, to, { mode: 'a', latest, first, max: 30 * DAY })[0], to - 30 * DAY);
  assert.equal(snapSpan(to - HOUR, latest + HOUR, { mode: 'b', latest, first })[1], latest);
});

test('a track holds still while the view stays on it, and follows the newest data', () => {
  const v = { from: latest - DAY, to: latest }, t = trackFor('1d', v, latest, first, null);
  assert.equal(t.b, latest); assert.equal(t.b - t.a, 7 * DAY);
  const past = { from: latest - 3 * DAY, to: latest - 2 * DAY };
  assert.deepEqual([trackFor('1d', past, latest, first, t).a, trackFor('1d', past, latest, first, t).b], [t.a, t.b]);
  const later = trackFor('1d', { from: latest + 3e5 - DAY, to: latest + 3e5 }, latest + 3e5, first, t);
  assert.equal(later.b, latest + 3e5);
});

test('a view off the track brings a new one, and tracks stop at the history\'s start', () => {
  const old = { from: first + DAY, to: first + 2 * DAY }, t = trackFor('1d', old, latest, first, null);
  assert.equal(t.a, first); assert.ok(old.to <= t.b);
  assert.deepEqual([trackFor('1y', old, latest, first, null).a, trackFor('all', old, latest, first, null).b], [first, latest]);
});

test('labels fit the track', () => {
  assert.match(ticksFor(latest - 7 * DAY, latest, 800)[0].text, /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+$/);
  assert.ok(ticksFor(latest - 7 * DAY, latest, 280).length <= 5);
  assert.ok(ticksFor(first, latest, 800).every((x) => /^\d{4}$/.test(x.text)));
});

test('the stretch in words', () => {
  assert.equal(spanLabel(today + 9 * HOUR, today + 12 * HOUR, latest), '9:00 am – 12:00 pm Thu 5 Nov');
  assert.equal(spanLabel(latest - 3 * HOUR, latest, latest), '6:00 pm – now');
  assert.equal(spanLabel(addDays(today, -1), today, latest), 'Wed 4 Nov 2026');
});
