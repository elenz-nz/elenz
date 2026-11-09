# Elenz: notes for Claude

Public NZ electricity tracker at https://elenz.co.nz. Give step-by-step instructions for anything that has to be done
by hand (dashboards, accounts, settings). This repository is public: never commit keys, tokens or personal details.

Wording (everything public here: these notes, code comments, commit messages, pull requests, issues): the people behind
Elenz are "the Elenz team" or "we". A decision is a "design decision", a problem found in testing a "test report". Say
nothing about anyone's background or experience. "Owner" means a plant's owner, nothing else.

## Getting changes live

`main` is protected (ruleset "protect main", 23 Oct 2026): no direct pushes; every change goes in through a pull request,
and it can only merge once the `ingest` and `site` checks (checks.yml) pass. That gates both things a merge sets live: the
site (Cloudflare redeploys `main`) and the ingest code (the data jobs run from `main` within 5 minutes). Work on a branch,
push it, open a PR and turn on auto-merge so it merges itself when the checks go green:
`gh pr create --fill --base main && gh pr merge --auto --squash`. From a Claude session, where `gh pr` commands fail
(GraphQL isn't available), use the REST API: `gh api repos/elenz-nz/elenz/pulls -X POST -f head=<branch> -f base=main
-f title=... -f body=...`, then `gh api -X PUT repos/elenz-nz/elenz/pulls/<n>/ccr/auto_merge -f merge_method=squash`.
If a check fails, fix it on the branch; nothing reaches the site meanwhile. Then report the merge, or the failure, to
the Elenz team. Merged branches are deleted automatically.
Auto-merge only works while something is still to wait for: on a PR whose checks have all passed GitHub refuses it
(HTTP 422 "Pull request is in clean status"). Then merge it directly:
`gh api -X PUT repos/elenz-nz/elenz/pulls/<n>/merge -f merge_method=squash` (the checks still gate it: GitHub refuses a
merge while a required check is failing or pending). It also refuses (HTTP 405 "Protected branch update failed", the PR's `mergeable_state`
"unstable") while any check is still running, the preview's `Workers Builds` included, and auto-merge is refused
then too: wait until the PR reads "clean" and merge directly (31 Oct 2026, PR #49). After a squash merge, `git checkout main && git pull` before the
next branch; the old local branch has no remote any more, which is expected.
A merge doesn't always deploy: Cloudflare's production build for #46 (30 Oct 2026) never ran, and the site stayed on the
previous build. To check what is live, `https://elenz.co.nz/_app/version.json` holds the build time (ms since 1970,
UTC); it should be just after the merge. If it isn't, retry the build in the Cloudflare dashboard (Workers & Pages →
elenz → Deployments) or merge the next change. The `Workers Builds` check isn't reported on every main commit, so its
absence alone proves nothing.
A Claude session can't push until the repository is attached with push access (`add_repo`, owner `elenz-nz`, repo
`elenz`, access `push`); a push refused with "not in this session's authorized repository set" (HTTP 403) means that
step was skipped, not that anything is wrong with the repository or its token.
Commit as `Goyilee <207005500+Goyilee@users.noreply.github.com>` (`git -c user.name=... -c user.email=... commit`):
GitHub's email privacy setting refuses a push carrying any other address ("push declined due to email privacy
restrictions"). A Claude session can't create tags or releases, delete branches or take a pull request out of draft;
give the Elenz team step-by-step instructions for those.

Preview links (since 24 Oct 2026): Cloudflare Workers Builds builds every other branch with `npx wrangler preview`
(Worker Previews, open beta), so each pushed branch gets its own address, `https://<branch>-elenz.elenz.workers.dev`
(e.g. `preview-test-elenz`). The `previews` block in `wrangler.jsonc` points it at the live KV namespace, so it shows
live data; that's safe because only the Worker's scheduled handler writes to KV and previews run no crons. Its pages
keep elenz.co.nz as their canonical address, and every host but elenz.co.nz is sent `X-Robots-Tag: noindex`
(`site/static/_headers` for static files; `finish` in `worker/index.js` for the Worker's own responses), so
Google doesn't index previews as copies. `preview_urls` is set explicitly because `workers_dev` is off. The build's check on the pull request says whether it built. A new branch's first push doesn't always start one (2 Nov 2026, PR #59: no Workers check after 10 minutes and the preview answered 404); an empty commit started it.
Each branch's preview copies the dashboard's "Previews Base" build settings the first time it builds and keeps that copy:
after changing the base (preview command `npx wrangler preview`), an existing branch keeps its old settings, so use a
fresh branch. A preview build's check links under `.../previews/<branch>/builds/`; one under `.../production/builds/`
on a branch went down the wrong path.
When a change is something the Elenz team should see before it goes live, open the PR without auto-merge, send the preview
link, and once they've approved it merge it directly (by then its checks have passed, so auto-merge would be refused,
see above); turn on auto-merge instead only if a check is still running.

## Beta note (remove when the site is announced)

Until the site is announced every page shows a thin "Beta" line above the masthead (`site/src/lib/site/Masthead.svelte`,
`.beta-note` in `site/src/lib/tracker/tracker.css`). It has no end date: the Elenz team decides when to announce. Then
delete the markup, the styles (keeping `.mast-wrap` is harmless) and this section.

## Writing for the site

`docs/style-guide.md` is the style guide for everything public on the site: voice, terms, dates and numbers, status
labels, tables, method pages, the source register, ⓘ notes (team rules, 1 Nov 2026), Using Elenz and articles. Follow it
when writing or changing any page, chart note or label, and keep it up to date when a rule changes.


## Reference docs

This file holds the rules, the workflow and where things are. The detail is in these, read when a task needs them:

| Doc | Read it |
| --- | --- |
| `docs/architecture.md` | Before changing any part of the site, the ingest, the Worker or the workflows. Each part has its own section: files, design decisions and test reports. |
| `docs/data-notes.md` | Before changing the ingest: feed timings, file layouts, gaps and quirks, past history builds. |
| `analysis/README.md` | For the evidence behind any estimate or constant. |
| `docs/style-guide.md` | Before writing anything public. |
| `facilities/NEXT_REBUILD.md` | Before touching a fingerprinted file or starting a history rebuild. |

A pull request that changes how something works updates its section in the same pull request. New detail goes in those
docs, not here: keep this file short.

## Where things are

- `site/`: the SvelteKit site. Routes in `src/routes/`; shared pieces in `src/lib/site/`; the Generation tab's charts in
  `src/lib/tracker/` (`tracker.js`, `fuels.js`, `emissions.js`, `series.js`, `oemb.js`, `tracker.css`) and its lower
  cards in `src/lib/generation/`; the Prices tab in `src/lib/prices/`; Now in `src/lib/now/` and `src/lib/home/`;
  Records in `src/lib/records/`; Articles in `src/lib/articles/`; Data and methods in `src/lib/methods/`
  (`registry.ts`, `roles.ts`, `pages/`); the landing page's previews in `src/lib/landing/`. Tests in `site/tests/`
  (`npm test`) and `site/tests/e2e/` (browsers).
- `worker/index.js`: serves the site and `/data/*` from Workers KV, and its crons start the GitHub jobs. Tests in
  `worker/tests/`.
- `ingest/`: the Python data jobs. `update.py` (live, every 5 minutes), `history.py` (history since 1997, `BUILD`),
  `records.py`, `offered.py`, `embedded.py`, `rooftop.py`, `hvdc.py`, `explain.py`, `tod.py`, `capacity.py`,
  `plant_meta.py`. Tests in `ingest/tests/`.
- `facilities/`: curated tables (`overrides.toml`, `metered_plants.csv`, `embedded_points.csv`, `plant_capacity.csv`,
  `dispatch_adjust.json`, the plant register).
- `analysis/`: development scripts. `.github/workflows/`: checks, update-data, history, offers, watchdog. `data/`: raw
  downloads, git-ignored.

## Rules that apply everywhere

Each is explained in `docs/architecture.md`.

- Keep heavy work out of click handlers: a control answers at once and the view is built just after that paint
  (`soon()` in tracker.js, `afterPaint` on the Prices tab), so clicks stay under ~50 ms at phone speed. In tracker.js
  call `render()` when anything other than the hover point changes, `hover()` when only the point moves.
- Never put the no-JavaScript style in a page: the one rule is the `<noscript><style>` in `src/app.html`; mark what
  should go with the class `js-only` (`tests/noscript.test.js` checks).
- Older Safari: keep `build.cssTarget` in `vite.config.ts` (`scripts/check-css.js` fails if it goes). Safari 15 is the
  floor.
- A new public page needs a `<Preview>` (`npm run check:previews` fails without one) and an entry in the sitemap's list.
- When a method changes, update its method page and its `reviewed` date. A figure typed into a page must match the
  Python that holds it (`ingest/tests/method_constants.py`).
- Keep the How to panels and `/guide` up to date with what the tabs do, and redo the guide's screenshots
  (`analysis/guide_shots.py`) when a layout they show changes.
- Update the privacy page and its date if the analytics, browser storage, fonts or email setup change.
- A change to what the Worker does gets a Worker test; a new page or card with its own fault worth guarding gets a
  browser test. In a Claude session run the browser tests with
  `npx playwright test --project=chromium --project=phone-chrome` after a build (only Chromium is installed there).
- `ingest/requirements.txt` is locked to exact versions and hashes; refresh it from `ingest/requirements.in` (the
  command is at its top). Nothing else may be installed on the same `pip install -r` line.
- After editing `facilities/plant_capacity.csv`, run `python3 ingest/capacity.py` and commit both. After refreshing the
  register or editing the site-only tables, rerun `ingest/plant_meta.py` and commit the JSON.
- History rebuilds: bump `BUILD` in `ingest/history.py` after changing how months are built. A change to any
  fingerprinted file (listed in `facilities/NEXT_REBUILD.md`) rebuilds every month, so collect them on the
  `next-rebuild` branch, never on `main`, and never start a rebuild while another is running. After one that changes
  generation, run the Offers workflow with "resummarise".
- KV write budgets: `WRITE_BUDGET` is 3,000 in `history.py` and 1,000 in `offered.py` on Workers Paid. Back on the free
  plan they must return to 280 and 100.
- Site copy speaks as "we", never "I" or "me".

## Status

Live at https://elenz.co.nz: live data every 5 minutes, history since Aug 1997 (BUILD 12, 9 Nov 2026). The tag
`v0.9.0` (9 Nov 2026) marks the version that passed user acceptance testing. The site isn't announced yet (Beta note).
Next: plant pages (`/plants/<slug>`), the map, a hydro panel, offer stacks and downloads.

Recurring upkeep: add Genesis's Rankine coal share to `emissions.js` each quarter (performance report ~3 weeks
after quarter end; FY27 Q1 (23%) added 24 Oct 2026, FY27 Q2 due late Jan 2027); add each year's NZGA geothermal figures (NZ Geothermal Workshop,
November) and Contact's station figures (`GEO_CONTACT`, green borrowing update report, about September); renew the Worker's `GITHUB_TOKEN` before it expires (~Oct 2027).

Terms: the EA confirmed by email (21 Oct 2026) that the EMI datasets and the API are CC BY 4.0, covering republishing,
derived data and a possible paid API for commercial users; attribution is still required (the footer credit).

Coming change: the EA is decommissioning EMI (told us 21 Oct 2026). The real-time dispatch API is being rebuilt and will
need a new subscription; datasets move to the EA's Datasets pages (ea.govt.nz), and the way to fetch them
programmatically is likely to change, with plenty of warning. Everything that reads EMI: `emi_live.py` (API,
`EMI_KEY`), `common.py` `BLOB` (the emidatasets blob container: dispatch, final prices, metered files, offers, the
register) and `rooftop.py` (`GUEHMT` report). Watch for the EA's notice and plan the switch as one change.

