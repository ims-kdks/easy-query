# Synthetic urban mobility demo data

This script creates a deterministic, fictional urban-mobility dataset in the
`metro_move` Postgres schema. It does not use external datasets and contains no
real people, trips, organizations, or personal contact details. Names and model
codes are generated solely for this demonstration and are not intended to
represent real entities.

The generated tables cover neighborhoods, stations, vehicles, anonymous rider
profiles, hourly weather, trips, and maintenance events. The data intentionally
contains stable patterns involving commuting, rain, weekends, seasonal demand,
an August festival, and higher maintenance rates for the neutral `Model-E2`
vehicle model.

## Run

The script uses inline Python dependency metadata, so `uv` installs the required
Postgres driver without creating a project-wide Python environment.

Preview deterministic row counts without connecting to a database:

```bash
uv run scripts/metro_move/seed.py --dry-run
```

Seed the database referenced by the ignored `.env.local` file:

```bash
uv run --env-file .env.local scripts/metro_move/seed.py
```

Verify database row counts without changing data:

```bash
uv run --env-file .env.local scripts/metro_move/seed.py --verify-only
```

The script refuses to overwrite an existing `metro_move` schema. To deliberately
drop and recreate only that schema:

```bash
uv run --env-file .env.local scripts/metro_move/seed.py --reset
```

## Example questions

- Which stations have the largest outbound imbalance during weekday mornings?
- How does rain change trip volume for annual members versus day-pass riders?
- Which vehicle models have the highest repair cost per 1,000 trips?
- What is the seven-day moving average of daily trip volume?
- Which neighborhoods gained the most weekend arrivals during the August festival?

The generator seed, date range, and synthetic-data declarations are also stored
inside `metro_move.dataset_metadata` for discovery from SQL clients.
