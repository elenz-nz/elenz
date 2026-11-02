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
  await page.locator('a.home').first().click();
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

test('an ⓘ opens the note it points to, after the page has hydrated', async ({ page }) => {
  await page.goto('/tracker');
  await expectShown(page, '/tracker');
  const tip = page.locator('button.info-tip').first();
  await tip.click();
  await expect(tip).toHaveAttribute('aria-expanded', 'true');
  const id = await tip.getAttribute('aria-controls');
  await expect(page.locator(`[id="${id}"]`)).toBeVisible();
});

test.describe('on a phone', () => {
  test.beforeEach(({}, testInfo) => test.skip(!isPhone(testInfo), 'phones only'));

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
