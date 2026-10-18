// Chart downloads for the tracker's tabs (the Download button, #lib/site/DownloadMenu.svelte):
//  - composeImage: one PNG with the view's title and dates over the charts, each with its heading and legend, and the
//    credit line and the view's link at the foot, in the site's current colours (light or dark);
//  - svgImage: a chart drawn as SVG (the Prices tab) as an image, its styles copied in so it draws the same;
//  - legendOf: a chart card's legend, read from its .lg items;
//  - csvText: a CSV with '#' header lines (what it is, source, licence, link) and quoted cells;
//  - save: hands the browser a file to download.
// The credit line follows the site footer's: the EA's data is CC BY 4.0, so a chart or table reused elsewhere must
// say where it came from.

export const CREDIT = 'Data: Electricity Authority, www.emi.ea.govt.nz, CC BY 4.0.';
export const CREDIT_SOLAR = 'Embedded solar and HVDC are Elenz estimates (irradiance: Himawari via Open-Meteo, CC BY 4.0).';
export const LICENCE = 'Licence: CC BY 4.0. Credit: Elenz (elenz.co.nz), from Electricity Authority data.';

const PAD = 28, GAP = 18;
const UI = '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif';
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A chart card's legend: [{ name, colour, kind: 'line' | 'dash' | 'area', alpha }], from its .lg items (values in <b> left out). */
export function legendOf(card) {
  return [...card.querySelectorAll('.legends .lg')].filter((el) => el.offsetParent !== null).map((el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('b').forEach((b) => b.remove());
    const i = el.querySelector('i'), s = i ? getComputedStyle(i) : null;
    const area = i?.classList.contains('area');
    return {
      name: c.textContent.trim(),
      colour: !s ? css('--ink') : area ? s.backgroundColor : s.borderTopColor,
      kind: area ? 'area' : i?.classList.contains('dash') ? 'dash' : 'line',
      alpha: s ? +s.opacity : 1,
    };
  }).filter((x) => x.name);
}

/** An SVG chart as an image to draw: its computed styles copied onto a clone (CSS variables and classes don't
 *  survive outside the page). Resolves to { img, w, h } in CSS pixels. */
export async function svgImage(svg) {
  const r = svg.getBoundingClientRect(), clone = svg.cloneNode(true);
  const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'paint-order', 'opacity', 'font-size', 'font-weight', 'font-family', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'visibility', 'display'];
  const src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, k) => {
    const s = getComputedStyle(el);
    dst[k].setAttribute('style', props.map((p) => `${p}:${s.getPropertyValue(p)}`).join(';'));
  });
  clone.setAttribute('width', String(r.width));
  clone.setAttribute('height', String(r.height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('The chart could not be drawn as an image.')); img.src = url; });
    return { img, w: r.width, h: r.height };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

// words split into lines no wider than max
function wrap(ctx, text, max) {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && ctx.measureText(t).width > max) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
// legend items laid out in rows: returns the height used (draws when draw is true)
function legendRows(ctx, items, x0, y, max, draw) {
  ctx.font = `500 12px ${UI}`;
  let x = x0, rows = items.length ? 1 : 0;
  for (const it of items) {
    const w = 18 + ctx.measureText(it.name).width + 16;
    if (x > x0 && x + w > x0 + max) { x = x0; y += 18; rows++; }
    if (draw) {
      ctx.save(); ctx.globalAlpha = it.alpha ?? 1;
      if (it.kind === 'area' || it.kind === 'fill') {
        ctx.fillStyle = it.colour; ctx.fillRect(x, y - 9, 12, 10);
        if (it.hatch) { ctx.strokeStyle = css('--surface'); ctx.lineWidth = 1.5; for (let k = -10; k < 12; k += 4) { ctx.beginPath(); ctx.moveTo(x + k, y + 1); ctx.lineTo(x + k + 10, y - 9); ctx.stroke(); } }
      } else {
        ctx.strokeStyle = it.colour; ctx.lineWidth = 2; ctx.setLineDash(it.kind === 'dash' ? [3, 2] : []);
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 13, y - 4); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = css('--ink-2'); ctx.textBaseline = 'alphabetic'; ctx.fillText(it.name, x + 18, y);
    }
    x += w;
  }
  return rows * 18;
}

// The Elenz logo (the mark from Mark.svelte and the ELENZ wordmark), right-aligned at x, its top at y. Returns its width.
const MARK = [[3, 17, 10, '--f-geo'], [3, 9, 7, '--f-hydro'], [9.5, 17, 10, '--f-geo'], [9.5, 5, 11, '--f-hydro'],
  [16, 17, 10, '--f-geo'], [16, 8, 8, '--f-hydro'], [16, 4, 3, '--f-wind'], [22.5, 17, 10, '--f-geo'], [22.5, 11, 5, '--f-hydro'], [22.5, 6, 4, '--f-solar']];
function logo(ctx, x, y, draw) {
  const size = 28, k = size / 30, gap = 7;
  ctx.font = `800 17px ${UI}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.4px';
  const ww = ctx.measureText('ELENZ').width, w = size + gap + ww;
  if (draw) {
    const x0 = x - w;
    for (const [rx, ry, rh, tok] of MARK) {
      ctx.fillStyle = css(tok); ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0 + rx * k, y + ry * k, 5 * k, rh * k, k); else ctx.rect(x0 + rx * k, y + ry * k, 5 * k, rh * k);
      ctx.fill();
    }
    ctx.fillStyle = css('--ink'); ctx.textBaseline = 'alphabetic'; ctx.fillText('ELENZ', x0 + size + gap, y + size * 0.72);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return w;
}

/** The download image. panels: [{ heading, unit, legend, img, w, h }] (img: a canvas, image or bitmap drawn at w x h
 *  CSS pixels); legend: items drawn under the title (the generation chart's sources); credit: lines at the foot;
 *  link: the view's address. Drawn at scale (2: sharp on any screen). Resolves to a PNG blob. */
export async function composeImage({ title, sub, legend = [], panels, credit = [CREDIT], link = '', scale = 2 }) {
  if (document.fonts?.ready) await document.fonts.ready;
  const inner = Math.ceil(Math.max(...panels.map((p) => p.w), 640)), W = inner + PAD * 2;
  const measure = document.createElement('canvas').getContext('2d');
  // heights first, then draw
  const layout = (ctx, draw) => {
    let y = PAD;
    const text = (t, font, colour, lh, max = inner) => { ctx.font = font; for (const l of wrap(ctx, t, max)) { y += lh; if (draw) { ctx.fillStyle = colour; ctx.fillText(l, PAD, y - lh * 0.25); } } };
    // the logo at the top right; the title wraps short of it
    const logoW = logo(ctx, W - PAD, PAD + 2, draw);
    text(title, `700 21px ${UI}`, css('--ink'), 28, inner - logoW - 24);
    if (sub) text(sub, `400 13px ${UI}`, css('--ink-2'), 19);
    if (legend.length) { y += 10; y += legendRows(ctx, legend, PAD, y + 12, inner, draw); }
    for (const p of panels) {
      y += GAP;
      ctx.font = `700 14px ${UI}`;
      const hw = ctx.measureText(p.heading).width;
      if (draw) {
        ctx.fillStyle = css('--ink'); ctx.fillText(p.heading, PAD, y + 14);
        if (p.unit) { ctx.font = `400 12px ${UI}`; ctx.fillStyle = css('--muted'); ctx.fillText(p.unit, PAD + hw + 8, y + 14); }
      }
      y += 20;
      if (p.legend?.length) { y += 4; y += legendRows(ctx, p.legend, PAD, y + 12, inner, draw); }
      y += 6;
      if (draw) ctx.drawImage(p.img, PAD, y, p.w, p.h);
      y += p.h;
    }
    y += GAP;
    if (draw) { ctx.fillStyle = css('--line'); ctx.fillRect(PAD, y, inner, 1); }
    y += 4;
    for (const c of credit) text(c, `400 12px ${UI}`, css('--muted'), 17);
    if (link) text(link, `500 12px ${UI}`, css('--accent'), 17);
    return y + PAD;
  };
  const H = Math.ceil(layout(measure, false));
  const cv = document.createElement('canvas');
  cv.width = W * scale; cv.height = H * scale;
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = css('--surface') || '#fff'; ctx.fillRect(0, 0, W, H);
  layout(ctx, true);
  return await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('The image could not be made.'))), 'image/png'));
}

/** CSV text: '#' lines first (what it is, where it's from, its licence), then the header row and rows. */
export function csvText(notes, header, rows) {
  const cell = (v) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [...notes.map((n) => '# ' + n), header.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

/** Hands the browser a file to save. */
export function save(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** NZ times for a CSV: 'YYYY-MM-DD HH:MM' local and the matching UTC instant. */
const NZ = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function nzTime(t) {
  const p = Object.fromEntries(NZ.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
export const utcTime = (t) => new Date(t).toISOString().slice(0, 16) + 'Z';
/** A file name from a view's words: "elenz-wind-generation-north-island-7-days-to-18-oct-2026". */
export const fileName = (words, ext) => 'elenz-' + words.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.' + ext;
