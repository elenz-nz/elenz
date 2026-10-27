# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (~4 days at the KV write budget). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

The last rebuild (BUILD 7, 23-27 Oct 2026: Mill Creek 2014-15, Kawerau TG1/TG2, West Wind as one plant, Ōtāhuhu
names, clock-change days before 2009, daily peak dispatchable output, small solar farms at Ashburton) finished on
27 Oct 2026 and its items were checked and removed. Add new items below as numbered sections, each saying what to
check once the rebuild has run.

Nothing is waiting.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
