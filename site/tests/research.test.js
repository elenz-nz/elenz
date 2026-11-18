// Tests for the private plant research page's filters, address and workbook (src/lib/plants/research.js, xlsx.js):
// run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { readSettings, writeSettings, pick, filtered, needCounts, progress, workbook, DEFAULTS } from '#lib/plants/research.js';
import { xlsx, zip, crc32, col } from '#lib/plants/xlsx.js';
import RESEARCH from '#lib/plants/research.json' with { type: 'json' };

const P = (o) => ({ slug: 'x', name: 'X', plant: 'X', fuel: 'hydro', island: 'NI', status: 'operating', mw: 10, owner: 'Other generators', scheme: '',
  wikidata: '', osm: [], register: [], reviewed: '', to_check: [], notes: [], photo_leads: [], images: [], loc: 'draft', disagree: [],
  facts: 2, checked: 0, entries: [], ...o });
const PLANTS = [
  P({ slug: 'manapouri', name: 'Manapōuri', island: 'SI', mw: 800, owner: 'Meridian', to_check: ['a', 'b'], disagree: ['Commissioned'] }),
  P({ slug: 'arapuni', name: 'Arapuni', mw: 196.7, owner: 'Mercury', reviewed: '2026-11-18', checked: 2, loc: 'checked', images: [{ file: 'a.webp' }] }),
  P({ slug: 'otahuhu-b', name: 'Ōtāhuhu B', fuel: 'gas', status: 'closed', mw: 404, owner: 'Contact', loc: 'grid', to_check: ['c'] }),
];

test('settings come from the address and go back with its key kept', () => {
  const s = readSettings('?key=abc&fuel=gas&island=si&need=grid&q=ota&sort=mw&plant=otahuhu-b&owner=nobody', PLANTS);
  assert.deepEqual(s, { ...DEFAULTS, fuel: 'gas', island: 'SI', need: 'grid', text: 'ota', by: 'mw', asc: false, open: 'otahuhu-b' });
  assert.equal(writeSettings(s, '?key=abc&fuel=hydro'), '?key=abc&fuel=gas&island=SI&need=grid&q=ota&sort=mw&plant=otahuhu-b');
  assert.equal(writeSettings(DEFAULTS, '?key=abc'), '?key=abc');
  assert.equal(writeSettings(DEFAULTS, ''), '');
  assert.equal(writeSettings({ ...DEFAULTS, by: 'name', asc: false }), '?sort=name-desc');
  assert.deepEqual(readSettings('?need=nonsense&status=closed', PLANTS), { ...DEFAULTS, status: 'closed' });
});

test('filters, needs and the sort', () => {
  const names = (s) => pick(PLANTS, { ...DEFAULTS, ...s }).map((p) => p.slug);
  assert.deepEqual(names({}), ['arapuni', 'manapouri', 'otahuhu-b']);   // A to Z, macrons ignored
  assert.deepEqual(names({ need: 'todo' }), ['manapouri', 'otahuhu-b']);
  assert.deepEqual(names({ need: 'grid' }), ['otahuhu-b']);
  assert.deepEqual(names({ need: 'disagree' }), ['manapouri']);
  assert.deepEqual(names({ need: 'reviewed' }), ['arapuni']);
  assert.deepEqual(names({ need: 'nophoto' }), ['manapouri', 'otahuhu-b']);
  assert.deepEqual(names({ text: 'otahuhu' }), ['otahuhu-b']);
  assert.deepEqual(names({ owner: 'meridian' }), ['manapouri']);
  assert.deepEqual(names({ by: 'mw', asc: false }), ['manapouri', 'otahuhu-b', 'arapuni']);
  assert.deepEqual(names({ by: 'todo', asc: false }), ['manapouri', 'otahuhu-b', 'arapuni']);
  assert.deepEqual(names({ by: 'reviewed', asc: false }), ['arapuni', 'manapouri', 'otahuhu-b']);   // no date goes last
  const c = needCounts(filtered(PLANTS, { ...DEFAULTS, island: 'NI' }));
  assert.equal(c.todo, 1);
  assert.equal(c.location, 1);
});

test('progress counts every plant file', () => {
  assert.deepEqual(progress(PLANTS), { plants: 3, reviewed: 1, facts: 6, checked: 2, photos: 1, located: 1, todo: 2, disagree: 1 });
  const all = progress(RESEARCH.plants);
  assert.equal(all.plants, RESEARCH.plants.length);
  assert.ok(all.facts >= all.checked);
});

test('the research data: every plant, its facts and their sources', () => {
  const m = RESEARCH.plants.find((p) => p.slug === 'manapouri');
  assert.ok(m, 'Manapōuri has a row');
  assert.equal(m.name, 'Manapōuri');
  assert.equal(m.facts, m.entries.length);
  for (const p of RESEARCH.plants) for (const e of p.entries) for (const x of [...e.source, ...e.alt.flatMap((a) => a.source)]) {
    assert.ok(RESEARCH.sources[x], `${p.slug} ${e.label}: source ${x} is listed`);
  }
});

// a stored zip's entries, read back: {name: text}
function unzip(/** @type {Uint8Array} */ b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = {};
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    const method = v.getUint16(at + 8, true), crc = v.getUint32(at + 14, true), size = v.getUint32(at + 18, true);
    const n = v.getUint16(at + 26, true), extra = v.getUint16(at + 28, true);
    const name = new TextDecoder().decode(b.subarray(at + 30, at + 30 + n));
    let data = b.subarray(at + 30 + n + extra, at + 30 + n + extra + size);
    if (method === 8) data = inflateRawSync(data);
    assert.equal(crc32(data), crc, `${name}: CRC`);
    out[name] = new TextDecoder().decode(data);
    at += 30 + n + extra + size;
  }
  return out;
}

test('the zip and the workbook', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.deepEqual(['A', 'Z', 'AA', 'AZ', 'BA'], [0, 25, 26, 51, 52].map(col));
  const z = unzip(zip([{ name: 'a.txt', data: new TextEncoder().encode('kia ora') }]));
  assert.deepEqual(z, { 'a.txt': 'kia ora' });
  const files = unzip(xlsx([{ name: 'Plants: all', header: ['Plant', 'MW'], rows: [['Ōtāhuhu B <closed> & gone', 404], ['Line\u0001two', null]] }]));
  assert.ok(files['[Content_Types].xml'] && files['xl/workbook.xml'] && files['xl/styles.xml']);
  assert.match(files['xl/workbook.xml'], /<sheet name="Plants  all"/);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Plant<\/t>/);
  assert.match(sheet, /Ōtāhuhu B &lt;closed&gt; &amp; gone/);
  assert.match(sheet, /<c r="B2"><v>404<\/v><\/c>/);
  assert.match(sheet, />Linetwo</, 'characters XML forbids are dropped');
  assert.ok(!sheet.includes('r="B3"'), 'an empty cell is left out');
  assert.match(sheet, /<autoFilter ref="A1:B3"\/>/);
});

test('the download holds every plant, fact and lead', () => {
  const wb = workbook(RESEARCH);
  assert.deepEqual(wb.map((s) => s.name), ['Plants', 'Facts', 'Sources', 'Photo leads', 'Station leads']);
  assert.equal(wb[0].rows.length, RESEARCH.plants.length);
  const facts = RESEARCH.plants.reduce((a, p) => a + p.entries.reduce((b, e) => b + 1 + e.alt.length, 0), 0);
  assert.equal(wb[1].rows.length, facts);
  assert.equal(wb[3].rows.length, RESEARCH.photo_leads.length);
  assert.equal(wb[4].rows.length, RESEARCH.station_leads.length);
  for (const s of wb) for (const r of s.rows) assert.equal(r.length, s.header.length, s.name);
});
