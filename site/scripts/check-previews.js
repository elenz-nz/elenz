// After `npm run build`: every public page has its link-preview tags (src/lib/site/Preview.svelte) and its image
// exists. Pages marked noindex (drafts, the preview card itself) are skipped. Run by `npm run check:previews` and in
// .github/workflows/checks.yml.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUILD = new URL('../build/', import.meta.url).pathname, SITE = 'https://elenz.co.nz';
const pages = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? pages(p) : p.endsWith('.html') ? [p] : []; });
const meta = (html, key) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return m ? m[1] : null;
};
let bad = 0, n = 0;
for (const file of pages(BUILD).sort()) {
  const html = readFileSync(file, 'utf8'), page = '/' + relative(BUILD, file).replace(/(index)?\.html$/, '');
  if (/<meta name="robots" content="noindex"/.test(html)) continue;
  n++;
  const problems = [];
  for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) if (!meta(html, k)) problems.push(`no ${k}`);
  const img = meta(html, 'og:image');
  if (img && !img.startsWith(SITE + '/')) problems.push(`og:image isn't on ${SITE}: ${img}`);
  else if (img && !existsSync(join(BUILD, img.slice(SITE.length).split('?')[0]))) problems.push(`og:image file missing: ${img.slice(SITE.length)}`);
  const url = meta(html, 'og:url');
  if (url && url !== SITE + page.replace(/\/$/, '') && !(page === '/' && url === SITE + '/')) problems.push(`og:url is ${url}`);
  if (problems.length) { bad++; console.log(`${page}: ${problems.join('; ')}`); }
}
console.log(`${n} public pages checked, ${bad} with problems`);
process.exit(bad ? 1 : 0);
