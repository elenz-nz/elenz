// The time slider under the tracker's charts (test report TRK-12, design decision, 5 Nov 2026): a window on a track of
// time. Drag it to move through time, held at the track's end it carries on and the track rolls with it, and drag either
// end to show more or less. Each range has its own track (TRACK_DAYS), so the slider stays put while it's used. The
// charts follow during a drag where the data is already here (`host.ready`), and otherwise once the finger pauses or
// lets go; the address and the lower cards wait for it to let go (`host.go`'s `final`).
//
// The page supplies a host:
//   view()        { from, to }: the stretch shown        bounds()  { first, latest }
//   range()       the range button in force              limits()  { min, max, resize }: lengths allowed
//   go(from, to, final)  show this stretch               ready(from, to)  is its data here?
//   inset()       { left, right }: the chart's margins, so the track lines up with its time axis
//   overview(a, b, n)    n values of total generation, or null when the data isn't here (no download is made for it)
import { addDays, addYears, midnightOf, SPANS } from './viewurl.js';
import { nzOffset } from '#lib/tracker/series.js';

const DAY = 864e5, HOUR = 36e5, FIVE = 3e5;
const DAYS = { '1d': 1, '3d': 3, '7d': 7, '30d': 30, '1y': 365 };
const ORDER = ['1d', '3d', '7d', '30d', '1y'];
/** The track each range sits on, in days; the whole history for 1Y and All. */
export const TRACK_DAYS = { '1d': 7, '3d': 7, '7d': 30, '30d': 365, '1y': null, all: null };

const parts = (t) => { const d = new Date(t + nzOffset(t)); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const DOW = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ');
const localDay = (y, mo, d = 1) => midnightOf(Date.UTC(y, mo, d, 12) - 12 * HOUR);

/** The window [from, to) a range shows with this end (null: up to the newest data). */
export function windowOf(range, end, latest, first) {
  if (!DAYS[range]) return [first, latest];
  if (end == null) return [latest - DAYS[range] * DAY, latest];
  return [range === '1y' ? addYears(end, -1) : addDays(end, -DAYS[range]), end];
}

/** What shows the stretch [from, to): a range, its end and any zoom. The range in force stays while it can hold the
 *  stretch, so a slider never hops to another range or track on its own. */
export function spanView(from, to, { range, latest, first }) {
  const live = to >= latest - 6e4;
  if (live && from <= first + DAY) return { range: 'all', end: null, zoom: null };
  const end = live ? null : addDays(midnightOf(to - 1), 1);
  if (DAYS[range]) {
    const [a, b] = windowOf(range, end, latest, first);
    if (Math.abs(a - from) < 6e4 && (live || Math.abs(b - to) < 6e4)) return { range, end, zoom: null };
  }
  const hours = (to - from) / HOUR;
  if (live && range === '1d' && SPANS.includes(hours)) return { range, end: null, zoom: { span: hours } };
  const zoom = { from, to };
  if (range === 'all') return { range, end: null, zoom };
  for (const r of ORDER.slice(ORDER.indexOf(range))) if (from >= windowOf(r, end, latest, first)[0]) return { range: r, end, zoom };
  return { range: 'all', end: null, zoom };
}

/** A stretch on the data's grid. mode 'move' keeps its length: a day or more moves by whole days, so it's an ordinary
 *  window again, and shorter by 5 minutes. mode 'a' or 'b' moves that end only. */
export function snapSpan(from, to, { mode, latest, first, min = HOUR, max = Infinity }) {
  const len = to - from;
  if (mode === 'move') {
    if (to >= latest - 6e4) return [latest - len, latest];
    if (len >= 23 * HOUR) {
      const days = Math.max(1, Math.round(len / DAY)), year = Math.abs(len - 365.25 * DAY) < 2.5 * DAY;
      let e = midnightOf(to + 12 * HOUR);
      if (e > midnightOf(latest)) return [latest - len, latest];
      let s = year ? addYears(e, -1) : addDays(e, -days);
      if (s < first) { s = midnightOf(first + DAY); e = year ? addYears(s, 1) : addDays(s, days); }
      return [s, e];
    }
    let e = Math.round(to / FIVE) * FIVE;
    if (e >= latest - FIVE / 2) e = latest;
    return [Math.max(first, e - len), e];
  }
  const step = (t) => { const l = mode === 'a' ? to - t : t - from; return l >= 46 * HOUR ? midnightOf(t + 12 * HOUR) : Math.round(t / (l > 12 * HOUR ? 6 * FIVE : FIVE)) * (l > 12 * HOUR ? 6 * FIVE : FIVE); };
  if (mode === 'a') return [Math.min(to - min, Math.max(first, to - max, step(from))), to];
  let e = step(to);
  if (e >= latest - FIVE / 2) e = latest;
  return [from, Math.max(from + min, Math.min(latest, from + max, e))];
}

/** The track around a view: the same one while the view stays on it (moving on with the newest data); otherwise the
 *  newest stretch if the view is near it, or one with the view three-quarters along. */
export function trackFor(range, view, latest, first, prev) {
  const days = TRACK_DAYS[range];
  if (!days) return { range, a: first, b: latest };
  const len = Math.max(days * DAY, (view.to - view.from) * 1.5);
  if (prev && prev.range === range && prev.b - prev.a === len) {
    const shift = prev.end ? latest - prev.b : 0, a = prev.a + shift, b = prev.b + shift;
    if (view.from >= a && view.to <= b) return { range, a, b, end: prev.end };
  }
  let b = view.to >= latest - len * 0.7 ? latest : view.to + len * 0.25;
  let a = b - len;
  if (a < first) { a = first; b = Math.min(latest, a + len); }
  return { range, a, b, end: b >= latest };
}

/** Labels for a track px wide: { t, text } at whole days, weeks, months or years, at least 56 px apart. */
export function ticksFor(a, b, px) {
  const per = ((b - a) / DAY / Math.max(px, 1)) * 56, out = [];
  const add = (t, text) => { if (t >= a && t < b) out.push({ t, text }); };
  if (per <= 7) {
    const every = per <= 1 ? 1 : per <= 2 ? 2 : 7;
    for (let t = midnightOf(a); t < b; t = addDays(t, 1)) {
      const p = parts(t);
      if (every === 7 ? p.dow === 1 : every === 2 ? Math.floor(t / DAY) % 2 === 0 : true) add(t, every === 1 ? `${DOW[p.dow]} ${p.d}` : `${p.d} ${MON[p.mo]}`);
    }
    return out;
  }
  const first = parts(a), last = parts(b);
  if (per <= 92) {
    const every = per <= 31 ? 1 : 3;
    for (let k = first.y * 12 + first.mo; k <= last.y * 12 + last.mo; k++) {
      if (k % every) continue;
      const y = Math.floor(k / 12), mo = k % 12;
      add(localDay(y, mo), mo === 0 ? String(y) : MON[mo]);
    }
    return out;
  }
  const every = per <= 366 ? 1 : per <= 2 * 366 ? 2 : 5;
  for (let y = first.y; y <= last.y; y++) if (y % every === 0) add(localDay(y, 0), String(y));
  return out;
}

const clock = (t) => { const p = parts(t); return `${p.h % 12 || 12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'am' : 'pm'}`; };
const dayName = (t) => { const p = parts(t); return `${DOW[p.dow]} ${p.d} ${MON[p.mo]}`; };
/** The stretch in words: its days, or its clock times when it's under a day or two. */
export function spanLabel(from, to, latest) {
  const days = (to - from) / DAY, last = to - 1, year = (t) => parts(t).y;
  if (days < 2 && parts(from).h + parts(from).mi + parts(to).h + parts(to).mi) {
    return `${clock(from)}${dayName(from) === dayName(last) ? '' : ` ${dayName(from)}`} – ${to >= latest - 6e4 ? 'now' : `${clock(to)} ${dayName(last)}`}`;
  }
  if (days < 1.5) return `${dayName(from)} ${year(from)}`;
  return `${dayName(from)}${year(from) === year(last) ? '' : ` ${year(from)}`} – ${dayName(last)} ${year(last)}`;
}

/** Puts a slider in el. Returns { sync, destroy }: call sync after every change of view. */
export function mountSlider(el, host) {
  el.innerHTML = `<div class="ts-track"><svg class="ts-area" aria-hidden="true" preserveAspectRatio="none"><path/></svg><div class="ts-ticks" aria-hidden="true"></div>
    <div class="ts-thumb" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="Move through time" title="Drag to move through time. Drag the ends to show more or less."></div>
    <div class="ts-grip a" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="Start of the time shown"></div>
    <div class="ts-grip b" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="End of the time shown"></div></div>
    <output class="ts-tip" hidden></output>`;
  const track = el.querySelector('.ts-track'), thumb = el.querySelector('.ts-thumb'), gripA = el.querySelector('.ts-grip.a'), gripB = el.querySelector('.ts-grip.b');
  const tip = el.querySelector('.ts-tip'), ticks = el.querySelector('.ts-ticks'), area = el.querySelector('.ts-area'), path = area.querySelector('path');
  // the thumb's least width, px, room for the grips and a grip between them on a finger; a track's length rolled by a second at its end
  const MIN_THUMB = matchMedia('(pointer: coarse)').matches ? 46 : 30, ROLL = 0.3;
  let T = null, view = null, drag = null, width = 0, drawn = '';
  const W = () => track.clientWidth;
  const X = (t) => ((t - T.a) / (T.b - T.a)) * W();

  function place(from = view.from, to = view.to) {
    const w = W(), x0 = X(from), x1 = X(to), tw = Math.max(MIN_THUMB, x1 - x0);
    const left = Math.max(0, Math.min(w - tw, (x0 + x1) / 2 - tw / 2));
    thumb.style.left = `${left}px`; thumb.style.width = `${tw}px`;
    gripA.style.left = `${left}px`; gripB.style.left = `${left + tw}px`;
    const { resize } = host.limits();
    gripA.hidden = gripB.hidden = !resize;
    const text = spanLabel(from, to, host.bounds().latest);
    for (const g of [thumb, gripA, gripB]) g.setAttribute('aria-valuetext', text);
    return left + tw / 2;
  }
  function paintTrack() {
    const w = W(), key = [T.a, T.b, w, host.overviewKey?.()].join('|');
    if (key === drawn || !w) return;
    drawn = key;
    ticks.replaceChildren(...ticksFor(T.a, T.b, w).map(({ t, text }) => {
      const s = document.createElement('span'); s.textContent = text; s.style.left = `${X(t)}px`; return s;
    }));
    const n = Math.min(240, Math.ceil(w / 3)), v = host.overview?.(T.a, T.b, n);
    if (!v) { area.hidden = true; return; }
    let top = 0;
    for (const x of v) if (x > top) top = x;
    const h = 100, Y = (x) => h - (x / (top || 1)) * h * 0.9;
    let d = '';
    for (let i = 0, open = false; i < n; i++) {
      const ok = Number.isFinite(v[i]);
      if (ok) d += `${open ? 'L' : `M${i},${h}L`}${i},${Y(v[i]).toFixed(1)}`;
      if (open && (!ok || i === n - 1)) d += `L${ok ? i : i - 1},${h}Z`;
      open = ok && i < n - 1;
    }
    area.setAttribute('viewBox', `0 0 ${n - 1} ${h}`); path.setAttribute('d', d); area.hidden = false;
  }
  function sync() {
    const ins = host.inset();
    el.style.setProperty('--l', `${ins.left}px`); el.style.setProperty('--r', `${ins.right}px`);
    if (drag) return;
    const { first, latest } = host.bounds();
    view = host.view();
    if (!view) return;
    T = trackFor(host.range(), view, latest, first, T);
    place(); paintTrack();
  }

  // ---------- applying a drag: one view at a time, the newest wins ----------
  let busy = false, wanted = null, pause = 0;
  const same = (p, q) => p && q && p[0] === q[0] && p[1] === q[1];
  function run(s, final) {
    busy = true;
    requestAnimationFrame(() => setTimeout(async () => {
      try { await host.go(s[0], s[1], final); } finally { busy = false; }
      if (final) { drag = null; el.classList.remove('sliding'); tip.hidden = true; sync(); return; }
      if (drag) drag.shown = s;
      if (wanted) { const w = wanted; wanted = null; run(w.s, w.final); }
    }, 0));
  }
  function apply(s, final) {
    clearTimeout(pause);
    if (busy) { wanted = { s, final }; return; }
    if (final) return run(s, true);
    if (same(s, drag.shown)) return;
    if (host.ready(s[0], s[1])) return run(s, false);
    pause = setTimeout(() => { if (drag && !busy) run(s, false); }, 220);   // data to fetch: wait for the finger to pause
  }

  // ---------- dragging ----------
  function limits(d) {
    const { first, latest } = host.bounds(), L = host.limits();
    return { mode: d.mode, first, latest, min: L.min, max: L.max };
  }
  function show(d) {
    if (!d.moved) {
      if (Math.abs(d.x - d.x0) < 3 && !d.jumped) return;   // a tap on the window, or a finger starting to scroll the page, moves nothing
      d.moved = true;
      el.classList.add('sliding');
      host.start?.();
    }
    const { first, latest } = host.bounds(), L = host.limits();
    let { from, to } = d.base;
    const dt = ((d.x - d.x0) / W()) * (T.b - T.a);
    if (d.mode === 'move') {
      const len = to - from;
      from = Math.max(first, Math.max(T.a, Math.min(T.b - len, from + dt)));
      to = from + len;
    } else if (d.mode === 'a') {
      from = Math.max(T.a, Math.max(first, to - L.max), Math.min(to - L.min, from + dt));
    } else {
      to = Math.min(T.b, latest, from + L.max, Math.max(from + L.min, to + dt));
    }
    d.raw = [from, to];
    d.snap = snapSpan(from, to, limits(d));
    const c = place(from, to);
    tip.textContent = spanLabel(d.snap[0], d.snap[1], latest);
    tip.hidden = false;
    tip.style.left = `${Math.max(tip.offsetWidth / 2, Math.min(W() - tip.offsetWidth / 2, c))}px`;
    apply(d.snap, false);
  }
  // held against the track's end, the track rolls and the window goes with it
  function roll(now) {
    const d = drag;
    if (!d || d.done) return;
    const dtime = Math.min(50, now - (d.last ?? now)); d.last = now;
    requestAnimationFrame(roll);
    const { first, latest } = host.bounds(), over = d.x < 0 ? -1 : d.x > W() ? 1 : 0;
    const days = TRACK_DAYS[T.range], dir = over;
    if (!dir || !days) return;
    const len = T.b - T.a, by = Math.max(-(T.a - first), Math.min(latest - T.b, dir * len * ROLL * (dtime / 1000)));
    if (!by) return;
    T = { ...T, a: T.a + by, b: T.b + by, end: T.b + by >= latest };
    paintTrack(); show(d);
  }
  function down(e, mode) {
    if (e.button || drag) return;
    e.preventDefault(); e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    view = host.view();
    if (!view) return;
    let base = { ...view }, jumped = false;
    if (mode === 'jump') {
      // a press on the track brings the window there, and it can be dragged from there
      const len = base.to - base.from, r = track.getBoundingClientRect(), t = T.a + ((e.clientX - r.left) / r.width) * (T.b - T.a);
      const from = Math.max(T.a, Math.min(T.b - len, t - len / 2));
      base = { from, to: from + len }; mode = 'move'; jumped = true;
    }
    const r = track.getBoundingClientRect();
    drag = { mode, base, start: { ...view }, x0: e.clientX - r.left, x: e.clientX - r.left, left: r.left, shown: null, jumped };
    show(drag);
    requestAnimationFrame(roll);
  }
  function move(e) {
    if (!drag) return;
    drag.x = e.clientX - drag.left;
    show(drag);
  }
  function up() {
    if (!drag || drag.done) return;
    drag.done = true;
    if (!drag.moved) { drag = null; return; }
    apply(drag.snap ?? [drag.start.from, drag.start.to], true);
  }
  function key(e) {
    if (e.key === 'Escape' && drag) { e.stopPropagation(); drag.snap = [drag.start.from, drag.start.to]; return up(); }
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, ends = e.key === 'Home' || e.key === 'End';
    if (!dir && !ends) return;
    e.preventDefault(); e.stopPropagation();
    if (drag) return;
    view = host.view();
    const { first, latest } = host.bounds(), len = view.to - view.from;
    const mode = e.currentTarget === gripA ? 'a' : e.currentTarget === gripB ? 'b' : 'move';
    const by = dir * Math.max(FIVE, (e.shiftKey ? 1 : 0.1) * len);
    let from = view.from, to = view.to;
    if (ends) { from = e.key === 'Home' ? first : latest - len; to = from + len; }
    else if (mode === 'move') { from += by; to += by; if (to > latest) { to = latest; from = to - len; } if (from < first) { from = first; to = from + len; } }
    else if (mode === 'a') from += by; else to += by;
    host.go(...snapSpan(from, to, { mode: ends ? 'move' : mode, first, latest, ...host.limits() }), true);
  }
  for (const [n, m] of [[thumb, 'move'], [gripA, 'a'], [gripB, 'b'], [track, 'jump']]) {
    n.addEventListener('pointerdown', (e) => { if (m === 'jump' && e.target !== track && !ticks.contains(e.target) && !area.contains(e.target)) return; down(e, m); });
    n.addEventListener('pointermove', move);
    n.addEventListener('pointerup', up);
    n.addEventListener('pointercancel', up);
    if (m !== 'jump') n.addEventListener('keydown', key);
  }
  const ro = new ResizeObserver(() => { if (track.clientWidth !== width) { width = track.clientWidth; drawn = ''; if (T && view) { place(); paintTrack(); } } });
  ro.observe(track);
  return { sync, destroy: () => ro.disconnect() };
}
