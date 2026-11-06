// A warning, never a failure: a method page whose listed code (`code` in the registry) has changed since its `reviewed`
// date. Clear it by reviewing the page, or put [method unchanged] in the commit message of a change that doesn't touch
// the method. Needs the whole git history (fetch-depth: 0 in checks.yml). Run by `npm run check:previews`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
const registry = readFileSync(join(ROOT, 'site/src/lib/methods/registry.ts'), 'utf8');
const topics = [...registry.matchAll(/slug: '([a-z-]+)'[\s\S]*?reviewed: '(\d{4}-\d{2}-\d{2})',\s*code: \[([^\]]*)\]/g)]
	.map(([, slug, reviewed, code]) => ({ slug, reviewed, code: [...code.matchAll(/'([^']+)'/g)].map((m) => m[1]) }));

let stale = 0;
const warn = (text) => {
	stale++;
	console.log(process.env.GITHUB_ACTIONS ? `::warning title=Method page review::${text}` : `warning: ${text}`);
};

let shallow = 'true';
try { shallow = git('rev-parse', '--is-shallow-repository'); } catch { /* not a git checkout */ }
if (shallow === 'true') {
	console.log('method reviews: skipped, this checkout has no history');
} else {
	for (const { slug, reviewed, code } of topics) {
		for (const path of code) {
			if (!existsSync(join(ROOT, path))) { warn(`${slug}: ${path} is listed in the registry but doesn't exist`); continue; }
			const since = git('log', `--after=${reviewed}T23:59:59+13:00`, '--format=%h', '--invert-grep', '--grep=\\[method unchanged\\]', '--', path);
			if (since) warn(`${slug} (reviewed ${reviewed}): ${path} has changed since, ${since.split('\n').join(', ')}`);
		}
	}
	console.log(`method reviews: ${topics.length} pages checked, ${stale} warning${stale === 1 ? '' : 's'}`);
}
