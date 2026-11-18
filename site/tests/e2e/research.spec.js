// The private plant research page (/plants/research): its table, filters kept in the address with the key, a plant's
// facts, and the workbook download. The Worker's key check is tested in worker/tests (here the static build is served
// without the Worker).
import { test, expect } from '@playwright/test';

test.describe('plant research page', () => {
  test('filters, a plant\'s facts and the download', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/plants/research?key=k123');
    await expect(page.getByRole('heading', { name: 'Plant research' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const count = page.locator('#tbl-h');
    await expect(count).toContainText(/of \d+ plants/);
    const all = Number((await count.textContent()).match(/^(\d+)/)[1]);

    await page.getByLabel('Needs').selectOption('grid');
    await expect(page).toHaveURL(/\?key=k123&need=grid/);
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
    await expect(detail).toContainText('To check');

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
