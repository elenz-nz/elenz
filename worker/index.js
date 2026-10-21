// The Elenz Worker.
//  fetch:     serves the site's static files, except /data/tracker.json and /data/history/*, which come from
//             Workers KV (written by the GitHub Actions jobs). Until KV has data, the bundled snapshot is served for
//             tracker.json; history returns 404 until the first history run. tracker.json carries an ETag (the
//             version tag the live job stores as KV metadata) and answers If-None-Match with 304.
//  health:    /data/health is 200 while live data and history are fresh, 503 with the reasons when not (for an
//             outside uptime monitor, which still works if the cron below stops).
//  scheduled: asks GitHub to run the data jobs. Every 5 minutes: the live update (update-data.yml), which waits
//             for the interval that has just begun (the EMI API publishes each 1-2 minutes after it starts). Every 6 hours:
//             the history update (history.yml), which adds newly published daily dispatch files, and the offers job
//             (offers.yml), which adds newly published daily offers files. GitHub's own
//             schedule is unreliable for new repositories; on-demand runs start within seconds. Every 15 minutes
//             (at :10, :25, :40, :55) also the watchdog (watchdog.yml), which raises an issue when data goes stale.
//             Needs the Worker secret GITHUB_TOKEN: a fine-grained token for elenz-nz/elenz with Actions: read and write.
//  previews: the tracker's pages (/tracker, /tracker/prices) pass through the Worker too ("run_worker_first" in
//             wrangler.jsonc), which puts what a linked view shows into the page title, og:title and og:url, e.g.
//             "Wind generation · North Island · 7 days to 18 Oct 2026", from its address (site/src/lib/site/viewurl.js,
//             shared with the pages). The pages are prerendered, so they can't do it themselves.
import { readQuery, writeQuery, describe, SITE_URL } from '../site/src/lib/site/viewurl.js';

const WORKFLOWS = 'https://api.github.com/repos/elenz-nz/elenz/actions/workflows';
const HISTORY_CRON = '40 */6 * * *'; // must match wrangler.jsonc
// history files the site may request: the index, all days, one half-hourly file per month, the records, and the
// offered capacity (ingest/offered.py: one file per month and all days)
// /data/health: the same limits as the GitHub watchdog (watchdog.yml)
const HEALTH = { liveMinutes: 30, historyDays: 5, rebuildDays: 12 };   // history may lag up to rebuildDays during a rebuild
const HISTORY_FILE = /^\/data\/history\/(index\.json|progress\.json|day\.json|records\.json|hh\/\d{4}-\d{2}\.json|tod\.json|off\/(?:\d{4}-\d{2}|days)\.json)$/;

// ---------- link previews for the tracker's pages ----------
// The pages carry their own preview tags (site/src/lib/site/Preview.svelte); for a linked view the Worker puts what
// the view shows into the title, og:title and og:url, e.g. "Wind generation · North Island · 7 days to 18 Oct 2026".
const PREVIEW_TABS = { '/tracker': 'generation', '/tracker/prices': 'prices' };
function withPreview(res, tab, url) {
  if (url.search.length < 2 || !res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  // the preview's address is the view's tidy form (unknown keys dropped)
  const q = readQuery(url.search), qs = writeQuery(q, { tDay: !/T\d/.test(url.searchParams.get('t') || '') });
  const title = `${describe(tab, q)} · ELENZ`;
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', title); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', SITE_URL + url.pathname + (qs ? '?' + qs : '')); } })
    .transform(res);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/data/health' && env.DATA) {
      // for an outside uptime monitor: 200 while the data is fresh, 503 (with the reasons) when it isn't. Unlike the
      // GitHub watchdog, it doesn't depend on the Worker's cron, so it also catches the cron itself stopping.
      const now = Date.now();
      const [live, index, cron, progress] = await Promise.all([
        env.DATA.getWithMetadata('tracker.json', { type: 'stream' }),
        env.DATA.get('hist/index.json', 'json'),
        env.DATA.get('cron-status', 'json'),
        env.DATA.get('hist/progress.json', 'json'),
      ]);
      // a rebuild republishes the index only when every month is done (a few days for the full history), so while
      // one is under way (months left, the job saving progress) the index may lag up to rebuildDays
      const rebuilding = !!(progress && progress.rebuild_left && progress.rebuild_left.length && progress.at && now - progress.at < 2 * 864e5);
      const histLimit = (rebuilding ? HEALTH.rebuildDays : HEALTH.historyDays) * 864e5;
      if (live.value) await live.value.cancel();  // only the version tag (metadata) is needed, not the file
      const problems = [];
      const end = live.metadata && live.metadata.end;
      if (!end) problems.push('live data has no version tag (the live job has not saved since the tag was added)');
      else if (now - end > HEALTH.liveMinutes * 60e3) problems.push(`live data is ${Math.round((now - end) / 60e3)} minutes old`);
      if (!index || !index.end) problems.push('history index missing');
      else if (now - index.end > histLimit) problems.push(`history is ${((now - index.end) / 864e5).toFixed(1)} days behind`);
      if (cron && cron.result !== 'ok') problems.push(`the Worker could not start the live job: ${cron.result}`);
      const body = {
        ok: !problems.length, problems,
        live_minutes_old: end ? Math.round((now - end) / 60e3) : null,
        history_days_behind: index && index.end ? +((now - index.end) / 864e5).toFixed(1) : null,
        history_rebuild_months_left: rebuilding ? progress.rebuild_left.length : 0,
        last_trigger: cron ? cron.at : null,
      };
      return new Response(JSON.stringify(body), {
        status: problems.length ? 503 : 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === '/data/status.json' && env.DATA) {
      // last outcome of the scheduled trigger, for checking the pipeline without the Cloudflare dashboard
      const [live, history] = await Promise.all([env.DATA.get('cron-status', 'json'), env.DATA.get('cron-status-history', 'json')]);
      const status = { ...(live || { result: 'no scheduled run recorded yet' }), history: history || { result: 'no history run triggered yet' } };
      return new Response(JSON.stringify(status), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === '/data/tracker.json' && env.DATA) {
      // the live job stores a version tag with the file (KV metadata, same write): sent as the ETag, so a browser
      // that already has this version gets 304 Not Modified (no body) instead of ~110 KB. Weak, because Cloudflare
      // compresses the response; the comparison ignores the W/ prefix either way.
      const { value: body, metadata } = await env.DATA.getWithMetadata('tracker.json', { type: 'stream', cacheTtl: 30 });
      if (body) {
        const headers = {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=30',
          'access-control-allow-origin': '*',
        };
        if (metadata && metadata.v) {
          headers.etag = `W/"${metadata.v}"`;
          const seen = (request.headers.get('if-none-match') || '').split(',').map((s) => s.trim().replace(/^W\//, ''));
          if (seen.includes(`"${metadata.v}"`) || seen.includes('*')) {
            await body.cancel();
            return new Response(null, { status: 304, headers });
          }
        }
        return new Response(body, { headers });
      }
    }
    const hist = url.pathname.match(HISTORY_FILE);
    if (hist && env.DATA) {
      const body = await env.DATA.get('hist/' + hist[1], { type: 'stream', cacheTtl: 600 });
      if (!body) return new Response('{"error":"not available yet"}', { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      return new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          // history changes a few times a day at most
          'cache-control': 'public, max-age=900',
          'access-control-allow-origin': '*',
        },
      });
    }
    const tab = PREVIEW_TABS[url.pathname];
    if (tab && request.method === 'GET') return withPreview(await env.ASSETS.fetch(request), tab, url);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env) {
    const history = event.cron === HISTORY_CRON;
    const workflow = history ? 'history.yml' : 'update-data.yml';
    const statusKey = history ? 'cron-status-history' : 'cron-status';
    const dispatch = async (wf) => {
      if (!env.GITHUB_TOKEN) return 'GITHUB_TOKEN secret not set';
      const r = await fetch(`${WORKFLOWS}/${wf}/dispatches`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'elenz-cron',
        },
        body: JSON.stringify({ ref: 'main' }),
      });
      return r.status === 204 ? 'ok' : `GitHub said HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`;
    };
    const result = await dispatch(workflow);
    // the offers job (offered capacity, ingest/offered.py) runs alongside the history job
    if (history) {
      const o = await dispatch('offers.yml');
      if (o !== 'ok') console.log('offers: ' + o);
    }
    if (!history && new Date(event.scheduledTime).getUTCMinutes() % 15 === 10) {
      const w = await dispatch('watchdog.yml');
      if (w !== 'ok') console.log('watchdog: ' + w);
    }
    if (result !== 'ok') console.log(result);
    // record the outcome when it changes, or hourly, to stay well inside KV's free daily write limit
    if (env.DATA) {
      const now = new Date().toISOString();
      const prev = await env.DATA.get(statusKey, 'json');
      if (history || !prev || prev.result !== result || Date.parse(now) - Date.parse(prev.at) > 3600e3) {
        await env.DATA.put(statusKey, JSON.stringify({ at: now, cron: event.cron, result }));
      }
    }
  },
};
