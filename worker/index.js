// Serves the site's static files, except /data/*, which comes from Workers KV (written every 5 minutes by the
// GitHub Actions job in .github/workflows/update-data.yml). Until KV has data, the bundled snapshot is served.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/data/') && env.DATA) {
      const key = url.pathname.slice('/data/'.length);
      if (key === 'tracker.json') {
        const body = await env.DATA.get(key, { type: 'stream', cacheTtl: 60 });
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
    }
    return env.ASSETS.fetch(request);
  },
};
