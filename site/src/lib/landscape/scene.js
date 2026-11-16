// The power landscape's scene (/landscape): an animated storybook New Zealand drawn on a canvas, every part of it driven
// by one dial (dials.js) worked out from the live feed (feed.js). The scene eases towards each new value, so a 5-minute
// update never makes anything jump. Also here: the names on the picture, the pop-ups, the numbers under it, the dials
// table and the page's buttons, all found inside `root` by id (the markup is in routes/landscape/+page.svelte).
//
// Ported from the prototype (Elenz Power Landscape, 13 Nov 2026); the view's settings come from prefs.js. Still to do from the
// production plan: pop-ups beside their subject, the phone layout, and drawing the still parts once.
import { clamp, lerp, sun, hourOf, lateness, sampleAt, SEASONS, SEASON_F, seasonIdx, seasonOf, snowAmt, meltAmt, lakeAmt,
  springAmt, autumnAmt, winterAmt, dryAmt, redAmt, isXmas, BAND, makeDials } from './dials.js';
import { clean, cardsOn } from './prefs.js';

/** Draws the scene in `root` from `feed` (feed.js) until destroy(); setFeed() takes each new feed. opts: `prefs`, the
 * view to open with (prefs.js); `onPrefs(prefs)`, called when the viewer changes it; `loop`, replay again from the
 * start after the end (the wall-screen link). */
export function mountScene(root, feed, opts = {}) {
let D = feed;
const at = x => sampleAt(D, x);
const dialsFrom = makeDials({ get batt() { return D.cap?.batt; } });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => root.querySelector('#' + id);
const fmtTime = ms => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit', hour12: true }).format(ms).replace(' ', ' ');
const fmtDay = ms => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
// ---------- modes ----------
const prefs = clean(opts.prefs);
let mode = prefs.mode, playing = true, pos = D.n - 1, showLabels = prefs.names, showBirds = prefs.birds, calm = prefs.calm;
const manual = { wind: .5, hydro: .45, cloud: .2, time: 12, thermal: .1, geo: .86, batt: 0 };
let target = dialsFrom(at(D.n - 1));
const cur = Object.assign({}, target);

// ---------- canvas ----------
const cv = $('cv'), ctx = cv.getContext('2d');
const W = 1000, H = 640;
let scale = 1;
// The drawing is redone every frame, so its pixels are capped (about 2.4 million: 1,920 x 1,230): a full-screen TV at
// two or three device pixels per CSS pixel would otherwise draw up to 9 million a frame, drop frames, and the turbines
// and birds would jump (test report, 16 Nov 2026). The picture is soft-edged, so the cap doesn't show.
const MAX_PX = 2.4e6;
function resize() {
  const r = cv.getBoundingClientRect();
  let dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (r.width * r.height * dpr * dpr > MAX_PX) dpr = Math.sqrt(MAX_PX / Math.max(1, r.width * r.height));
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  scale = cv.width / W;
  $('stage').style.setProperty('--u', r.width / 100 + 'px');   // 1% of the picture's width, for the numbers on it
}
const ro = new ResizeObserver(resize); ro.observe(cv);
resize();

const hex = c => c[0] === '#' ? [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)] : c.match(/\d+/g).slice(0, 3).map(Number);
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v,i) => Math.round(lerp(v, B[i], clamp(t)))).join(',')})`; };
const mixA = (a, b, t, al) => { const A = hex(a), B = hex(b); return `rgba(${A.map((v,i) => Math.round(lerp(v, B[i], clamp(t)))).join(',')},${al})`; };

// ---------- scene geometry: every object is placed from these, so things sit on the land ----------
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ridgeY = x => 432 - 90 * Math.exp(-(((x - 520) / 235) ** 2)) + 3 * Math.sin(x / 41);          // wind farm ridge
const shoulderY = x => 398 - 9 * Math.pow(clamp((x - 790) / 210), .8) + 2 * Math.sin(x / 23);      // bush hill right of the dam
const groundY = x => 452 - 16 * Math.sin(clamp(x / 1000) * Math.PI) + 2.5 * Math.sin(x / 67 + 1);   // front paddocks
const farY = x => 404 + 10 * Math.sin(x / 90) + 5 * Math.sin(x / 37 + 2);                           // hazy far hills
const LAKE_TOP = 358, CREST = 394, S = 70, BOT = 640 + S; // S: the land is drawn this far up, leaving less empty sky
const ALPS = [[430,430],[505,318],[535,335],[568,252],[604,292],[650,182],[700,244],[745,150],[800,232],[850,176],[900,252],[950,206],[1000,250],[1000,430]];
const ALP_PEAKS = [3, 5, 7, 9, 11];
const RIVER = [[773,447],[764,468],[712,484],[742,512],[856,524],[906,560],[852,602],[880,652],[846,700],[874,748]];
function riverPt(t) { // Catmull-Rom along the river
  const n = RIVER.length - 1, x = clamp(t) * n, i = Math.min(Math.floor(x), n - 1), f = x - i;
  const p0 = RIVER[Math.max(i-1,0)], p1 = RIVER[i], p2 = RIVER[i+1], p3 = RIVER[Math.min(i+2,n)];
  const cr = (a,b,c,d) => 0.5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f);
  return [cr(p0[0],p1[0],p2[0],p3[0]), cr(p0[1],p1[1],p2[1],p3[1])];
}
const RPTS = Array.from({ length: 61 }, (_, i) => riverPt(i / 60));
let BRI = 0; for (let i = 30; i < 61; i++) if (Math.abs(RPTS[i][1] - 588) < Math.abs(RPTS[BRI][1] - 588)) BRI = i; // where the road meets the river
const BR = RPTS[BRI], BA = -.093;
const RD = Array.from({ length: 401 }, (_, i) => [...riverPt(i / 400), (11 + i * .15 * .52) * 1.35 / 2 + 5]);
const inRiver = (x, y) => RD.some(([rx, ry, h]) => Math.hypot(x - rx, y - ry) < h);
let BL = 0, BRT = 0; // how far the deck must reach each way along the road to clear the water and both banks
while (BL < 90 && inRiver(BR[0] - Math.cos(BA) * BL, BR[1] - Math.sin(BA) * BL)) BL += 2;
while (BRT < 90 && inRiver(BR[0] + Math.cos(BA) * BRT, BR[1] + Math.sin(BA) * BRT)) BRT += 2;
BL += 9; BRT += 9;
const TURBINES = [[372,.74],[436,.84],[508,.94],[578,.86],[640,.76]].map(([x, s]) => [x, ridgeY(x) + 3, s]);
const HOUSES = [[392,552,0],[352,512,1],[404,498,2],[456,514,3],[508,502,1],[326,546,2],[344,662,0],[456,654,3]];
// lights go out one house at a time between 9:30 pm and 1 am (hours past midnight count on from 24); one house keeps a single window lit all night
const BEDTIME = [22.4, 21.6, Infinity, 22.9, 24.3, 22.0, 23.7, 24.9];
const awake = (h, off) => h >= 5.5 && h < 12 ? clamp(h - 5.5) : clamp((off - (h < 12 ? h + 24 : h)) * 4); // 1 = lit; everyone is up again by 6:30 am
const WALLS = ['#f6ead2', '#e9eef0', '#f3d9c4', '#e3ecd6'], ROOFS = ['#c8553f', '#55708c', '#b8492f', '#7a5a4a'];
const R0 = rng(11);
const STARS = Array.from({ length: 90 }, () => [R0() * 1000, R0() * 300 + 6, R0(), R0() < .15 ? 2.6 : 1.6]);
const CRUX = [[0,-27,3],[0,27,3.2],[-15,3,2.8],[17,-7,2.6],[8,9,1.6],[-64,34,3],[-92,48,3.2]];
// Matariki (the Pleiades): Matariki, Tupuārangi, Tupuānuku, Ururangi, Waipunarangi, Waitī, Waitā, Hiwa-i-te-rangi, Pōhutukawa
const MATARIKI = [[-8,2,4.6],[-31,5,3.6],[-30,-8,3],[3,14,3.4],[23,10,3.6],[10,-9,3.6],[19,-18,3.2],[23,-5,2.6],[6,-24,3]];
const clouds = Array.from({ length: 13 }, (_, i) => ({ x: i * 92 + 20, y: 40 + ((i * 37) % 5) * 21, s: .62 + (i % 4) * .16, k: [0, 7, 3, 10, 5, 12, 1, 8, 4, 11, 2, 9, 6][i] }));
const birds = [
  { kind: 'kereru', x: 300, y: 196, dir: -1, ph: 0 },
  { kind: 'tui', x: 760, y: 300, dir: -1, ph: 1.7 },
];
// wires: each runs from a power station to the switchyard, then on to town. t = lattice tower, p = pole, g = switchyard gantry, b = building
const NET = [
  { k: 'wind', c: '#3fc79b', pts: [[546,392,.62,'t'],[560,448,.82,'t'],[568,472,1,'g']] },
  { k: 'hydro', c: '#69b4ff', pts: [[726,432,1,'b'],[690,454,.82,'t'],[628,459,.9,'t'],[576,472,1,'g']] },
  { k: 'thermal', c: '#ffa04d', pts: [[874,462,1,'b'],[816,474,.86,'t'],[690,454,.82,'t'],[628,459,.9,'t'],[576,472,1,'g']] },
  { k: 'geo', c: '#f07fc0', pts: [[214,441,1,'b'],[294,457,.8,'t'],[390,452,.8,'t'],[480,453,.82,'t'],[560,448,.82,'t'],[568,472,1,'g']] },
  { k: 'solar', c: '#ffd426', pts: [[265,489,1,'b'],[294,457,.8,'t'],[390,452,.8,'t'],[480,453,.82,'t'],[560,448,.82,'t'],[568,472,1,'g']] },
  { k: 'batt', c: '#b79cff', pts: [[626,532,1,'b'],[600,506,.9,'p'],[578,472,1,'g']] },
  { k: 'town', c: '#ffffff', pts: [[543,502,.9,'p'],[516,628,1,'p'],[400,640,1,'p']] },
  { k: 'drop', c: '#ffa04d', pts: [[400,640,1,'p'],[366,628,1,'b']] },
  { k: 'drop', c: '#ffa04d', pts: [[400,640,1,'p'],[434,621,1,'b']] },
  { k: 'town', c: '#ffffff', pts: [[566,472,1,'g'],[543,502,.9,'p']] },
];
const topOf = ([x, y, s, kind]) => kind === 't' ? [x, y - 41 * s] : kind === 'p' ? [x, y - 25 * s] : kind === 'g' ? [x, y - 27] : [x, y];
for (const n of NET) {
  n.w = n.pts.map(topOf); n.len = []; n.total = 0;
  for (let i = 0; i < n.w.length - 1; i++) { const l = Math.hypot(n.w[i+1][0] - n.w[i][0], n.w[i+1][1] - n.w[i][1]); n.len.push(l); n.total += l; }
}
const STANDS = []; // towers and poles, drawn once each
for (const n of NET) for (const p of n.pts) if ((p[3] === 't' || p[3] === 'p') && !STANDS.some(q => q[0] === p[0] && q[1] === p[1])) STANDS.push(p);

// painterly texture: short brush dabs, hedgerows, bush and sheep, placed once with a fixed seed
const R1 = rng(4);
function dabs(n, x0, x1, top, bot) {
  const out = [];
  while (out.length < n) { const x = lerp(x0, x1, R1()), y0 = top(x) + 5, y1 = bot(x) - 3; if (y1 <= y0) continue; out.push([x, lerp(y0, y1, R1()), 5 + R1() * 9, (R1() - .5) * .5, R1() < .5]); }
  return out;
}
const DAB_RIDGE = dabs(170, 0, 760, ridgeY, groundY), DAB_FORE = dabs(520, 0, 1000, groundY, () => BOT), DAB_FAR = dabs(60, 0, 700, farY, ridgeY);
const HEDGE = [];
for (let x = 250; x < 742; x += 5) { const y = ridgeY(x) + 30 + 3 * Math.sin(x / 30); if (y < groundY(x) - 5) HEDGE.push([x, y, 2.6 + R1() * 1.6]); }
for (let x = 330; x < 705; x += 5) { const y = ridgeY(x) + 60 + 4 * Math.sin(x / 26); if (y < groundY(x) - 5) HEDGE.push([x, y, 2.8 + R1() * 1.8]); }
for (const hx of [318, 402, 470, 610, 676]) for (let k = 0; k < 1; k += .09) { const x = hx + k * 16, y = ridgeY(hx) + 8 + k * 52; if (y < groundY(x) - 5) HEDGE.push([x, y, 2.4 + R1() * 1.4]); }
const BUSH = [];
for (let i = 0; i < 120; i++) { const x = 800 + R1() * 205, y = shoulderY(x) + 5 + R1() * R1() * 60; BUSH.push([x, y, 5 + R1() * 6, R1()]); }
BUSH.sort((a, b) => a[1] - b[1]);
const SHEEP = [[292,418],[318,424],[352,411],[428,404],[452,410],[236,430],[655,416],[694,424],[950,514],[976,528],[936,534],[130,500],[160,494],[962,640],[690,640],[612,646],[160,655]];
const FLOWERS = [];
while (FLOWERS.length < 190) { const x = R1() * 1000, top = groundY(x) + 10, y = lerp(top, BOT - 6, R1()); if (x < 300 && y > 496 && y < 606) continue; FLOWERS.push([x, y, Math.floor(R1() * 4), .7 + (y - 440) / 220]); }
while (FLOWERS.length < 250) { const x = R1() * 740, y0 = ridgeY(x) + 8, y1 = groundY(x) - 4; if (y1 > y0) FLOWERS.push([x, lerp(y0, y1, R1()), Math.floor(R1() * 4), .6]); }
const PETAL = ['#ffffff', '#ffe04a', '#ff9fcc', '#c9a6ff'];
const PATCHES = [[180,520,150,34,1],[470,470,120,16,0],[640,560,170,36,1],[930,500,90,30,0],[380,610,220,30,0],[820,470,90,18,1],[250,672,200,26,1],[640,668,180,24,0]];

let snowAlps = 262, snowRua = 306, melt = 0, lakeLevel = .5;
let swayA = 0, swayB = 0, fanRot = 0, spillPh = 0, sheepPh = 0, rainPh = 0, spring = 0, autumn = 0, dry = 0, red = 0, xmas = false, winterSky = 0;
let rclock = 0; // real time, for the things low motion leaves alone
let rotor = 0, flow = 0, clock = 0, battLevel = .55, N = 0, lastN = -1, skyTop = '#4c9be0', skyBot = '#bfe2f4';
const steam = [], smoke = [], mist = [];

// colours: every land colour is a daytime colour pulled towards deep blue as the sun goes down
const toneCache = new Map();
const G = c => T(dry > .01 ? mix(c, '#c4b062', dry * .45) : c); // grass colours: they brown off in a dry summer
function T(c, k = .74) { const key = c + k; let v = toneCache.get(key); if (!v) { v = mix(c, '#0f1b33', N * k); toneCache.set(key, v); } return v; }
function poly(pts, fill, stroke) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) ink(stroke); }
function ink(w = 1.3, a = .5) { ctx.strokeStyle = `rgba(18,34,44,${a})`; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
function edge(fn, x0, x1, bottom, step = 8) { ctx.beginPath(); ctx.moveTo(x0, bottom); for (let x = x0; x <= x1; x += step) ctx.lineTo(x, fn(x)); ctx.lineTo(x1, fn(x1)); ctx.lineTo(x1, bottom); ctx.closePath(); }
function rim(fn, x0, x1, col, w = 2) { ctx.beginPath(); for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, fn(x) + w / 2); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); }
function shadow(x, y, rx, ry = rx * .22) { ctx.fillStyle = 'rgba(16,44,30,.24)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); }
function strokeDabs(list) {
  ctx.lineCap = 'round'; ctx.lineWidth = 3;
  for (const light of [true, false]) {
    ctx.beginPath();
    for (const [x, y, l, a, isLight] of list) if (isLight === light) { ctx.moveTo(x, y); ctx.lineTo(x + l, y + l * a); }
    ctx.strokeStyle = light ? `rgba(240,255,190,${.13 * (1 - N * .7)})` : 'rgba(14,60,40,.11)'; ctx.stroke();
  }
}
function glowDot(x, y, r, col, a) { ctx.globalAlpha = a * .26; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }

// ---------- sky ----------
function sky(d) {
  const e = d.sun;
  let top, bot;
  if (e < -8) { top = '#081630'; bot = '#1c3560'; }
  else if (e < 0) { const t = (e + 8) / 8; top = mix('#081630', '#35508c', t); bot = mix('#1c3560', '#f3916f', t); }
  else if (e < 12) { const t = e / 12; top = mix('#35508c', '#3f8fdc', t); bot = mix('#f3916f', '#c9e8f5', t); }
  else { top = '#3f8fdc'; bot = '#c9e8f5'; }
  const grey = e > 0 ? d.cloud * .55 : 0;
  skyTop = mix(top, '#8a97a3', grey); skyBot = mix(bot, '#c3cbd2', grey);
  const g = ctx.createLinearGradient(0, 0, 0, 440 - S);
  g.addColorStop(0, skyTop); g.addColorStop(.55, mix(skyTop, skyBot, .55)); g.addColorStop(1, skyBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 460);
  const night = clamp((-e - 2) / 8);
  if (night > 0) {
    ctx.fillStyle = '#fff';
    for (const [x, y, k, r] of STARS) { ctx.globalAlpha = night * (.35 + .65 * Math.abs(Math.sin(clock * (.6 + k) + x))); ctx.fillRect(x, y, r, r); }
    const spark = (cx, cy, r) => { ctx.beginPath(); ctx.moveTo(cx, cy - r * 2); ctx.quadraticCurveTo(cx, cy, cx + r * 2, cy); ctx.quadraticCurveTo(cx, cy, cx, cy + r * 2); ctx.quadraticCurveTo(cx, cy, cx - r * 2, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - r * 2); ctx.fill(); };
    ctx.globalAlpha = night * .8; // the Southern Cross and its two pointers, small, on the right
    for (const [x, y, r] of CRUX) spark(268 + x * .62, 58 + y * .62, r * .62);
    // Matariki, the brightest thing in the night sky here
    ctx.globalAlpha = night * winterSky; // Matariki rises in winter
    if (winterSky > .02) MATARIKI.forEach(([x, y, r], i) => { const tw = 1 + .16 * Math.sin(clock * 2.2 + i * 1.9), cx = 640 + x * 1.7, cy = 60 + y * 1.7;
      ctx.fillStyle = 'rgba(190,225,255,.35)'; ctx.beginPath(); ctx.arc(cx, cy, r * 2.1 * tw, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; spark(cx, cy, r * tw); });
    ctx.globalAlpha = 1;
  }
}
function sunAndMoon(d) {
  const e = d.sun;
  if (e > -6) {
    const x = 500 - 470 * Math.sin(clamp(d.sunH / 100, -1, 1) * Math.PI / 2);
    const y = 400 - S - clamp(e / 65, -0.1, 1) * 262;
    const bright = 1 - d.cloud * .7, low = clamp(1 - e / 18);
    const core = mix(mix('#ffd84d', '#ff9a3d', low * .8), '#f2e9c4', d.cloud * .6);
    const glow = ctx.createRadialGradient(x, y, 10, x, y, 150 + low * 60);
    glow.addColorStop(0, mixA('#ffe890', '#ffb060', low, .6 * bright)); glow.addColorStop(.4, mixA('#ffe890', '#ff9a60', low, .22 * bright)); glow.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 210, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(clock * .12);
    ctx.fillStyle = mixA('#ffdb66', '#ffa955', low, .9 * bright);
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); const l = (i % 2 ? 13 : 20) * bright + 3 * Math.sin(clock * 2 + i); ctx.beginPath(); ctx.moveTo(-4, 43); ctx.quadraticCurveTo(0, 46 + l * 1.5, 0, 46 + l); ctx.quadraticCurveTo(0, 46 + l * 1.5, 4, 43); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, 35, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x - 9, y - 10, 19, 0, 7); ctx.fill();
  }
  if (e < -3) {
    ctx.globalAlpha = clamp((-e - 3) / 6);
    const halo = ctx.createRadialGradient(820, 95, 10, 820, 95, 80); halo.addColorStop(0, 'rgba(240,240,210,.3)'); halo.addColorStop(1, 'rgba(240,240,210,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(820, 95, 80, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(760, 40, 120, 120); ctx.arc(832, 88, 20, 0, Math.PI * 2, true); ctx.clip('evenodd'); // a crescent
    ctx.fillStyle = '#f6f2dc'; ctx.beginPath(); ctx.arc(820, 95, 23, 0, 7); ctx.fill(); ctx.restore();
    ctx.globalAlpha = 1;
  }
}
const CLOUD = [[0,0,28],[32,-16,34],[68,-6,30],[100,2,22],[-26,4,20],[48,4,26]];
function xlights(pts, n, seed = 0) { // a string of Christmas lights along a line of points
  const len = []; let total = 0; for (let i = 0; i < pts.length - 1; i++) { len.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])); total += len[i]; }
  for (let j = 0; j <= n; j++) { let d0 = total * j / n, i = 0; while (i < len.length - 1 && d0 > len[i]) d0 -= len[i++]; const u = d0 / len[i];
    glowDot(lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u) + 1.2, 1.3, ['#ff4a4a', '#ffd23a', '#4ad16a', '#4aa8ff'][(j + seed) % 4], .55 + .45 * Math.sin(clock * 3 + j * 1.7 + seed)); }
}
const rb = { t: 0, T: 1 };
function rainbow(d, dt) { // only now and then: low sun with some cloud about, and even then by chance
  const ok = d.sun > 4 && d.sun < 42 && d.cloud > .3 && d.cloud < .92;
  if (rb.t <= 0 && ok && Math.random() < dt / (mode === 'now' ? 900 : mode === 'replay' ? 30 : 60)) { rb.T = rb.t = mode === 'replay' ? 9 : 30; say('Look, a rainbow!', '--f-solar'); }
  if (rb.t <= 0) return;
  rb.t -= dt; const fade = rb.T * .14, a = clamp(Math.min((rb.T - rb.t) / fade, rb.t / fade)) * (ok ? 1 : .75);
  const sunX = 500 - 470 * Math.sin(clamp(d.sunH / 100, -1, 1) * Math.PI / 2), cx = sunX < 500 ? 730 : 270; // it stands opposite the sun
  ctx.lineWidth = 7;
  ['#e8463a', '#f08a2e', '#f2d43a', '#4cb563', '#3f86d8', '#7a4fc0'].forEach((c, i) => { ctx.strokeStyle = mixA(c, c, 0, .68 * a); ctx.beginPath(); ctx.arc(cx, 420 - S, 300 - i * 6.5, Math.PI, 0); ctx.stroke(); });
}
function cloudLayer(d, dt) {
  const n = 1 + d.cloud * 12;
  const shade = d.cloud > .65 ? (d.cloud - .65) / .35 : 0;
  const night = clamp((-d.sun) / 8), dusk = clamp(1 - Math.abs(d.sun - 2) / 9);
  for (const c of clouds) {
    c.x += dt * (1.2 + d.wind * 11) * (0.6 + c.s * .5);   // slow: a minute or more to cross even in a strong wind
    if (c.x > W + 160) c.x = -200;
    const vis = clamp(n - c.k);
    if (vis <= 0) continue;
    const s = c.s * (1 + d.cloud * .35), base = c.y + 16 * s;
    ctx.save(); ctx.beginPath(); ctx.rect(c.x - 60 * s, c.y - 60 * s, 200 * s, 60 * s + 16 * s); ctx.clip(); // flat-bottomed, like a long white cloud
    ctx.globalAlpha = vis * (.96 - night * .45);
    const body = mix(mix(mix('#ffffff', '#8b96a0', shade), '#ffd9c2', dusk * .5), '#4f5c75', night * .8);
    const under = mix(mix(mix('#c9d6e4', '#6d7883', shade), '#e79a86', dusk * .6), '#3a4660', night * .8);
    for (const [col, oy] of [[under, 5], [body, 0]]) {
      ctx.fillStyle = col; ctx.beginPath();
      for (const [ox, o2, r] of CLOUD) { ctx.moveTo(c.x + ox * s + r * s, c.y + (o2 + oy) * s); ctx.arc(c.x + ox * s, c.y + (o2 + oy) * s, r * s, 0, 7); }
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = vis * .5 * (1 - night); ctx.strokeStyle = under; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c.x - 40 * s, base); ctx.lineTo(c.x + 116 * s, base); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- far land ----------
function snowLine(x0, x1, y, amp, seed) { // clip to a mountain first; fills everything above a jagged line
  const r = rng(seed); ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, y);
  for (let x = x0, up = true; x <= x1; x += 9 + r() * 9, up = !up) ctx.lineTo(x, y + (up ? -amp : amp) * (.4 + r() * .6));
  ctx.lineTo(x1, y); ctx.lineTo(x1, 0); ctx.closePath();
}
function mountains(d) {
  // Southern Alps
  ctx.save(); poly(ALPS, T('#8195b3', .7)); ctx.clip();
  const g = ctx.createLinearGradient(0, 150, 0, 430); g.addColorStop(0, T('#7388a8', .7)); g.addColorStop(1, T('#a8bbcf', .7)); ctx.fillStyle = g; ctx.fillRect(420, 140, 600, 300);
  snowLine(420, 1010, snowAlps, 16, 3); ctx.fillStyle = T('#fbfdff', .5); ctx.fill();
  for (const i of ALP_PEAKS) { // shaded face of each peak, and a ridge line running down from it
    const [px, py] = ALPS[i], [rx, ry] = ALPS[i + 1];
    poly([[px, py], [rx, ry], [rx + 36, 430], [px + 60, 430]], 'rgba(38,58,104,.2)'); // shaded face, leaning away from the light
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 12, py + 70, px + 60, 430); ctx.strokeStyle = 'rgba(38,58,104,.24)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 2, py + 14); ctx.quadraticCurveTo(px - 12, py + 62, px - 34, py + 132); ctx.strokeStyle = 'rgba(38,58,104,.13)'; ctx.stroke(); // a spur running down the lit side
    const [lx, ly] = ALPS[i - 1];
    ctx.beginPath(); ctx.moveTo(px - 3, py + 8); ctx.lineTo(lerp(px, lx, .55), lerp(py, ly, .55) + 16); ctx.strokeStyle = `rgba(255,255,255,${.35 * (1 - N)})`; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(ALPS[0][0], ALPS[0][1]); for (const p of ALPS.slice(1, -1)) ctx.lineTo(p[0], p[1]); ink(1.4, .3);
  // Ruapehu: a broad massif with a jagged summit ridge rather than a neat cone
  const ruapehu = () => { ctx.moveTo(-10, 440); ctx.bezierCurveTo(70, 414, 124, 362, 164, 304); for (const [x, y] of [[182,282],[198,266],[214,254],[228,257],[244,247],[258,251],[272,243],[290,242],[304,248],[318,245],[334,254],[352,268],[370,290]]) ctx.lineTo(x, y); ctx.bezierCurveTo(418, 340, 466, 402, 550, 440); };
  ctx.save();
  ctx.beginPath(); ruapehu(); ctx.closePath();
  const vg = ctx.createLinearGradient(0, 200, 0, 440); vg.addColorStop(0, T('#7f7482', .7)); vg.addColorStop(1, T('#a89aa0', .7)); ctx.fillStyle = vg; ctx.fill(); ctx.clip();
  snowLine(100, 440, snowRua, 16, 9); ctx.fillStyle = T('#fbfdff', .5); ctx.fill();
  for (const [px, py, bx] of [[244, 247, 296], [290, 242, 388], [318, 245, 446]]) poly([[px, py], [px + 14, py + 12], [bx + 70, 440], [bx, 440], [px + 6, py + 44]], 'rgba(46,40,80,.12)');
  ctx.strokeStyle = 'rgba(46,40,80,.2)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (const [x0, y0, bend, x1] of [[200, 268, 168, 80], [228, 260, 214, 180], [258, 254, 268, 290], [304, 251, 338, 410], [350, 270, 398, 480]]) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(bend, 350, x1, 440); ctx.stroke(); }
  ctx.restore();
  ctx.beginPath(); ruapehu(); ink(1.4, .3);
  // haze where the mountains meet the land
  const hz = ctx.createLinearGradient(0, 300, 0, 440); hz.addColorStop(0, mixA(skyBot, skyBot, 0, 0)); hz.addColorStop(1, mixA(skyBot, skyBot, 0, .7));
  ctx.fillStyle = hz; ctx.fillRect(0, 300, W, 150);
  // far hills
  edge(farY, -10, 720, 480); ctx.fillStyle = mix(T(dry > .01 ? mix('#98c878', '#c4b062', dry * .45) : '#98c878', .7), skyBot, .16); ctx.fill();
  rim(farY, 0, 720, `rgba(226,246,170,${.4 * (1 - N)})`, 2);
  ctx.strokeStyle = mixA(T('#4f8a52'), skyBot, .15, .6); ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); // hedges make it read as far-off paddocks
  for (const off of [11, 24]) for (let x = 0; x <= 340; x += 8) ctx[x ? 'lineTo' : 'moveTo'](x, farY(x) + off + 2 * Math.sin(x / 20));
  for (const hx of [36, 92, 150, 206, 268]) { ctx.moveTo(hx, farY(hx) + 3); ctx.lineTo(hx + 9, farY(hx) + 36); }
  ctx.stroke();
  strokeDabs(DAB_FAR);
}
const BED_L = [[815, 336], [806, 340], [790, 347], [766, 356], [742, 364], [734, 374]], BED_R = [[825, 336], [836, 340], [851, 347], [867, 356], [882, 364], [890, 374]]; // low and wide: flat ground seen from far off
function lake(d) {
  const wy = LAKE_TOP + (1 - lakeLevel) * 9, flow = .14 + .86 * melt; // the water line on the far shore; how hard the river runs
  if (snowAlps < 320) { ctx.strokeStyle = T('#6aa9e0', .66); ctx.lineWidth = 1 + 1.2 * flow; ctx.lineCap = 'round'; ctx.beginPath(); const sy = Math.max(snowAlps + 2, 246); ctx.moveTo(803, sy); ctx.bezierCurveTo(797, sy + 18, 812, 318, 820, 338); ctx.stroke(); } // the stream that feeds the river, from the snow line
  // tussock foothills either side of the river valley
  ctx.fillStyle = mix(T('#a99c64', .7), skyBot, .22); ctx.beginPath(); ctx.moveTo(660, 364); ctx.quadraticCurveTo(726, 312, 802, 364); ctx.moveTo(838, 364); ctx.quadraticCurveTo(908, 304, 984, 364); ctx.fill();
  ctx.save(); ctx.clip(); // keep the tussock lines inside the hills
  ctx.strokeStyle = 'rgba(70,62,30,.16)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); for (const [x0, x1, y] of [[706, 698, 346], [736, 744, 342], [884, 874, 342], [916, 926, 338], [946, 958, 350]]) { ctx.moveTo(x0, y - 8); ctx.lineTo(x1, y + 8); } ctx.stroke(); ctx.restore();
  // far shore: a strip of bush under the mountains
  ctx.fillStyle = T('#4f7f62'); ctx.beginPath(); ctx.moveTo(564, LAKE_TOP + 2);
  for (let x = 564; x <= 1010; x += 11) ctx.arc(x, LAKE_TOP - 1 + 2 * Math.sin(x / 19), 6 + 2 * Math.sin(x / 7), Math.PI, 0);
  ctx.lineTo(1010, LAKE_TOP + 2); ctx.fill();
  ctx.fillStyle = T('#d3caa6'); ctx.fillRect(560, LAKE_TOP, 450, 12); // bare shore, uncovered when the lake is low
  // the braided river: a wide shingle bed that the meltwater weaves across
  ctx.save(); ctx.beginPath(); ctx.rect(700, Math.min(snowAlps + 10, 336), 220, 200); ctx.clip(); // its top is under the snow in winter
  ctx.beginPath(); BED_L.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); BED_R.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath();
  ctx.fillStyle = T('#c9c4b4'); ctx.fill(); ink(1, .22);
  const bedX = (E, y) => { for (let i = 0; i < E.length - 1; i++) if (y <= E[i + 1][1]) return lerp(E[i][0], E[i + 1][0], clamp((y - E[i][1]) / (E[i + 1][1] - E[i][1]))); return E[E.length - 1][0]; };
  const chan = (k, y) => { const a = bedX(BED_L, y), b = bedX(BED_R, y), u = (y - 336) / 38; return lerp(a, b, .5 + .34 * Math.sin(u * 5.5 + k * 1.7) * (k % 2 ? 1 : -1) + (k - 1) * .11); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < 3; k++) {
    const on = clamp((flow - k * .28) / .3); if (on <= 0) continue; // more channels fill as the flow rises
    for (let y = 337; y < 374; y += 2.5) { // drawn in short pieces so each channel widens as it nears the lake
      ctx.strokeStyle = T('#5aa2e2', .66); ctx.lineWidth = (.8 + (y - 336) * .13) * (.45 + flow) * on;
      ctx.beginPath(); ctx.moveTo(chan(k, y), y); ctx.lineTo(chan(k, y + 2.8), y + 2.8); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,255,255,${.85 * on})`; ctx.lineWidth = 1.1; ctx.beginPath();
    for (let j = 0; j < 3; j++) { const y = 338 + ((clock * (4 + 12 * flow) + j * 11 + k * 5) % 32); ctx.moveTo(chan(k, y), y); ctx.lineTo(chan(k, y + 2.5), y + 2.5); } ctx.stroke();
  }
  ctx.restore();

  // the lake, from the water line down
  const g = ctx.createLinearGradient(0, LAKE_TOP, 0, 404); g.addColorStop(0, T('#9fcdf0', .66)); g.addColorStop(1, T('#3f82cc', .66));
  ctx.fillStyle = g; ctx.fillRect(560, wy, 450, 60);
  ctx.save(); ctx.beginPath(); ctx.rect(560, wy, 450, 60); ctx.clip();
  ctx.translate(0, wy + LAKE_TOP * .16); ctx.scale(1, -.16); ctx.globalAlpha = .28; poly(ALPS, T('#5f7696')); ctx.save(); poly(ALPS); ctx.clip(); snowLine(420, 1010, snowAlps, 16, 3); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.restore(); ctx.globalAlpha = 1;
  for (let k = 0; k < 3; k++) { // foam where each channel meets the lake
    const on = clamp((flow - k * .28) / .3); if (on <= 0) continue;
    ctx.fillStyle = `rgba(255,255,255,${.8 * on})`; ctx.beginPath(); ctx.ellipse(chan(k, wy + 1), wy + 2.5, (3 + 4 * flow) + Math.sin(clock * 5 + k) * 1.2, 1.8, 0, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = `rgba(255,255,255,${.25 + .35 * flow})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(808, wy + 8, 62 + (clock * 6) % 12, 4.5, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${.5 - N * .3})`; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) { const y = wy + 5 + (i * 7) % 30, x = 660 + (i * 83) % 330 + Math.sin(clock * .5 + i) * 5, l = 8 + (i * 5) % 14; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y); ctx.stroke(); }
}
function ridge(d) {
  edge(ridgeY, -10, 770, 490);
  const g = ctx.createLinearGradient(0, 340, 0, 450); g.addColorStop(0, G('#9dcc6a')); g.addColorStop(1, G('#69a851')); ctx.fillStyle = g; ctx.fill();
  rim(ridgeY, 0, 760, `rgba(226,246,170,${.5 * (1 - N)})`, 2.4);
  strokeDabs(DAB_RIDGE);
  ctx.fillStyle = T('#3f7b40'); ctx.beginPath(); for (const [x, y, r] of HEDGE) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 7); } ctx.fill();
  // bush hill on the far side of the dam
  edge(shoulderY, 786, 1010, 490, 6); ctx.fillStyle = T('#4c8a4c'); ctx.fill();
  for (const [x, y, r, k] of BUSH) { ctx.fillStyle = T(k < .33 ? '#3d7a44' : k < .66 ? '#4f8f4c' : '#5fa257'); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = `rgba(210,240,160,${.16 * (1 - N)})`; ctx.beginPath(); ctx.arc(x - r * .25, y - r * .3, r * .55, 0, 7); ctx.fill(); }
}
function sheep(x0, y, s = 1, i = 0) { // each sheep ambles a little way from its spot, stops to graze, and turns back
  const p = sheepPh * .2 + i * 1.9, v = Math.cos(p) + 1.08 * Math.cos(p * 2.7 + i), moving = Math.abs(v) > .6;
  const x = x0 + (10 * Math.sin(p) + 4 * Math.sin(p * 2.7 + i)) * s, step = moving ? Math.sin(sheepPh * 8 + i) * 1.3 * s : 0, graze = moving ? 0 : 2.6 * s * (.6 + .4 * Math.sin(sheepPh * 3 + i));
  ctx.save(); ctx.translate(x, y); ctx.scale(v >= 0 ? 1 : -1, 1);
  ctx.strokeStyle = T('#2b2f33'); ctx.lineWidth = 1.2 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-2.4 * s, 0); ctx.lineTo(-2.4 * s + step, 4 * s); ctx.moveTo(2.4 * s, 0); ctx.lineTo(2.4 * s - step, 4 * s); ctx.stroke();
  ctx.fillStyle = T('#fbf8ee', .6); ctx.beginPath(); ctx.ellipse(0, -1 * s, 5 * s, 3.4 * s, 0, 0, 7); ctx.fill(); ink(.8 * s, .45);
  ctx.fillStyle = T('#2b2f33'); ctx.beginPath(); ctx.ellipse(5 * s, -2 * s + graze, 2 * s, 1.7 * s, .3, 0, 7); ctx.fill();
  ctx.restore();
}
function flowers(a, b) { // spring: daisies and buttercups through the grass
  ctx.globalAlpha = spring;
  for (let i = a; i < b; i++) { const [x, y, c, r] = FLOWERS[i]; ctx.fillStyle = T(PETAL[c], .5); ctx.beginPath(); ctx.arc(x, y, 1.7 * r, 0, 7); ctx.fill(); if (r > .95) { ctx.fillStyle = T(c === 1 ? '#e58a1f' : '#ffd23a', .5); ctx.beginPath(); ctx.arc(x, y, .7 * r, 0, 7); ctx.fill(); } }
  ctx.globalAlpha = 1;
}
function foreground(d) {
  edge(groundY, -10, 1010, BOT + 10);
  const g = ctx.createLinearGradient(0, 430, 0, BOT); g.addColorStop(0, G('#a5d470')); g.addColorStop(.45, G('#7fbb5a')); g.addColorStop(1, G('#4f9243'));
  ctx.fillStyle = g; ctx.fill();
  rim(groundY, 0, 1000, `rgba(232,250,180,${.55 * (1 - N)})`, 2.4);
  for (const [x, y, rx, ry, light] of PATCHES) { ctx.fillStyle = light ? `rgba(214,240,140,${.22 * (1 - N * .8)})` : 'rgba(40,110,60,.16)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, -.05, 0, 7); ctx.fill(); }
  strokeDabs(DAB_FORE);
  // gravel road through town and over the river
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, c] of [[12, T('#8f8163')], [9, T('#dccba3')]]) {
    ctx.beginPath(); ctx.moveTo(-10, 616); ctx.bezierCurveTo(140, 616, 300, 604, 470, 592); ctx.bezierCurveTo(640, 580, BR[0] - 150, BR[1] + 14, BR[0], BR[1]); ctx.bezierCurveTo(BR[0] + 50, BR[1] - 5, 980, BR[1] - 16, 1010, BR[1] - 18);
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
  }
  // a post-and-wire fence around the right-hand paddock
  ctx.strokeStyle = T('#7b6a52'); ctx.lineWidth = 1.2; ctx.beginPath();
  for (let x = 905; x <= 1000; x += 12) { const y = 548 - (x - 905) * .12; ctx.moveTo(x, y); ctx.lineTo(x, y - 8); }
  ctx.moveTo(905, 543); ctx.lineTo(1000, 531.5); ctx.moveTo(905, 546); ctx.lineTo(1000, 534.5); ctx.stroke();
}

// ---------- water ----------
function dam(d) {
  const h = d.hydro;
  poly([[726, CREST], [820, CREST], [809, 448], [737, 448]], T('#dcd8cb'));
  poly([[790, CREST], [820, CREST], [809, 448], [786, 448]], 'rgba(60,70,90,.14)');
  ctx.strokeStyle = 'rgba(60,70,90,.2)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 1; i < 8; i++) { const x = 726 + i * 11.75; ctx.moveTo(x, CREST + 4); ctx.lineTo(lerp(x, 773, .22), 448); } ctx.stroke();
  poly([[726, CREST], [820, CREST], [809, 448], [737, 448]], null, 1.3);
  ctx.fillStyle = T('#f6f7f5'); ctx.beginPath(); ctx.roundRect(731, 401, 8, 38, 3); ctx.fill(); ink(1, .5); // lake level gauge
  ctx.fillStyle = T('#3f82cc', .5); ctx.beginPath(); ctx.roundRect(732.6, 437 - 32 * clamp(lakeLevel, .06), 4.8, 32 * clamp(lakeLevel, .06) + .5, 2); ctx.fill();
  ctx.strokeStyle = 'rgba(18,34,44,.45)'; ctx.lineWidth = .8; ctx.beginPath(); for (let i = 1; i < 4; i++) { ctx.moveTo(736, 437 - i * 8); ctx.lineTo(739, 437 - i * 8); } ctx.stroke();
  // spillway: three gates, more white water as hydro works harder
  for (let i = 0; i < 3; i++) {
    const gx = 753 + i * 15;
    ctx.fillStyle = T('#4a5560'); ctx.fillRect(gx, CREST + 4, 10, 6);
    const w = 10 * (.3 + .7 * h);
    ctx.fillStyle = `rgba(255,255,255,${.45 + .45 * h})`; ctx.fillRect(gx + 5 - w / 2, CREST + 9, w, 448 - CREST - 9);
    ctx.strokeStyle = T('#8fc4f0', .5); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = 0; k < 3; k++) { const y = CREST + 10 + (spillPh + k * 15 + i * 6) % 40, x = gx + 2.5 + k * 2.5; ctx.moveTo(x, y); ctx.lineTo(x, y + 5); } ctx.stroke();
  }
  // crest road and railing
  ctx.fillStyle = T('#b9b5a8'); ctx.fillRect(722, CREST - 3, 102, 4);
  ctx.strokeStyle = T('#6c7078'); ctx.lineWidth = 1; ctx.beginPath(); for (let x = 724; x <= 822; x += 7) { ctx.moveTo(x, CREST - 3); ctx.lineTo(x, CREST - 7); } ctx.moveTo(722, CREST - 7); ctx.lineTo(824, CREST - 7); ctx.stroke();
  // powerhouse at the foot of the dam
  shadow(728, 451, 20);
  poly([[710, 450], [710, 436], [744, 436], [744, 450]], T('#efe9da'), 1.2);
  poly([[707, 436], [727, 428], [747, 436]], T('#55708c'), 1.2);
  const lit = d.hydro > .02 ? clamp((-d.sun + 2) / 8) : 0; // station lights stay on all night, but only while it is generating
  ctx.fillStyle = lit > .05 ? `rgba(255,214,110,${.5 + lit * .5})` : T('#7fa9c9'); for (const x of [714, 724, 734]) ctx.fillRect(x, 440, 6, 6);
  if (xmas) { xlights([[707, 436], [727, 428], [747, 436]], 8, 1); xlights([[724, CREST - 7], [822, CREST - 7]], 16, 2); }
  // plunge pool and foam
  ctx.fillStyle = T('#5aa2e2', .66); ctx.beginPath(); ctx.ellipse(773, 449, 34, 6.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${.85 - N * .2})`;
  for (let i = 0; i < 9; i++) { const r = 2.5 + h * 4.5 + Math.sin(clock * 6 + i * 1.7) * 1.4; ctx.beginPath(); ctx.arc(751 + i * 5.6, 447 + Math.sin(i * 2.1) * 1.5, Math.max(r, 1), 0, 7); ctx.fill(); }
}
function river(d, dt) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const wide = i => (11 + i * .52) * (0.85 + d.hydro * .5);
  for (const [extra, col] of [[7, T('#3f7a3c')], [3.5, T('#d9cfa4')]]) { // grassy bank, then a strip of shingle
    ctx.strokeStyle = col; for (let i = 0; i < 60; i++) { ctx.lineWidth = wide(i) + extra; ctx.beginPath(); ctx.moveTo(...RPTS[i]); ctx.lineTo(...RPTS[i + 1]); ctx.stroke(); }
  }
  for (let i = 0; i < 60; i++) { ctx.strokeStyle = T(mix('#6db3ea', '#2f78c6', i / 60), .66); ctx.lineWidth = wide(i); ctx.beginPath(); ctx.moveTo(...RPTS[i]); ctx.lineTo(...RPTS[i + 1]); ctx.stroke(); }
  for (let i = 0; i < 60; i++) { ctx.strokeStyle = `rgba(190,228,255,${.28 * (1 - N * .6)})`; ctx.lineWidth = wide(i) * .4; ctx.beginPath(); ctx.moveTo(RPTS[i][0] - wide(i) * .16, RPTS[i][1] - 1); ctx.lineTo(RPTS[i + 1][0] - wide(i + 1) * .16, RPTS[i + 1][1] - 1); ctx.stroke(); }
  flow += dt * (0.02 + d.hydro * .16);
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  const count = 16 + Math.round(d.hydro * 22);
  for (let k = 0; k < count; k++) {
    const t = (flow + k / count) % 1, w = (k * 7 % 5 - 2) * 2.2 * (0.6 + t);
    const [x, y] = riverPt(t), [x2, y2] = riverPt(Math.min(t + .012 + d.hydro * .02, 1));
    ctx.lineWidth = 1.6 + t * 2; ctx.globalAlpha = Math.sin(t * Math.PI) * .9;
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x2 + w, y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const [t, off, r] of [[.2, -3, 4], [.36, 4, 5], [.52, -6, 5.5], [.64, 7, 6], [.9, -9, 7]]) { // rocks with a ruffle of foam
    const [x, y] = riverPt(t); const wob = Math.sin(clock * 4 + t * 20) * 1.2;
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(x + off, y + r * .5, r * 1.5 + wob * d.hydro, r * .55, 0, 0, 7); ctx.fill();
    ctx.fillStyle = T('#8c8f94'); ctx.beginPath(); ctx.ellipse(x + off, y, r, r * .7, 0, 0, 7); ctx.fill(); ink(1, .45);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(x + off - r * .3, y - r * .25, r * .4, r * .22, 0, 0, 7); ctx.fill();
  }
  // road bridge
  ctx.save(); ctx.translate(BR[0], BR[1]); ctx.rotate(BA);
  ctx.fillStyle = T('#7d7468'); for (const f of [.2, .5, .8]) ctx.fillRect(lerp(-BL, BRT, f) - 2.5, 0, 5, 12);
  ctx.fillStyle = T('#e7dcc0'); ctx.fillRect(-BL, -5.5, BL + BRT, 10.5); ctx.beginPath(); ctx.rect(-BL, -5.5, BL + BRT, 10.5); ink(1.2, .5);
  ctx.strokeStyle = T('#f7f3e6'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-BL, -9); ctx.lineTo(BRT, -9); for (let x = -BL; x <= BRT + .1; x += (BL + BRT) / 9) { ctx.moveTo(x, -9); ctx.lineTo(x, -5); } ctx.stroke();
  ctx.restore();
}

// ---------- machines ----------
function turbine(x, y, s, d) {
  const h = 92 * s;
  shadow(x + 3 * s, y + 1, 12 * s);
  poly([[x - 3.2 * s, y], [x + 3.2 * s, y], [x + 1.5 * s, y - h], [x - 1.5 * s, y - h]], T('#f7f8f5', .55));
  poly([[x + .6 * s, y], [x + 3.2 * s, y], [x + 1.5 * s, y - h], [x + .3 * s, y - h]], 'rgba(70,90,120,.18)');
  poly([[x - 3.2 * s, y], [x + 3.2 * s, y], [x + 1.5 * s, y - h], [x - 1.5 * s, y - h]], null, 1);
  ctx.fillStyle = T('#e9ecee', .55); ctx.beginPath(); ctx.roundRect(x - 4 * s, y - h - 3.4 * s, 12 * s, 6.4 * s, 3 * s); ctx.fill(); ink(1, .5);
  ctx.save(); ctx.translate(x, y - h); ctx.rotate(rotor + x);
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(-2.2 * s, -1 * s); ctx.quadraticCurveTo(-6 * s, -20 * s, -1 * s, -56 * s); ctx.lineTo(.4 * s, -56 * s); ctx.quadraticCurveTo(3 * s, -22 * s, 2.2 * s, -1 * s); ctx.closePath();
    ctx.fillStyle = T('#ffffff', .5); ctx.fill(); ink(.9, .42);
  }
  ctx.restore();
  ctx.fillStyle = T('#d9dee2', .55); ctx.beginPath(); ctx.arc(x, y - h, 3.6 * s, 0, 7); ctx.fill(); ink(1, .5);
}
function stand([x, y, s, kind]) {
  shadow(x + 2 * s, y + .5, kind === 't' ? 9 * s : 5 * s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'p') {
    ctx.strokeStyle = T('#7a5f48'); ctx.lineWidth = 2.4 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 27 * s); ctx.stroke();
    ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.moveTo(x - 7 * s, y - 24 * s); ctx.lineTo(x + 7 * s, y - 24 * s); ctx.stroke();
    return;
  }
  const h = 44 * s, w = 8 * s;
  ctx.strokeStyle = T('#5f6c76'); ctx.lineWidth = 1.3 * s; ctx.beginPath();
  ctx.moveTo(x - w, y); ctx.lineTo(x - 1.6 * s, y - h); ctx.lineTo(x + 1.6 * s, y - h); ctx.lineTo(x + w, y);
  for (let i = 0; i < 4; i++) { const a = i / 4, b = (i + 1) / 4, wa = lerp(w, 1.6 * s, a), wb = lerp(w, 1.6 * s, b); ctx.moveTo(x - wa, y - h * a); ctx.lineTo(x + wb, y - h * b); ctx.moveTo(x + wa, y - h * a); ctx.lineTo(x - wb, y - h * b); }
  for (const [f, arm] of [[.93, 11], [.76, 14]]) { ctx.moveTo(x - arm * s, y - h * f); ctx.lineTo(x + arm * s, y - h * f); }
  ctx.stroke();
}
function wires(d) {
  const sag = l => 3 + l * .07;
  ctx.strokeStyle = `rgba(30,44,54,${.62 - N * .15})`; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  for (const n of NET) for (let i = 0; i < n.w.length - 1; i++) { const [a, b] = [n.w[i], n.w[i + 1]]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag(n.len[i]) * 2, b[0], b[1]); ctx.stroke(); }
  // little sparks of electricity run down each wire: more of them the harder that kind of power is working
  const amt = { wind: d.wind, hydro: d.hydro, geo: d.geo, thermal: d.thermal, solar: d.sun > 0 ? Math.max(d.solar, d.roof * .5) : 0, town: .35 + d.town * .65, batt: Math.abs(d.batt), drop: .35 + d.town * .65 };
  for (const n of NET) {
    const v = amt[n.k]; if (v < .03) continue;
    const drop = n.k === 'drop', count = drop ? 1 : Math.max(1, Math.round(v * n.total / (n.k === 'town' ? 85 : 44)));
    for (let k = 0; k < count; k++) {
      let s = (clock * (drop ? 12 : 46) + k * n.total / count) % n.total, i = 0;
      if (n.k === 'batt' && d.batt < 0) s = n.total - s; // charging: sparks run from the switchyard into the batteries
      while (i < n.len.length - 1 && s > n.len[i]) s -= n.len[i++];
      const u = s / n.len[i], a = n.w[i], b = n.w[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + sag(n.len[i]) * 2;
      const x = (1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * mx + u * u * b[0], y = (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * my + u * u * b[1];
      glowDot(x, y, drop ? 1.1 : 1.8, n.c, drop ? .7 : .85);
    }
  }
}
const sprites = new Map();
function puffSprite(col) {
  let s = sprites.get(col);
  if (!s) {
    s = document.createElement('canvas'); s.width = s.height = 64; const c = s.getContext('2d'), [r, g, b] = hex(col);
    const gr = c.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(.6, `rgba(${r},${g},${b},.7)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64); if (sprites.size > 30) sprites.clear(); sprites.set(col, s);
  }
  return s;
}
function emit(arr, rate, dt, x, y, o) { if (!reduced && Math.random() < rate * dt) arr.push({ x, y, r: o.r0, a: o.a, vx: 0, vy: -o.rise, grow: o.grow, fade: o.fade }); }
function drawPuffs(arr, dt, drift, col) {
  const sp = puffSprite(col);
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.vx = lerp(p.vx, drift, dt * .8); p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * p.grow; p.a -= dt * p.fade;
    if (p.a <= 0) { arr.splice(i, 1); continue; }
    ctx.globalAlpha = p.a; ctx.drawImage(sp, p.x - p.r * 1.35, p.y - p.r * 1.35, p.r * 2.7, p.r * 2.7);
  }
  ctx.globalAlpha = 1;
}
function stillPlume(x, y, amount, color, lean) { // used when the viewer has asked for less motion
  const sp = puffSprite(color);
  for (let i = 0; i < 6 * amount; i++) { const r = 8 + i * 4; ctx.globalAlpha = .6 - i * .07; ctx.drawImage(sp, x + i * lean * 6 - r * 1.35, y - i * 14 - r * 1.35, r * 2.7, r * 2.7); }
  ctx.globalAlpha = 1;
}
const steamCol = d => mix('#ffffff', '#c3ccd8', Math.round(clamp(-d.sun / 8) * 5) / 5);

function geothermal(d, dt) {
  const y = 458, lit = d.geo > .02 ? clamp((-d.sun + 2) / 8) : 0;
  // a blue lake below the mountain, like Taupō
  const lakePath = g => { ctx.beginPath(); ctx.moveTo(8 - g, 480); ctx.bezierCurveTo(10 - g, 468 - g, 44, 466 - g, 70, 469 - g); ctx.bezierCurveTo(96, 465 - g, 126 + g, 470 - g, 128 + g, 481); ctx.bezierCurveTo(128 + g, 492 + g, 92, 493 + g, 66, 491 + g); ctx.bezierCurveTo(40, 495 + g, 8 - g, 492 + g, 8 - g, 480); ctx.closePath(); };
  lakePath(2.5); ctx.fillStyle = T('#d9cfa4'); ctx.fill();
  lakePath(0); const lg = ctx.createLinearGradient(0, 466, 0, 494); lg.addColorStop(0, T('#8cc4ee', .66)); lg.addColorStop(1, T('#3f82cc', .66)); ctx.fillStyle = lg; ctx.fill(); ink(1, .3);
  ctx.strokeStyle = `rgba(255,255,255,${.55 - N * .3})`; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i < 6; i++) { const lx = 26 + (i * 37) % 84 + Math.sin(clock * .5 + i) * 3, ly = 473 + (i * 5) % 15; ctx.moveTo(lx, ly); ctx.lineTo(lx + 8 + (i % 3) * 3, ly); } ctx.stroke();
  // steam pipes with expansion loops, running from the wells to the station
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const pipe = [[150, y - 8], [132, y - 8], [132, y - 17], [118, y - 17], [118, y - 8], [96, y - 8], [96, y - 17], [82, y - 17], [82, y - 8], [34, y - 8]];
  for (const [w, c] of [[5.2, 'rgba(18,34,44,.5)'], [3.4, T('#cfd6da')], [1, 'rgba(255,255,255,.6)']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pipe.forEach(([px, py], i) => i ? ctx.lineTo(px, py - (w === 1 ? 1 : 0)) : ctx.moveTo(px, py - (w === 1 ? 1 : 0))); ctx.stroke(); }
  ctx.strokeStyle = T('#7b858c'); ctx.lineWidth = 1.6; ctx.beginPath(); for (const px of [140, 107, 60, 44]) { ctx.moveTo(px, y - 6); ctx.lineTo(px, y); } ctx.stroke();
  for (const wx of [34, 70]) { ctx.fillStyle = T('#a9b3b9'); ctx.beginPath(); ctx.roundRect(wx - 4, y - 14, 8, 14, 2); ctx.fill(); ink(1, .5); ctx.fillStyle = T('#c8463c'); ctx.fillRect(wx - 5, y - 16, 10, 3); }
  // station: turbine hall and two steam stacks
  shadow(212, y + 1, 66);
  poly([[150, y], [150, y - 22], [212, y - 22], [212, y]], T('#e9e4d8'), 1.2);
  ctx.fillStyle = T('#b24a78'); ctx.beginPath(); ctx.moveTo(147, y - 22); ctx.quadraticCurveTo(181, y - 38, 215, y - 22); ctx.closePath(); ctx.fill(); ink(1.2, .5);
  ctx.fillStyle = lit > .05 ? `rgba(255,214,110,${.5 + lit * .5})` : T('#7fa9c9'); for (let i = 0; i < 5; i++) ctx.fillRect(156 + i * 11, y - 16, 7, 7);
  ctx.fillStyle = T('#8a5a44'); ctx.fillRect(176, y - 8, 9, 8);
  if (xmas) xlights([[147, y - 22], [164, y - 31], [181, y - 34], [198, y - 31], [215, y - 22]], 12, 3);
  // cooling tower: a long low block with a row of big fans on top, as at Ngā Awa Pūrua or Te Mihi
  poly([[220, y], [220, y - 17], [272, y - 17], [272, y]], T('#d8dde0'), 1.2);
  ctx.strokeStyle = 'rgba(40,56,70,.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(223, y - 3 - i * 3.6); ctx.lineTo(269, y - 3 - i * 3.6); } ctx.stroke();
  const FANS = [227, 240, 253, 266];
  for (const fx of FANS) {
    poly([[fx - 5, y - 17], [fx - 5.8, y - 25], [fx + 5.8, y - 25], [fx + 5, y - 17]], T('#eef1f2'), 1.1);
    ctx.fillStyle = T('#56626b'); ctx.beginPath(); ctx.ellipse(fx, y - 25, 5.8, 2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = T('#dfe5e8'); ctx.lineWidth = 1.2; ctx.beginPath(); const a = fanRot + fx; ctx.moveTo(fx - Math.cos(a) * 5, y - 25 - Math.sin(a) * 1.6); ctx.lineTo(fx + Math.cos(a) * 5, y - 25 + Math.sin(a) * 1.6); ctx.moveTo(fx - Math.cos(a + 1.57) * 5, y - 25 - Math.sin(a + 1.57) * 1.6); ctx.lineTo(fx + Math.cos(a + 1.57) * 5, y - 25 + Math.sin(a + 1.57) * 1.6); ctx.stroke();
  }
  const drift = 10 + d.wind * 70, col = steamCol(d);
  if (reduced) { for (const fx of FANS) stillPlume(fx, y - 30, d.geo * .7, col, d.wind); stillPlume(34, y - 18, d.geo * .5, col, d.wind); return; }
  for (const fx of FANS) emit(steam, 1 + d.geo * 7, dt, fx + (Math.random() - .5) * 4, y - 28, { r0: 5, a: .7, rise: 30, grow: 8, fade: .3 });
  emit(steam, 1 + d.geo * 6, dt, 34, y - 18, { r0: 4, a: .6, rise: 26, grow: 6, fade: .36 });
  drawPuffs(steam, dt, drift, col);
}

function thermal(d, dt) {
  const x = 916, y = 492, lit = clamp((-d.sun + 2) / 8);
  shadow(x + 4, y + 1, 58);
  for (const cx of [x - 22, x + 4]) { // chimneys behind the hall
    poly([[cx - 6, y - 30], [cx - 4.5, y - 86], [cx + 4.5, y - 86], [cx + 6, y - 30]], T('#e2dccf'));
    ctx.fillStyle = T('#c9493a', .6); ctx.fillRect(cx - 4.8, y - 86, 9.6, 7); ctx.fillRect(cx - 5.2, y - 72, 10.4, 7);
    poly([[cx + 1.5, y - 30], [cx + 1.5, y - 86], [cx + 4.5, y - 86], [cx + 6, y - 30]], 'rgba(60,60,80,.16)');
    poly([[cx - 6, y - 30], [cx - 4.5, y - 86], [cx + 4.5, y - 86], [cx + 6, y - 30]], null, 1.2);
    if (lit > .2 && Math.sin(clock * 3 + cx) > 0) glowDot(cx, y - 88, 1.6, '#ff4a3a', lit);
  }
  poly([[x - 42, y], [x - 42, y - 34], [x + 24, y - 34], [x + 24, y]], T('#cfc6b6'), 1.2);
  poly([[x - 45, y - 34], [x - 42, y - 39], [x + 24, y - 39], [x + 27, y - 34]], T('#8f8577'), 1.2);
  poly([[x + 24, y], [x + 24, y - 20], [x + 48, y - 20], [x + 48, y]], T('#e3dccd'), 1.2);
  ctx.strokeStyle = 'rgba(60,60,80,.18)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 6; i++) { ctx.moveTo(x - 42 + i * 11, y - 33); ctx.lineTo(x - 42 + i * 11, y - 1); } ctx.stroke();
  const wl = d.thermal > .02 ? lit : 0;
  ctx.fillStyle = wl > .05 ? `rgba(255,214,110,${.5 + wl * .5})` : T('#7fa9c9');
  for (let i = 0; i < 5; i++) ctx.fillRect(x - 37 + i * 12, y - 26, 7, 6); for (let i = 0; i < 2; i++) ctx.fillRect(x + 29 + i * 9, y - 14, 5, 5);
  for (const tx of [x + 62, x + 78]) { ctx.fillStyle = T('#f1f1ec'); ctx.beginPath(); ctx.roundRect(tx - 6, y - 16, 12, 16, [6, 6, 1, 1]); ctx.fill(); ink(1.1, .5); ctx.fillStyle = T('#e58a3a'); ctx.fillRect(tx - 6, y - 8, 12, 2.4); }
  ctx.strokeStyle = T('#e58a3a'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 56, y - 4); ctx.lineTo(x + 48, y - 4); ctx.stroke();
  if (xmas) { xlights([[x - 45, y - 35], [x - 42, y - 40], [x + 24, y - 40], [x + 27, y - 35]], 13, 0); xlights([[x - 22, y - 84], [x - 9, y - 76], [x + 4, y - 84]], 6, 2); xlights([[x + 24, y - 21], [x + 48, y - 21]], 5, 1); }
  if (d.thermal < .02) return;
  const drift = 12 + d.wind * 60, col = mix('#a9a6a3', '#5c5a5e', Math.round(clamp(-d.sun / 8) * 5) / 5);
  if (reduced) { stillPlume(x - 22, y - 92, d.thermal * 1.6, col, d.wind); stillPlume(x + 4, y - 92, d.thermal * 1.6, col, d.wind); return; }
  for (const cx of [x - 22, x + 4]) emit(smoke, d.thermal * 22, dt, cx, y - 90, { r0: 5, a: .75, rise: 28, grow: 8, fade: .3 });
  drawPuffs(smoke, dt, drift, col);
}

function battery(d, dt) {
  battLevel = clamp(battLevel - d.batt * dt * .05, .08, .97);
  // switchyard gantry where every wire meets
  shadow(572, 477, 24);
  ctx.strokeStyle = T('#5f6c76'); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(554, 476); ctx.lineTo(554, 445); ctx.lineTo(590, 445); ctx.lineTo(590, 476); ctx.moveTo(554, 455); ctx.lineTo(590, 455); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); for (const ix of [562, 572, 582]) { ctx.moveTo(ix, 445); ctx.lineTo(ix, 441); } ctx.stroke();
  ctx.fillStyle = T('#8d99a2'); ctx.beginPath(); ctx.roundRect(561, 460, 22, 16, 2); ctx.fill(); ink(1.1, .5);
  ctx.strokeStyle = 'rgba(18,34,44,.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (const ix of [566.5, 572, 577.5]) { ctx.moveTo(ix, 463); ctx.lineTo(ix, 473); } ctx.stroke();
  const by = 552, col = '#9b7fe6';
  shadow(628, by + 2, 56);
  for (let i = 0; i < 3; i++) {
    const x = 586 + i * 29;
    ctx.fillStyle = T('#f3f5f6'); ctx.beginPath(); ctx.roundRect(x, by - 20, 26, 20, 2.5); ctx.fill(); ink(1.2, .5);
    ctx.fillStyle = 'rgba(30,30,40,.18)'; ctx.fillRect(x + 4, by - 15, 18, 6.5);
    ctx.fillStyle = col; ctx.fillRect(x + 4, by - 15, 18 * clamp(battLevel * 3 - i), 6.5);
    ctx.fillStyle = T('#8d99a2'); ctx.fillRect(x + 4, by - 5.5, 5, 2.4); ctx.fillRect(x + 12, by - 5.5, 5, 2.4);
  }
  ctx.strokeStyle = T('#5f6c76'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(626, by - 20); ctx.lineTo(626, 532); ctx.moveTo(621, 533); ctx.lineTo(631, 533); ctx.stroke();
  if (Math.abs(d.batt) > .05) {
    const up = d.batt > 0, bob = (clock * 1.6) % 1, x = 686;
    ctx.fillStyle = '#9b7fe6'; ctx.globalAlpha = 1 - bob;
    const ay = up ? by - 8 - bob * 16 : by - 24 + bob * 16;
    ctx.beginPath(); if (up) { ctx.moveTo(x, ay - 9); ctx.lineTo(x + 7, ay); ctx.lineTo(x - 7, ay); } else { ctx.moveTo(x, ay + 9); ctx.lineTo(x + 7, ay); ctx.lineTo(x - 7, ay); } ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function solarFarm(d) {
  const shine = d.sun > 0 ? d.solar : 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const x = 36 + c * 44 + r * 9, y = 524 + r * 23;
    ctx.fillStyle = 'rgba(16,44,30,.2)'; ctx.beginPath(); ctx.ellipse(x + 15, y + 5, 20, 3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = T('#7b8a8f'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 27, y); ctx.lineTo(x + 27, y + 5); ctx.stroke();
    const glint = shine * (.6 + .4 * Math.sin(clock * 2 + c + r * 2));
    const P = [[x, y], [x + 34, y], [x + 28, y - 15], [x - 6, y - 15]];
    poly(P, mix(T('#2c4f86', .6), '#a9d8ff', glint * .55));
    ctx.strokeStyle = `rgba(220,236,255,${.3 + glint * .3})`; ctx.lineWidth = .8; ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(x + k * 8.5, y); ctx.lineTo(x - 6 + k * 8.5, y - 15); } ctx.moveTo(x - 3, y - 7.5); ctx.lineTo(x + 31, y - 7.5); ctx.stroke();
    if (glint > .25) { ctx.fillStyle = `rgba(255,255,255,${glint * .5})`; poly([[x + 20, y], [x + 25, y], [x + 19, y - 15], [x + 14, y - 15]], ctx.fillStyle); }
    poly(P, null, 1);
  }
  ctx.fillStyle = T('#e9ece8'); ctx.beginPath(); ctx.strokeStyle = T('#39444c'); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(243, 516); ctx.quadraticCurveTo(249, 521, 254, 513); ctx.stroke(); /* cable from the last panel */ shadow(266, 519, 16); ctx.fillStyle = T('#e9ece8'); ctx.beginPath(); ctx.roundRect(253, 489, 24, 30, 2.5); ctx.fill(); ink(1.2, .5); ctx.fillStyle = T('#f0b82a'); ctx.fillRect(257, 493, 16, 4); ctx.fillStyle = T('#8d99a2'); for (const vy of [501, 505, 509]) ctx.fillRect(257, vy, 16, 2); ctx.fillRect(263, 513, 4, 6);
}

function tree(x, y, s, d) { // pōhutukawa: a wide crown with red flowers
  shadow(x, y + 1, 15 * s);
  ctx.strokeStyle = T('#6a5142'); ctx.lineWidth = 3.4 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1 * s, y - 12 * s); ctx.moveTo(x - 1 * s, y - 9 * s); ctx.lineTo(x + 7 * s, y - 15 * s); ctx.stroke();
  const sway = Math.sin(swayB + x) * d.wind * 2.5;
  const fall = ['#c8642a', '#b5382a', '#9a6a2f', '#d68a2a'][Math.round(x) % 4];
  ctx.fillStyle = T(mix('#3f7a48', fall, autumn * .92)); ctx.beginPath(); for (const [ox, oy, r] of [[-9, -18, 9], [2, -24, 11], [12, -17, 9], [0, -15, 10]]) { ctx.moveTo(x + (ox + sway) * s + r * s, y + oy * s); ctx.arc(x + (ox + sway) * s, y + oy * s, r * s, 0, 7); } ctx.fill();
  ctx.fillStyle = `rgba(${autumn > .5 ? '255,214,150' : '190,230,150'},${.2 * (1 - N)})`; ctx.beginPath(); ctx.arc(x + (-3 + sway) * s, y - 25 * s, 7 * s, 0, 7); ctx.fill();
  const dots = (col, a, r) => { if (a < .02) return; ctx.globalAlpha = a; ctx.fillStyle = col; for (const [ox, oy] of [[-11, -20], [-3, -28], [6, -27], [13, -19], [3, -18], [-6, -14], [9, -12]]) { ctx.beginPath(); ctx.arc(x + (ox + sway) * s, y + oy * s, r * s, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; };
  dots(T('#d93a3a', .5), red, 1.7); dots(T('#ffd9ea', .4), spring, 2); // red flowers in summer, blossom in spring
  if (autumn > .05) { // leaves drifting down
    for (let j = 0; j < 4; j++) { const u = (clock * .22 + j / 4 + x * .013) % 1, lx = x + (j - 1.5) * 8 * s + Math.sin(u * 7 + j) * 5 + d.wind * 26 * u, ly = y - 20 * s + u * 21 * s;
      ctx.globalAlpha = autumn * Math.min(1, (1 - u) * 4); ctx.fillStyle = T(['#c8642a', '#b5382a', '#d68a2a', '#9a6a2f'][j], .5); ctx.beginPath(); ctx.ellipse(lx, ly, 2.2 * s, 1.2 * s, u * 9 + j, 0, 7); ctx.fill(); }
    ctx.globalAlpha = autumn; ctx.fillStyle = T('#b5622a', .5); for (const [ox, oy] of [[-12, 1], [-5, 3], [4, 2], [11, 3], [16, 1]]) { ctx.beginPath(); ctx.ellipse(x + ox * s, y + oy * s, 2 * s, 1 * s, ox, 0, 7); ctx.fill(); } // and lying under the tree
    ctx.globalAlpha = 1;
  }
}
function cabbageTree(x, y, s, d) { // tī kōuka
  shadow(x, y + 1, 9 * s);
  const sway = Math.sin(swayB * 1.15 + x) * (1 + d.wind * 5);
  ctx.strokeStyle = T('#8a7a66'); ctx.lineCap = 'round'; ctx.lineWidth = 3.2 * s;
  const heads = [[-9 * s + sway, -46 * s], [6 * s + sway, -54 * s], [15 * s + sway, -40 * s]];
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2 * s, y - 20 * s, x + sway * .4, y - 32 * s);
  for (const [hx, hy] of heads) { ctx.moveTo(x + sway * .4, y - 32 * s); ctx.lineTo(x + hx, y + hy + 6 * s); } ctx.stroke();
  for (const [hx, hy] of heads) {
    ctx.strokeStyle = T('#4f8a3c'); ctx.lineWidth = 1.7 * s; ctx.beginPath();
    for (let i = 0; i < 13; i++) { const a = -Math.PI * 1.15 + i * Math.PI * 1.3 / 12; ctx.moveTo(x + hx, y + hy + 5 * s); ctx.quadraticCurveTo(x + hx + Math.cos(a) * 8 * s, y + hy + Math.sin(a) * 8 * s, x + hx + Math.cos(a) * 13 * s + sway * .3, y + hy + 4 * s + Math.sin(a) * 12 * s); } ctx.stroke();
    ctx.strokeStyle = `rgba(200,236,140,${.5 * (1 - N)})`; ctx.lineWidth = 1 * s; ctx.beginPath();
    for (let i = 1; i < 13; i += 3) { const a = -Math.PI * 1.15 + i * Math.PI * 1.3 / 12; ctx.moveTo(x + hx, y + hy + 5 * s); ctx.lineTo(x + hx + Math.cos(a) * 11 * s + sway * .3, y + hy + 4 * s + Math.sin(a) * 10 * s); } ctx.stroke();
  }
}
function flax(x, y, s, d) { // harakeke
  const sway = Math.sin(swayA + x) * (1.5 + d.wind * 7);
  ctx.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const a = (i - 5) / 5, tipx = x + a * 30 * s + sway * (1 - Math.abs(a) * .4), tipy = y - (46 - Math.abs(a) * 22) * s;
    ctx.strokeStyle = T(i % 2 ? '#3f7d3a' : '#56974a'); ctx.lineWidth = 3.4 * s; ctx.beginPath(); ctx.moveTo(x + a * 5 * s, y); ctx.quadraticCurveTo(x + a * 12 * s, y - 30 * s, tipx, tipy); ctx.stroke();
  }
  ctx.strokeStyle = T('#5a3f33'); ctx.lineWidth = 1.8 * s;
  for (const [o, hgt] of [[-6, 66], [9, 58]]) {
    const tx = x + o * s + sway * 1.2, ty = y - hgt * s; ctx.beginPath(); ctx.moveTo(x + o * .3 * s, y - 10 * s); ctx.quadraticCurveTo(x + o * s, y - 40 * s, tx, ty); ctx.stroke();
    ctx.fillStyle = T('#8c2f2a', .5); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(tx - k * .6 * s + (k % 2 ? 4 : -4) * s, ty + k * 6 * s, 3.4 * s, 1.5 * s, k % 2 ? -.5 : .5, 0, 7); ctx.fill(); }
  }
}
function ponga(x, y, s, d) { // silver fern, framing the corner
  const sway = Math.sin(swayB) * (1 + d.wind * 5);
  ctx.strokeStyle = T('#4a3a30'); ctx.lineWidth = 9 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x - 2 * s, y - 58 * s); ctx.stroke();
  const cx = x - 2 * s, cy = y - 60 * s;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 1.08 + i * Math.PI * 1.16 / 8, L = 68 * s, ex = cx + Math.cos(a) * L + sway, ey = cy + Math.sin(a) * L * .55 + 26 * s * Math.abs(Math.cos(a));
    const mx = cx + Math.cos(a) * L * .55, my = cy + Math.sin(a) * L * .7 - 6 * s;
    ctx.strokeStyle = T(i % 2 ? '#2f6a3c' : '#3f8048'); ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    ctx.lineWidth = 2.6 * s; ctx.beginPath();
    for (let k = 1; k <= 9; k++) { const u = k / 10, px = (1 - u) * (1 - u) * cx + 2 * u * (1 - u) * mx + u * u * ex, py = (1 - u) * (1 - u) * cy + 2 * u * (1 - u) * my + u * u * ey, l = 11 * s * (1 - u * .7); ctx.moveTo(px, py); ctx.lineTo(px - Math.sin(a) * l * .4 + 2, py + l); ctx.moveTo(px, py); ctx.lineTo(px + Math.sin(a) * l * .4 - 2, py - l * .55); }
    ctx.stroke();
  }
}

function town(d) {
  const night = clamp((-d.sun + 2) / 8);
  const shine = d.sun > 0 ? d.roof : 0;
  tree(300, 528, .9, d); tree(548, 546, .9, d); tree(288, 676, 1, d);
  for (const [x, y, k] of HOUSES) {
    const sc = y > 600 ? 1.2 : 1; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y); // nearer houses are a little bigger
    shadow(x + 3, y + 1, 27);
    if (k % 2 === 0) { ctx.fillStyle = T('#9a5a48'); ctx.fillRect(x - 15, y - 40, 6, 12); ctx.beginPath(); ctx.rect(x - 15, y - 40, 6, 12); ink(1, .5); }
    poly([[x - 20, y], [x - 20, y - 22], [x + 20, y - 22], [x + 20, y]], T(WALLS[k]), 1.2);
    poly([[x - 26, y - 21], [x, y - 41], [x + 26, y - 21]], T(ROOFS[k]), 1.2);
    poly([[x - 26, y - 21], [x, y - 41], [x + 3, y - 38.5], [x - 20, y - 21]], 'rgba(255,255,255,.14)');
    const P = [[x + 4, y - 25.5], [x + 19, y - 25.5], [x + 11, y - 32.5], [x + 2, y - 34]]; // rooftop solar
    poly(P, mix(T('#27467a', .5), '#b4dcff', shine * .65)); ctx.strokeStyle = 'rgba(220,236,255,.45)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(x + 9, y - 25.5); ctx.lineTo(x + 5.5, y - 33.4); ctx.moveTo(x + 14, y - 25.5); ctx.lineTo(x + 8.5, y - 33); ctx.stroke(); poly(P, null, .9);
    const on = night * (.45 + d.town * .8), off = BEDTIME[HOUSES.findIndex(h => h[0] === x && h[1] === y)]; // each house has its own bedtime
    for (const [wx, ww, lit] of [[x - 14, 9, on * awake(d.time, off)], [x + 7, 8, on * awake(d.time, Math.min(off, 23) - .4)]]) {
      if (lit > .05) { ctx.fillStyle = `rgba(255,206,100,${clamp(lit) * .28})`; ctx.beginPath(); ctx.arc(wx + ww / 2, y - 12, 10, 0, 7); ctx.fill(); }
      ctx.fillStyle = lit > .05 ? mixA('#5b7186', '#ffd66e', lit * 1.3, 1) : T('#8fb8d6'); ctx.fillRect(wx, y - 17, ww, 8);
    }
    ctx.strokeStyle = T('#ffffff', .5); ctx.lineWidth = 1; ctx.strokeRect(x - 14, y - 17, 9, 8); ctx.strokeRect(x + 7, y - 17, 8, 8);
    ctx.fillStyle = T(ROOFS[(k + 1) % 4]); ctx.fillRect(x - 3, y - 13, 7, 13);
    if (xmas && x !== 352 && x !== 508 && x !== 344) for (let j = 0; j <= 10; j++) { // fairy lights along the roof (three houses don't bother)
      const u = j / 10, lx = u < .5 ? lerp(x - 25, x, u * 2) : lerp(x, x + 25, u * 2 - 1), ly = (u < .5 ? lerp(y - 20, y - 39.5, u * 2) : lerp(y - 39.5, y - 20, u * 2 - 1)) + 1.5;
      glowDot(lx, ly, 1.25, ['#ff4a4a', '#ffd23a', '#4ad16a', '#4aa8ff'][(j + k) % 4], .55 + .45 * Math.sin(clock * 3 + j * 1.7 + k));
    }
    ctx.restore();
  }
  if (xmas) { // the town's Christmas tree
    const x = 438, y = 588; shadow(x, y + 1, 15);
    ctx.fillStyle = T('#7a5a3c'); ctx.fillRect(x - 2, y - 6, 4, 6);
    for (const [w, top, bot] of [[15, -24, -5], [12, -34, -17], [8.5, -43, -28]]) { poly([[x - w, y + bot], [x, y + top], [x + w, y + bot]], T('#2f7a45'), 1); }
    [[-8, -8, 0], [1, -10, 1], [8, -8, 2], [-5, -20, 3], [5, -21, 0], [0, -31, 1], [-3, -14, 2], [4, -27, 3]].forEach(([ox, oy, c], j) => glowDot(x + ox, y + oy, 1.5, ['#ff4a4a', '#ffd23a', '#4aa8ff', '#ff8ad8'][c], .6 + .4 * Math.sin(clock * 3 + j * 2)));
    ctx.fillStyle = '#ffd94a'; ctx.beginPath(); for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + j * Math.PI / 5, r = j % 2 ? 2.2 : 5.2; ctx.lineTo(x + Math.cos(a) * r, y - 46 + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ink(.8, .5);
    for (const [ox, c] of [[-13, '#d8453a'], [11, '#3f86d8']]) { ctx.fillStyle = T(c, .5); ctx.fillRect(x + ox, y - 5, 6, 5); ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x + ox + 2.4, y - 5, 1.2, 5); }
  }
  for (const [x, y] of [[356, 596], [478, 588], [560, 582]]) { // street lamps come on at night
    ctx.strokeStyle = T('#59646c'); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 20); ctx.lineTo(x + 5, y - 22); ctx.stroke();
    if (night > .1) { const g = ctx.createRadialGradient(x + 5, y - 20, 1, x + 5, y - 14, 24); g.addColorStop(0, `rgba(255,220,130,${.6 * night})`); g.addColorStop(1, 'rgba(255,220,130,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 5, y - 14, 24, 0, 7); ctx.fill(); }
    ctx.fillStyle = night > .1 ? '#ffe9a8' : T('#dfe5e8'); ctx.beginPath(); ctx.arc(x + 5, y - 21.5, 2, 0, 7); ctx.fill();
  }
}

function bird(b, d, dt) {
  const isKer = b.kind === 'kereru', gale = d.wind > .96;
  // after each pass a bird stays away for a while: a couple of minutes on the live view, seconds in replay and play
  const gap = () => mode === 'now' ? 75 + Math.random() * 80 : mode === 'replay' ? 4 + Math.random() * 6 : 9 + Math.random() * 12;
  if (b.wait > 0) {
    b.wait -= dt; if (b.wait > 0) return;
    if (!isKer) { b.n = (b.n || 0) + 1; b.fast = b.n % 3 === 0; b.dir = b.fast ? 1 : -1; } // every third pass the tūī rides back on the wind; the other two it flies the hard way
    b.x = b.dir < 0 ? W + 55 : -55; b.y = (isKer ? 196 : 300) + (Math.random() - .5) * 50;
  }
  const fight = b.fast ? 0 : clamp((d.wind - .55) / .35);
  let speed = isKer ? 46 - fight * 52 : 46 - fight * 37, tilt = Math.sin(b.ph * .9) * fight * .35; // the tūī always makes a little headway
  if (isKer) { // within a few percent of full wind the kererū is tipped upright, then swept backwards off the picture
    if (gale && !b.blown && b.x > 30 && b.x < W - 30) b.blown = .001;
    if (b.blown) {
      b.blown += dt; const t = b.blown;
      tilt = -Math.min(t / .8, 1) * 1.5 + Math.sin(b.ph * 1.4) * .08;
      speed = t < .8 ? -8 : -Math.min(60 + (t - .8) * 700, 900);
      if (Math.abs(b.x - W / 2) > W / 2 + 90) { b.x = b.dir < 0 ? W + 150 : -150; if (d.wind < .9) { b.blown = 0; b.wait = gap() * .4; } }
    }
  }
  if (b.fast) { speed = 110 + d.wind * 430; tilt = -.12; } // with the wind behind it
  b.x += dt * speed * b.dir; b.ph += dt * (b.fast ? 3 + (1 - d.wind) * 5 : 7 + fight * 9);
  if (!b.blown && (b.x > W + 60 || b.x < -60)) { b.wait = gap(); return; } // gone, either across or pushed back out
  const bob = Math.sin(b.ph * .45) * (4 + fight * 16) + Math.sin(b.ph * 1.3) * fight * 6;
  const x = b.x, y = b.y + bob, ker = b.kind === 'kereru', s = ker ? 1.3 : 1.05;
  const flap = Math.sin(b.ph), tipX = -5 - flap * 2, tipY = -3 - flap * (19 + fight * 5);
  const back = ker ? '#3c8463' : '#16323c', wingC = ker ? '#356f6f' : '#1f4a52', out = () => ink(1.3, .85);
  ctx.save(); ctx.translate(x, y); ctx.scale(b.dir * s, s); ctx.rotate(tilt);
  const wing = (dx, col) => { ctx.beginPath(); ctx.moveTo(7 + dx, -2); ctx.quadraticCurveTo(8 + dx, tipY * .7 - 3, tipX + dx, tipY); ctx.quadraticCurveTo(-10 + dx, tipY * .45, -7 + dx, -1); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); out(); };
  wing(3, ker ? '#2b5a5c' : '#12282f'); // far wing
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-29, -6); ctx.lineTo(-30, 1); ctx.lineTo(-27, 6); ctx.lineTo(-12, 4); ctx.closePath(); ctx.fillStyle = ker ? '#2f5f58' : '#12282f'; ctx.fill(); out(); // tail
  ctx.beginPath(); ctx.ellipse(0, 0, ker ? 17 : 15, ker ? 10 : 7.5, 0, 0, 7); ctx.fillStyle = back; ctx.fill();
  ctx.save(); ctx.clip();
  if (ker) { ctx.fillStyle = '#f7f6ef'; ctx.fillRect(-20, 1.5, 34, 12); ctx.fillStyle = '#7a4f86'; ctx.beginPath(); ctx.ellipse(-2, -6, 10, 4, -.1, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = '#2d7f86'; ctx.beginPath(); ctx.ellipse(-3, -5, 9, 3, -.1, 0, 7); ctx.fill(); ctx.fillStyle = '#5a3f2e'; ctx.beginPath(); ctx.ellipse(-4, 6, 9, 3, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, ker ? 17 : 15, ker ? 10 : 7.5, 0, 0, 7); out();
  ctx.beginPath(); ctx.arc(ker ? 16 : 14, -5, ker ? 6.4 : 5.6, 0, 7); ctx.fillStyle = back; ctx.fill(); out(); // head
  ctx.beginPath(); if (ker) { ctx.moveTo(21, -7); ctx.lineTo(28, -4.5); ctx.lineTo(21, -3); } else { ctx.moveTo(18.5, -7); ctx.quadraticCurveTo(25, -6.5, 27, -2.5); ctx.quadraticCurveTo(22, -4, 18.5, -3.5); }
  ctx.closePath(); ctx.fillStyle = ker ? '#d8452f' : '#1a1a1a'; ctx.fill(); ink(1, .85);
  if (!ker) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(15.5, 1.5, 2.5, 0, 7); ctx.arc(13, 3.6, 2.2, 0, 7); ctx.fill(); ink(.9, .7); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = .9; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(8 + i * 1.6, -7 + i * .5); ctx.lineTo(7 + i * 1.6, -3.5 + i * .5); } ctx.stroke(); }
  ctx.fillStyle = ker ? '#d8452f' : '#fff'; ctx.beginPath(); ctx.arc(ker ? 17.5 : 15.5, -6, 1.9, 0, 7); ctx.fill();
  ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.arc(ker ? 17.8 : 15.8, -6, 1, 0, 7); ctx.fill();
  wing(0, wingC); // near wing
  if (!ker) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(3, -2.5); ctx.lineTo(1 + tipX * .25, -2.5 + tipY * .28); ctx.stroke(); }
  ctx.restore();
  if (b.fast && d.wind > .25) { // speed lines behind the tūī on its downwind dash
    ctx.strokeStyle = `rgba(255,255,255,${.3 + .5 * d.wind})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const l = 14 + d.wind * 26, gx = x - 34 - i * 7, gy = y - 8 + i * 8; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - l, gy); ctx.stroke(); }
  }
  if (fight > .2) { // gusts streaming past the bird
    ctx.strokeStyle = `rgba(255,255,255,${.75 * fight})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const gx = x - 70 + ((rclock * 160 + i * 40) % 130), gy = y - 14 + i * 12; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + 14, gy - 4, gx + 26, gy); ctx.stroke(); }
  }
}

const BUSH2 = [];
for (let i = 0; i < 30; i++) BUSH2.push([706 + R1() * 104, BOT - 58 + R1() * 62, 10 + R1() * 9, R1()]);
for (let i = 0; i < 22; i++) BUSH2.push([904 + R1() * 100, BOT - 96 + R1() * 100, 11 + R1() * 10, R1()]);
BUSH2.sort((a, b) => a[1] - b[1]);
function frontBush() {
  for (const [x, y, r, k] of BUSH2) {
    ctx.fillStyle = T(k < .33 ? '#2f6a3c' : k < .66 ? '#3d7a44' : '#4b8b4a'); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(200,236,150,${.18 * (1 - N)})`; ctx.beginPath(); ctx.arc(x - r * .25, y - r * .3, r * .5, 0, 7); ctx.fill();
  }
}
// a kiwi comes out of the bush once each night, pokes about for bugs, and goes home
const kiwi = { t: -1, done: false, wait: 0 };
function kiwiWalk(d, dt) {
  if (d.sun > 0) { kiwi.done = false; kiwi.t = -1; }
  if (d.sun < -9 && !kiwi.done && kiwi.t < 0) { kiwi.wait += dt; if (kiwi.wait > 2.5) { kiwi.t = 0; kiwi.done = true; kiwi.wait = 0; say('Shh… a kiwi has come out to look for bugs.', '--f-bio'); } }
  if (kiwi.t < 0) return;
  kiwi.t += dt / (mode === 'replay' ? 9 : 28);
  if (kiwi.t >= 1) { kiwi.t = -1; return; }
  const u = kiwi.t, seg = (a, b) => clamp((u - a) / (b - a));
  let x, dir = -1, walk = true, peck = 0, look = 0;
  if (u < .28) x = lerp(756, 590, seg(0, .28));
  else if (u < .40) { x = 590; walk = false; peck = 1; }
  else if (u < .50) x = lerp(590, 524, seg(.40, .50));
  else if (u < .60) { x = 524; walk = false; peck = 1; }
  else if (u < .67) { x = lerp(524, 556, seg(.60, .67)); dir = 1; }
  else if (u < .74) { x = 556; walk = false; look = 1; dir = 1; }
  else { x = lerp(556, 760, seg(.74, 1)); dir = 1; }
  const step = Math.sin(x * .42), dip = peck * Math.max(0, Math.sin(rclock * 7)), bob = walk ? Math.abs(step) * 1.5 : 0;
  ctx.save(); ctx.translate(x, BOT - 14 - bob); ctx.scale(dir * 1.35, 1.35);
  const brown = T('#8f6a47', .38), dark = T('#5d4330', .38), o = () => ink(1.1, .8);
  ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); // legs and feet
  for (const [lx, sw] of [[-3, walk ? step * 4 : 0], [3, walk ? -step * 4 : 0]]) { ctx.moveTo(lx, -5); ctx.lineTo(lx + sw, 0); ctx.lineTo(lx + sw + 3.5, 0); } ctx.stroke();
  ctx.fillStyle = brown; ctx.beginPath(); ctx.ellipse(-1, -13, 13, 10.5, -.15, 0, 7); ctx.fill(); o(); // round shaggy body
  ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.beginPath(); for (const [fx, fy] of [[-9, -14], [-5, -9], [-3, -17], [1, -11], [4, -16], [-11, -9], [6, -9]]) { ctx.moveTo(fx, fy); ctx.lineTo(fx - 3, fy + 3.5); } ctx.stroke();
  const hx = 11 + dip * 3, hy = -21 + dip * 9 - look * 3;
  ctx.strokeStyle = T('#e9dcc0', .3); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(hx + 4, hy + 1); ctx.quadraticCurveTo(hx + 12, hy + 3 - look * 3, hx + 19, hy + 9 - look * 9 + dip * 2.5); ctx.stroke(); // long beak
  ctx.fillStyle = brown; ctx.beginPath(); ctx.arc(hx, hy, 5.6, 0, 7); ctx.fill(); o();
  if (xmas) { ctx.fillStyle = '#d8342c'; ctx.beginPath(); ctx.moveTo(hx - 5, hy - 3.5); ctx.quadraticCurveTo(hx - 3, hy - 13, hx - 9, hy - 12); ctx.quadraticCurveTo(hx + 2, hy - 12, hx + 4.5, hy - 4.5); ctx.closePath(); ctx.fill(); ink(.9, .7);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(hx - 6, hy - 5.2, 11.5, 2.6, 1.3); ctx.fill(); ctx.beginPath(); ctx.arc(hx - 9.4, hy - 11.6, 1.9, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.arc(hx + 2, hy - 1, 1.2, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + 2.4, hy - 1.4, .45, 0, 7); ctx.fill();
  ctx.restore();
}

// a pīwakawaka (fantail) visits once a day: in from the right, flitting between the trees on both sides of the river, then away
const FAN_STOPS = [[1075, 400], [992, 436], [815, 536], [698, 464], [958, BOT - 84], [764, BOT - 62], [1080, 500]];
const fan = { t: -1, done: false, wait: 0 };
function fantail(d, dt) {
  if (d.sun < 0) { fan.done = false; fan.t = -1; }
  if (d.sun > 14 && !fan.done && fan.t < 0) { fan.wait += dt; if (fan.wait > 5) { fan.t = 0; fan.done = true; fan.wait = 0; say('A pīwakawaka (fantail) has come to flit about the trees by the river.', '--f-bio'); } }
  if (fan.t < 0) return;
  fan.t += dt * (mode === 'replay' ? 3.2 : 1);
  const FLY = 1.5, SIT = 3, legs = FAN_STOPS.length - 1, i = Math.floor(fan.t / (FLY + SIT)), lt = fan.t - i * (FLY + SIT);
  if (i >= legs) { fan.t = -1; return; }
  const [ax, ay] = FAN_STOPS[i], [bx, by] = FAN_STOPS[i + 1];
  let x, y, dir, open, flap = 0;
  if (lt < FLY) { // a looping, fluttery flight to the next perch
    const u = lt / FLY, e = u * u * (3 - 2 * u); x = lerp(ax, bx, e) + Math.sin(u * 19) * 5; y = lerp(ay, by, e) - Math.sin(u * Math.PI) * 30 + Math.cos(u * 23) * 4; dir = bx > ax ? 1 : -1; open = .35; flap = Math.sin(rclock * 34);
  } else { // perched: hopping, turning about and fanning its tail
    const p = lt - FLY; if (i === legs - 1) { fan.t = (i + 1) * (FLY + SIT); return; }
    x = bx + Math.sin(p * 2.1) * 7; y = by - Math.abs(Math.sin(p * 6.3)) * 3.5; dir = Math.sin(p * 2.1 + 1.2) > 0 ? 1 : -1; open = .75 + .25 * Math.sin(p * 5);
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * 1.25, 1.25);
  const o = () => ink(1, .8), spread = .25 + open * .75; // tail: a pale fan with a dark middle
  ctx.beginPath(); ctx.moveTo(-4, 0); for (let a = -spread; a <= spread + .01; a += spread / 4) ctx.lineTo(-4 - Math.cos(a + .35) * 17, -Math.sin(a + .35) * 17 - 2); ctx.closePath(); ctx.fillStyle = T('#f6efe0', .3); ctx.fill(); o();
  ctx.strokeStyle = T('#4a3c33', .3); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-4 - Math.cos(.35) * 16, -Math.sin(.35) * 16 - 2); ctx.stroke();
  ctx.lineWidth = .7; ctx.beginPath(); for (const a of [-spread * .55, spread * .55]) { ctx.moveTo(-4, 0); ctx.lineTo(-4 - Math.cos(a + .35) * 16, -Math.sin(a + .35) * 16 - 2); } ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 5, -.2, 0, 7); ctx.fillStyle = T('#e9b676', .3); ctx.fill(); o(); // buff belly
  ctx.save(); ctx.clip(); ctx.fillStyle = T('#6a5746', .3); ctx.fillRect(-8, -7, 16, 6.5); ctx.restore(); // brown back
  if (flap) { ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-1, -3 - flap * 9); ctx.lineTo(4, -2); ctx.closePath(); ctx.fillStyle = T('#5a4a3c', .3); ctx.fill(); o(); }
  ctx.beginPath(); ctx.arc(5.5, -4.5, 3.8, 0, 7); ctx.fillStyle = T('#4f433a', .3); ctx.fill(); o(); // head
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(4.2, -6.2); ctx.lineTo(7.6, -6.4); ctx.moveTo(4, -2); ctx.lineTo(7.4, -2.2); ctx.stroke(); // white eyebrow and throat
  ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.arc(6.6, -4.8, .8, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(9, -4.8); ctx.lineTo(11.6, -4.2); ctx.lineTo(9, -3.6); ctx.fill();
  ctx.restore();
}

function grass(d) {
  ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = (i * 53) % 1000, y = BOT - 34 + (i * 37) % 36;
    if (x > 800 && x < 915) continue;
    ctx.strokeStyle = G(i % 3 ? '#3f8236' : '#62a548');
    const sway = Math.sin(swayA + i) * (2 + d.wind * 9) + d.wind * 6;
    ctx.beginPath(); for (const o of [-4, 0, 4]) { ctx.moveTo(x + o, y); ctx.quadraticCurveTo(x + o + sway * .4, y - 10, x + o + sway, y - 17 - (i % 3) * 3 - Math.abs(o)); } ctx.stroke();
  }
}

const grainTile = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'), im = g.createImageData(160, 160), r = rng(7);
  for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 15; }
  g.putImageData(im, 0, 0); return c;
})();
let grainPat = null;
function finish(d) {
  const e = d.sun, dusk = clamp(1 - Math.abs(e - 3) / 10), shade = e > 0 ? clamp((d.cloud - .55) / .45) : 0;
  if (dusk > 0) { ctx.fillStyle = `rgba(255,140,80,${.2 * dusk})`; ctx.fillRect(0, 0, W, H); }       // golden light at sunrise and sunset
  if (shade > 0) { ctx.fillStyle = `rgba(70,82,98,${.2 * shade})`; ctx.fillRect(0, 0, W, H); }        // a cloud over the sun dims the land
  const rain = clamp((d.cloud - .78) / .18);
  if (rain > .02) { // a light drizzle when the cloud is thick; it leans with the wind
    const slant = 5 + d.wind * 20; ctx.strokeStyle = `rgba(214,230,246,${.3 * rain})`; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 46; i++) { const x = (i * 127.3 + rainPh * slant * 4) % 1100 - 50, y = (i * 71.7 + rainPh * 300 * (.8 + (i % 5) * .08)) % 720 - 40; ctx.moveTo(x, y); ctx.lineTo(x + slant * .3, y + 8); }
    ctx.stroke();
  }
  const v = ctx.createRadialGradient(500, 300, 330, 500, 320, 700); v.addColorStop(0, 'rgba(10,24,40,0)'); v.addColorStop(1, 'rgba(10,24,40,.3)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  grainPat = grainPat || ctx.createPattern(grainTile, 'repeat');
  ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
}

function frame(dt, rdt = dt) { // dt is slowed in low motion; rdt is real time, for birds, sheep, turbines and the dam's falling water
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const d = calm ? Object.assign({}, cur, { wind: Math.min(cur.wind, .08) }) : cur, m = reduced ? 0 : dt, rm = reduced ? 0 : rdt; // low motion also stills the wind's push on grass, trees, clouds and birds
  N = clamp((-d.sun + 2) / 10);
  const sa = snowAmt(d.season); snowAlps = lerp(206, 322, sa); snowRua = lerp(262, 342, sa); melt = meltAmt(d.season); lakeLevel = lakeAmt(d.season);
  if (Math.abs(N - lastN) > .003 || toneCache.size > 700) { toneCache.clear(); lastN = N; }
  if (!reduced) { rotor += calm ? rdt * .32 : dt * (d.wind < .02 ? .06 : .4 + d.wind * 1.2); swayA += dt * (1.2 + d.wind * 4); swayB += dt * (1 + d.wind * 3); fanRot += dt * (.4 + d.geo * 5); spillPh += rdt * 50 * (.4 + d.hydro); sheepPh += rdt * (1 - N); rainPh += dt; }
  spring = springAmt(d.season); autumn = autumnAmt(d.season); dry = dryAmt(d.season); red = redAmt(d.season); xmas = isXmas(d.season); winterSky = winterAmt(d.season);
  sky(d); sunAndMoon(d); rainbow(d, m); cloudLayer(d, m);
  ctx.translate(0, -S);
  mountains(d); lake(d); ridge(d);
  if (spring > .02) flowers(190, 250);
  SHEEP.slice(0, 8).forEach(([x, y], i) => sheep(x, y, .8, i));
  for (const [x, y, s] of TURBINES) turbine(x, y, s, d);
  foreground(d);
  if (spring > .02) flowers(0, 190);
  SHEEP.slice(8).forEach(([x, y], i) => sheep(x, y, y > 600 ? 1.55 : 1.1, i + 8));
  river(d, m); dam(d);
  cabbageTree(984, 480, .8, d); cabbageTree(690, 520, 1, d);
  geothermal(d, dt);
  for (const p of STANDS) stand(p);
  wires(cur);
  battery(d, m); thermal(d, dt);
  solarFarm(d); town(d);
  cabbageTree(806, 606, 1.25, d);
  ctx.globalAlpha = clamp((d.sun + 4) / 4); if (showBirds && ctx.globalAlpha > 0) for (const b of birds) bird(b, cur, rm); ctx.globalAlpha = 1; // birds roost once the sun is down
  if (showBirds) kiwiWalk(cur, rm); frontBush(); if (showBirds) fantail(cur, rm);
  flax(24, BOT + 2, 1.1, d); flax(760, BOT + 6, 1, d); ponga(986, BOT - 4, 1.15, d);
  grass(d);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  finish(d);
}

// ---------- names on the scene ----------
const LABELS = [
  ['Wind', 508, 196, '--f-wind'], ['Hydro', 704, 356, '--f-hydro'], ['Geothermal', 232, 406, '--f-geo'],
  ['Solar farms', 150, 504, '--f-solar'], ['Rooftop solar', 404, 452, '--f-solar'], ['Gas', 850, 432, '--f-gas'], ['Battery', 628, 527, '--f-batt']
].map(([t, x, y, c]) => [t, x, y - S, c]);
$('labels').innerHTML = LABELS.map(([t, x, y, c]) => `<span style="left:${x / 10}%;top:${y / 6.4}%"><i style="background:var(${c})"></i>${t}</span>`).join('')
  + `<span class="under" id="batt-state" style="left:62.8%;top:${(556 - S) / 6.4}%"><i style="background:#9aa5ab"></i><b style="font-weight:600">Resting</b></span>`;

// ---------- pop-ups ----------
const queue = []; let lastToast = -1e9;
function say(text, color) { queue.push([text, color]); }
function pumpToasts(now) {
  const gap = mode === 'replay' ? 2600 : 900;
  if (!queue.length || now - lastToast < gap) return;
  lastToast = now;
  const [text, color] = queue.shift();
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<i style="background:var(${color})"></i><span></span>`; el.lastChild.textContent = text;
  const box = $('toasts'); box.appendChild(el);
  const max = matchMedia('(max-width: 640px)').matches ? 1 : 3;
  while (box.children.length > max) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 520); }, 5200);
}
const pct = v => Math.round(v * 100) + '%';
const windWords = w => w < .15 ? 'Hardly any wind. The wind farms are resting.' : w < .4 ? 'A nice breeze is turning the wind turbines.' : w < .65 ? 'It’s windy! The wind farms are busy.' : 'Blowing a gale! The kererū is struggling to fly.';
const band = w => w < .15 ? 0 : w < .4 ? 1 : w < .65 ? 2 : 3;
function events(i, j) { // what changed between interval i and j
  eventsFrom(dialsFrom(at(i)), dialsFrom(at(j)), D.plants.map(p => [p.n, p.f, p.s[Math.floor(i)] ?? 0, p.s[Math.floor(j)] ?? 0]));
}
function eventsFrom(a, b, plants) { // what changed between two moments: dials a and b, and each plant's [name, fuel, MW at a, MW at b]
  if (a.wind <= .96 && b.wind > .96) say('Whoosh! The wind farms are flat out. The kererū has been blown away, but the tūī is hanging on.', '--f-wind');
  if (band(a.wind) !== band(b.wind)) say(windWords(b.wind) + ` Wind is making ${pct(b._s.wind / (D.cap.wind || 1412))} of what it can.`, '--f-wind');
  if (a.sun <= 0 && b.sun > 0) say('Good morning! The sun is up and the solar panels are waking.', '--f-solar');
  if (a.sun > 0 && b.sun <= 0) say('The sun has set. No solar power until the morning.', '--f-solar');
  if (a.cloud < .8 && b.cloud >= .8) say('The clouds are thick enough for a little drizzle.', '--f-hydro');
  if (b.sun > 15 && a.cloud < .55 && b.cloud >= .55) say('Clouds are covering the sun, so rooftop panels make less.', '--f-solar');
  if (b.sun > 15 && a.cloud >= .45 && b.cloud < .3) say('The clouds have moved away. Sunshine for the solar panels!', '--f-solar');
  if (a._ren < .9 && b._ren >= .9) say(`${pct(b._ren)} of our electricity is coming from nature right now.`, '--f-hydro');
  if (Math.sign(Math.round(a.batt * 10)) !== Math.sign(Math.round(b.batt * 10)) && Math.abs(b.batt) > .1)
    say(b.batt > 0 ? 'The batteries are giving back the energy they saved.' : 'The batteries are filling up with spare electricity.', '--f-batt');
  for (const [n, f, s0, s1] of plants) {
    if (!['gas', 'coal', 'diesel'].includes(f)) continue;
    if (s0 <= 2 && s1 > 8) say(`${n} has started up to help out.`, '--f-gas');
    if (s0 > 8 && s1 <= 2) say(`${n} has switched off.`, '--f-gas');
  }
}
function hello() {
  const d = dialsFrom(at(D.n - 1));
  say(windWords(d.wind), '--f-wind');
  if (isXmas(d.season)) say('Meri Kirihimete! The town has put up its Christmas lights.', '--f-diesel');
  if (meltAmt(d.season) > .6) say('It’s spring. The snow is melting, and the river is running high into the hydro lake.', '--f-hydro');
  say(`The rivers are making ${Math.round(d._s.hydro).toLocaleString('en-NZ')} MW at the hydro dams.`, '--f-hydro');
  say(d.sun > 0 ? `Rooftop solar is making about ${Math.round(d._s.roof)} MW from people’s houses.` : 'It’s night, so the solar panels are asleep.', '--f-solar');
}

// ---------- numbers under the scene ----------
const MIXF = [['geo','Geothermal'],['hydro','Hydro'],['wind','Wind'],['solar','Solar farms'],['roof','Rooftop solar'],['bio','Bioenergy'],['waste','Waste heat'],['gas','Gas'],['coal','Coal/gas'],['diesel','Diesel']];
$('vstack').innerHTML = MIXF.map(([k]) => `<div data-k="${k}" style="background:var(--f-${k === 'roof' ? 'solar' : k});${k === 'roof' ? 'filter:brightness(1.25)' : ''}"></div>`).join('');
$('vlabs').innerHTML = MIXF.map(([k]) => `<span data-k="${k}"></span>`).join('');
$('mix').innerHTML = MIXF.map(([k]) => `<div data-k="${k}" style="background:var(--f-${k === 'roof' ? 'solar' : k});${k === 'roof' ? 'opacity:.6' : ''}"></div>`).join('');
const DIALS = [
  ['wind', 'Wind', '--f-wind', 'Turbine speed, cloud drift, grass sway; over 0.55 the birds start to struggle, and over 0.96 the kererū is blown away. The tūī’s ride back downwind gets faster.', '0 at no wind, 1 at 1,270 MW (about the most the fleet reaches)'],
  ['hydro', 'Hydro', '--f-hydro', 'River flow speed, width and dam spray.', '0 at 1,400 MW, 1 at 4,600 MW (the range hydro really works in)'],
  ['geo', 'Geothermal', '--f-geo', 'How much steam rises from the station. Steady day and night.', '0.5 at 900 MW, 1 at 1,180 MW; 0 only if it stops'],
  ['cloud', 'Cloud cover', '--f-solar', 'Number and greyness of clouds, how bright the sun is.', '1 − rooftop solar ÷ clear-sky estimate (held overnight)'],
  ['time', 'Time of day', '--f-solar', 'Sun or moon position, sky colour and lit windows; house lights go out one by one from 9:30 pm, leaving a single window lit by 1 am.', 'NZ clock time; the sun’s height is worked out for the centre of NZ'],
  ['solar', 'Solar', '--f-solar', 'Shine on the solar farm’s panels and on the house roofs.', '(Grid solar + rooftop MW) ÷ 1,360 MW; the farm and the roofs each follow their own share'],
  ['thermal', 'Gas and coal', '--f-gas', 'Smoke from the chimneys; none when it’s zero.', '0 below 30 MW (the small plants that never stop), 1 at 600 MW'],
  ['batt', 'Battery', '--f-batt', 'Arrow and sparks run in when charging and out when discharging.', 'Battery MW ÷ installed (− = charging)'],
  ['season', 'Season', '--f-hydro', 'Snow, the braided river and the lake level; spring flowers, brown summer paddocks, autumn leaves, Matariki in winter and Christmas lights in December.', 'Summer, autumn, winter, spring or December, from the date'],
];
// what each dial does and how it's worked out stays folded under More info until asked for (test report, 16 Nov 2026).
// The season slider stops at spring: December's Christmas look comes with the date, not the slider.
$('dtable').innerHTML = DIALS.map(([k, name, c, does, how]) => `<div class="drow"><div class="dname"><i style="background:var(${c})"></i>${name}</div>
  <div class="dbody"><div class="dline"><div class="dbar${k === 'batt' ? ' mid' : ''}"><b id="bar-${k}" style="background:var(${c})"></b></div><span class="dval" id="val-${k}">–</span>
  <button type="button" class="dmore" aria-expanded="false" aria-controls="how-${k}">More info</button></div>
  <input id="sl-${k}" type="range" min="${k === 'batt' ? -1 : 0}" max="${k === 'time' ? 24 : k === 'season' ? 3 : 1}" step="${k === 'time' ? .05 : k === 'season' ? 1 : .01}" aria-label="${name}" hidden>
  <div class="dhow" id="how-${k}" hidden>${does} <span style="font-family:var(--font-data)">${how}</span></div></div></div>`).join('');
for (const b of root.querySelectorAll('.dmore')) b.onclick = () => {
  const open = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Less info' : 'More info';
  $(b.getAttribute('aria-controls')).hidden = !open;
};

function updateText(d) {
  const s = d._s;
  $('k-gen').textContent = Math.round(d._gen).toLocaleString('en-NZ') + ' MW';
  $('k-ren').textContent = d._ren == null ? 'No estimate' : pct(d._ren);
  const parts = MIXF.map(([k, n]) => [k, n, Math.max(s[k], 0)]), tot = parts.reduce((a, p) => a + p[2], 0);
  for (const [k, , v] of parts) root.querySelector(`#mix [data-k="${k}"]`).style.width = (v / tot * 100) + '%';
  $('h-gen').textContent = Math.round(d._gen).toLocaleString('en-NZ'); $('h-ren').textContent = d._ren == null ? 'No estimate' : pct(d._ren);
  let cum = 0; const vh = $('vstack').clientHeight, small = $('vstack').clientWidth < 16;
  for (const [k, n, v] of parts) { // the same mix, stacked up the left of the picture
    const share = v / tot, lab = root.querySelector(`#vlabs [data-k="${k}"]`);
    root.querySelector(`#vstack [data-k="${k}"]`).style.height = share * 100 + '%';
    lab.style.bottom = (cum + share / 2) * 100 + '%'; cum += share;
    lab.hidden = share * vh < (small ? 12.5 : 18); lab.textContent = `${n} ${pct(share)}`;
  }
  const bs = $('batt-state'), bw = d.batt < -.05 ? 'Charging' : d.batt > .05 ? 'Discharging' : 'Resting';
  if (bs.lastChild.textContent !== bw) { bs.lastChild.textContent = bw; bs.firstChild.style.background = Math.abs(d.batt) > .05 ? '#9b7fe6' : '#9aa5ab'; }
  const top = parts.slice().sort((a, b) => b[2] - a[2]).slice(0, 2);
  $('k-top').textContent = `Mostly ${top[0][1].toLowerCase()} (${pct(top[0][2] / tot)}), then ${top[1][1].toLowerCase()} (${pct(top[1][2] / tot)})`;
  for (const [k] of DIALS) {
    let v = d[k];
    if (k === 'solar' && mode !== 'play') v = (s.solar + s.roof) / (BAND.solar[1] + BAND.roof[1]);
    const bar = $('bar-' + k), val = $('val-' + k);
    if (k === 'season') { const si = seasonIdx(v), dec = isXmas(v); bar.style.width = (dec ? 100 : (si + 1) * 20) + '%'; val.textContent = dec ? 'December · Christmas' : SEASONS[si] + ' · ' + ['dry paddocks, little snow', 'autumn leaves', 'deep snow, Matariki', 'flowers, snow melting'][si]; continue; }
    if (k === 'time') { bar.style.width = clamp(v / 24) * 100 + '%'; val.textContent = fmtTime(DAY0 + v * 36e5) + ` · sun ${d.sun.toFixed(0)}°`; continue; }
    if (k === 'batt') { const w = Math.abs(v) * 50; bar.style.width = w + '%'; bar.style.left = v < 0 ? (50 - w) + '%' : '50%'; val.textContent = v.toFixed(2) + (mode !== 'play' ? ` · ${Math.round(s.batt)} MW` : ''); continue; }
    bar.style.width = clamp(v) * 100 + '%';
    const mw = { wind: s.wind, hydro: s.hydro, geo: s.geo, solar: s.solar + s.roof, thermal: s.coal + s.gas + s.diesel }[k];
    val.textContent = v.toFixed(2) + (mode !== 'play' && mw !== undefined ? ` · ${Math.round(mw).toLocaleString('en-NZ')} MW` : '');
  }
}

// ---------- mode switching ----------
const minutes = n => `${n} minute${n === 1 ? '' : 's'}`;
function setMode(m, keepCards = false) {
  mode = prefs.mode = m;
  if (!keepCards) prefs.cards = null;      // each mode opens with its own cards setting: off in the replay, on otherwise
  for (const k of ['now', 'replay', 'play']) $('m-' + k).setAttribute('aria-pressed', String(k === m));
  $('scrub').hidden = m !== 'replay';
  for (const [k] of DIALS) $('sl-' + k).hidden = m !== 'play';
  queue.length = 0; $('toasts').innerHTML = '';
  applyPrefs();
  if (m === 'now') { pos = D.n - 1; hello(); }
  if (m === 'replay') { pos = 0; playing = true; endWait = 0; $('pp').textContent = 'Pause'; say(`Replaying the last 24 hours, one day in ${minutes(prefs.speed)}.`, '--f-hydro'); }
  if (m === 'play') {
    for (const [k] of DIALS) { const v = k in manual ? manual[k] : cur[k]; manual[k] = v; $('sl-' + k).value = v; }
    say('You’re in charge! Move the sliders and watch the scene.', '--f-wind');
  }
  $('dials-lede').textContent = m === 'play'
    ? 'Each slider sets one dial directly. On the real page these come from the live feed.'
    : 'Each part of the picture listens to one number between 0 and 1, worked out from the live feed. The scene eases towards each new value, so a 5-minute update never makes anything jump.';
}
// the on/off buttons and the replay speed, set from prefs; every change goes back to the page (opts.onPrefs) to keep
const toggle = (id, on, word) => { const b = $(id); b.setAttribute('aria-pressed', String(on)); b.textContent = `${word} ${on ? 'on' : 'off'}`; };
let showCards = true, showHud = true;
function applyPrefs() {
  showLabels = prefs.names; showHud = prefs.numbers; showBirds = prefs.birds; calm = prefs.calm; showCards = cardsOn(prefs);
  $('labels').hidden = !showLabels; $('hud').hidden = !showHud; $('toasts').hidden = !showCards;
  root.querySelector('.scene').classList.toggle('hud-on', showHud);
  toggle('labels-btn', showLabels, 'Names'); toggle('hud-btn', showHud, 'Numbers'); toggle('cards-btn', showCards, 'Cards');
  toggle('birds-btn', showBirds, 'Birds'); toggle('calm-btn', calm, 'Low motion');
  for (const b of root.querySelectorAll('#speed button')) b.setAttribute('aria-pressed', String(+b.dataset.min === prefs.speed));
  syncMenu();
}
const changed = () => { applyPrefs(); opts.onPrefs?.(Object.assign({}, prefs)); };
$('m-now').onclick = () => { setMode('now'); changed(); };
$('m-replay').onclick = () => { setMode('replay'); changed(); };
$('m-play').onclick = () => { setMode('play'); changed(); };
$('pp').onclick = () => { playing = !playing; endWait = 0; if (playing && pos >= D.n - 1) pos = 0; $('pp').textContent = playing ? 'Pause' : 'Play'; $('pp').setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay'); };
$('scrub-in').oninput = e => { pos = +e.target.value; };
for (const b of root.querySelectorAll('#speed button')) b.onclick = () => { prefs.speed = +b.dataset.min; changed(); };
$('fs-btn').onclick = async () => { // the picture alone, filling the screen; Esc (or Back on a TV remote) leaves it
  const el = root.querySelector('.scene');
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen()); }
  catch (e) { $('fs-btn').textContent = 'Full screen isn’t available here'; setTimeout(() => { $('fs-btn').textContent = 'Full screen'; }, 2600); }
};
$('calm-btn').onclick = () => { prefs.calm = !prefs.calm; changed(); };
$('birds-btn').onclick = () => { prefs.birds = !prefs.birds; changed(); };
$('cards-btn').onclick = () => { prefs.cards = !cardsOn(prefs); changed(); };
$('hud-btn').onclick = () => { prefs.numbers = !prefs.numbers; changed(); };
$('labels-btn').onclick = () => { prefs.names = !prefs.names; changed(); };
// in full screen the page's buttons are out of sight, so a menu in the corner mirrors them
function syncMenu() { for (const b of root.querySelectorAll('#fsmenu [data-for]')) { const src = $(b.dataset.for); b.textContent = src.textContent; b.setAttribute('aria-pressed', src.getAttribute('aria-pressed')); } }
for (const b of root.querySelectorAll('#fsmenu [data-for]')) b.onclick = () => { $(b.dataset.for).click(); syncMenu(); };
$('fs-menu-btn').onclick = () => { const open = $('fsmenu').hidden; syncMenu(); $('fsmenu').hidden = !open; $('fs-menu-btn').setAttribute('aria-expanded', String(open)); };
$('fs-x').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); };
const onFs = () => { $('fsmenu').hidden = true; $('fs-menu-btn').setAttribute('aria-expanded', 'false'); };
document.addEventListener('fullscreenchange', onFs);
for (const [k] of DIALS) $('sl-' + k).oninput = e => { manual[k] = +e.target.value; };
const playDials = ['wind','hydro','geo','cloud','sun','solar','roof','thermal','batt'];
for (const k of playDials) if (k !== 'sun' && !(k in manual)) manual[k] = cur[k];
manual.season = seasonIdx(seasonOf(D.t0 + (D.n - 1) * D.step));
let DAY0 = D.t0 + (D.n - 1) * D.step - hourOf(D.t0 + (D.n - 1) * D.step) * 36e5; // midnight (NZ) of the feed's last day

// ---------- loop ----------
let last = performance.now(), lastIdx = D.n - 1, endWait = 0, sdt = 1 / 60;
let raf = 0, dead = false;
const shown = {};   // text last written to each element: only a change touches the page, not every frame
const show = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
function tick(now) {
  if (dead) return;
  // frame times are smoothed, so one late frame doesn't throw the turbines and birds forward (test report, 16 Nov 2026)
  const raw = Math.min((now - last) / 1000, .1); last = now; sdt += (raw - sdt) * .2; const dt = Math.min(sdt, .066); const slow = calm ? .3 : 1; clock += reduced ? 0 : dt * slow; rclock += reduced ? 0 : dt; // low motion: everything runs at under a third speed
  if (mode === 'replay') {
    const before = pos;
    if (playing) pos += dt * (D.n - 1) / (60 * prefs.speed);       // the whole day in prefs.speed minutes
    if (pos >= D.n - 1) {
      pos = D.n - 1;
      if (opts.loop && playing) { endWait += dt; if (endWait > 6) { pos = 0; endWait = 0; } }   // a wall screen replays again
      else if (playing) { playing = false; $('pp').textContent = 'Play'; }
    }
    if (Math.floor(pos) !== Math.floor(before) && pos > before) events(Math.floor(before), Math.floor(pos));
    $('scrub-in').value = pos;
  }
  if (mode === 'play') {
    const t = dialsFrom(at(D.n - 1));
    target = Object.assign(t, manual);
    const ms = DAY0 + manual.time * 36e5, sp = sun(ms); // the time-of-day slider sets the sun, the sky and the house lights
    target.sun = sp.e; target.sunH = sp.H; target.late = lateness(ms); target.roof = manual.solar; target.season = SEASON_F[manual.season];
  } else target = dialsFrom(at(pos));
  const t = mode === 'play' ? DAY0 + manual.time * 36e5 : at(pos).t;
  const tShow = mode === 'replay' ? Math.floor(t / 18e5) * 18e5 : t; // in replay the clock ticks in half hours
  show('scrub-out', fmtTime(tShow));
  $('h-day').hidden = mode === 'play'; show('h-time', fmtTime(tShow)); show('h-day', fmtDay(tShow));
  show('when', mode === 'play' ? `Your own dials · ${fmtTime(t)}` : `${fmtDay(tShow)} · ${fmtTime(tShow)} NZ time`);
  const ease = reduced ? 1 : 1 - Math.exp(-dt / (mode === 'replay' ? .35 : .9));
  for (const k of playDials) cur[k] = lerp(cur[k], target[k], ease);
  cur.sunH = target.sunH; cur.town = target.town; cur.late = target.late; cur.time = target.time; cur.season = lerp(cur.season, target.season, ease); cur._gen = target._gen; cur._ren = target._ren; cur._s = target._s;
  frame(dt * slow, dt);
  if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) updateText(cur);
  pumpToasts(now);
  if (!dead) raf = requestAnimationFrame(tick);
}
updateText(cur);
$('scrub-in').max = String(D.n - 1);
setMode(prefs.mode, true);
raf = requestAnimationFrame(tick);

// ---------- new data, and leaving the page ----------
function setFeed(next) {
  const old = D, before = mode === 'now' ? dialsFrom(at(D.n - 1)) : null;
  D = next;
  DAY0 = D.t0 + (D.n - 1) * D.step - hourOf(D.t0 + (D.n - 1) * D.step) * 36e5;
  $('scrub-in').max = String(D.n - 1);
  if (mode === 'replay') pos = clamp(pos - (D.t0 - old.t0) / D.step, 0, D.n - 1);   // the same moment in the new feed
  if (mode === 'now') {
    pos = D.n - 1;
    const after = dialsFrom(at(D.n - 1));
    eventsFrom(before, after, D.plants.map(p => { const q = old.plants.find(o => o.n === p.n); return [p.n, p.f, q?.s[old.n - 1] ?? 0, p.s[D.n - 1] ?? 0]; }));
  }
}
function destroy() {
  dead = true; cancelAnimationFrame(raf); ro.disconnect();
  document.removeEventListener('fullscreenchange', onFs);
}
return { setFeed, destroy };
}
