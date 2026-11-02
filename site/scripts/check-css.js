// After `npm run build`: the built CSS keeps its width rules in the old `max-width` form. Safari before 16.4 can't read
// the `width<=` form and skips the whole rule, so older iPhones got the desktop layout (2 Nov 2026; `cssTarget` in
// vite.config.ts stops the rewrite). Run by `npm run check:previews` and in .github/workflows/checks.yml.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../build/_app/immutable/assets/', import.meta.url).pathname;
const files = readdirSync(DIR).filter((f) => f.endsWith('.css'));
if (!files.length) { console.error('No built CSS found: run the build first.'); process.exit(1); }

const bad = files.filter((f) => /@media[^{]*\((?:width|height)\s*[<>]/.test(readFileSync(join(DIR, f), 'utf8')));
if (bad.length) {
  console.error(`Width rules older Safari can't read, in: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`${files.length} CSS files checked, width rules all readable by older Safari`);
