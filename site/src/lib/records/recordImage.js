// A record as a 1200 x 630 image (the size link previews use): the mark, the record, when it was set, what it beat, and
// its progression. Laid out once, as a list of shapes and text (recordScene), and drawn two ways from that list:
//   - in the browser onto a canvas (paintScene), for a record page's Share and Download (shareImage.js), and
//   - as SVG (sceneToSvg), which the Worker turns into the PNG that link previews show (worker/og.js, /og/records/...).
// So the image a visitor downloads and the one LinkedIn or Slack shows are the same drawing (design decision,
// 16 Nov 2026). Nothing here measures text, as the Worker can't: the large value is IBM Plex Mono, whose every
// character is 0.6 em wide, and the tag's three possible widths were measured in Chromium with the site's fonts.
// Text sits on its alphabetic baseline everywhere, so canvas and SVG place it the same.
import { fmt, fullName, when, step, REGIONS, periodOf, energy } from './records.js';

// tracker.css's palettes, light and dark
export const LIGHT = {
  bg: '#f2f5f5', ink: '#132020', ink2: '#3f4f4e', muted: '#667574', line: '#d6dfde', tagBg: '#e5ebeb',
  '--ink': '#132020', '--g-ren': '#208a68', '--g-fossil': '#96501a', '--f-coal': '#4b4744', '--f-wind': '#2f9a78',
  '--f-solar': '#c48e10', '--accent': '#0d6275', '--f-hvdc': '#71838f', '--f-geo': '#a63a78', '--f-hydro': '#2f6db8',
  warnBg: '#f6ecd9', warnInk: '#6b4a0d',
};
export const DARK = {
  bg: '#131c1c', ink: '#e1e9e9', ink2: '#b3c1c0', muted: '#849493', line: '#2f3e3e', tagBg: '#243030',
  '--ink': '#e1e9e9', '--g-ren': '#2ea88a', '--g-fossil': '#a8693a', '--f-coal': '#5f5a57', '--f-wind': '#2fa883',
  '--f-solar': '#bb8c18', '--accent': '#5cb5c8', '--f-hvdc': '#7f909b', '--f-geo': '#c4508f', '--f-hydro': '#4f8bd6',
  warnBg: '#2e2412', warnInk: '#e9c98a',
};

export const W = 1200, H = 630;
export const FONTS = { ui: 'Schibsted Grotesk', data: 'IBM Plex Mono' };
// the tag's text at 600 22px Schibsted Grotesk, measured in Chromium (16 Nov 2026)
const TAG_W = { Record: 75.9, 'New record': 123.5, 'Provisional record': 192.9 };
const MONO = 0.6;   // IBM Plex Mono's advance, in em, for every character

/** The record's image as a list of shapes and text, top to bottom. Each item is one of
 *    { k: 'rect', x, y, w, h, r, fill }
 *    { k: 'circle', cx, cy, r, fill, stroke, lw }
 *    { k: 'path', pts: [[x, y], ...], stroke, lw, dash }
 *    { k: 'text', x, y, text, font: 'ui' | 'data', weight, size, fill, end }   (y: the alphabetic baseline; end: right-aligned)
 *  isNew says "New record". A provisional record (records.js headline: rec.prov, rec.official) says "Provisional
 *  record", names the official one and ends its line dashed and hollow. */
export function recordScene({ d, region, rec, end, isNew, period = 'tp', dark = false }) {
  const C = dark ? DARK : LIGHT;
  const col = C[d.tok] ?? C.ink;
  const ops = [];
  const text = (x, y, s, font, weight, size, fill, endAlign = false) =>
    ops.push({ k: 'text', x, y, text: s, font, weight, size, fill, end: endAlign });
  ops.push({ k: 'rect', x: 0, y: 0, w: W, h: H, r: 0, fill: C.bg });

  // the Elenz mark and wordmark
  const mk = (x, y, s) => {
    const k = s / 30;
    const r = (cx, cy, w, h, c) => ops.push({ k: 'rect', x: x + cx * k, y: y + cy * k, w: w * k, h: h * k, r: k, fill: C[c] });
    r(3, 17, 5, 10, '--f-geo'); r(3, 9, 5, 7, '--f-hydro');
    r(9.5, 17, 5, 10, '--f-geo'); r(9.5, 5, 5, 11, '--f-hydro');
    r(16, 17, 5, 10, '--f-geo'); r(16, 8, 5, 8, '--f-hydro'); r(16, 4, 5, 3, '--f-wind');
    r(22.5, 17, 5, 10, '--f-geo'); r(22.5, 11, 5, 5, '--f-hydro'); r(22.5, 6, 5, 4, '--f-solar');
  };
  mk(64, 50, 46);
  text(122, 82.7, 'ELENZ', 'ui', 800, 30, C.ink);
  const prov = !!rec.prov && !!rec.official;
  const tag = prov ? 'Provisional record' : isNew ? 'New record' : 'Record';
  const tw = TAG_W[tag] + 36;
  ops.push({ k: 'rect', x: 1136 - tw, y: 52, w: tw, h: 44, r: 22, fill: isNew || prov ? C.warnBg : C.tagBg });
  text(1136 - tw + 18, 81.4, tag, 'ui', 600, 22, isNew || prov ? C.warnInk : C.ink2);

  const regionName = REGIONS.find((r) => r.id === region)?.name ?? region;
  ops.push({ k: 'circle', cx: 74, cy: 186, r: 10, fill: col });
  text(96, 196, `${fullName(d)}${period !== 'tp' ? ' · ' + periodOf(period).label : ''} · ${regionName}`, 'ui', 500, 30, C.ink2);

  // the value, as large as fits beside the chart
  const value = fmt(d, rec.v, period);
  let size = 130;
  while (value.length * MONO * size > 640 && size > 60) size -= 6;
  text(60, 210 + size, value, 'data', 600, size, C.ink);
  const en = energy(d, rec.t, rec.v, period), enPrev = rec.prev ? energy(d, rec.prev[0], rec.prev[1], period) : '';
  text(64, 270 + size, when(d, rec, false, period) + (en ? ` · ${en}` : ''), 'ui', 400, 28, C.ink2);
  if (rec.prev) {
    text(64, 312 + size, `${prov ? 'Official record' : 'Previous record'} ${step(d, rec.prev, period)}${enPrev ? ` (${enPrev})` : ''}`, 'ui', 400, 24, C.muted);
  }

  // progression: a step line in the right-hand block
  const steps = rec.steps ?? [];
  if (steps.length > 1) {
    const X0 = 760, X1 = 1136, Y0 = 200, Y1 = 500;
    const a = steps[0][0], b = Math.max(end ?? 0, steps[steps.length - 1][0], prov ? rec.t : 0);
    const vs = [...steps.map((s) => s[1]), ...(prov ? [rec.v] : [])];
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (lo >= 0 && lo < 0.5 * hi) lo = 0;
    if (hi === lo) hi = lo + 1;
    const x = (t) => X0 + ((t - a) / (b - a || 1)) * (X1 - X0);
    const y = (v) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0);
    ops.push({ k: 'path', pts: [[X0, Y1 + 12], [X1, Y1 + 12]], stroke: C.line, lw: 2 });
    const pts = [[x(steps[0][0]), y(steps[0][1])]];
    let pv = steps[0][1];
    for (const [t, v] of steps.slice(1)) { pts.push([x(t), y(pv)], [x(t), y(v)]); pv = v; }
    const l = steps[steps.length - 1];
    pts.push([x(prov ? rec.t : b), y(l[1])]);
    ops.push({ k: 'path', pts, stroke: col, lw: 6, dash: d.est ? [12, 6] : null });
    if (prov) {
      // the provisional step: dashed up (or down) from the official record, ending in a hollow point
      ops.push({ k: 'path', pts: [[x(rec.t), y(l[1])], [x(rec.t), y(rec.v)], [x(b), y(rec.v)]], stroke: col, lw: 6, dash: [10, 8] });
      ops.push({ k: 'circle', cx: x(rec.t), cy: y(rec.v), r: 10, fill: C.bg, stroke: col, lw: 5 });
    } else {
      ops.push({ k: 'circle', cx: x(l[0]), cy: y(l[1]), r: 11, fill: col });
    }
    text(X0, Y1 + 42, new Date(a).getUTCFullYear().toString(), 'data', 400, 20, C.muted);
    text(X1, Y1 + 42, new Date(b).getUTCFullYear().toString(), 'data', 400, 20, C.muted, true);
  }

  ops.push({ k: 'path', pts: [[64, 556], [1136, 556]], stroke: C.line, lw: 2 });
  text(64, 594, 'elenz.co.nz/records', 'ui', 400, 22, C.muted);
  text(1136, 594, `Data: Electricity Authority, CC BY 4.0${d.est ? ' · estimate' : ''}${prov ? ' · provisional' : ''}`, 'ui', 400, 22, C.muted, true);
  return ops;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => +v.toFixed(2);

/** The scene as an SVG document (fonts named, not embedded: the renderer supplies them). */
export function sceneToSvg(ops) {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  for (const o of ops) {
    if (o.k === 'rect') out.push(`<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}"${o.r ? ` rx="${n(o.r)}"` : ''} fill="${o.fill}"/>`);
    else if (o.k === 'circle') out.push(`<circle cx="${n(o.cx)}" cy="${n(o.cy)}" r="${o.r}" fill="${o.fill ?? 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.lw}"` : ''}/>`);
    else if (o.k === 'path') out.push(`<path d="M${o.pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}" fill="none" stroke="${o.stroke}" stroke-width="${o.lw}" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''}/>`);
    else if (o.k === 'text') out.push(`<text x="${n(o.x)}" y="${n(o.y)}" font-family="${FONTS[o.font]}" font-weight="${o.weight}" font-size="${o.size}" fill="${o.fill}"${o.end ? ' text-anchor="end"' : ''}>${esc(o.text)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

const STACK = { ui: '"Schibsted Grotesk", system-ui, sans-serif', data: '"IBM Plex Mono", ui-monospace, monospace' };

/** Draw the scene onto a 2D canvas context (the canvas already W x H). */
export function paintScene(ctx, ops) {
  ctx.textBaseline = 'alphabetic';
  for (const o of ops) {
    if (o.k === 'rect') {
      ctx.fillStyle = o.fill; ctx.beginPath();
      if (o.r) ctx.roundRect(o.x, o.y, o.w, o.h, o.r); else ctx.rect(o.x, o.y, o.w, o.h);
      ctx.fill();
    } else if (o.k === 'circle') {
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, 2 * Math.PI);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw; ctx.stroke(); }
    } else if (o.k === 'path') {
      ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw; ctx.lineJoin = 'round'; ctx.setLineDash(o.dash ?? []);
      ctx.beginPath(); o.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.setLineDash([]);
    } else if (o.k === 'text') {
      ctx.fillStyle = o.fill; ctx.font = `${o.weight} ${o.size}px ${STACK[o.font]}`;
      ctx.textAlign = o.end ? 'right' : 'left'; ctx.fillText(o.text, o.x, o.y); ctx.textAlign = 'left';
    }
  }
}

/** A short tag for this image's content, for its address: a new record, or a change to the drawing (IMAGE_V), gives a
 *  new address, so link previews that keep one copy per address fetch it again. */
export const IMAGE_V = 1;
export function imageVersion({ rec, isNew, period = 'tp' }) {
  const s = `${IMAGE_V}|${period}|${rec.t}|${rec.v}|${rec.prov ? 1 : 0}|${isNew ? 1 : 0}|${rec.prev?.[0] ?? ''}|${rec.steps?.length ?? 0}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
