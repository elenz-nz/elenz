"""How many screens were left open on Now, the dashboard and the power landscape, hour by hour (NZ time), from the
heartbeats in Workers Analytics Engine (dataset elenz_beats; worker/index.js, site/src/lib/site/beat.js).

  CF_ACCOUNT_ID=... CF_ANALYTICS_TOKEN=... python3 analysis/open_screens.py [days, default 7]

CF_ANALYTICS_TOKEN is a Cloudflare API token with the one permission Account > Account Analytics > Read (step by step
in docs/architecture.md, Worker). Analytics Engine keeps three months of rows.

Prints, for each hour with any beat: the screens open on each page (a screen is one page load), how many of them were on
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

# one row per page load per hour: whether it was on screen at all, and the most minutes it reported
SQL = """
SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob1 AS page, index1 AS id, blob3 AS opened,
       max(double1) AS minutes, sum(if(blob2 = 'visible', 1, 0)) AS shown, sum(_sample_interval) AS beats
FROM elenz_beats
WHERE timestamp > NOW() - INTERVAL '{days}' DAY
GROUP BY hour, page, id, opened
ORDER BY hour
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
    hours = defaultdict(lambda: {p: [0, 0, 0] for p in PAGES})
    longest = {}
    for r in rows:
        if r['page'] not in PAGES:
            continue
        h = hours[nz_hour(r['hour'])][r['page']]
        h[0] += 1
        h[1] += int(float(r['shown'])) > 0
        h[2] += r['opened'] == 'kiosk'
        key = (r['page'], r['id'])
        longest[key] = max(longest.get(key, 0), float(r['minutes']))
    return dict(sorted(hours.items())), longest


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
