// A record as a 1200 x 630 image (the size link previews use), drawn in the browser for the "Download image"
// button on a record's page: the mark, the record, when it was set, what it beat, and its progression.
// Always in the light palette (tracker.css), so it reads the same wherever it is posted.
import { fmt, fullName, when, step, REGIONS, periodOf, energy } from './records.js';

const C = {
  bg: '#f2f5f5', ink: '#132020', ink2: '#3f4f4e', muted: '#667574', line: '#d6dfde',
  '--ink': '#132020', '--g-ren': '#208a68', '--g-fossil': '#96501a', '--f-coal': '#4b4744', '--f-wind': '#2f9a78',
  '--f-solar': '#c48e10', '--accent': '#0d6275', '--f-hvdc': '#71838f', '--f-geo': '#a63a78', '--f-hydro': '#2f6db8',
  warnBg: '#f6ecd9', warnInk: '#6b4a0d',
};
const UI = '"Schibsted Grotesk", system-ui, sans-serif';
const DATA = '"IBM Plex Mono", ui-monospace, monospace';

function mark(ctx, x, y, s) {
  const k = s / 30;
  const r = (cx, cy, w, h, c) => { ctx.fillStyle = C[c]; ctx.beginPath(); ctx.roundRect(x + cx * k, y + cy * k, w * k, h * k, k); ctx.fill(); };
  r(3, 17, 5, 10, '--f-geo'); r(3, 9, 5, 7, '--f-hydro');
  r(9.5, 17, 5, 10, '--f-geo'); r(9.5, 5, 5, 11, '--f-hydro');
  r(16, 17, 5, 10, '--f-geo'); r(16, 8, 5, 8, '--f-hydro'); r(16, 4, 5, 3, '--f-wind');
  r(22.5, 17, 5, 10, '--f-geo'); r(22.5, 11, 5, 5, '--f-hydro'); r(22.5, 6, 5, 4, '--f-solar');
}

/** Draw a record onto a canvas (1200 x 630). isNew: say "New record". */
export async function drawRecord(canvas, { d, region, rec, end, isNew, period = 'tp' }) {
  try { await document.fonts.ready; } catch { /* fonts are a nicety */ }
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  const col = C[d.tok] ?? C.ink;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 1200, 630);

  mark(ctx, 64, 50, 46);
  ctx.fillStyle = C.ink; ctx.font = `800 30px ${UI}`; ctx.textBaseline = 'middle';
  ctx.fillText('ELENZ', 122, 74);
  const tag = isNew ? 'New record' : 'Record';
  ctx.font = `600 22px ${UI}`;
  const tw = ctx.measureText(tag).width + 36;
  ctx.fillStyle = isNew ? C.warnBg : '#e5ebeb';
  ctx.beginPath(); ctx.roundRect(1136 - tw, 52, tw, 44, 22); ctx.fill();
  ctx.fillStyle = isNew ? C.warnInk : C.ink2; ctx.fillText(tag, 1136 - tw + 18, 75);

  const regionName = REGIONS.find((r) => r.id === region)?.name ?? region;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(74, 186, 10, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = C.ink2; ctx.font = `500 30px ${UI}`;
  ctx.fillText(`${fullName(d)}${period !== 'tp' ? ' · ' + periodOf(period).label : ''} · ${regionName}`, 96, 196);

  // the value, as large as fits beside the chart
  const value = fmt(d, rec.v, period);
  let size = 130;
  ctx.font = `600 ${size}px ${DATA}`;
  while (ctx.measureText(value).width > 640 && size > 60) { size -= 6; ctx.font = `600 ${size}px ${DATA}`; }
  ctx.fillStyle = C.ink; ctx.fillText(value, 60, 210 + size);
  ctx.font = `400 28px ${UI}`; ctx.fillStyle = C.ink2;
  const en = energy(d, rec.t, rec.v, period), enPrev = rec.prev ? energy(d, rec.prev[0], rec.prev[1], period) : '';
  ctx.fillText(when(d, rec, false, period) + (en ? ` · ${en}` : ''), 64, 270 + size);
  if (rec.prev) {
    ctx.fillStyle = C.muted; ctx.font = `400 24px ${UI}`;
    ctx.fillText(`Previous record ${step(d, rec.prev, period)}${enPrev ? ` (${enPrev})` : ''}`, 64, 312 + size);
  }

  // progression: a step line in the right-hand block
  const steps = rec.steps ?? [];
  if (steps.length > 1) {
    const X0 = 760, X1 = 1136, Y0 = 200, Y1 = 500;
    const a = steps[0][0], b = Math.max(end ?? 0, steps[steps.length - 1][0]);
    const vs = steps.map((s) => s[1]);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (lo >= 0 && lo < 0.5 * hi) lo = 0;
    if (hi === lo) hi = lo + 1;
    const x = (t) => X0 + ((t - a) / (b - a || 1)) * (X1 - X0);
    const y = (v) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X0, Y1 + 12); ctx.lineTo(X1, Y1 + 12); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    if (d.est) ctx.setLineDash([12, 6]);
    ctx.beginPath(); ctx.moveTo(x(steps[0][0]), y(steps[0][1]));
    let pv = steps[0][1];
    for (const [t, v] of steps.slice(1)) { ctx.lineTo(x(t), y(pv)); ctx.lineTo(x(t), y(v)); pv = v; }
    ctx.lineTo(x(b), y(steps[steps.length - 1][1]));
    ctx.stroke(); ctx.setLineDash([]);
    const l = steps[steps.length - 1];
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x(l[0]), y(l[1]), 11, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = C.muted; ctx.font = `400 20px ${DATA}`;
    ctx.fillText(new Date(a).getUTCFullYear().toString(), X0, Y1 + 42);
    ctx.textAlign = 'right'; ctx.fillText(new Date(b).getUTCFullYear().toString(), X1, Y1 + 42); ctx.textAlign = 'left';
  }

  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, 556); ctx.lineTo(1136, 556); ctx.stroke();
  ctx.fillStyle = C.muted; ctx.font = `400 22px ${UI}`;
  ctx.fillText('elenz.co.nz/records', 64, 594);
  ctx.textAlign = 'right';
  ctx.fillText(`Data: Electricity Authority, CC BY 4.0${d.est ? ' · estimate' : ''}`, 1136, 594);
  ctx.textAlign = 'left';
}
