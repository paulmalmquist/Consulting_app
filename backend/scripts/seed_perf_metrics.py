#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db import get_cursor  # noqa: E402


TIER_DEFAULTS = {
    "S": {"rows": 1_000, "businesses": 3},
    "M": {"rows": 100_000, "businesses": 30},
    "L": {"rows": 1_000_000, "businesses": 120},
}

METRIC_DEFS = [
    ("accounting_journal_debits", "Accounting Journal Debits", "USD", "sum"),
    ("accounting_journal_credits", "Accounting Journal Credits", "USD", "sum"),
    ("crm_open_opportunity_count", "CRM Open Opportunity Count", "count", "sum"),
    ("crm_open_pipeline_amount", "CRM Open Pipeline Amount", "USD", "sum"),
    ("repe_commitment_total", "REPE Commitment Total", "USD", "sum"),
    ("repe_distribution_total", "REPE Distribution Total", "USD", "sum"),
]

for i in range(1, 15):
    METRIC_DEFS.append(
        (
            f"perf_synthetic_metric_{i:02d}",
            f"Perf Synthetic Metric {i:02d}",
            "count",
            "sum",
        )
    )


def _uuid_from(label: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, label))


def _ensure_dim_dates(cur, days: int = 370) -> None:
    start = date.today() - timedelta(days=days)
    rows = []
    for i in range(days + 1):
        d = start + timedelta(days=i)
        rows.append(
            (
                int(d.strftime("%Y%m%d")),
                d.isoformat(),
                d.year,
                ((d.month - 1) // 3) + 1,
                d.month,
                d.day,
                d.isoweekday(),
                int(d.strftime("%V")),
                d.isoweekday() in (6, 7),
            )
        )

    cur.executemany(
        """
        INSERT INTO dim_date (
          date_key, full_date, year, quarter, month, day, day_of_week, week_of_year, is_weekend
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (date_key) DO NOTHING
        """,
        rows,
    )


def _ensure_lineage(cur, tenant_id: str, tier: str, dataset_version: str) -> tuple[str, str, str]:
    dataset_key = f"perf_metrics_{tier.lower()}_{dataset_version}"
    rule_key = f"perf_rules_{tier.lower()}"

    cur.execute(
        """
        INSERT INTO dataset (tenant_id, key, label, description)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (tenant_id, key) DO UPDATE SET label = EXCLUDED.label
        RETURNING dataset_id
        """,
        (tenant_id, dataset_key, f"Perf Dataset {tier}", "Deterministic perf seed dataset"),
    )
    dataset_id = str(cur.fetchone()["dataset_id"])

    cur.execute(
        """
        INSERT INTO dataset_version (dataset_id, version, row_count, checksum)
        VALUES (%s, 1, 0, %s)
        ON CONFLICT (dataset_id, version) DO UPDATE SET checksum = EXCLUDED.checksum
        RETURNING dataset_version_id
        """,
        (dataset_id, dataset_version),
    )
    dataset_version_id = str(cur.fetchone()["dataset_version_id"])

    cur.execute(
        """
        INSERT INTO rule_set (tenant_id, key, label, description)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (tenant_id, key) DO UPDATE SET label = EXCLUDED.label
        RETURNING rule_set_id
        """,
        (tenant_id, rule_key, f"Perf Rules {tier}", "Synthetic perf rule set"),
    )
    rule_set_id = str(cur.fetchone()["rule_set_id"])

    cur.execute(
        """
        INSERT INTO rule_version (rule_set_id, version, definition_json, checksum)
        VALUES (%s, 1, %s::jsonb, %s)
        ON CONFLICT (rule_set_id, version) DO UPDATE SET checksum = EXCLUDED.checksum
        RETURNING rule_version_id
        """,
        (rule_set_id, json.dumps({"tier": tier, "dataset_version": dataset_version}), dataset_version),
    )
    rule_version_id = str(cur.fetchone()["rule_version_id"])

    run_id = _uuid_from(f"perf-run-{tier}-{dataset_version}")
    cur.execute(
        """
        INSERT INTO run (run_id, tenant_id, business_id, dataset_version_id, rule_version_id, status, started_at, completed_at)
        VALUES (%s, %s, NULL, %s, %s, 'completed', now(), now())
        ON CONFLICT (run_id) DO UPDATE SET status = EXCLUDED.status
        """,
        (run_id, tenant_id, dataset_version_id, rule_version_id),
    )

    return dataset_version_id, rule_version_id, run_id


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed deterministic perf metrics data")
    parser.add_argument("--tier", choices=["S", "M", "L"], required=True)
    parser.add_argument("--dataset-version", default="perf_v1")
    parser.add_argument("--rows-target", type=int)
    parser.add_argument("--business-count", type=int)
    parser.add_argument(
        "--fixture-output",
        default=None,
        help="Output JSON fixture path. Default: backend/perf/fixtures/metrics_queries/<tier>.json",
    )
    args = parser.parse_args()

    defaults = TIER_DEFAULTS[args.tier]
    rows_target = args.rows_target or defaults["rows"]
    business_count = args.business_count or defaults["businesses"]

    tenant_slug = f"perf-{args.tier.lower()}-{args.dataset_version}"
    tenant_name = f"Performance Tenant {args.tier}"

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO tenant (tenant_id, name, slug)
            VALUES (%s, %s, %s)
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
            RETURNING tenant_id
            """,
            (_uuid_from(f"tenant-{tenant_slug}"), tenant_name, tenant_slug),
        )
        tenant_id = str(cur.fetchone()["tenant_id"])

        business_ids: list[str] = []
        for i in range(1, business_count + 1):
            slug = f"perf-{args.tier.lower()}-{i:03d}"
            name = f"Perf Biz {args.tier}-{i:03d}"
            business_id = _uuid_from(f"business-{tenant_slug}-{i:03d}")
            cur.execute(
                """
                INSERT INTO business (business_id, tenant_id, name, slug, region)
                VALUES (%s, %s, %s, %s, 'us')
                ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
                RETURNING business_id
                """,
                (business_id, tenant_id, name, slug),
            )
            business_ids.append(str(cur.fetchone()["business_id"]))

        metric_ids: list[str] = []
        for key, label, unit, aggregation in METRIC_DEFS:
            cur.execute(
                """
                INSERT INTO metric (tenant_id, key, label, unit, aggregation)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, key) DO UPDATE SET label = EXCLUDED.label
                RETURNING metric_id
                """,
                (tenant_id, key, label, unit, aggregation),
            )
            metric_ids.append(str(cur.fetchone()["metric_id"]))

        _ensure_dim_dates(cur)
        dataset_version_id, rule_version_id, run_id = _ensure_lineage(
            cur, tenant_id=tenant_id, tier=args.tier, dataset_version=args.dataset_version
        )

        cur.execute(
            "DELETE FROM fact_measurement WHERE tenant_id = %s AND dimension_key = 'perf_tier' AND dimension_value = %s",
            (tenant_id, args.tier),
        )

        cur.execute("CREATE TEMP TABLE perf_business_pool (seq int PRIMARY KEY, business_id uuid NOT NULL)")
        cur.execute("CREATE TEMP TABLE perf_metric_pool (seq int PRIMARY KEY, metric_id uuid NOT NULL)")
        cur.execute("CREATE TEMP TABLE perf_date_pool (seq int PRIMARY KEY, date_key int NOT NULL)")

        cur.executemany(
            "INSERT INTO perf_business_pool (seq, business_id) VALUES (%s, %s)",
            [(i + 1, b) for i, b in enumerate(business_ids)],
        )
        cur.executemany(
            "INSERT INTO perf_metric_pool (seq, metric_id) VALUES (%s, %s)",
            [(i + 1, m) for i, m in enumerate(metric_ids)],
        )

        cur.execute(
            """
            INSERT INTO perf_date_pool (seq, date_key)
            SELECT ROW_NUMBER() OVER (ORDER BY date_key), date_key
            FROM dim_date
            WHERE full_date >= CURRENT_DATE - INTERVAL '365 days'
            ORDER BY date_key
            """
        )

        cur.execute("SELECT COUNT(*) AS c FROM perf_date_pool")
        date_count = int(cur.fetchone()["c"])

        cur.execute(
            """
            INSERT INTO fact_measurement (
              tenant_id, business_id, metric_id, dimension_key, dimension_value,
              date_key, value, currency_code, dataset_version_id, rule_version_id, run_id
            )
            SELECT
              %s,
              b.business_id,
              m.metric_id,
              'perf_tier',
              %s,
              d.date_key,
              ROUND((((g.i * 17) %% 100000) / 10.0)::numeric, 4),
              CASE WHEN ((g.i %% 10) = 0) THEN 'USD' ELSE NULL END,
              %s,
              %s,
              %s
            FROM generate_series(1, %s) AS g(i)
            JOIN perf_business_pool b ON b.seq = ((g.i - 1) %% %s) + 1
            JOIN perf_metric_pool m ON m.seq = ((g.i - 1) %% %s) + 1
            JOIN perf_date_pool d ON d.seq = ((g.i - 1) %% %s) + 1
            """,
            (
                tenant_id,
                args.tier,
                dataset_version_id,
                rule_version_id,
                run_id,
                rows_target,
                len(business_ids),
                len(metric_ids),
                max(1, date_count),
            ),
        )

        cur.execute(
            "UPDATE dataset_version SET row_count = %s, checksum = %s WHERE dataset_version_id = %s",
            (rows_target, f"perf:{args.tier}:{args.dataset_version}:{rows_target}", dataset_version_id),
        )

    fixture_path = Path(
        args.fixture_output
        or f"backend/perf/fixtures/metrics_queries/{args.tier.lower()}.json"
    )
    fixture_path.parent.mkdir(parents=True, exist_ok=True)

    fixture = {
        "tier": args.tier,
        "dataset_version": args.dataset_version,
        "business_ids": business_ids,
        "metric_keys": [m[0] for m in METRIC_DEFS],
        "dimensions": [None, "date", "scope"],
        "metric_key_counts": [1, 5, min(20, len(METRIC_DEFS))],
        "date_ranges": [
            {"label": "7d", "days": 7},
            {"label": "90d", "days": 90},
            {"label": "365d", "days": 365},
        ],
    }
    fixture_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": True,
                "tier": args.tier,
                "rows_target": rows_target,
                "business_count": business_count,
                "fixture": str(fixture_path),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
