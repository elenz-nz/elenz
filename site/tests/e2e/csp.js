// The Content-Security-Policy in the browser tests (design decision, 26 Nov 2026). `vite preview` doesn't read
// static/_headers, so each page is handed the policy _headers gives its path, as Cloudflare would; the <meta> policy is
// in the built pages already (vite.config.ts). Anything either policy blocks fails the test, so a new outside origin,
// an inline script SvelteKit didn't hash or a stray style source shows here before it reaches the site.
import { readFileSync } from 'node:fs';

const HEADERS = readFileSync(new URL('../../static/_headers', import.meta.url), 'utf8');

/** The Content-Security-Policy _headers gives a path: its own rule if it has one (the dashboards), else the /* rule. */
export function policyFor(path) {
  const block = (rule) => HEADERS.split(`\n${rule}\n`)[1]?.split('\n\n')[0] ?? '';
  const csp = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('Content-Security-Policy:')).pop()?.slice(24).trim();
  return csp(block(path.replace(/\.html$/, ''))) ?? csp(block('/*'));
}

/** Hands every page its policy and collects what the browser blocks; returns the list (empty when nothing was). */
export async function watchCsp(page) {
  const blocked = [];
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.resourceType() !== 'document' || !req.url().startsWith('http://localhost')) return route.fallback();
    const res = await route.fetch();
    const policy = policyFor(new URL(req.url()).pathname);
    return route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': policy } });
  });
  await page.exposeFunction('__cspBlocked', (s) => blocked.push(s));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) =>
    window.__cspBlocked(`${location.pathname}: ${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} ${e.sample || ''}`.trim())));
  return blocked;
}
