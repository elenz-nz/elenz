# Elenz

Live, open data on New Zealand's electricity system: generation by fuel and plant, wholesale prices, demand, HVDC
transfer and emissions, in the style of [Open Electricity](https://openelectricity.org.au). Built on free
Electricity Authority data (CC BY 4.0).

## How it fits together

```
                    Cloudflare cron (in the site's Worker)
                     │ every 5 min        │ every 6 h             │ every 15 min
                     ▼                    ▼                       ▼
EMI dispatch API ─► ingest/update.py   EMI daily files ─► ingest/history.py   .github/workflows/watchdog.yml
                     │ (GitHub Actions)  final prices,        │ (GitHub Actions)   opens an issue if data
                     │                   metered HVDC ────────┤                    goes stale
                     ▼                                        ▼
              Workers KV: tracker.json (7 days)     Workers KV: hist/* (since Sep 2020)
                     └──────────────► worker/index.js ◄───────┘
                                      serves the site (site/) and /data/*
```

Embedded solar is modelled (`ingest/rooftop.py`, `ingest/pv.py`: installed capacity from the EA registry, Himawari
satellite irradiance), and HVDC is metered or estimated (`ingest/hvdc.py`). Emissions are calculated in the
browser (`site/src/lib/tracker/emissions.js`). `analysis/` holds the scripts and evidence behind every estimate.

| Folder | What's in it |
| --- | --- |
| `site/` | The website (SvelteKit, built to static files and hosted on Cloudflare Workers; see `wrangler.jsonc`) |
| `worker/` | The Cloudflare Worker: serves the site and the data from KV, and starts the GitHub jobs on a schedule |
| `ingest/` | Python jobs that download EMI data and build the JSON the website reads |
| `facilities/` | Hand-maintained corrections to the EA plant register, and the embedded solar points and capacity |
| `analysis/` | Development scripts and the evidence for the embedded solar, HVDC and emission factor estimates |
| `data/` | Downloaded raw data. Not committed; recreate it with the ingest scripts |

## Running it on your own computer

You need [Node.js](https://nodejs.org) (version 22 or newer) and Python 3.11 or newer.

**Website only** (uses the data snapshot already in `site/static/data/`):

```
cd site
npm install
npm run dev
```

Then open http://localhost:5173.

**Refreshing the data:**

```
pip install -r ingest/requirements.txt
python3 ingest/sync.py all                 # plant register, irradiance, last week of daily files
python3 ingest/emi_live.py latest          # newest 5-minute interval (needs an EMI API key, below)
python3 ingest/build_tracker.py            # rebuild site/static/data/tracker.json
```

The live API needs a free key from [emi.developer.azure-api.net](https://emi.developer.azure-api.net) (subscribe to
"Wholesale market prices"). Put it in a file called `.emi_key` in this folder, or set the `EMI_KEY` environment
variable. `.emi_key` is git-ignored; never commit the key.

## How the live data updates

`.github/workflows/update-data.yml` runs `ingest/update.py` on GitHub every 5 minutes, started by a Cloudflare cron
trigger in the site's Worker (GitHub's own schedule is too unreliable to depend on). It fetches new intervals from
the EMI API, keeps a compact 7-day store (`state.csv.gz`) and rebuilds `tracker.json`, saving both to Cloudflare
Workers KV. The site's Worker (`worker/index.js`) serves `/data/tracker.json` from KV, so code changes and data
updates never overwrite each other. It needs three repository secrets: `EMI_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`.

Run the same job on your own computer with `python3 ingest/update.py` (it uses `data/store/` instead of KV).

History: `.github/workflows/history.yml` runs `ingest/history.py` every 6 hours, adding newly published daily
dispatch files, final prices and metered HVDC flows to the monthly history in KV (at most 280 KV writes a day).

## When the build warns about a unit

New plant appears in the dispatch feed months before the EA's plant register catches up. If
`build_tracker.py` prints `WARNING unmapped generating units`, add the unit to `[units]` in
`facilities/overrides.toml` with its fuel and plant name, then rebuild.

## Data and licence

Data from www.emi.ea.govt.nz provided by the Electricity Authority (New Zealand), CC BY 4.0.
Irradiance: Himawari satellite data (JMA/JAXA) via Open-Meteo, CC BY 4.0.
