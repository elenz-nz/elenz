// Tests for the private plant research page's filters, address and workbook (src/lib/plants/research.js, xlsx.js):
// run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { readSettings, writeSettings, pick, filtered, needCounts, progress, workbook, DEFAULTS, LEAD_GROUPS, ROUNDS, leadKey, leadCounts, leadTechs, pickLeads, photoStatuses, photoCounts, photoCollections, pickPhotoLeads, leadSlugs } from '#lib/plants/research.js';
import { keyOf, loadNotes, saveNote, dateStamp, savedAt } from '#lib/plants/notes.js';
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

test('the "Has team notes" filter and the notes in the download', () => {
  const withNote = RESEARCH.plants.map((p) => ({ ...p, my_note: p.slug === 'benmore' ? 'Ask about unit 6' : '' }));
  assert.deepEqual(pick(withNote, { ...DEFAULTS, need: 'mine' }).map((p) => p.slug), ['benmore']);
  assert.equal(readSettings('?key=k&need=mine', withNote).need, 'mine');
  const wb = workbook(RESEARCH, { benmore: { text: 'Ask about unit 6' } });
  const col = wb[0].header.indexOf('Team notes');
  assert.ok(col > 0);
  assert.equal(wb[0].rows.find((r) => r[1] === 'benmore')[col], 'Ask about unit 6');
  assert.equal(wb[0].rows.find((r) => r[1] === 'arapuni')[col], '');
  for (const r of wb[0].rows) assert.equal(r.length, wb[0].header.length);
});

test('the team notes: reading and saving through the Worker, with the key in a header', async () => {
  const calls = [];
  const answer = (status, body) => async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
  assert.equal(keyOf('?key=abc&need=todo'), 'abc');
  assert.deepEqual(await loadNotes('', answer(200, {})), { ok: false, problem: 'nokey' });
  assert.equal(calls.length, 0, 'no key: not even asked');
  const ok = await loadNotes('abc', answer(200, { notes: { benmore: { text: 'x', at: 1 } } }));
  assert.deepEqual(ok, { ok: true, notes: { benmore: { text: 'x', at: 1 } } });
  assert.equal(calls[0].url, '/data/plant-notes');
  assert.equal(calls[0].init.headers['x-elenz-key'], 'abc');
  assert.deepEqual(await loadNotes('abc', answer(404, {})), { ok: false, problem: 'badkey' });
  assert.deepEqual(await loadNotes('abc', answer(503, { error: 'no key is set for this address' })), { ok: false, problem: 'unset' });
  assert.deepEqual(await loadNotes('abc', answer(503, { error: 'store down' })), { ok: false, problem: 'error' });
  assert.deepEqual(await loadNotes('abc', async () => { throw new Error('offline'); }), { ok: false, problem: 'error' });

  calls.length = 0;
  assert.deepEqual(await saveNote('abc', 'benmore', 'hello', 5, answer(200, { text: 'hello', at: 9 })), { ok: true, note: { text: 'hello', at: 9 } });
  assert.equal(calls[0].url, '/data/plant-notes/benmore');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: 'hello', base: 5 });
  assert.deepEqual(await saveNote('abc', 'benmore', 'x', 5, answer(409, { conflict: true, note: { text: 'theirs', at: 7 } })), { ok: false, conflict: { text: 'theirs', at: 7 } });
  assert.match((await saveNote('abc', 'benmore', 'x', 5, answer(413, { error: 'too long' }))).error, /too long/);
  assert.match((await saveNote('abc', 'benmore', 'x', 5, async () => { throw new Error('offline'); })).error, /no connection/);
  assert.equal(dateStamp(new Date('2026-11-19T03:30:00Z')), '19 Nov 2026: ');
  assert.match(savedAt(Date.parse('2026-11-19T03:40:00Z')), /^saved 19 Nov 2026, 4:40\s?pm$/);
  assert.equal(savedAt(null), '');
});

test('station leads: groups, filters, note keys and the download', () => {
  const leads = RESEARCH.station_leads;
  const keys = new Set(LEAD_GROUPS.map(([k]) => k));
  for (const r of leads) assert.ok(keys.has(r.group), `${r.id} has a known group`);
  const n = leadCounts(leads);
  assert.equal(n[''], leads.length);
  assert.equal(LEAD_GROUPS.filter(([k]) => k).reduce((a, [k]) => a + n[k], 0), leads.length, 'every lead is in one group');
  assert.ok(n.todo > 0);
  for (const r of leads.filter((x) => x.on_page)) {
    assert.equal(r.group, 'page');
    assert.ok(RESEARCH.plants.some((p) => p.slug === r.on_page), `${r.id}: ${r.on_page} is a plant`);
  }
  assert.equal(ROUNDS.filter(([, , s]) => s === 'now').length, 1, 'one round under way');
  const L = (o) => ({ id: 'X1', name: 'X', group: 'todo', ...o });
  const few = [L({ id: 'H2', name: 'Ōkere Falls', technology: 'Hydro', region: 'Bay of Plenty' }), L({ id: 'W1', name: 'Brooklyn', technology: 'Wind' }),
    L({ id: 'H1', name: 'Bullendale', technology: 'Hydro', group: 'historic' })];
  assert.deepEqual(pickLeads(few, { group: 'todo', tech: '', text: '' }).map((r) => r.id), ['W1', 'H2']);
  assert.deepEqual(pickLeads(few, { group: '', tech: 'Hydro', text: '' }).map((r) => r.id), ['H1', 'H2']);
  assert.deepEqual(pickLeads(few, { group: '', tech: '', text: 'okere' }).map((r) => r.id), ['H2'], 'macrons ignored');
  assert.deepEqual(pickLeads(few, { group: '', tech: '', text: 'plenty' }).map((r) => r.id), ['H2'], 'region matches');
  assert.deepEqual(leadTechs(few), ['Hydro', 'Wind']);
  assert.equal(leadKey('E025'), 'lead-e025');
  assert.match(leadKey('E025'), /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a key the notes store takes (worker/notes.js, SLUG)');
  assert.ok(!RESEARCH.plants.some((p) => p.slug.startsWith('lead-')), 'no plant slug clashes with a lead note key');
  const id = leads[0].id;
  const sheet = workbook(RESEARCH, { [leadKey(id)]: { text: 'Ask the network' } })[4];
  assert.equal(sheet.header[0], 'Group');
  assert.ok(!sheet.header.includes('group'));
  assert.equal(sheet.rows[0][sheet.header.indexOf('Team notes')], 'Ask the network');
  assert.equal(sheet.rows[0][sheet.header.indexOf('id')], id);
});

test('photo leads: status from the plants’ photos, and their filters', () => {
  const plants = [
    P({ slug: 'arapuni', images: [{ source_url: 'https://c/a.jpg' }] }),
    P({ slug: 'karapiro' }),
    P({ slug: 'benmore', images: [{ source_url: 'https://c/b.jpg#x' }] }),
  ];
  const L = (id, slugs, url, collection = 'Wikimedia Commons', subject = id) => ({ id, slugs, subject, url, collection, rights_lead: '', description: '' });
  const leads = [
    L('P1', 'arapuni', 'https://c/a.jpg'),
    L('P2', 'arapuni', 'https://c/other.jpg', 'Wikimedia Commons category'),
    L('P3', 'karapiro', 'https://c/k.jpg'),
    L('P4', 'arapuni karapiro', 'https://c/m.jpg', 'Te Ara'),
    L('P5', 'benmore', 'https://c/b.jpg'),
    L('P6', 'nowhere', 'https://c/n.jpg'),
  ];
  assert.deepEqual(leadSlugs({ slugs: 'a b,c; d' }), ['a', 'b', 'c', 'd']);
  const st = photoStatuses(leads, plants);
  assert.deepEqual(st, { P1: 'used', P2: 'has', P3: 'needs', P4: 'needs', P5: 'used', P6: 'none' });
  assert.deepEqual(photoCounts(leads, st), { needs: 2, used: 2, has: 1, none: 1, '': 6 });
  assert.deepEqual(photoCollections(leads), ['Te Ara', 'Wikimedia Commons', 'Wikimedia Commons category']);
  const ids = (f) => pickPhotoLeads(leads, st, { status: '', collection: '', text: '', ...f }).map((r) => r.id);
  assert.deepEqual(ids({ status: 'needs' }), ['P3', 'P4']);
  assert.deepEqual(ids({ status: 'none' }), ['P6']);
  assert.deepEqual(ids({ collection: 'Te Ara' }), ['P4']);
  assert.deepEqual(ids({ status: 'needs', text: 'karap' }), ['P3', 'P4']);
  assert.equal(ids({}).length, 6);
});

test('photo leads: every real lead gets exactly one status', () => {
  const st = photoStatuses(RESEARCH.photo_leads, RESEARCH.plants);
  const n = photoCounts(RESEARCH.photo_leads, st);
  assert.equal(n[''], RESEARCH.photo_leads.length);
  assert.equal(n.needs + n.used + n.has + n.none, n['']);
});
