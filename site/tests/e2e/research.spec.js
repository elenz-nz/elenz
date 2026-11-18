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
      await page.getByLabel('Needs').selectOption('grid');
      await expect(page).toHaveURL(/\?key=k123&need=grid/, { timeout: 2_000 });
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

  test('on a phone the table fits and a plant opens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/plants/research?plant=benmore');
    await expect(page.locator('.detail')).toContainText('Facts');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide).toBeLessThanOrEqual(1);
  });
});
