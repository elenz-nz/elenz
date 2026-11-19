// The site in real browsers (playwright.config.js). They use the data bundled with the build, not the live site, so a
// pull request can still merge while the live site or its data is down (when a fix may be needed most).
//
// Each test comes from a fault that reached the live site on 2 Nov 2026: charts hidden after a click between pages
// (Chrome), then the desktop layout on phones. A refresh hid the first, so these go through the site's own links.
import { test as base, expect } from '@playwright/test';
import { OK_ERRORS, WEBKIT_CANCELLED } from './errors.js';

// any uncaught error in the page fails the test, but for the cancelled loads in ./errors.js, which aren't faults. The
// analytics scripts are blocked so the tests reach nothing outside the build.
const test = base.extend({
  page: async ({ page, browserName }, use) => {
    const errors = [];
    const ignore = browserName === 'webkit' ? WEBKIT_CANCELLED : OK_ERRORS;
    await page.route(/cloudflareinsights\.com|umami\.is/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    page.on('pageerror', (e) => { if (!ignore.test(e.message)) errors.push(e.message); });
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

const isPhone = (testInfo) => testInfo.project.name.startsWith('phone');
// empty when the page fits the screen; otherwise by how much, and the path down to what causes it, found by hiding each
// element in turn (text and ::before strips have no box of their own to look at)
const sticksOut = () => {
  const root = document.documentElement, over = () => root.scrollWidth - root.clientWidth;
  const before = over();
  if (before <= 0) return '';
  const fitsWithout = (e) => { const d = e.style.getPropertyValue('display'); e.style.setProperty('display', 'none', 'important'); const fits = over() <= 0; e.style.removeProperty('display'); if (d) e.style.setProperty('display', d); return fits; };
  const path = [];
  for (let node = document.body; node;) {
    node = [...node.children].find(fitsWithout);
    if (node) path.push(`${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}.${String(node.className.baseVal ?? node.className).split(' ')[0]}`);
  }
  const last = path.length ? document.querySelector(path.at(-1).replace(/\.$/, '')) : null;
  return `${before}px: ${path.join(' > ')} "${(last?.textContent ?? '').trim().slice(0, 60)}"`;
};

// what each page must show once it has loaded; the data-free parts only, so none of this waits on history files
const SHOWS = {
  '/now': ['.kpis', '.below', '.map-panel', '.mix-panel'],
  '/tracker': ['.toolbar', '.layout', '#cv-gen', '.lower'],
  '/tracker/prices': ['.toolbar', '.layout', '.p-row'],
  '/': ['.pages-list .window'],
};
const expectShown = async (page, path) => {
  for (const s of SHOWS[path]) await expect(page.locator(s).first(), `${path} shows ${s}`).toBeVisible();
};
// the rule that hides things with JavaScript off must never apply while JavaScript is on
const expectJsOnlyShown = async (page) => {
  const hidden = await page.locator('.js-only').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display === 'none').map((e) => e.className));
  expect(hidden, 'js-only elements hidden with JavaScript on').toEqual([]);
};

test('clicking between pages shows each page in full', async ({ page }) => {
  await page.goto('/about');
  const go = async (href, path) => {
    await page.locator(`nav.pages a[href="${href}"], nav.pages a[href^="${href}?"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
    await expectShown(page, path);
    await expectJsOnlyShown(page);
  };
  await go('/now', '/now');
  await go('/tracker', '/tracker');
  await page.locator('a[href^="/tracker/prices"]').first().click();
  await expect(page).toHaveURL(/\/tracker\/prices/);
  await expectShown(page, '/tracker/prices');
  await expectJsOnlyShown(page);
  await go('/now', '/now');
  await page.locator('a.brand svg').first().click();   // the whole logo is the link (SITE-01)
  await expect(page).toHaveURL(/\/$/);
  await expectShown(page, '/');
  await expectJsOnlyShown(page);
});

test('the generation chart draws after a click from another page', async ({ page }) => {
  await page.goto('/about');
  await page.locator('nav.pages a[href^="/tracker"]').first().click();
  await expect(page.locator('#cv-gen')).toBeVisible();
  await expect.poll(() => page.locator('#cv-gen').evaluate((c) => {
    if (!c.width || !c.height) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i]) n++;
    return n;
  })).toBeGreaterThan(50);
});

for (const path of Object.keys(SHOWS)) {
  test(`${path} shows in full on a direct visit and a refresh`, async ({ page }) => {
    await page.goto(path);
    await expectShown(page, path);
    await page.reload();
    await expectShown(page, path);
    await expectJsOnlyShown(page);
  });
}

// the live week's embedded solar with no estimate (null: daylight with no irradiance, design decision 13 Nov 2026): the
// last hour of the bundled tracker.json blanked as the live job writes it; the pages say "No estimate" and draw a gap
const withoutRoof = async (page, n = 12) => {
  await page.route(/\/data\/tracker\.json/, async (r) => {
    const D = await (await r.fetch()).json();
    for (const isl of ['NI', 'SI']) for (const k of ['roof', 'roofU', 'underlying']) if (D[isl][k]) for (let j = D.N - n; j < D.N; j++) D[isl][k][j] = null;
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(D) });
  });
};
test('with no embedded solar estimate, Now says so rather than show zero', async ({ page }) => {
  await withoutRoof(page);
  await page.goto('/now');
  const tile = (name) => page.locator('.kpi', { has: page.locator('.k-lbl', { hasText: name }) });
  await expect(tile('Embedded solar').locator('.k-val')).toHaveText('No estimate');
  await expect(tile('Renewable share').locator('.k-val')).toHaveText('No estimate');
  await expect(tile('Emissions intensity').locator('.k-val')).toHaveText('No estimate');
});
test('with no embedded solar estimate, the tracker draws and says how long it lacks one', async ({ page }) => {
  await withoutRoof(page);
  await page.goto('/tracker');
  await expect(page.locator('#sum-sub')).toContainText('embedded solar missing for 1 h');
  await expect(page.locator('#sys')).toContainText('Renewable share');
});
// "No estimate" in the summary's table mustn't make the page jump as the cursor crosses the gap
test('crossing the gap leaves the page where it was', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), 'a mouse hover');
  await withoutRoof(page, 144);   // the last 12 hours
  await page.goto('/tracker');
  await expect(page.locator('#sum-sub')).toContainText('embedded solar missing');
  const cv = page.locator('#cv-gen'), b = await cv.boundingBox();
  const below = async (f) => {
    await page.mouse.move(b.x + b.width * f, b.y + b.height / 2);
    await expect(page.locator('#sum-sub')).toContainText('TP');
    // where the cards below start, and the height of every row in the summary's table
    return page.evaluate(() => [document.querySelector('.lower').getBoundingClientRect().top + scrollY,
      ...[...document.querySelectorAll('#summary tr')].map((r) => Math.round(r.getBoundingClientRect().height))]);
  };
  const out = await below(0.3), gap = await below(0.85);
  await expect(page.locator('#sum-sub')).toContainText('no embedded solar estimate');
  expect(gap).toEqual(out);
});

// a finger that lands on the map and then scrolls the page leaves no pointerleave, so a mouse can't show this fault (a
// real mouse clears the tooltip anyway): the pointer event is sent to the cell directly, with nothing there to leave
test('a heat map tooltip clears when the page scrolls', async ({ page }) => {
  await page.goto('/tracker/prices');
  const cell = page.locator('.hm .c').nth(40);
  await cell.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));   // that scroll has landed
  await cell.dispatchEvent('pointermove', { bubbles: true, clientX: 120, clientY: 200 });
  await expect(page.locator('.hm-tip')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, window.scrollY > 100 ? 0 : 200));
  await expect(page.locator('.hm-tip')).toHaveCount(0);
});

// SvelteKit's own router can't decode this address and stops there (an uncaught URIError, so `base`, not `test`), which
// leaves the page as prerendered: it must still read properly and its links must still work.
base('a badly encoded address shows the not-found page', async ({ page }) => {
  await page.route(/cloudflareinsights\.com|umami\.is/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**/records/bad%E0%A4%A', (r) => r.fulfill({ path: 'build/404.html', status: 404, contentType: 'text/html' }));
  await page.goto('/records/bad%E0%A4%A');
  await expect(page.getByRole('heading', { name: /can’t find that page/ })).toBeVisible();
  await page.locator('main a[href="/methods"], a[href="/methods"]').first().click();
  await expect(page).toHaveURL(/\/methods$/);
});

// Space is held for what the data fills in (.waiting), so a slow connection doesn't move the page under the reader (seen
// in the analytics, 3 Nov 2026: Prices scored 0.31 to 0.66 on every load). Tablet width, where the Generation tab's list
// sits above the lower charts. Only Chromium reports layout shifts.
test.describe('while the data loads', () => {
  test.use({ viewport: { width: 820, height: 1180 } });
  for (const path of ['/tracker', '/tracker/prices']) {
    test(`${path} stays where it is`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'Chromium on a computer only');
      await page.addInitScript(() => {
        window.shifts = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.shifts += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.route(/\/data\/tracker\.json/, async (r) => { await new Promise((ok) => setTimeout(ok, 500)); await r.fallback(); });
      await page.goto(path);
      await expect(page.locator('.mix tbody tr').first()).toBeVisible();
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => window.shifts)).toBeLessThan(0.1);
    });
  }
});

test('a method page keeps its calculations behind a button', async ({ page }) => {
  await page.goto('/methods/hvdc');
  const button = page.getByText('Show calculations');
  const formula = page.locator('.calc .formula').first();
  await expect(formula).toBeHidden();
  await button.click();
  await expect(formula).toBeVisible();
  await page.getByText('Hide calculations').click();
  await expect(formula).toBeHidden();
});

test('All offers no daily interval on the Prices tab', async ({ page }) => {
  await page.goto('/tracker/prices');
  await page.locator('[aria-labelledby="p-lb-range"] button', { hasText: 'ALL' }).click();
  await expect(page.locator('[aria-labelledby="p-lb-int"] button')).toHaveText(['Week', 'Month']);
});

test('an ⓘ opens the note it points to, after the page has hydrated', async ({ page }) => {
  await page.goto('/tracker');
  await expectShown(page, '/tracker');
  const tip = page.locator('button.info-tip').first();
  await tip.click();
  await expect(tip).toHaveAttribute('aria-expanded', 'true');
  const id = await tip.getAttribute('aria-controls');
  await expect(page.locator(`[id="${id}"]`)).toBeVisible();
});

for (const path of ['/now', '/tracker', '/tracker/prices']) {
  test(`${path}: the status button is last on its line and opens its panel (TRK-01)`, async ({ page }) => {
    await page.goto(path);
    const pill = page.locator('.status .pill');
    await expect(pill).toBeEnabled();
    const others = page.locator('.status > :is(button, .dl-wrap, .share-wrap):not(.pill)');
    const right = (l) => l.evaluate((e) => e.getBoundingClientRect().right);
    for (const b of await others.all()) if (await b.isVisible()) expect(await right(b)).toBeLessThan(await right(pill));
    const panel = page.locator('.info-pop[aria-label="About this data"]');
    await expect(panel).toBeHidden();
    await pill.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
}

for (const path of ['/tracker', '/tracker/prices']) {
  test(`${path}: Reset asks first, and Cancel leaves the view alone`, async ({ page }) => {
    await page.goto(`${path}?range=7d`);
    const ask = page.locator('.rs-pop');
    await expect(ask).toBeHidden();
    await page.locator('.status .reset-btn').click();
    await expect(ask).toContainText('Reset all charts?');
    await page.locator('.rs-no').click();
    await expect(ask).toBeHidden();
    await expect(page).toHaveURL(/range=7d/);
    await page.locator('.status .reset-btn').click();
    await page.keyboard.press('Escape');
    await expect(ask).toBeHidden();
    await page.locator('.status .reset-btn').click();
    await page.locator('.rs-yes').click();
    await expect(page).not.toHaveURL(/range=7d/);
  });

  test(`${path}: Reset is out on the tabs line (TRK-01)`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('.status .reset-btn')).toBeVisible();
  });
}

// drags a slider part by dx with the mouse, a step at a time
async function slide(page, part, dx) {
  const b = await page.locator(part).first().boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
}

for (const path of ['/tracker?range=3d', '/tracker/prices?range=3d']) {
  test.describe(`${path}: the time slider (TRK-12)`, () => {
    test.beforeEach(({}, testInfo) => test.skip(isPhone(testInfo), 'dragged with a mouse'));

    test('a tap on its window moves nothing', async ({ page }) => {
      await page.goto(path);
      const thumb = page.locator('.ts-thumb');
      await expect(thumb).toHaveAttribute('aria-valuetext', /./);
      await thumb.click();
      await page.waitForTimeout(300);
      await expect(page).not.toHaveURL(/end=|zoom=/);
    });

    test('its window glides, keeps its range, and comes back to the newest data', async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.ts-thumb')).toHaveAttribute('aria-valuetext', /./);
      await slide(page, '.ts-thumb', -60);
      await expect(page).toHaveURL(/zoom=\d{4}-\d\d-\d\dT\d\d:\d\d/);
      await expect(page).toHaveURL(/range=3d/);
      await expect(page.locator('.zoom-chip:not([hidden]):has-text("Reset zoom")')).toHaveCount(0);   // moved, not zoomed
      await slide(page, '.ts-thumb', 400);   // past the track's end, but inside the window: Firefox here loses a press let go outside it
      await expect(page).not.toHaveURL(/end=|zoom=/);
    });

    test('letting go while the mouse is still moving ends the drag', async ({ page }) => {
      await page.goto(path);
      const thumb = page.locator('.ts-thumb'), slider = page.locator('.tslider');
      await expect(thumb).toHaveAttribute('aria-valuetext', /./);
      const b = await thumb.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(x - i * 8, y);
      await page.mouse.up();
      for (let i = 7; i <= 12; i++) await page.mouse.move(x - i * 8, y);   // still moving as it lets go
      await expect(slider).not.toHaveClass(/sliding/);
      const where = await thumb.getAttribute('aria-valuetext');
      await page.mouse.move(x - 200, y + 200);   // off the slider, and back on it: it no longer follows
      await page.mouse.move(x - 120, y);
      await page.waitForTimeout(200);
      await expect(thumb).toHaveAttribute('aria-valuetext', where);
    });

    test('its window has a fixed length: no ends to drag', async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.ts-thumb')).toHaveAttribute('aria-valuetext', /./);
      await expect(page.locator('.ts-thumb')).toHaveCount(1);
      await expect(page.locator('.tslider [role="slider"]')).toHaveCount(1);
    });
  });
}

for (const [path, menu, date] of [['/tracker', '#span-menu', '#in-date'], ['/tracker/prices', '#p-span-menu', '#p-date']]) {
  test(`${path}: the zoom menu starts at 3 hours, and the calendar holds the time`, async ({ page }, info) => {
    test.skip(info.project.name.includes('phone'), 'the same on a phone, with a mouse here');
    await page.goto(path);
    await expect(page.locator(date).locator('.dp-txt')).not.toBeEmpty();
    await page.locator('.span-btn').click();
    await expect(page.locator(`${menu} .span-hd`)).toHaveText('Zoom');
    await expect(page.locator(`${menu} button`).first()).toHaveText('3 hours');
    await page.locator(`${menu} button`).first().click();
    await expect(page).toHaveURL(/zoom=3h/);
    await expect(page.locator('time-pick')).toHaveCount(0);
    await expect(page.locator(date).locator('button')).toHaveAttribute('title', /^Ends at \d+:\d\d [ap]m/);

    await page.locator(date).locator('button').click();
    await page.locator('.dp-time').click();
    const was = page.url();
    await page.locator('.tp-h').nth(1).click();          // an hour only marks itself
    await expect(page.locator('.tp-h.sel')).toHaveText('1 am');
    expect(page.url()).toBe(was);
    await page.locator('.tp-m').nth(6).click();          // the minutes apply it
    await expect(page.locator('.dp-pop')).toHaveCount(0);
    await expect(page).toHaveURL(/zoom=[^&]*T01%3A30|zoom=[^&]*T01:30/);
  });
}

for (const [path, width] of [['/tracker?range=3d', 360], ['/tracker?range=3d', 412], ['/tracker/prices?range=3d', 320], ['/tracker/prices?range=3d', 390]]) {
  test(`${path} at ${width} px: the bar keeps its height and the date stays put through a slide`, async ({ page }, info) => {
    test.skip(info.project.name.includes('phone'), 'set by width, with a mouse here');
    await page.setViewportSize({ width, height: 800 });
    await page.goto(path);
    const thumb = page.locator('.ts-thumb'), bar = page.locator('.toolbar'), date = page.locator('date-pick button');
    await expect(thumb).toHaveAttribute('aria-valuetext', /./);
    const h = (await bar.boundingBox()).height, x0 = (await date.boundingBox()).x;
    const b = await thumb.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x - i * 5, y);
      await page.waitForTimeout(60);
      expect((await bar.boundingBox()).height).toBe(h);
      expect((await date.boundingBox()).x).toBe(x0);
    }
    await page.mouse.up();
  });
}

test('on the 3-hour zoom the forward arrow comes back after a step back (ZM-04)', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), 'the 1D menu is covered by the zoom tests');
  await page.goto('/tracker?zoom=3h');
  await expect(page.locator('#tb-next')).toBeDisabled();
  await page.locator('#tb-prev').click();
  await expect(page).toHaveURL(/zoom=\d/);
  await expect(page.locator('#tb-next')).toBeEnabled();
  await page.locator('#tb-next').click();
  await expect(page).toHaveURL(/zoom=3h/);
  await expect(page.locator('#tb-next')).toBeDisabled();
});

test('a site picked from far down the list goes back up to the chart (GRP-03)', async ({ page }) => {
  await page.goto('/tracker?by=site');
  await expect(page.locator('#summary .sec-btn').first()).toBeVisible();
  await page.evaluate(() => document.querySelectorAll('#summary tr.sec[aria-expanded="false"] .sec-btn').forEach((b) => b.click()));
  const last = page.locator('#summary tr:not([hidden]) .drill').last();
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect.poll(() => page.evaluate(() => document.getElementById('charts').getBoundingClientRect().top)).toBeLessThan(200);
  await expect.poll(() => page.evaluate(() => document.getElementById('charts').getBoundingClientRect().top)).toBeGreaterThan(-5);
});

// plant pages (hidden until PLANTS_PUBLIC): the history file comes from the history job, so the tests hand them a small
// one (two years of Manapōuri, the newest month running)
const PLANT_MONTHS = Array.from({ length: 34 }, (_, k) => `${2024 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`);
const PLANT_HISTORY = { v: 1, months: PLANT_MONTHS, src: 'm'.repeat(33) + 'd', end: Date.UTC(2026, 9, 15, 11), left: 0,
  plants: { 'Manapōuri': { i: 0, g: PLANT_MONTHS.map((m, k) => 400000 + 5000 * k) } } };

test.describe('plant pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/data/history/plants.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(PLANT_HISTORY) }));
  });

  test('a plant page shows its live output, history and capacity, and stays out of search', async ({ page }) => {
    await page.goto('/plants/manapouri');
    await expect(page.locator('h1')).toHaveText('Manapōuri');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('.now .big .num')).toHaveText(/^\d/);
    await expect(page.locator('section[aria-labelledby="hist-h"] svg > rect')).toHaveCount(3);   // 2024, 2025, 2026
    await expect(page.locator('section[aria-labelledby="mon-h"] svg > rect')).toHaveCount(24);
    await page.getByRole('button', { name: 'Capacity factor' }).click();
    await expect(page.locator('section[aria-labelledby="hist-h"] .ctx')).toContainText('% of installed capacity');
    await expect(page.locator('#capacity .box svg path')).toHaveCount(2);
    await expect(page.locator('.stats')).toContainText('October 2025 to September 2026');   // October is still running
  });

  test('a closed plant has no live panel', async ({ page }) => {
    await page.goto('/plants/otahuhu-b');
    await expect(page.locator('.tags')).toContainText('Closed');
    await expect(page.locator('section[aria-labelledby="hist-h"]')).toBeVisible();
    await expect(page.locator('.now')).toHaveCount(0);
  });

  test('the aerial views switch scale and credit their imagery', async ({ page }) => {
    await page.goto('/plants/aviemore');   // no photo, so the views lead the page
    const img = page.locator('.photo .loc img');
    await expect(img).toHaveAttribute('src', '/plants/aerial/aviemore-site.webp');
    await expect(img).toHaveJSProperty('complete', true);
    expect(await img.evaluate((el) => el.naturalWidth)).toBe(1000);   // the file is there
    await page.getByRole('button', { name: 'Wide' }).click();
    await expect(img).toHaveAttribute('src', '/plants/aerial/aviemore-wide.webp');
    await expect(page.locator('.loc figcaption')).toContainText('Toitū Te Whenua LINZ');
    await expect(page.locator('.loc .locator')).toBeVisible();   // the island locator in the corner
    await expect(page.getByRole('button', { name: 'Photo' })).toHaveCount(0);   // no photo, so no tabs
  });

  test('a licensed photo leads, credited, and the Location tab has the aerial views', async ({ page }) => {
    await page.goto('/plants/manapouri');
    const photo = page.locator('.photo .photos img');
    await expect(photo).toHaveAttribute('src', '/plants/manapouri.webp');
    await expect(photo).toHaveJSProperty('complete', true);
    expect(await photo.evaluate((el) => el.naturalWidth)).toBe(1600);   // the file is there
    const credit = page.locator('.photos figcaption');
    await expect(credit).toContainText('CC BY-SA 3.0');
    for (const a of await credit.locator('a').all()) await expect(a).toHaveAttribute('target', '_blank');
    await page.getByRole('button', { name: 'Location' }).click();
    await expect(page.locator('.photo .loc img')).toHaveAttribute('src', '/plants/aerial/manapouri-site.webp');
    await expect(page.locator('.photo .photos')).toHaveCount(0);
    await expect(page.locator('.loc figcaption')).toContainText('° S');   // the coordinates moved here from the side
  });

  test('facts keep their notes in an info button; related plants and the call to share sit below', async ({ page }) => {
    await page.goto('/plants/benmore');
    const facts = page.locator('section[aria-labelledby="facts-h"]');
    await expect(facts).not.toContainText('construction began');
    const tip = facts.getByRole('button', { name: 'More about commissioned' });
    await tip.scrollIntoViewIfNeeded();   // a scroll closes an open ⓘ, so be there before tapping it
    await page.waitForTimeout(300);
    await tip.click();
    await expect(page.locator('.info-pop-tip:visible')).toContainText('Construction began in 1958');
    await expect(page.locator('.main .related')).toContainText('Aviemore');
    await expect(page.locator('.side .related')).toHaveCount(0);
    await page.getByRole('link', { name: 'Share what you know' }).click();
    await expect(page).toHaveURL(/\/plants\/share\?plant=benmore/);
    await expect(page.locator('h1')).toHaveText('Share what you know about Benmore');
    await expect(page.getByRole('link', { name: 'Email us about Benmore' })).toHaveAttribute('href', /^mailto:hello@elenz\.co\.nz\?subject=About%20Benmore/);
  });
});

// the plant index (/plants): without a LINZ key (as in checks.yml) the map is the drawn outline
test.describe('plant index', () => {
  test('filters keep to the address, and a dot opens its plant in the panel', async ({ page }) => {
    await page.goto('/plants');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('.tbl tbody tr')).toHaveCount(20);
    await page.getByRole('button', { name: /^Show all \d+$/ }).click();
    await expect(page.locator('.tbl tbody tr')).toHaveCount(101);   // closed plants wait for "Show closed"
    await page.locator('.fuels').getByRole('button', { name: /^Geothermal/ }).click();
    await page.getByRole('group', { name: 'Island' }).getByRole('button', { name: 'North Island' }).click();
    await expect(page).toHaveURL(/fuel=geo/);
    await expect(page).toHaveURL(/island=NI/);
    await expect(page.locator('.tbl tbody tr').first()).toContainText('Geothermal');
    // the Taupō dots overlap on the outline map, so pick Wairākei's from the keyboard
    await page.locator('.outline .dot[aria-label^="Wairākei,"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#sel-h')).toHaveText('Wairākei');
    await expect(page.locator('#sel-h a')).toHaveAttribute('href', '/plants/wairakei');   // the name opens the page too
    await expect(page.locator('.side .thumb img')).toHaveAttribute('src', '/plants/wairakei.webp');
    await expect(page.locator('.side .ov')).toHaveText(/^A 136 MW geothermal station on the Wairākei geothermal field/);
    await expect(page.getByRole('link', { name: 'Open Wairākei’s page' })).toHaveAttribute('href', '/plants/wairakei');
    await expect(page).toHaveURL(/plant=wairakei/);
    await page.reload();
    await expect(page.locator('#sel-h')).toHaveText('Wairākei');
    await expect(page.locator('.fuels .fb.alone')).toContainText('Geothermal');
  });

  test('the fuel squares mix fuels, and the dots can show output now', async ({ page }) => {
    await page.goto('/plants');
    await page.getByRole('button', { name: 'Show Wind' }).click();
    await page.getByRole('button', { name: 'Show Hydro' }).click();
    await expect(page).toHaveURL(/fuel=(?!.*hydro)(?!.*wind)[a-z,]+/);
    await page.getByRole('button', { name: /^All fuels/ }).click();
    await page.locator('.fuels .nm', { hasText: 'Wind' }).click();   // the name: wind alone
    await page.getByRole('button', { name: 'Show Solar' }).click();   // then solar with it
    await expect(page).toHaveURL(/fuel=wind,solar|fuel=solar,wind/);
    await expect(page.locator('.tbl tbody tr').first()).toContainText(/Wind|Solar/);
    await page.getByRole('button', { name: 'Output now' }).click();
    await expect(page).toHaveURL(/size=now/);
    await expect(page.locator('.key')).toContainText('Size shows output now');
  });

  test('closed plants show when asked for, with the rest or on their own', async ({ page }) => {
    await page.goto('/plants?closed=1&q=otahuhu');
    await expect(page.locator('.tbl tbody tr')).toHaveCount(2);
    await expect(page.locator('.tbl tbody')).toContainText('Closed 2015');
    await page.goto('/plants?closed=only');
    await expect(page.locator('.tbl tbody tr')).toHaveCount(9);
    await expect(page.locator('select').filter({ hasText: 'Closed only' })).toHaveValue('only');
  });
});

test.describe('on a phone', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isPhone(testInfo), 'phones only'));

  // the tabs line is the widest thing on these pages: Reset took it past the smallest phones' width
  for (const path of ['/tracker', '/tracker/prices']) {
    test(`${path} fits a 320 px screen`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      await expect.poll(() => page.evaluate(sticksOut), { message: 'what sticks out past the side of the screen' }).toBe('');
    });
  }

  for (const path of ['/', '/now', '/tracker', '/tracker/prices', '/records', '/articles', '/about', '/plants/manapouri']) {
    test(`${path} fits the screen`, async ({ page }) => {
      await page.goto(path);
      await expect.poll(() => page.evaluate(sticksOut), { message: 'what sticks out past the side of the screen' }).toBe('');
    });
  }

  test('the tracker uses the phone layout', async ({ page }) => {
    await page.goto('/tracker');
    await expect(page.locator('.toolbar')).toBeVisible();
    // the control names (Range, Interval) are hidden on phones: a browser that skips the width rules shows them
    expect(await page.locator('.toolbar .ctl > span').first().evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  });
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });
  const PLAIN = {
    '/now': ['.kpis', '.below', '.status'],
    '/tracker': ['.toolbar', '.layout', '.lower', '.status'],
    '/tracker/prices': ['.toolbar', '.layout', '.p-row', '.status'],
  };
  for (const [path, gone] of Object.entries(PLAIN)) {
    test(`${path} shows one plain line`, async ({ page }) => {
      await page.goto(path);
      expect(await page.locator('body').innerText()).toContain('JavaScript turned on');   // Playwright's text finders skip <noscript>
      for (const s of gone) await expect(page.locator(s).first(), `${path} hides ${s}`).toBeHidden();
    });
  }
});

// opting out of the counts (src/app.html, /privacy#opt-out), 16 Nov 2026
test('?exclude-me saves the opt-out, leaves the address and says so; ?include-me undoes it', async ({ page }) => {
  await page.goto('/now?exclude-me');
  await expect(page.locator('#optout-note')).toContainText('left out');
  await expect(page).toHaveURL(/\/now$/);
  expect(await page.evaluate(() => localStorage.getItem('umami.disabled'))).toBe('1');
  await page.goto('/about?include-me');
  await expect(page.locator('#optout-note')).toContainText('counted');
  await expect(page).toHaveURL(/\/about$/);
  expect(await page.evaluate(() => localStorage.getItem('umami.disabled'))).toBeNull();
  // the links on /privacy load the page afresh, so the opt-out runs (a link inside the site wouldn't otherwise)
  await page.goto('/privacy');
  await page.locator('#opt-out').getByRole('link', { name: 'elenz.co.nz/?exclude-me' }).click();
  await expect(page.locator('#optout-note')).toContainText('left out');
  expect(await page.evaluate(() => localStorage.getItem('umami.disabled'))).toBe('1');
});

// the dashboards: the big-number dashboard and the power landscape, linked from Now since 16 Nov 2026
test.describe('dashboards', () => {
  test("Now's line under its heading opens each dashboard, and neither sends a heartbeat off elenz.co.nz", async ({ page }) => {
    const beats = [];
    page.on('request', (r) => { if (r.url().includes('/data/beat')) beats.push(r.url()); });
    for (const [name, path, shows] of [['big-number dashboard', '/dashboard', '.stage'], ['power landscape', '/landscape', '#cv']]) {
      await page.goto('/now');
      await page.locator('.hero .lede').getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(path + '$'));
      await expect(page.locator(shows).first()).toBeVisible();
    }
    expect(beats, 'heartbeats from a local build').toEqual([]);
  });

  test('the big-number dashboard opens the layout in its address and keeps a change in it', async ({ page }) => {
    await page.goto('/dashboard?bg=aurora&big=gen:NZ&small=hydro:NZ:pct,hvdc');
    await expect(page.locator('.stage .tile.big')).toHaveCount(1);
    await expect(page.locator('.stage .tile.small')).toHaveCount(2);
    await expect(page.locator('.stage .tile.big .num')).not.toHaveText('–');
    const customise = page.getByRole('button', { name: 'Customise' });   // open on wide screens, closed on phones
    if (await customise.getAttribute('aria-pressed') !== 'true') await customise.click();
    await page.getByRole('button', { name: 'Cook Strait' }).click();
    await expect(page).toHaveURL(/bg=strait/);
    // a value picked from the list replaces the tile's
    await page.getByRole('button', { name: /^Small 2: HVDC transfer/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Prices' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Price at Ōtāhuhu/ }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/small=hydro:NZ:pct,price_ota/);
    await expect(page.locator('.stage .tile.small').nth(1)).toContainText('Price at Ōtāhuhu');
    // kept in this browser: the bare address opens it again
    await page.goto('/dashboard');
    await expect(page.locator('.stage .tile.small').nth(1)).toContainText('Price at Ōtāhuhu');
  });

  test("the big-number dashboard's Groupings tab lists the tracker's groupings under their headings", async ({ page }) => {
    await page.goto('/dashboard?bg=aurora&big=gen:NZ&small=hvdc');
    await expect(page.locator('.stage .tile.big')).toHaveCount(1);   // the address's layout, once the page has started
    await expect(page.locator('.stage .tile.big .num')).not.toHaveText('–');
    const customise = page.getByRole('button', { name: 'Customise' });
    if (await customise.getAttribute('aria-pressed') !== 'true') await customise.click();
    await page.getByRole('button', { name: /^Small 1: HVDC transfer/ }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Groupings' }).click();
    for (const h of ['Renewable vs fossil', 'Inverter vs synchronous', 'Flexibility', 'Simplified', 'By owner', 'By hydro scheme']) {
      await expect(sheet.getByRole('heading', { name: h })).toBeVisible();
    }
    await sheet.getByRole('button', { name: /^Inverter-based/ }).click();
    await expect(page).toHaveURL(/small=inverter:NZ:pct/);
    await expect(page.locator('.stage .tile.small').first()).toContainText('Inverter-based');
    await expect(page.locator('.stage .tile.small .num').first()).not.toHaveText('–');
  });

  test('a long value shrinks to fit its card, and Simple hides the line under it', async ({ page }) => {
    await page.goto('/dashboard?bg=plain&col=0b1a33&view=simple&big=gen:NZ,price:NI&small=price:SI,co2rate:NZ,bigbatt,biggest&kiosk=1');
    await expect(page.locator('.stage .tile.big .num').first()).not.toHaveText('–');
    await expect(page.locator('.stage .sub')).toHaveCount(0);
    await expect(page.locator('.stage .live')).toHaveText(/^(Live|Delayed)$/);
    // every value and its unit fit inside their card
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.stage .row')]
      .filter((r) => { const n = r.querySelector('.num'); return n.scrollWidth > n.clientWidth + 1; }).length)).toBe(0);
  });

  test('the cards sit in the middle of the screen', async ({ page }) => {
    await page.goto('/dashboard?bg=aurora&big=gen:NZ&small=hvdc&kiosk=1');
    await expect(page.locator('.stage .tile.big')).toHaveCount(1);   // the address's layout, not the page's first paint
    await expect(page.locator('.stage .tile.big .num')).not.toHaveText('–');
    // how far the cards' middle is from the screen's, as a share of its height (measured again until the layout settles)
    await expect.poll(() => page.evaluate(() => {
      const st = document.querySelector('.stage').getBoundingClientRect(), c = document.querySelector('.stage .cards').getBoundingClientRect();
      return Math.abs((c.top + c.height / 2) - (st.top + st.height / 2)) / st.height;
    })).toBeLessThan(0.06);
  });

  test("Plain colour's own picker changes the screen, and the address once it's let go", async ({ page }, testInfo) => {
    test.skip(isPhone(testInfo), 'desktop only: the panel starts closed on phones');
    await page.goto('/dashboard?bg=plain&col=1f5f8b&big=gen:NZ&small=');
    await page.getByRole('button', { name: 'Pick any colour' }).click();
    const code = page.getByRole('textbox', { name: /Colour code/ });
    await expect(code).toHaveValue('#1f5f8b');
    await code.fill('#e0a526');
    await code.blur();
    await expect(page.locator('.stage .plain')).toHaveAttribute('style', /rgb\(224, 165, 38\)/);
    await expect(page).toHaveURL(/col=e0a526/);
    // light colours get dark ink
    await expect(page.locator('.stage')).toHaveAttribute('style', /--ink: ?#132020/);
  });

  test('the wall-screen link shows the screen alone', async ({ page }) => {
    await page.goto('/dashboard?bg=mix&big=gen:NZ,ren:NZ&small=&kiosk=1');
    await expect(page.locator('.stage .tile.big')).toHaveCount(2);
    await expect(page.locator('.mast-wrap')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Customise' })).toHaveCount(0);
  });

  test('the power landscape draws from the live data', async ({ page }) => {
    await page.goto('/landscape');
    await expect(page.locator('#k-gen')).toHaveText(/MW$/);
    await expect(page.locator('#dtable .drow')).toHaveCount(9);
    await page.getByRole('button', { name: 'Replay 24 h' }).click();
    await expect(page.locator('#scrub')).toBeVisible();
  });

  test("the landscape's replay has its own speed and cards setting", async ({ page }) => {
    await page.goto('/landscape');
    await expect(page.locator('#k-gen')).toHaveText(/MW$/);
    await expect(page.locator('#cards-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Replay 24 h' }).click();
    await expect(page.locator('#cards-btn')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#speed button', { hasText: '3 min' }).click();
    await expect(page).toHaveURL(/mode=replay/);
    await expect(page).toHaveURL(/speed=3/);
    await page.getByRole('button', { name: 'Right now' }).click();
    await expect(page.locator('#cards-btn')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Play with dials brings its sliders onto the screen with the picture', async ({ page }) => {
    await page.goto('/landscape');
    await expect(page.locator('#k-gen')).toHaveText(/MW$/);
    await expect(page.locator('.dmore')).toHaveCount(0);   // the dials' notes are in Using Elenz, not on the page
    await page.getByRole('button', { name: 'Play with dials' }).click();
    await expect(page.locator('#sl-wind')).toBeVisible();
    await expect(page.locator('#sl-wind')).toBeInViewport();
    await expect(page.locator('#stage')).toBeInViewport();
    await expect(page.locator('#dials-h')).toHaveText('Your dials');
    // the sliders come straight after the picture, before the numbers
    const [dials, tiles] = await Promise.all(['.dials', '.kid'].map((s) => page.locator(s).evaluate((e) => e.getBoundingClientRect().top)));
    expect(dials).toBeLessThan(tiles);
  });

  test("the landscape's switches sit in Picture options, beside Keep screen on", async ({ page }) => {
    await page.goto('/landscape');
    await expect(page.locator('#k-gen')).toHaveText(/MW$/);
    await expect(page.locator('.controls').getByRole('button', { name: /Keep screen on/ })).toBeVisible();
    const opts = page.getByRole('button', { name: 'Picture options' });
    await expect(page.locator('#ls-opts')).toBeHidden();
    await opts.click();
    await expect(page.locator('#ls-opts')).toBeVisible();
    await page.locator('#labels-btn').click();
    await expect(page.locator('#labels-btn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#labels')).toBeHidden();
    await expect(page).toHaveURL(/names=0/);
    await expect(page.locator('#ls-opts')).toBeVisible();   // stays open for the next switch
    await page.keyboard.press('Escape');
    await expect(page.locator('#ls-opts')).toBeHidden();
    await expect(opts).toBeFocused();
    await opts.click();
    await page.locator('h1').click();
    await expect(page.locator('#ls-opts')).toBeHidden();
  });

  test("the landscape's wall-screen link shows the picture alone, in the linked view", async ({ page }) => {
    await page.goto('/landscape?mode=replay&names=0&kiosk=1');
    await expect(page.locator('#stage')).toBeVisible();
    await expect(page.locator('.controls')).toBeHidden();
    await expect(page.locator('.dials')).toBeHidden();
    await expect(page.locator('#labels')).toBeHidden();
    await expect(page.locator('#m-replay')).toHaveAttribute('aria-pressed', 'true');
  });

  for (const path of ['/dashboard', '/landscape']) {
    test(`${path} fits a phone's screen`, async ({ page }, testInfo) => {
      test.skip(!isPhone(testInfo), 'phones only');
      await page.goto(path);
      await expect.poll(() => page.evaluate(sticksOut), { message: 'what sticks out past the side of the screen' }).toBe('');
    });
  }
});
