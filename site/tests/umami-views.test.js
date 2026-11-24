// One Umami page view per page (#umami-views in app.html): run with `npm test`. Umami counts a view on every address
// change, and several pages keep their view in the address, so repeat views of the same path are dropped before sending
// and become view-change events instead: the first of a run at once, then at most one a minute per page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');

/** The hook, run in a sandbox with a clock we move by hand and a stand-in for Umami's track(). */
function setup() {
  const src = html.match(/<script id="umami-views">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(src, 'app.html has the #umami-views script');
  let now = 0, seq = 0;
  const timers = new Map(), listeners = {}, sent = [];
  const window = {
    umami: { track: (name, data) => sent.push({ name, ...data }) },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const setTimeout = (fn, ms) => { timers.set(++seq, { fn, at: now + ms }); return seq; };
  const clearTimeout = (id) => timers.delete(id);
  vm.runInNewContext(src, { window, URL, location: { href: 'https://elenz.co.nz/' }, setTimeout, clearTimeout });
  const advance = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = until;
  };
  const view = (url) => window.elenzBeforeSend('event', { website: 'w', url, title: 'Elenz' });
  return { f: window.elenzBeforeSend, view, sent, advance, pagehide: () => listeners.pagehide?.() };
}
const T = 'https://elenz.co.nz/tracker';

test("Umami's script is pointed at the hook", () => {
  assert.match(html, /<script defer src="https:\/\/cloud\.umami\.is\/script\.js"[^>]*data-before-send="elenzBeforeSend"/);
});

test('the first view of a page goes, with its tags', () => {
  const { f } = setup();
  const p = { website: 'w', url: T + '?utm_source=linkedin&utm_medium=social&utm_campaign=launch' };
  assert.equal(f('event', p), p);
});

test('a change of view on the same page is no view, but a view-change event', () => {
  const { view, sent } = setup();
  assert.ok(view(T + '?range=1d'));
  assert.equal(view(T + '?range=7d'), null);
  assert.deepEqual(sent, [{ name: 'view-change', page: '/tracker', changes: 1, keys: 'range' }]);
});

test('the same settings in a new order are no change', () => {
  const { view, sent } = setup();
  assert.ok(view(T + '?fuel=oemb&region=NI'));
  assert.equal(view(T + '?region=NI&fuel=oemb'), null, 'still no view');
  assert.deepEqual(sent, [], 'and no event');
  view(T + '?region=SI&fuel=oemb');
  assert.deepEqual(sent, [{ name: 'view-change', page: '/tracker', changes: 1, keys: 'region' }]);
});

test('a run of changes sends at most one event a minute, counting what came between', () => {
  const { view, sent, advance } = setup();
  view(T);
  view(T + '?range=7d');                         // goes at once
  advance(5e3); view(T + '?range=7d&region=NI');
  advance(5e3); view(T + '?range=30d&region=NI#x');
  advance(5e3); view(T + '?range=30d&region=NI&t=5#x');
  assert.equal(sent.length, 1);
  advance(60e3);                                 // the minute ends: the three since
  assert.deepEqual(sent[1], { name: 'view-change', page: '/tracker', changes: 3, keys: '#,range,region,t' });
  advance(120e3);                                // nothing more: no more events, and the run ends
  assert.equal(sent.length, 2);
  view(T + '?range=1y');                         // a new run goes at once again
  assert.deepEqual(sent[2], { name: 'view-change', page: '/tracker', changes: 1, keys: '#,range,region,t' });
});

test('leaving the page, or closing the tab, sends what is waiting', () => {
  const { view, sent, advance, pagehide } = setup();
  view(T); view(T + '?a=1'); advance(1e3); view(T + '?a=2');
  assert.ok(view('https://elenz.co.nz/tracker/prices'), 'a new page counts as a view');
  assert.deepEqual(sent.map((e) => [e.page, e.changes]), [['/tracker', 1], ['/tracker', 1]]);
  view('https://elenz.co.nz/tracker/prices?b=1'); advance(1e3); view('https://elenz.co.nz/tracker/prices?b=2');
  pagehide();
  assert.deepEqual(sent.slice(2).map((e) => [e.page, e.changes, e.keys]), [['/tracker/prices', 1, 'b'], ['/tracker/prices', 1, 'b']]);
  advance(120e3);
  assert.equal(sent.length, 4, 'nothing left on the clock');
});

test('coming back to a page counts as a view again', () => {
  const { view } = setup();
  assert.ok(view(T));
  assert.ok(view('https://elenz.co.nz/now'));
  assert.ok(view(T + '?x=1'));
  assert.ok(view('/plants'), 'a path-only address works too');
});

test('the dashboard has its own event, so it sends no view-change', () => {
  const { view, sent } = setup();
  view('https://elenz.co.nz/dashboard');
  assert.equal(view('https://elenz.co.nz/dashboard?bg=plain'), null);
  assert.deepEqual(sent, []);
});

test('events and other kinds pass untouched', () => {
  const { f, view } = setup();
  view('https://elenz.co.nz/landscape');
  const e = { website: 'w', url: 'https://elenz.co.nz/landscape?mode=replay', name: 'landscape-mode', data: { mode: 'replay' } };
  assert.equal(f('event', e), e);
  assert.equal(f('event', e), e, 'the same event twice still goes');
  const perf = { website: 'w', url: 'https://elenz.co.nz/landscape' };
  assert.equal(f('performance', perf), perf);
  assert.equal(f('identify', perf), perf);
});
