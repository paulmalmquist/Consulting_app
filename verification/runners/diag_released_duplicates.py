"""Diagnostic: enumerate all (fund_id, quarter) released-snapshot duplicates.

Reads ``re_authoritative_fund_state_qtr`` for every released row and groups
by (fund_id, quarter). Anything with count > 1 violates the immutability
invariant from ``docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`` rule #6.

Prints:
  - per-fund summary of duplicate-count distribution
  - per-(fund, quarter) detail with snapshot_version, audit_run_id, gross_irr,
    released_at, trust_status — so the cleanup runner can pick the canonical
    row by released_at DESC

Run:  python -m verification.runners.diag_released_duplicates
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
DSN = os.environ["DATABASE_URL"]


def main() -> None:
    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            print("=" * 110)
            print("DUPLICATE-COUNT SUMMARY (released rows per fund/quarter)")
            print("=" * 110)
            cur.execute(
                """
                SELECT
                    f.name,
                    s.fund_id,
                    s.quarter,
                    COUNT(*) AS row_count,
                    COUNT(DISTINCT s.snapshot_version) AS distinct_versions,
                    COUNT(DISTINCT s.audit_run_id) AS distinct_runs,
                    MIN(s.released_at) AS first_release,
                    MAX(s.released_at) AS last_release
                FROM re_authoritative_fund_state_qtr s
                JOIN repe_fund f ON f.fund_id = s.fund_id
                WHERE s.promotion_state = 'released'
                GROUP BY f.name, s.fund_id, s.quarter
                HAVING COUNT(*) > 1
                ORDER BY f.name, s.quarter
                """
            )
            dup_groups = cur.fetchall()

            if not dup_groups:
                print("  No duplicates. Immutability invariant intact.")
                return

            print(
                f"{'fund':<48}{'qtr':<8}{'rows':<6}{'versions':<10}{'runs':<6}"
                f"{'first_released':<22}{'last_released':<22}"
            )
            for name, _fid, q, n, nv, nr, fr, lr in dup_groups:
                print(
                    f"{name[:46]:<48}{q:<8}{n:<6}{nv:<10}{nr:<6}"
                    f"{str(fr)[:21]:<22}{str(lr)[:21]:<22}"
                )

            print("\n" + "=" * 110)
            print("PER-DUPLICATE-GROUP DETAIL")
            print("=" * 110)
            cur.execute(
                """
                WITH dup_keys AS (
                    SELECT fund_id, quarter
                    FROM re_authoritative_fund_state_qtr
                    WHERE promotion_state = 'released'
                    GROUP BY fund_id, quarter
                    HAVING COUNT(*) > 1
                )
                SELECT
                    f.name,
                    s.quarter,
                    s.snapshot_version,
                    s.audit_run_id::text,
                    s.trust_status,
                    s.breakpoint_layer,
                    (s.canonical_metrics->>'gross_irr')::numeric AS gross_irr,
                    (s.canonical_metrics->>'tvpi')::numeric AS tvpi,
                    (s.canonical_metrics->>'asset_count')::int AS asset_count,
                    s.released_at,
                    s.released_by,
                    s.id::text AS row_id
                FROM re_authoritative_fund_state_qtr s
                JOIN repe_fund f ON f.fund_id = s.fund_id
                JOIN dup_keys d ON d.fund_id = s.fund_id AND d.quarter = s.quarter
                WHERE s.promotion_state = 'released'
                ORDER BY f.name, s.quarter, s.released_at DESC NULLS LAST, s.created_at DESC
                """
            )
            current = ""
            for r in cur.fetchall():
                key = f"{r[0]} | {r[1]}"
                if key != current:
                    print(f"\n--- {key} ---")
                    current = key
                    canonical_marker = ">>> CANONICAL"
                else:
                    canonical_marker = "    superseded"
                irr = f"{r[6]:.4f}" if r[6] is not None else "—"
                tvpi = f"{r[7]:.2f}" if r[7] is not None else "—"
                rel = str(r[9])[:19] if r[9] else "(no released_at)"
                print(
                    f"  {canonical_marker:<16} ver={r[2][:48]:<48} run={r[3][:8]} "
                    f"irr={irr:<8} tvpi={tvpi:<6} assets={r[8] or 0:<3} "
                    f"trust={r[4]:<10} released={rel}"
                )

            print("\n" + "=" * 110)
            print(f"TOTAL DUPLICATE GROUPS: {len(dup_groups)}")
            total_extra = sum(n - 1 for _, _, _, n, *_ in dup_groups)
            print(f"TOTAL EXTRA ROWS TO DOWNGRADE: {total_extra}")


if __name__ == "__main__":
    main()
