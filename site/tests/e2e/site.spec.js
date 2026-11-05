// The site in real browsers (playwright.config.js). They use the data bundled with the build, not the live site, so a
// pull request can still merge while the live site or its data is down (when a fix may be needed most).
//
// Each test comes from a fault that reached the live site on 2 Nov 2026: charts hidden after a click between pages
// (Chrome), then the desktop layout on phones. A refresh hid the first, so these go through the site's own links.
import { test as base, expect } from '@playwright/test';

// any uncaught error in the page fails the test. WebKit also reports cancelled requests as page errors ("... due to access
// control checks"), such as a data file cut off by a refresh; those aren't faults. The analytics script is blocked so
// the tests reach nothing outside the build.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    await page.route(/cloudflareinsights\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    page.on('pageerror', (e) => { if (!/access control checks/.test(e.message)) errors.push(e.message); });
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
  await page.route(/cloudflareinsights\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
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
      await expect(page.locator('.ts-grip').first()).toBeHidden();
      await expect(page.locator('.ts-grip').last()).toBeHidden();
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

  for (const path of ['/', '/now', '/tracker', '/tracker/prices', '/records', '/articles', '/about']) {
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
