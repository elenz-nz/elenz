// The Elenz Worker.
//  fetch:     serves the site's static files, except /data/tracker.json and /data/history/*, which come from
//             Workers KV (written by the GitHub Actions jobs). Until KV has data, the bundled snapshot is served for
//             tracker.json; history returns 404 until the first history run.
//  scheduled: asks GitHub to run the data jobs. Every 5 minutes: the live update (update-data.yml), which waits
//             for the interval that has just begun (the EMI API publishes each 1-2 minutes after it starts). Every 6 hours:
//             the history update (history.yml), which adds newly published daily dispatch files. GitHub's own
//             schedule is unreliable for new repositories; on-demand runs start within seconds. Every 15 minutes
//             (at :10, :25, :40, :55) also the watchdog (watchdog.yml), which raises an issue when data goes stale.
//             Needs the Worker secret GITHUB_TOKEN: a fine-grained token for stubzy19/elenz with Actions: read and write.
const WORKFLOWS = 'https://api.github.com/repos/stubzy19/elenz/actions/workflows';
const HISTORY_CRON = '40 */6 * * *'; // must match wrangler.jsonc
// history files the site may request: the index, all days, and one half-hourly file per month
const HISTORY_FILE = /^\/data\/history\/(index\.json|day\.json|hh\/\d{4}-\d{2}\.json)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/data/status.json' && env.DATA) {
      // last outcome of the scheduled trigger, for checking the pipeline without the Cloudflare dashboard
      const [live, history] = await Promise.all([env.DATA.get('cron-status', 'json'), env.DATA.get('cron-status-history', 'json')]);
      const status = { ...(live || { result: 'no scheduled run recorded yet' }), history: history || { result: 'no history run triggered yet' } };
      return new Response(JSON.stringify(status), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === '/data/tracker.json' && env.DATA) {
      const body = await env.DATA.get('tracker.json', { type: 'stream', cacheTtl: 30 });
      if (body) {
        return new Response(body, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=30',
            'access-control-allow-origin': '*',
          },
        });
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
