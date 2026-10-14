# Elenz

Live, open data on New Zealand's electricity system: generation by fuel and plant, wholesale prices, demand, HVDC
transfer and emissions, in the style of [Open Electricity](https://openelectricity.org.au). Built on free
Electricity Authority data (CC BY 4.0).

## How it fits together

```
EMI real-time dispatch API ──► ingest/emi_live.py ──► data/raw/api/      ┐
EMI daily dispatch files   ──► ingest/sync.py     ──► data/raw/daily/    ├─► ingest/build_tracker.py ──► site/static/data/tracker.json ──► website
EA plant register, irradiance ► ingest/sync.py    ──► data/ref/          ┘                ▲
                                                        facilities/ (curated corrections) ┘
```

| Folder | What's in it |
| --- | --- |
| `site/` | The website (SvelteKit, built to static files and hosted on Cloudflare Workers; see `wrangler.jsonc`) |
| `ingest/` | Python jobs that download EMI data and build the JSON the website reads |
| `facilities/` | Hand-maintained corrections to the EA plant register: new plant, moved connections, fuel labels |
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

`.github/workflows/update-data.yml` runs `ingest/update.py` on GitHub every 5 minutes. It fetches new intervals from
the EMI API, keeps a compact 7-day store (`state.csv.gz`) and rebuilds `tracker.json`, saving both to Cloudflare
Workers KV. The site's Worker (`worker/index.js`) serves `/data/tracker.json` from KV, so code changes and data
updates never overwrite each other. It needs three repository secrets: `EMI_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`.

Run the same job on your own computer with `python3 ingest/update.py` (it uses `data/store/` instead of KV).

## When the build warns about a unit

New plant appears in the dispatch feed months before the EA's plant register catches up. If
`build_tracker.py` prints `WARNING unmapped generating units`, add the unit to `[units]` in
`facilities/overrides.toml` with its fuel and plant name, then rebuild.

## Data and licence

Data from www.emi.ea.govt.nz provided by the Electricity Authority (New Zealand), CC BY 4.0.
Irradiance from Open-Meteo, CC BY 4.0.
