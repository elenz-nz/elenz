// The Elenz Worker.
//  fetch:     serves the site's static files, except /data/tracker.json, which comes from Workers KV (written by
//             the GitHub Actions job). Until KV has data, the bundled snapshot is served.
//  scheduled: every 5 minutes (Cloudflare cron, see wrangler.jsonc), asks GitHub to run the data job. GitHub's own
//             schedule is unreliable for new repositories; on-demand runs start within seconds.
//             Needs the Worker secret GITHUB_TOKEN: a fine-grained token for stubzy19/elenz with Actions: read and write.
const DISPATCH = 'https://api.github.com/repos/stubzy19/elenz/actions/workflows/update-data.yml/dispatches';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/data/status.json' && env.DATA) {
      // last outcome of the scheduled trigger, for checking the pipeline without the Cloudflare dashboard
      const status = await env.DATA.get('cron-status');
      return new Response(status || '{"result":"no scheduled run recorded yet"}', {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === '/data/tracker.json' && env.DATA) {
      const body = await env.DATA.get('tracker.json', { type: 'stream', cacheTtl: 60 });
      if (body) {
        return new Response(body, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=60',
            'access-control-allow-origin': '*',
          },
        });
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env) {
    let result;
    if (!env.GITHUB_TOKEN) {
      result = 'GITHUB_TOKEN secret not set';
    } else {
      const r = await fetch(DISPATCH, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'elenz-cron',
        },
        body: JSON.stringify({ ref: 'main' }),
      });
      result = r.status === 204 ? 'ok' : `GitHub said HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`;
    }
    if (result !== 'ok') console.log(result);
    // record the outcome when it changes, or hourly, to stay well inside KV's free daily write limit
    if (env.DATA) {
      const now = new Date().toISOString();
      const prev = await env.DATA.get('cron-status', 'json');
      if (!prev || prev.result !== result || Date.parse(now) - Date.parse(prev.at) > 3600e3) {
        await env.DATA.put('cron-status', JSON.stringify({ at: now, cron: event.cron, result }));
      }
    }
  },
};
