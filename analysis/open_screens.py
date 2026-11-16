"""How many screens were left open on Now, the dashboard and the power landscape, hour by hour (NZ time), from the
heartbeats in Workers Analytics Engine (dataset elenz_beats; worker/index.js, site/src/lib/site/beat.js).

  CF_ACCOUNT_ID=... CF_ANALYTICS_TOKEN=... python3 analysis/open_screens.py [days, default 7]

CF_ANALYTICS_TOKEN is a Cloudflare API token with the one permission Account > Account Analytics > Read (step by step
in docs/architecture.md, Worker). Analytics Engine keeps three months of rows.

The same tables are on the private page https://elenz.co.nz/data/screens?key=<SCREENS_KEY> (worker/screens.js),
which needs nothing installed. Prints, for each hour with any beat: the screens open on each page (a screen is one page load), how many of them were on
screen rather than hidden at some point in the hour, and how many came from a wall-screen link; then how long screens
stayed open. Standard library only.
"""
import json
import os
import statistics
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

NZ = ZoneInfo('Pacific/Auckland')
PAGES = ('now', 'dashboard', 'landscape')

# one row per page load per hour and state: the most minutes it reported (the same query as worker/screens.js, which
# draws this on the private page elenz.co.nz/data/screens)
SQL = """
SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob1 AS page, index1 AS id,
  blob2 AS shown, blob3 AS opened, blob4 AS country, max(double1) AS minutes, count() AS beats
FROM elenz_beats
WHERE timestamp > NOW() - INTERVAL '{days}' DAY
GROUP BY hour, page, id, shown, opened, country
ORDER BY hour
LIMIT 100000
FORMAT JSON
"""


def query(days):
    account, token = os.environ.get('CF_ACCOUNT_ID'), os.environ.get('CF_ANALYTICS_TOKEN')
    if not account or not token:
        sys.exit('Set CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN first (see the top of this file).')
    req = urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/analytics_engine/sql',
                                 data=SQL.format(days=int(days)).encode(), headers={'Authorization': f'Bearer {token}'})
    return json.load(urllib.request.urlopen(req, timeout=60))['data']


def nz_hour(text):
    # the API gives UTC times as '2026-11-17 08:00:00'
    return datetime.strptime(text, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).astimezone(NZ)


def summarise(rows):
    """Per NZ hour and page: screens open, of them on screen, of them from a wall-screen link; and each screen's
    longest time open, in minutes."""
    sets = defaultdict(lambda: {p: (set(), set(), set()) for p in PAGES})
    longest = {}
    for r in rows:
        if r['page'] not in PAGES:
            continue
        opened, shown, wall = sets[nz_hour(r['hour'])][r['page']]
        opened.add(r['id'])
        if r['shown'] == 'visible':
            shown.add(r['id'])
        if r['opened'] == 'kiosk':
            wall.add(r['id'])
        key = (r['page'], r['id'])
        longest[key] = max(longest.get(key, 0), float(r['minutes']))
    hours = {h: {p: [len(x) for x in by[p]] for p in PAGES} for h, by in sorted(sets.items())}
    return hours, longest


def main(days=7):
    hours, longest = summarise(query(days))
    if not hours:
        print(f'No heartbeats in the last {days} days.')
        return
    print('NZ hour            ' + ''.join(f'{p:>22}' for p in PAGES))
    print('                   ' + ''.join(f'{"open / shown / wall":>22}' for _ in PAGES))
    for h, by in hours.items():
        print(h.strftime('%a %d %b %H:00  ') + ''.join(f'{"%d / %d / %d" % tuple(by[p]):>22}' for p in PAGES))
    print()
    for p in PAGES:
        mins = sorted(m for (pg, _), m in longest.items() if pg == p)
        if mins:
            print(f'{p}: {len(mins)} screens; open a median {statistics.median(mins):.0f} min, '
                  f'{sum(m >= 60 for m in mins)} for an hour or more, longest {mins[-1] / 60:.1f} h')


if __name__ == '__main__':
    main(*sys.argv[1:])
