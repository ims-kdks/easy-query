# Synthetic urban mobility demo data

This script creates a deterministic, fictional urban-mobility dataset as eight
related Parquet files. It does not use external datasets and contains no real
people, trips, organizations, or personal contact details. Names and model codes
are generated solely for this demonstration and are not intended to represent
real entities.

The generated tables cover neighborhoods, stations, vehicles, anonymous rider
profiles, hourly weather, trips, and maintenance events. The data intentionally
contains stable patterns involving commuting, rain, weekends, seasonal demand,
an August festival, and higher maintenance rates for the neutral `Model-E2`
vehicle model.

By default, the files are written to `static/demo/metro_move`, where the Svelte
app and Vercel can serve them as static assets.

## Generate

The script uses inline Python dependency metadata, so `uv` installs PyArrow
without creating a project-wide Python environment.

Generate all demo files:

```bash
uv run scripts/metro_move/generate.py
```

Preview deterministic row counts without writing files:

```bash
uv run scripts/metro_move/generate.py --dry-run
```

Write to a different directory:

```bash
uv run scripts/metro_move/generate.py --output-dir /tmp/metro_move
```

Generation is deterministic and replaces only the eight expected Parquet files.

## Example questions

- Which stations have the largest outbound imbalance during weekday mornings?
- How does rain change trip volume for annual members versus day-pass riders?
- Which vehicle models have the highest repair cost per 1,000 trips?
- What is the seven-day moving average of daily trip volume?
- Which neighborhoods gained the most weekend arrivals during the August festival?

The generator seed, date range, and synthetic-data declarations are also stored
inside `dataset_metadata.parquet` for discovery through Easy Query.
