# /// script
# requires-python = ">=3.12"
# dependencies = ["pyarrow>=21"]
# ///

"""Generate the synthetic urban-mobility demo dataset as Parquet files."""

from __future__ import annotations

import argparse
import math
import random
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

SEED = 20260902
START_DATE = date(2025, 1, 1)
DAY_COUNT = 365
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[2] / "static/demo/metro_move"
TABLES = (
    "dataset_metadata",
    "neighborhoods",
    "stations",
    "vehicles",
    "riders",
    "weather_hourly",
    "trips",
    "maintenance_events",
)

NEIGHBORHOODS = [
    (1, "Cedar Heights", "residential"),
    (2, "Maple Gardens", "residential"),
    (3, "North Commons", "residential"),
    (4, "Central Exchange", "business"),
    (5, "Market Quarter", "business"),
    (6, "Innovation District", "business"),
    (7, "Harbor Point", "leisure"),
    (8, "Museum Row", "leisure"),
    (9, "Riverwalk", "leisure"),
    (10, "Summit Campus", "education"),
]

TABLE_SCHEMAS = {
    "dataset_metadata": pa.schema(
        [("key", pa.string()), ("value", pa.string())]
    ),
    "neighborhoods": pa.schema(
        [
            ("neighborhood_id", pa.int16()),
            ("name", pa.string()),
            ("district_type", pa.string()),
        ]
    ),
    "stations": pa.schema(
        [
            ("station_id", pa.int32()),
            ("name", pa.string()),
            ("neighborhood_id", pa.int16()),
            ("station_type", pa.string()),
            ("capacity", pa.int16()),
            ("latitude", pa.float64()),
            ("longitude", pa.float64()),
            ("opened_on", pa.date32()),
        ]
    ),
    "vehicles": pa.schema(
        [
            ("vehicle_id", pa.int32()),
            ("vehicle_code", pa.string()),
            ("vehicle_type", pa.string()),
            ("model", pa.string()),
            ("commissioned_on", pa.date32()),
            ("status", pa.string()),
        ]
    ),
    "riders": pa.schema(
        [
            ("rider_id", pa.int32()),
            ("rider_code", pa.string()),
            ("membership_type", pa.string()),
            ("signup_date", pa.date32()),
            ("home_neighborhood_id", pa.int16()),
            ("age_group", pa.string()),
        ]
    ),
    "weather_hourly": pa.schema(
        [
            ("observed_at", pa.timestamp("us", tz="UTC")),
            ("temperature_c", pa.float64()),
            ("precipitation_mm", pa.float64()),
            ("wind_kph", pa.float64()),
            ("conditions", pa.string()),
        ]
    ),
    "trips": pa.schema(
        [
            ("trip_id", pa.int64()),
            ("started_at", pa.timestamp("us", tz="UTC")),
            ("ended_at", pa.timestamp("us", tz="UTC")),
            ("start_station_id", pa.int32()),
            ("end_station_id", pa.int32()),
            ("vehicle_id", pa.int32()),
            ("rider_id", pa.int32()),
            ("distance_km", pa.float64()),
            ("duration_minutes", pa.int16()),
            ("fare_usd", pa.float64()),
        ]
    ),
    "maintenance_events": pa.schema(
        [
            ("event_id", pa.int64()),
            ("vehicle_id", pa.int32()),
            ("reported_at", pa.timestamp("us", tz="UTC")),
            ("resolved_at", pa.timestamp("us", tz="UTC")),
            ("issue_type", pa.string()),
            ("severity", pa.string()),
            ("repair_cost_usd", pa.float64()),
        ]
    ),
}


def build_data() -> dict[str, list[tuple[object, ...]]]:
    rng = random.Random(SEED)

    stations: list[tuple[object, ...]] = []
    station_ids_by_type: dict[str, list[int]] = defaultdict(list)
    suffixes = ("Center", "North", "East", "South", "West", "Plaza")
    station_id = 1
    for neighborhood_id, name, district_type in NEIGHBORHOODS:
        for offset, suffix in enumerate(suffixes):
            station_type = {
                "residential": "street",
                "business": "transit_hub",
                "leisure": "park",
                "education": "campus",
            }[district_type]
            stations.append(
                (
                    station_id,
                    f"{name} {suffix}",
                    neighborhood_id,
                    station_type,
                    rng.randrange(18, 53),
                    round(40.0 + neighborhood_id * 0.012 + offset * 0.0017, 5),
                    round(-74.0 + neighborhood_id * 0.009 - offset * 0.0013, 5),
                    date(2018, 1, 1) + timedelta(days=rng.randrange(0, 2_100)),
                )
            )
            station_ids_by_type[district_type].append(station_id)
            station_id += 1

    model_options = [
        ("bike", "Model-C1", 0.42),
        ("e-bike", "Model-E1", 0.28),
        ("e-bike", "Model-E2", 0.18),
        ("scooter", "Model-S1", 0.12),
    ]
    vehicles: list[tuple[object, ...]] = []
    vehicle_ids_by_type: dict[str, list[int]] = defaultdict(list)
    vehicle_model_by_id: dict[int, str] = {}
    for vehicle_id in range(1, 1_001):
        vehicle_type, model, _ = rng.choices(
            model_options, weights=[item[2] for item in model_options], k=1
        )[0]
        vehicles.append(
            (
                vehicle_id,
                f"MM-{vehicle_id:04d}",
                vehicle_type,
                model,
                date(2021, 1, 1) + timedelta(days=rng.randrange(0, 1_460)),
                "active",
            )
        )
        vehicle_ids_by_type[vehicle_type].append(vehicle_id)
        vehicle_model_by_id[vehicle_id] = model

    riders: list[tuple[object, ...]] = []
    rider_ids_by_membership: dict[str, list[int]] = defaultdict(list)
    for rider_id in range(1, 15_001):
        membership_type = rng.choices(
            ["annual", "monthly", "day_pass"], weights=[0.52, 0.28, 0.20], k=1
        )[0]
        riders.append(
            (
                rider_id,
                f"R-{rider_id:05d}",
                membership_type,
                date(2021, 1, 1) + timedelta(days=rng.randrange(0, 1_460)),
                rng.choice([item[0] for item in NEIGHBORHOODS]),
                rng.choices(
                    ["18-24", "25-34", "35-44", "45-54", "55+"],
                    weights=[0.17, 0.34, 0.25, 0.15, 0.09],
                    k=1,
                )[0],
            )
        )
        rider_ids_by_membership[membership_type].append(rider_id)

    weather: list[tuple[object, ...]] = []
    precipitation_by_day: dict[date, float] = {}
    for day_offset in range(DAY_COUNT):
        current_date = START_DATE + timedelta(days=day_offset)
        seasonal_temperature = 13 + 12 * math.sin(
            2 * math.pi * (day_offset - 105) / DAY_COUNT
        )
        rainy_day = rng.random() < (0.24 if current_date.month in {6, 7, 8} else 0.31)
        rain_start = rng.randrange(0, 18) if rainy_day else -1
        rain_length = rng.randrange(2, 9) if rainy_day else 0
        daily_precipitation = 0.0
        for hour in range(24):
            observed_at = datetime.combine(current_date, time(hour), tzinfo=UTC)
            temperature = (
                seasonal_temperature
                + 4 * math.sin(2 * math.pi * (hour - 8) / 24)
                + rng.uniform(-1.8, 1.8)
            )
            precipitation = (
                round(rng.uniform(0.4, 3.8), 1)
                if rain_start <= hour < rain_start + rain_length
                else 0.0
            )
            daily_precipitation += precipitation
            if precipitation and temperature < 1.5:
                conditions = "snow"
            elif precipitation:
                conditions = "rain"
            elif rng.random() < 0.38:
                conditions = "cloudy"
            else:
                conditions = "clear"
            weather.append(
                (
                    observed_at,
                    round(temperature, 1),
                    precipitation,
                    round(max(2.0, rng.gauss(13 if rainy_day else 9, 3.2)), 1),
                    conditions,
                )
            )
        precipitation_by_day[current_date] = daily_precipitation

    all_station_ids = [row[0] for row in stations]
    weekday_hours = [
        1,
        1,
        1,
        1,
        1,
        2,
        5,
        10,
        14,
        9,
        5,
        5,
        6,
        6,
        6,
        7,
        11,
        15,
        12,
        8,
        5,
        3,
        2,
        1,
    ]
    weekend_hours = [
        1,
        1,
        1,
        1,
        1,
        1,
        2,
        3,
        5,
        7,
        9,
        11,
        12,
        12,
        11,
        10,
        9,
        8,
        7,
        5,
        4,
        3,
        2,
        1,
    ]
    trips: list[tuple[object, ...]] = []
    trip_count_by_vehicle: Counter[int] = Counter()
    trip_id = 1
    for day_offset in range(DAY_COUNT):
        current_date = START_DATE + timedelta(days=day_offset)
        weekend = current_date.weekday() >= 5
        seasonal_factor = (
            0.78
            + 0.30 * (1 + math.sin(2 * math.pi * (day_offset - 105) / DAY_COUNT)) / 2
        )
        rain_factor = max(0.58, 1 - precipitation_by_day[current_date] / 45)
        festival_factor = (
            1.35 if date(2025, 8, 14) <= current_date <= date(2025, 8, 23) else 1.0
        )
        trips_today = round(
            300
            * seasonal_factor
            * rain_factor
            * (1.12 if weekend else 1.0)
            * festival_factor
        )
        for _ in range(trips_today):
            hour = rng.choices(
                range(24), weights=weekend_hours if weekend else weekday_hours, k=1
            )[0]
            if not weekend and 6 <= hour <= 9:
                start_pool = station_ids_by_type["residential"]
                end_pool = station_ids_by_type["business"]
            elif not weekend and 16 <= hour <= 19:
                start_pool = station_ids_by_type["business"]
                end_pool = station_ids_by_type["residential"]
            elif weekend and rng.random() < 0.58:
                start_pool = all_station_ids
                end_pool = station_ids_by_type["leisure"]
            else:
                start_pool = all_station_ids
                end_pool = all_station_ids
            start_station_id = rng.choice(start_pool)
            end_station_id = rng.choice(end_pool)
            while end_station_id == start_station_id:
                end_station_id = rng.choice(end_pool)

            raining = precipitation_by_day[current_date] > 3
            membership_type = rng.choices(
                ["annual", "monthly", "day_pass"],
                weights=[
                    0.57,
                    0.26,
                    (0.38 if weekend else 0.17) * (0.55 if raining else 1),
                ],
                k=1,
            )[0]
            rider_id = rng.choice(rider_ids_by_membership[membership_type])
            vehicle_type = rng.choices(
                ["bike", "e-bike", "scooter"],
                weights=[0.50, 0.42, 0.03 if raining else 0.14],
                k=1,
            )[0]
            vehicle_id = rng.choice(vehicle_ids_by_type[vehicle_type])
            trip_count_by_vehicle[vehicle_id] += 1

            distance_km = min(18.0, 0.35 + rng.gammavariate(2.2, 1.05))
            speed_kph = {"bike": 14.0, "e-bike": 19.0, "scooter": 16.0}[vehicle_type]
            duration = max(
                3, round(distance_km / speed_kph * 60 * rng.uniform(0.9, 1.25) + 2)
            )
            started_at = datetime.combine(
                current_date, time(hour), tzinfo=UTC
            ) + timedelta(minutes=rng.randrange(60), seconds=rng.randrange(60))
            base_fare, minute_rate = {
                "annual": (0.20, 0.08),
                "monthly": (0.50, 0.10),
                "day_pass": (2.50, 0.24),
            }[membership_type]
            trips.append(
                (
                    trip_id,
                    started_at,
                    started_at + timedelta(minutes=duration),
                    start_station_id,
                    end_station_id,
                    vehicle_id,
                    rider_id,
                    round(distance_km, 2),
                    duration,
                    round(base_fare + duration * minute_rate, 2),
                )
            )
            trip_id += 1

    maintenance_events: list[tuple[object, ...]] = []
    event_id = 1
    for vehicle_id, trip_count in sorted(trip_count_by_vehicle.items()):
        model = vehicle_model_by_id[vehicle_id]
        event_count = int(
            trip_count
            / 65
            * {"Model-C1": 0.85, "Model-E1": 1.05, "Model-E2": 1.85, "Model-S1": 1.25}[
                model
            ]
            + rng.random()
        )
        issue_weights = {
            "Model-C1": [0.36, 0.01, 0.42, 0.03, 0.18],
            "Model-E1": [0.24, 0.28, 0.24, 0.18, 0.06],
            "Model-E2": [0.18, 0.42, 0.16, 0.20, 0.04],
            "Model-S1": [0.24, 0.24, 0.30, 0.18, 0.04],
        }[model]
        for _ in range(event_count):
            issue = rng.choices(
                ["brakes", "battery", "tire", "electronics", "frame"],
                weights=issue_weights,
                k=1,
            )[0]
            severity = rng.choices(
                ["low", "medium", "high"], weights=[0.52, 0.36, 0.12], k=1
            )[0]
            reported_at = datetime(2025, 1, 1, tzinfo=UTC) + timedelta(
                minutes=rng.randrange(DAY_COUNT * 24 * 60)
            )
            repair_hours = {
                "low": rng.uniform(1, 6),
                "medium": rng.uniform(6, 24),
                "high": rng.uniform(24, 72),
            }[severity]
            issue_cost = {
                "brakes": 45,
                "battery": 180,
                "tire": 32,
                "electronics": 125,
                "frame": 210,
            }[issue]
            severity_factor = {"low": 0.75, "medium": 1.15, "high": 1.65}[severity]
            maintenance_events.append(
                (
                    event_id,
                    vehicle_id,
                    reported_at,
                    reported_at + timedelta(hours=repair_hours),
                    issue,
                    severity,
                    round(issue_cost * severity_factor * rng.uniform(0.85, 1.2), 2),
                )
            )
            event_id += 1

    return {
        "dataset_metadata": [
            ("dataset_name", "Synthetic Urban Mobility Demo"),
            ("dataset_version", "1"),
            ("description", "Fictional synthetic urban-mobility demo data"),
            ("generator_seed", str(SEED)),
            ("date_range", "2025-01-01 through 2025-12-31"),
            ("contains_real_people", "false"),
            ("uses_third_party_data", "false"),
        ],
        "neighborhoods": NEIGHBORHOODS,
        "stations": stations,
        "vehicles": vehicles,
        "riders": riders,
        "weather_hourly": weather,
        "trips": trips,
        "maintenance_events": maintenance_events,
    }


def write_parquet_files(
    data: dict[str, list[tuple[object, ...]]], output_dir: Path
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata = {
        b"easy_query_dataset": b"metro_move",
        b"synthetic": b"true",
        b"uses_third_party_data": b"false",
    }

    for table_name in TABLES:
        rows = data[table_name]
        schema = TABLE_SCHEMAS[table_name].with_metadata(
            {**metadata, b"table": table_name.encode()}
        )
        columns = zip(*rows, strict=True)
        arrays = [
            pa.array(values, type=field.type)
            for field, values in zip(schema, columns, strict=True)
        ]
        table = pa.Table.from_arrays(arrays, schema=schema)
        output_path = output_dir / f"{table_name}.parquet"
        pq.write_table(table, output_path, compression="zstd")
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"{output_path}: {table.num_rows:,} rows, {size_mb:.2f} MiB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate the deterministic dataset and print row counts without writing files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR}).",
    )
    args = parser.parse_args()

    data = build_data()
    if args.dry_run:
        for table_name in TABLES:
            print(f"{table_name}: {len(data[table_name]):,} rows")
        return

    write_parquet_files(data, args.output_dir)


if __name__ == "__main__":
    main()
