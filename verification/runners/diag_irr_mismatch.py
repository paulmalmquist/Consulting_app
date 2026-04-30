"""Quick diagnostic: compare released-snapshot IRRs vs calibrated targets.

Reads:
  - re_authoritative_fund_state_qtr (released)
  - re_fund_quarter_state (legacy snapshot)
  - re_asset_operating_qtr aggregate by fund
  - re_asset_cf_series_mat row counts by fund

Prints a table per fund so we can see where the 53.4% IRR is coming from.

Run: python -m verification.runners.diag_irr_mismatch
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
            print("=" * 100)
            print("RELEASED AUTHORITATIVE SNAPSHOTS")
            print("=" * 100)
            cur.execute(
                """
                SELECT
                    f.name,
                    s.quarter,
                    s.snapshot_version,
                    (s.canonical_metrics->>'gross_irr')::numeric AS gross_irr,
                    (s.canonical_metrics->>'gross_irr_bottom_up')::numeric AS gross_irr_bu,
                    (s.canonical_metrics->>'gross_tvpi')::numeric AS gross_tvpi,
                    (s.canonical_metrics->>'authoritative_nav')::numeric AS nav,
                    s.trust_status,
                    s.audit_run_id
                FROM re_authoritative_fund_state_qtr s
                JOIN repe_fund f ON f.fund_id = s.fund_id
                WHERE s.promotion_state = 'released'
                ORDER BY f.name, s.quarter
                """
            )
            rows = cur.fetchall()
            print(f"{'fund':<55}{'qtr':<8}{'gross_irr':<12}{'gross_irr_bu':<14}{'tvpi':<8}{'nav':<18}{'trust':<10}")
            for r in rows:
                name, qtr, ver, irr, irr_bu, tvpi, nav, trust, _ = r
                print(
                    f"{name[:53]:<55}{qtr:<8}"
                    f"{(f'{irr:.3f}' if irr is not None else '—'):<12}"
                    f"{(f'{irr_bu:.3f}' if irr_bu is not None else '—'):<14}"
                    f"{(f'{tvpi:.2f}' if tvpi is not None else '—'):<8}"
                    f"{(f'{nav:,.0f}' if nav is not None else '—'):<18}"
                    f"{trust or '—':<10}"
                )

            print("\n" + "=" * 100)
            print("LEGACY re_fund_quarter_state (latest quarter per fund)")
            print("=" * 100)
            cur.execute(
                """
                SELECT DISTINCT ON (s.fund_id)
                    f.name,
                    s.quarter,
                    s.gross_irr::numeric,
                    s.net_irr::numeric,
                    s.tvpi::numeric,
                    s.dpi::numeric,
                    s.portfolio_nav::numeric,
                    s.total_committed::numeric,
                    s.scenario_id
                FROM re_fund_quarter_state s
                JOIN repe_fund f ON f.fund_id = s.fund_id
                WHERE s.scenario_id IS NULL
                ORDER BY s.fund_id, s.quarter DESC
                """
            )
            print(f"{'fund':<55}{'qtr':<8}{'gross_irr':<12}{'net_irr':<10}{'tvpi':<8}{'dpi':<8}{'nav':<18}")
            for r in cur.fetchall():
                name, qtr, gi, ni, tvpi, dpi, nav, _, _ = r
                print(
                    f"{name[:53]:<55}{qtr:<8}"
                    f"{(f'{gi:.3f}' if gi is not None else '—'):<12}"
                    f"{(f'{ni:.3f}' if ni is not None else '—'):<10}"
                    f"{(f'{tvpi:.2f}' if tvpi is not None else '—'):<8}"
                    f"{(f'{dpi:.2f}' if dpi is not None else '—'):<8}"
                    f"{(f'{nav:,.0f}' if nav is not None else '—'):<18}"
                )

            print("\n" + "=" * 100)
            print("ASSET-LEVEL DATA: re_asset_operating_qtr COUNTS BY FUND")
            print("=" * 100)
            cur.execute(
                """
                SELECT
                    f.name,
                    COUNT(DISTINCT a.asset_id) AS asset_count,
                    COUNT(DISTINCT op.asset_id) AS assets_with_operating_qtr,
                    COUNT(DISTINCT ee.asset_id) AS assets_with_exit_event,
                    COUNT(op.*) AS operating_qtr_rows,
                    MIN(op.quarter) AS earliest_quarter,
                    MAX(op.quarter) AS latest_quarter
                FROM repe_fund f
                LEFT JOIN repe_deal d ON d.fund_id = f.fund_id
                LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
                LEFT JOIN re_asset_operating_qtr op ON op.asset_id = a.asset_id
                LEFT JOIN re_asset_exit_event ee ON ee.asset_id = a.asset_id
                GROUP BY f.fund_id, f.name
                ORDER BY f.name
                """
            )
            print(f"{'fund':<55}{'assets':<8}{'op_qtr':<8}{'exits':<8}{'rows':<8}{'first':<10}{'last':<10}")
            for r in cur.fetchall():
                name, ac, op_a, ee_a, rows_n, first_q, last_q = r
                print(f"{name[:53]:<55}{ac:<8}{op_a:<8}{ee_a:<8}{rows_n:<8}{first_q or '—':<10}{last_q or '—':<10}")

            print("\n" + "=" * 100)
            print("BOTTOM-UP MATERIALIZED CF: re_asset_cf_series_mat COUNTS BY FUND")
            print("=" * 100)
            cur.execute(
                """
                SELECT
                    f.name,
                    COUNT(DISTINCT a.asset_id) AS asset_count,
                    COUNT(DISTINCT m.asset_id) AS assets_with_mat,
                    COUNT(m.*) AS mat_rows
                FROM repe_fund f
                LEFT JOIN repe_deal d ON d.fund_id = f.fund_id
                LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
                LEFT JOIN re_asset_cf_series_mat m ON m.asset_id = a.asset_id
                GROUP BY f.fund_id, f.name
                ORDER BY f.name
                """
            )
            print(f"{'fund':<55}{'assets':<8}{'mat':<8}{'rows':<8}")
            for r in cur.fetchall():
                name, ac, m_a, m_n = r
                print(f"{name[:53]:<55}{ac:<8}{m_a:<8}{m_n:<8}")

            print("\n" + "=" * 100)
            print("FUND COMMITMENTS / CALLED (capital ledger)")
            print("=" * 100)
            cur.execute(
                """
                SELECT
                    f.name,
                    SUM(CASE WHEN cl.event_type = 'commitment' THEN cl.amount ELSE 0 END) AS committed,
                    SUM(CASE WHEN cl.event_type = 'capital_call' THEN cl.amount ELSE 0 END) AS called,
                    SUM(CASE WHEN cl.event_type = 'distribution' THEN cl.amount ELSE 0 END) AS distributed,
                    COUNT(*) FILTER (WHERE cl.event_type = 'capital_call') AS call_count,
                    MIN(cl.event_date) FILTER (WHERE cl.event_type = 'capital_call') AS first_call,
                    MAX(cl.event_date) AS last_event
                FROM repe_fund f
                LEFT JOIN re_capital_ledger cl ON cl.fund_id = f.fund_id
                GROUP BY f.fund_id, f.name
                ORDER BY f.name
                """
            )
            print(f"{'fund':<55}{'committed':<18}{'called':<18}{'distributed':<18}{'calls':<8}{'1st_call':<12}{'last':<12}")
            for r in cur.fetchall():
                name, c, ca, d, cn, fc, le = r
                print(
                    f"{name[:53]:<55}"
                    f"{(f'{c:,.0f}' if c is not None else '—'):<18}"
                    f"{(f'{ca:,.0f}' if ca is not None else '—'):<18}"
                    f"{(f'{d:,.0f}' if d is not None else '—'):<18}"
                    f"{(cn or 0):<8}"
                    f"{str(fc or '—'):<12}"
                    f"{str(le or '—'):<12}"
                )


if __name__ == "__main__":
    main()
