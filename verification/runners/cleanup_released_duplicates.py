"""Cleanup runner: downgrade duplicate released rows to 'superseded'.

For every authoritative-state table where multiple rows exist with
``promotion_state = 'released'`` for the same ``(entity, quarter)`` key:

  1. Pick the canonical row by ``released_at DESC NULLS LAST, created_at DESC``.
  2. Mark every other row as ``promotion_state = 'superseded'`` with
     ``superseded_at = now()`` and ``superseded_by = canonical.id``.
  3. After cleanup, create the partial unique index that hard-prevents
     duplicates from re-appearing.

Receipts:
  audit/asset_operating_cf_run/duplicate_cleanup/<run_id>/
    summary.md           — per-table counts of canonical kept / superseded
    fund_changes.csv     — every row whose state changed: id, fund, quarter,
                           prior_state, new_state, snapshot_version, etc.
    asset_changes.csv
    investment_changes.csv
    bridge_changes.csv

Run:
  python -m verification.runners.cleanup_released_duplicates --dry-run
  python -m verification.runners.cleanup_released_duplicates --apply

The dry-run prints the plan but does NOT mutate. Use ``--apply`` to commit.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
DSN = os.environ["DATABASE_URL"]

# (table_name, entity_id_column, label, has_canonical_metrics)
TABLES: list[tuple[str, str, str, bool]] = [
    ("re_authoritative_fund_state_qtr", "fund_id", "fund", True),
    ("re_authoritative_asset_state_qtr", "asset_id", "asset", True),
    ("re_authoritative_investment_state_qtr", "investment_id", "investment", True),
    ("re_authoritative_fund_gross_to_net_qtr", "fund_id", "bridge", False),
]


def find_duplicates(cur, table: str, entity_col: str) -> list[dict]:
    """Return rows from a table where (entity, quarter) has >1 released rows.

    Each result row carries the ``rank`` (1 = canonical) and metadata for
    the receipt CSV.
    """
    metrics_select = (
        "(canonical_metrics->>'gross_irr')::numeric AS gross_irr, "
        "(canonical_metrics->>'tvpi')::numeric AS tvpi"
        if table != "re_authoritative_fund_gross_to_net_qtr"
        else "NULL::numeric AS gross_irr, NULL::numeric AS tvpi"
    )
    cur.execute(
        f"""
        WITH dup_keys AS (
            SELECT {entity_col} AS entity_id, quarter
            FROM {table}
            WHERE promotion_state = 'released'
            GROUP BY {entity_col}, quarter
            HAVING COUNT(*) > 1
        ),
        ranked AS (
            SELECT
                s.id,
                s.{entity_col} AS entity_id,
                s.quarter,
                s.snapshot_version,
                s.audit_run_id,
                s.trust_status,
                s.released_at,
                s.created_at,
                {metrics_select},
                ROW_NUMBER() OVER (
                    PARTITION BY s.{entity_col}, s.quarter
                    ORDER BY s.released_at DESC NULLS LAST, s.created_at DESC
                ) AS rank
            FROM {table} s
            JOIN dup_keys d
              ON d.entity_id = s.{entity_col} AND d.quarter = s.quarter
            WHERE s.promotion_state = 'released'
        )
        SELECT * FROM ranked ORDER BY entity_id, quarter, rank
        """
    )
    return cur.fetchall() or []


def apply_cleanup(
    cur,
    table: str,
    entity_col: str,
    rows: list[dict],
    *,
    dry_run: bool,
) -> tuple[int, int, list[dict]]:
    """For every duplicate group, set rank=1 as canonical and rank>1 to superseded.

    Returns (kept_count, superseded_count, change_rows).
    """
    by_group: dict[tuple, list[dict]] = {}
    for r in rows:
        key = (r["entity_id"], r["quarter"])
        by_group.setdefault(key, []).append(r)

    kept = 0
    superseded = 0
    changes: list[dict] = []
    now = datetime.now(timezone.utc)

    for (_entity_id, _q), group in by_group.items():
        if len(group) < 2:
            continue
        canonical = group[0]
        kept += 1
        for old in group[1:]:
            superseded += 1
            change = {
                "row_id": str(old["id"]),
                "entity_id": str(old["entity_id"]),
                "quarter": old["quarter"],
                "prior_state": "released",
                "new_state": "superseded",
                "snapshot_version": old["snapshot_version"],
                "audit_run_id": str(old["audit_run_id"]),
                "trust_status": old["trust_status"],
                "released_at": str(old["released_at"]),
                "gross_irr": float(old["gross_irr"]) if old["gross_irr"] is not None else None,
                "tvpi": float(old["tvpi"]) if old["tvpi"] is not None else None,
                "superseded_by": str(canonical["id"]),
                "canonical_version": canonical["snapshot_version"],
                "canonical_released_at": str(canonical["released_at"]),
            }
            changes.append(change)

            if not dry_run:
                cur.execute(
                    f"""
                    UPDATE {table}
                    SET
                        promotion_state = 'superseded',
                        superseded_at = %s,
                        superseded_by = %s
                    WHERE id = %s AND promotion_state = 'released'
                    """,
                    (now, canonical["id"], old["id"]),
                )

    return kept, superseded, changes


def create_uniqueness_index(cur, table: str, entity_col: str, *, dry_run: bool) -> str:
    """Create the partial unique index that prevents future duplicates.

    Index is partial on ``promotion_state = 'released'`` so that older
    superseded rows don't conflict.
    """
    idx_name = f"idx_{table}_one_release_per_period_uq"
    sql = (
        f"CREATE UNIQUE INDEX IF NOT EXISTS {idx_name} "
        f"ON {table} ({entity_col}, quarter) "
        f"WHERE promotion_state = 'released'"
    )
    if not dry_run:
        cur.execute(sql)
    return sql


def write_receipts(run_id: str, results: dict[str, dict]) -> Path:
    receipt_root = (
        ROOT
        / "audit"
        / "asset_operating_cf_run"
        / "duplicate_cleanup"
        / run_id
    )
    receipt_root.mkdir(parents=True, exist_ok=True)

    summary_lines: list[str] = [
        "# Released-snapshot duplicate cleanup",
        "",
        f"**Run ID:** `{run_id}`",
        f"**Run at:** {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Per-table changes",
        "",
        "| Table | Canonical kept | Superseded | Index created |",
        "|---|---|---|---|",
    ]
    for table, label, _entity_col, _ in [
        ("re_authoritative_fund_state_qtr", "fund", "fund_id", True),
        ("re_authoritative_asset_state_qtr", "asset", "asset_id", True),
        ("re_authoritative_investment_state_qtr", "investment", "investment_id", True),
        ("re_authoritative_fund_gross_to_net_qtr", "bridge", "fund_id", False),
    ]:
        info = results.get(table, {})
        summary_lines.append(
            f"| `{table}` | {info.get('kept', 0)} | {info.get('superseded', 0)} | "
            f"`{info.get('index_sql', '—')[:60]}...` |"
        )

    summary_lines.append("")
    summary_lines.append("## Detail CSVs")
    summary_lines.append("")
    for table_label in ("fund", "asset", "investment", "bridge"):
        csv_path = receipt_root / f"{table_label}_changes.csv"
        if csv_path.exists():
            summary_lines.append(f"- `{csv_path.name}`")

    (receipt_root / "summary.md").write_text("\n".join(summary_lines))

    return receipt_root


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually run the cleanup. Default is dry-run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicit dry run (default behavior).",
    )
    args = parser.parse_args()
    dry_run = not args.apply

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if dry_run:
        run_id = f"DRYRUN_{run_id}"

    print(f"[cleanup] mode={'DRY-RUN' if dry_run else 'APPLY'}  run_id={run_id}")

    results: dict[str, dict] = {}
    receipt_root = (
        ROOT / "audit" / "asset_operating_cf_run" / "duplicate_cleanup" / run_id
    )
    receipt_root.mkdir(parents=True, exist_ok=True)

    with psycopg.connect(DSN, row_factory=psycopg.rows.dict_row) as conn:
        for table, entity_col, label, _has_metrics in TABLES:
            print(f"\n[cleanup] === {table} ({label}) ===")
            with conn.cursor() as cur:
                rows = find_duplicates(cur, table, entity_col)
                if not rows:
                    print(f"  no duplicates")
                    results[table] = {"kept": 0, "superseded": 0}
                    continue

                kept, superseded, changes = apply_cleanup(
                    cur, table, entity_col, rows, dry_run=dry_run
                )
                print(
                    f"  groups: {kept}  rows_to_supersede: {superseded}  "
                    f"({'dry-run' if dry_run else 'applied'})"
                )

                csv_path = receipt_root / f"{label}_changes.csv"
                with csv_path.open("w", newline="", encoding="utf-8") as f:
                    if changes:
                        writer = csv.DictWriter(f, fieldnames=list(changes[0].keys()))
                        writer.writeheader()
                        writer.writerows(changes)
                print(f"  wrote {csv_path.name} ({len(changes)} rows)")

                idx_sql = create_uniqueness_index(cur, table, entity_col, dry_run=dry_run)
                results[table] = {
                    "kept": kept,
                    "superseded": superseded,
                    "index_sql": idx_sql,
                }

        if not dry_run:
            conn.commit()
            print(f"\n[cleanup] committed")
        else:
            conn.rollback()
            print(f"\n[cleanup] dry-run rolled back; no changes persisted")

    receipt_path = write_receipts(run_id, results)
    print(f"\n[cleanup] receipts: {receipt_path}")

    if dry_run:
        print(
            "\nTo apply: python -m verification.runners.cleanup_released_duplicates --apply"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
