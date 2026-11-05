// Tests for the time slider's rules (src/lib/site/slider.js): run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spanView, snapSpan, trackFor, trackLength, ticksFor, spanLabel, windowOf } from '#lib/site/slider.js';
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

test('a moved window keeps its range, across midnight too', () => {
  const to = addDays(today, -2) + 3 * HOUR, from = to - 3 * DAY;
  assert.deepEqual(spanView(from, to, o('3d')), { range: '3d', end: addDays(today, -1), zoom: { from, to } });
  assert.equal(spanView(from + 2 * DAY, to, o('1d')).range, '1d');
});

test('a stretch that outgrows its range takes the next one that holds it', () => {
  assert.equal(spanView(today - 2 * DAY, today, o('1d')).range, '3d');
  assert.equal(spanView(today - 200 * DAY, today, o('30d')).range, '1y');
  assert.equal(spanView(today - 500 * DAY, today, o('1y')).range, 'all');
});

test('the whole history is All', () => {
  assert.deepEqual(spanView(first, latest, o('1y')), { range: 'all', end: null, zoom: null });
  const z = spanView(latest - 900 * DAY, latest, o('all'));
  assert.equal(z.range, 'all'); assert.ok(z.zoom);
});

test('a window glides on the data\'s grid: 5 minutes, then half-hours, not whole days', () => {
  const to = today - 2.4 * DAY + 1000;
  for (const [days, g] of [[1, 3e5], [3, 3e5], [7, 18e5], [30, 18e5]]) {
    const [a, b] = snapSpan(to - days * DAY, to, { mode: 'move', latest, first });
    assert.equal(b % g, 0); assert.equal(b - a, days * DAY); assert.ok(Math.abs(b - to) <= g);
  }
});

test('daily data keeps to whole days, and a year to the calendar', () => {
  const [a, b] = snapSpan(today - 3.4 * DAY, today - 0.4 * DAY, { mode: 'move', latest, first, grid: 'day' });
  assert.equal(b, midnightOf(b)); assert.equal(a, addDays(b, -3));
  const [c, d] = snapSpan(today - 400 * DAY, today - 35 * DAY, { mode: 'move', latest, first });
  assert.equal(new Date(c).getUTCDate(), new Date(d).getUTCDate());
});

test('a window at the newest data stays there, whatever the time of day', () => {
  for (const h of [1, 9, 20]) {
    const now = today + h * HOUR;
    assert.deepEqual(snapSpan(now - DAY, now, { mode: 'move', latest: now, first }), [now - DAY, now]);
  }
});

test('within a step of the newest data, a window goes to it', () => {
  assert.deepEqual(snapSpan(latest - DAY - 60e3, latest - 60e3, { mode: 'move', latest, first }), [latest - DAY, latest]);
});

test('the grips keep to the shortest and longest lengths allowed', () => {
  const to = today - DAY;
  assert.equal(to - snapSpan(to - 60e3, to, { mode: 'a', latest, first, min: HOUR })[0], HOUR);
  assert.equal(snapSpan(to - 40 * DAY, to, { mode: 'a', latest, first, max: 30 * DAY })[0], to - 30 * DAY);
  assert.equal(snapSpan(to - HOUR, latest + HOUR, { mode: 'b', latest, first })[1], latest);
});

test('a track is eight windows long, for a range or any zoom, up to the whole history', () => {
  const on = (r, len) => { const t = trackFor(r, { from: latest - len, to: latest }, latest, first); return t.b - t.a; };
  for (const [r, d] of [['1d', 1], ['3d', 3], ['7d', 7], ['30d', 30], ['1y', 365]]) assert.equal(on(r, d * DAY), d * 8 * DAY);
  assert.equal(on('1d', 3 * 36e5), DAY);             // the zoom menu's 3 hours
  assert.equal(on('30d', 2 * DAY + 36e5), 49 * 8 * 36e5);   // a stretch dragged on a chart
  assert.equal(on('all', latest - first), latest - first);
  assert.equal(on('all', 5 * 365 * DAY), latest - first);    // eight times that is more than there is
});

test('a clock change or a leap year inside a window leaves its track alone', () => {
  assert.equal(trackLength('1d', 23 * 36e5), trackLength('1d', DAY));
  assert.equal(trackLength('1d', 25 * 36e5), trackLength('1d', DAY));
  assert.equal(trackLength('1y', 366 * DAY), trackLength('1y', 365 * DAY));
  assert.notEqual(trackLength('1d', 12 * 36e5), trackLength('1d', DAY));
});

test('a short track is labelled in hours, with the day at midnight', () => {
  const a = Date.parse('2026-11-04T23:00:00Z'), texts = ticksFor(a, a + DAY, 500).map((x) => x.text);   // from noon, NZ time
  assert.ok(texts.includes('3 pm') && texts.includes('Fri 6') && texts.includes('9 am'), texts.join());
  assert.ok(ticksFor(a, a + 8 * DAY, 1000).every((x) => !/[ap]m$/.test(x.text)));
});

test('the newest data sits at the track\'s end, and a past view in its middle', () => {
  const v = { from: latest - DAY, to: latest }, t = trackFor('1d', v, latest, first);
  assert.equal(t.b, latest);
  const past = { from: latest - 100 * DAY, to: latest - 99 * DAY }, m = trackFor('1d', past, latest, first);
  assert.equal((m.a + m.b) / 2, (past.from + past.to) / 2);
});

test('a track holds still while the view stays on it, and follows the newest data', () => {
  const v = { from: latest - DAY, to: latest }, t = trackFor('1d', v, latest, first);
  const past = { from: latest - 3 * DAY, to: latest - 2 * DAY }, kept = trackFor('1d', past, latest, first, t);
  assert.deepEqual([kept.a, kept.b], [t.a, t.b]);
  assert.equal(trackFor('1d', { from: latest + 3e5 - DAY, to: latest + 3e5 }, latest + 3e5, first, t).b, latest + 3e5);
});

test('a window dragged to the end of its track stays on that track, though the grid puts it just past the end', () => {
  const v = { from: latest - 30 * DAY, to: latest }, t = trackFor('30d', v, latest, first);
  const left = { from: t.a - 10 * 6e4, to: t.a - 10 * 6e4 + 30 * DAY }, kept = trackFor('30d', left, latest, first, t);
  assert.deepEqual([kept.a, kept.b], [t.a, t.b]);
  const week = trackFor('1d', { from: latest - DAY, to: latest }, latest, first);   // a day past it is a different track
  assert.notEqual(trackFor('1d', { from: week.a - DAY, to: week.a }, latest, first, week).a, week.a);
});

test('asked to centre, the view goes to the middle of the track, as far as the data allows', () => {
  const v = { from: latest - DAY, to: latest }, t = trackFor('1d', v, latest, first);
  const near = { from: latest - 5 * DAY, to: latest - 4 * DAY }, c = trackFor('1d', near, latest, first, t, true);
  assert.equal((c.a + c.b) / 2, (near.from + near.to) / 2);
  const close = { from: latest - 2 * DAY, to: latest - DAY }, d = trackFor('1d', close, latest, first, t, true);
  assert.equal(d.b, latest);
});

test('a track stops at the history\'s start, and leaves it no shorter', () => {
  const old = { from: first + DAY, to: first + 2 * DAY }, t = trackFor('1d', old, latest, first);
  assert.equal(t.a, first); assert.equal(t.b - t.a, 8 * DAY);
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
