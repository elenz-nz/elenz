// After the build: every method page has the seven standard sections in order, and every link to a section of a method
// page or the guide leads somewhere. Run by `npm run check:previews`.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUILD = 'build';
const SECTIONS = ['introduction', 'data-sources', 'how-it-works', 'interpretation', 'limitations', 'coverage', 'references'];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
	e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []);

const pages = new Map(walk(BUILD).map((f) => [`/${relative(BUILD, f).replace(/\.html$/, '')}`, readFileSync(f, 'utf8')]));
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const bad = [];

for (const [path, html] of pages) {
	if (path.startsWith('/methods/') && path !== '/methods/sources') {
		const at = SECTIONS.map((s) => html.indexOf(` id="${s}"`));
		if (at.some((p) => p < 0) || at.some((p, i) => i && p < at[i - 1])) bad.push(`${path}: the seven sections aren't all there in order`);
	}
	for (const [, target, hash] of html.matchAll(/href="(\/methods(?:\/[a-z-]+)?|\/guide)#([^"]+)"/g)) {
		const page = pages.get(target);
		if (page && !ids(page).has(hash)) bad.push(`${path}: ${target}#${hash} leads nowhere`);
	}
}

if (bad.length) {
	console.error(bad.join('\n'));
	process.exit(1);
}
console.log('method pages: sections in order, every section link leads somewhere');
