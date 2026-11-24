// One Umami page view per page (#umami-views in app.html): run with `npm test`. Umami counts a view on every address
// change, and several pages keep their view in the address, so repeat views of the same path are dropped before sending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');

function beforeSend() {
  const src = html.match(/<script id="umami-views">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(src, 'app.html has the #umami-views script');
  const window = {};
  vm.runInNewContext(src, { window, URL, location: { href: 'https://elenz.co.nz/' } });
  return window.elenzBeforeSend;
}
const view = (url) => ({ website: 'w', url, title: 'Elenz' });

test("Umami's script is pointed at the hook", () => {
  assert.match(html, /<script defer src="https:\/\/cloud\.umami\.is\/script\.js"[^>]*data-before-send="elenzBeforeSend"/);
});

test('the first view of a page goes, with its tags', () => {
  const f = beforeSend();
  const p = view('https://elenz.co.nz/tracker?utm_source=linkedin&utm_medium=social&utm_campaign=launch');
  assert.equal(f('event', p), p);
});

test('a change of view on the same page is dropped', () => {
  const f = beforeSend();
  assert.ok(f('event', view('https://elenz.co.nz/tracker')));
  assert.equal(f('event', view('https://elenz.co.nz/tracker?range=7d')), null);
  assert.equal(f('event', view('https://elenz.co.nz/tracker?range=30d#nz')), null);
});

test('a new page counts, and so does coming back to one', () => {
  const f = beforeSend();
  assert.ok(f('event', view('https://elenz.co.nz/tracker')));
  assert.ok(f('event', view('https://elenz.co.nz/tracker/prices')));
  assert.ok(f('event', view('https://elenz.co.nz/tracker?x=1')));
  assert.ok(f('event', view('/now')), 'a path-only address works too');
});

test('events and other kinds pass untouched', () => {
  const f = beforeSend();
  assert.ok(f('event', view('https://elenz.co.nz/dashboard')));
  const e = { ...view('https://elenz.co.nz/dashboard?bg=plain'), name: 'layout-change', data: { bg: 'plain' } };
  assert.equal(f('event', e), e);
  assert.equal(f('event', e), e, 'the same event twice still goes');
  const perf = view('https://elenz.co.nz/dashboard');
  assert.equal(f('performance', perf), perf);
  assert.equal(f('identify', perf), perf);
});
