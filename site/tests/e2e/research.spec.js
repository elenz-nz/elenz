// The private plant research page (/plants/research): its table, filters kept in the address with the key, a plant's
// facts, and the workbook download. The Worker's key check is tested in worker/tests (here the static build is served
// without the Worker).
import { test, expect } from '@playwright/test';
import { OK_ERRORS, WEBKIT_CANCELLED } from './errors.js';

test.describe('plant research page', () => {
  test('filters, a plant\'s facts and the download', async ({ page, browserName }) => {
    const errors = [];
    const ignore = browserName === 'webkit' ? WEBKIT_CANCELLED : OK_ERRORS;
    // the visit counters: on elenz.co.nz the Worker takes them out of this page; here they're stubbed, as in site.spec.js
    await page.route(/cloudflareinsights\.com|umami\.is/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    page.on('pageerror', (e) => { if (!ignore.test(e.message)) errors.push(e.message); });
    await page.goto('/plants/research?key=k123');
    await expect(page.getByRole('heading', { name: 'Plant research' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const count = page.locator('#tbl-h');
    await expect(count).toContainText(/of \d+ plants/);
    const all = Number((await count.textContent()).match(/^(\d+)/)[1]);

    // a choice made before the page has hydrated is lost (the page then reads its settings from the address), and a
    // phone Safari on GitHub's runners can still be hydrating here (test report, 19 Nov 2026), so choose until it takes
    await expect(async () => {
      await page.getByLabel('Needs').selectOption('todo');
      await expect(page).toHaveURL(/\?key=k123&need=todo/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    const some = Number((await count.textContent()).match(/^(\d+)/)[1]);
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(all);

    await page.getByLabel('Needs').selectOption('');
    await page.getByLabel('Find').fill('Manap');
    await page.getByRole('button', { name: 'Manapōuri' }).click();
    await expect(page).toHaveURL(/key=k123&q=Manap&plant=manapouri/);
    const detail = page.locator('.detail');
    await expect(detail.getByRole('link', { name: 'Plant page' })).toHaveAttribute('href', '/plants/manapouri');
    await expect(detail.locator('tr.alt.diff').first()).toContainText('differs');   // Wikidata's 1972 beside Wikipedia's 1971
    await expect(detail).toContainText(/reviewed \d{4}-\d{2}-\d{2}|not reviewed yet/);   // Manapōuri's to-check list emptied 19 Nov 2026

    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download workbook/ }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^elenz-plant-research-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(errors).toEqual([]);
  });

  test('team notes: read with the key, saved on leaving the box, and every link opens in a new tab', async ({ page, browserName }) => {
    const errors = [];
    const ignore = browserName === 'webkit' ? WEBKIT_CANCELLED : OK_ERRORS;
    page.on('pageerror', (e) => { if (!ignore.test(e.message)) errors.push(e.message); });
    await page.route(/cloudflareinsights\.com|umami\.is/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    // the Worker's notes store (worker/notes.js), stood in for: the static build here has no Worker
    const saved = [];
    let stored = { benmore: { text: 'Ask Meridian about unit 6.', at: 1795000000000 } };
    await page.route('**/data/plant-notes**', async (route) => {
      const req = route.request();
      if (req.headers()['x-elenz-key'] !== 'k123') return route.fulfill({ status: 404, body: 'Not found' });
      if (req.method() === 'GET') return route.fulfill({ json: { notes: stored } });
      const slug = new URL(req.url()).pathname.split('/').pop(), body = req.postDataJSON();
      saved.push({ slug, ...body });
      const note = { text: body.text.trim(), at: 1795000100000 + saved.length };
      stored = { ...stored, [slug]: note };
      return route.fulfill({ json: note });
    });
    await page.goto('/plants/research?key=k123&plant=benmore');
    const detail = page.locator('.detail');
    const box = detail.getByLabel('Team notes');
    await expect(box).toHaveValue('Ask Meridian about unit 6.');
    await expect(page.locator('tr.on .has-note')).toBeVisible();
    await expect(detail).toContainText(/saved \d+ Nov 2026/);

    await box.fill('Ask Meridian about unit 6.\nAlso the 1965 date.');
    await expect(detail).toContainText('Not saved yet');
    await detail.getByRole('heading', { name: /Facts/ }).click();   // leaving the box saves it
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toEqual({ slug: 'benmore', text: 'Ask Meridian about unit 6.\nAlso the 1965 date.', base: 1795000000000 });
    await expect(detail).not.toContainText('Not saved yet');

    // the Needs filter finds the plants with notes
    await page.getByLabel('Needs').selectOption('mine');
    await expect(page.locator('#tbl-h')).toContainText(/^1 of/);

    // every link on the page, the masthead's and footer's too, opens in a new tab; links within the page don't
    const links = await page.locator('a[href]').evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel })));
    expect(links.length).toBeGreaterThan(10);
    for (const l of links) {
      if (/^(#|mailto:|tel:)/.test(l.href)) continue;
      expect(l, l.href).toMatchObject({ target: '_blank' });
      expect(l.rel, l.href).toContain('noopener');
    }
    const [tab] = await Promise.all([page.context().waitForEvent('page'), detail.getByRole('link', { name: 'Plant page' }).click()]);
    expect(new URL(tab.url()).pathname).toBe('/plants/benmore');
    await tab.close();
    await expect(page).toHaveURL(/\/plants\/research\?key=k123&need=mine&plant=benmore/);   // this tab stays put
    expect(errors).toEqual([]);
  });

  test('station leads: the rounds, groups, a lead\'s details and its own team notes', async ({ page, browserName }) => {
    const errors = [];
    const ignore = browserName === 'webkit' ? WEBKIT_CANCELLED : OK_ERRORS;
    page.on('pageerror', (e) => { if (!ignore.test(e.message)) errors.push(e.message); });
    await page.route(/cloudflareinsights\.com|umami\.is/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const saved = [];
    await page.route('**/data/plant-notes**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({ json: { notes: { 'lead-h046': { text: 'Phoenix mine, 1886.', at: 1795000000000 } } } });
      const slug = new URL(req.url()).pathname.split('/').pop(), body = req.postDataJSON();
      saved.push({ slug, ...body });
      return route.fulfill({ json: { text: body.text.trim(), at: 1795000100000 } });
    });
    await page.goto('/plants/research?key=k123');
    await expect(page.getByRole('list', { name: 'Research rounds' })).toContainText('Stations without a page');
    const leads = page.locator('details.leads-now');
    // "To research" is chosen first; a choice made while the page hydrates can be lost, so choose until it takes
    await expect(leads.getByRole('button', { name: /^To research/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(async () => {
      await leads.getByRole('button', { name: /^Historic/ }).click();
      await expect(leads.getByRole('button', { name: /^Historic/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await leads.getByLabel('Search leads').fill('bullen');
    await expect(leads.locator('tbody > tr')).toHaveCount(1);
    await expect(leads.locator('tr .has-note')).toBeVisible();
    await leads.getByRole('button', { name: 'Bullendale' }).click();
    const box = leads.locator('.detail').getByLabel('Team notes');
    await expect(box).toHaveValue('Phoenix mine, 1886.');
    await box.fill('Phoenix mine, 1886. Look in Papers Past.');
    await leads.locator('.detail > p.quiet').click();   // leaving the box saves it
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toEqual({ slug: 'lead-h046', text: 'Phoenix mine, 1886. Look in Papers Past.', base: 1795000000000 });

    // a lead already on a page links to it
    await leads.getByRole('button', { name: /^On a page already/ }).click();
    await leads.getByLabel('Search leads').fill('Argyle');
    await leads.getByRole('button', { name: 'Argyle' }).click();
    await expect(leads.locator('.detail').getByRole('link', { name: 'On the Branch River page' })).toHaveAttribute('href', '/plants/branch-river-arnold');
    expect(errors).toEqual([]);
  });

  test('the three lists fold, and the photo leads filter by status', async ({ page }) => {
    await page.route(/cloudflareinsights\.com|umami\.is/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.goto('/plants/research?key=k123');
    const plants = page.locator('details.tbl'), stations = page.locator('details.leads-now'), photos = page.locator('details.leads');
    await expect(plants).toHaveAttribute('open', '');
    await expect(stations).toHaveAttribute('open', '');
    await expect(photos).not.toHaveAttribute('open', '');
    // a fold answers once the page has hydrated; a click before it still toggles the native details
    await plants.locator('summary').click();
    await expect(plants.locator('table')).toBeHidden();
    await plants.locator('summary').click();
    await expect(plants.locator('table')).toBeVisible();
    await photos.locator('summary').click();
    const rows = photos.locator('tbody tr');
    await expect(async () => {
      await photos.getByRole('button', { name: /^Needs a photo/ }).click();
      await expect(photos.getByRole('button', { name: /^Needs a photo/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(rows.first()).toContainText('Needs a photo');
    for (const r of await rows.all()) await expect(r).toContainText('Needs a photo');
  });

  test('team notes say why they can\'t be read without the key', async ({ page }) => {
    await page.goto('/plants/research?plant=benmore');
    await expect(page.locator('.detail')).toContainText('Notes need the page’s key');
    await expect(page.locator('.detail').getByLabel('Team notes')).toHaveCount(0);
  });

  test('on a phone the table fits and a plant opens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/plants/research?plant=benmore');
    await expect(page.locator('.detail')).toContainText('Facts');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide).toBeLessThanOrEqual(1);
  });
});
