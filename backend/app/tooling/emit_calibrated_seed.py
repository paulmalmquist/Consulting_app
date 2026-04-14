"""Emit the calibrated asset seed SQL.

Reads the portfolio profiles, runs the calibrator on every asset, and writes
a single idempotent SQL file at `repo-b/db/schema/511_repe_calibrated_asset_seed.sql`.

The file:
  1. Writes the resolved `strategy` onto every `repe_asset` row.
  2. Clears prior `re_asset_operating_qtr` rows for the calibrated assets
     (source_type = 'seed') so rerunning the calibrator is clean.
  3. Inserts the fresh quarterly operating series.
  4. Inserts the resolved exit event (one per asset) into `re_asset_exit_event`.
  5. For Granite Peak assets, resolves env_id/business_id from whichever fund
     row matches the name (handling both explicit and lookup seeds).

Run via `python -m app.tooling.emit_calibrated_seed` from `backend/`.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Any

from app.tooling.repe_calibration import CalibratedCashflow, calibrate_asset
from app.tooling.repe_portfolio_profiles import (
    ALL_PROFILES,
    GRANITE_FUND_ID,
    GRANITE_PROFILES,
    IGF_VII_FUND_ID,
    IGF_VII_PROFILES,
    MREF_III_FUND_ID,
    MREF_III_PROFILES,
)


SEED_PATH = Path(
    "/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/repo-b/db/schema/511_repe_calibrated_asset_seed.sql"
)


def _sql_num(v: Decimal | int | float) -> str:
    return f"{Decimal(v):.2f}"


def _sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def _strategy_updates() -> list[str]:
    rows: list[str] = []
    for p in ALL_PROFILES:
        if p.fund_id == GRANITE_FUND_ID:
            # Granite Peak assets are scoped by asset_id directly (UUIDs).
            rows.append(
                f"UPDATE repe_asset SET strategy = '{p.strategy}' "
                f"WHERE asset_id = '{p.asset_id}'::uuid;"
            )
        else:
            rows.append(
                f"UPDATE repe_asset SET strategy = '{p.strategy}' "
                f"WHERE asset_id = '{p.asset_id}'::uuid;"
            )
    return rows


def _operating_inserts(cf: CalibratedCashflow) -> list[str]:
    rows: list[str] = []
    for r in cf.operating_quarters:
        rows.append(
            "INSERT INTO re_asset_operating_qtr "
            "(asset_id, quarter, revenue, other_income, opex, capex, debt_service, "
            "inputs_hash, source_type) VALUES ("
            f"'{cf.profile.asset_id}'::uuid, '{r['quarter']}', "
            f"{_sql_num(r['revenue'])}, {_sql_num(r['other_income'])}, "
            f"{_sql_num(r['opex'])}, {_sql_num(r['capex'])}, "
            f"{_sql_num(r['debt_service'])}, "
            f"'calibrated-511-{cf.profile.asset_id}-{r['quarter']}', 'seed') "
            "ON CONFLICT (asset_id, quarter, "
            "COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)) "
            "DO UPDATE SET "
            "revenue = EXCLUDED.revenue, other_income = EXCLUDED.other_income, "
            "opex = EXCLUDED.opex, capex = EXCLUDED.capex, "
            "debt_service = EXCLUDED.debt_service, "
            "inputs_hash = EXCLUDED.inputs_hash;"
        )
    return rows


def _exit_event_insert(cf: CalibratedCashflow, *, env_id_expr: str, business_id_expr: str) -> str:
    e = cf.exit_event
    notes = (
        f"Calibrated by repe_calibration; driver={cf.driver_shape['driver']}, "
        f"target_irr={e['target_irr']}, realized_irr={cf.realized_irr}, "
        f"warnings={','.join(cf.warnings) or 'none'}"
    )
    return (
        "INSERT INTO re_asset_exit_event "
        "(env_id, business_id, asset_id, status, exit_quarter, exit_date, "
        "gross_sale_price, selling_costs, debt_payoff, net_proceeds, "
        "projected_cap_rate, notes, created_by) VALUES ("
        f"{env_id_expr}, {business_id_expr}, '{cf.profile.asset_id}'::uuid, "
        f"'{e['status']}', '{e['exit_quarter']}', DATE '{e['exit_date'].isoformat()}', "
        f"{_sql_num(e['gross_sale_price'])}, {_sql_num(e['selling_costs'])}, "
        f"{_sql_num(e['debt_payoff'])}, {_sql_num(e['net_proceeds'])}, "
        f"{_sql_num(e['projected_cap_rate'])}, "
        f"{_sql_str(notes)}, 'calibrator_511') "
        "ON CONFLICT (asset_id, revision_at) DO NOTHING;"
    )


def _env_business_ctes(fund_ids: list[str]) -> str:
    """Resolve env_id + business_id for each fund, picking any existing
    authoritative-snapshot env mapping first; falling back to 'demo' env."""
    return (
        "WITH fund_env AS ("
        "  SELECT f.fund_id, f.business_id, "
        "         COALESCE((SELECT env_id FROM re_authoritative_fund_state_qtr a "
        "                   WHERE a.fund_id = f.fund_id LIMIT 1), 'demo') AS env_id "
        "  FROM repe_fund f "
        f"  WHERE f.fund_id::text = ANY(ARRAY[{', '.join(_sql_str(fid) for fid in fund_ids)}]) "
        "     OR f.name = 'Granite Peak Value-Add Fund IV'"
        ")"
    )


def emit() -> str:
    lines: list[str] = [
        "-- 511_repe_calibrated_asset_seed.sql",
        "-- Calibrated REPE asset-level seed.",
        "--",
        "-- Generated by app.tooling.emit_calibrated_seed from the deterministic",
        "-- calibrator (app.tooling.repe_calibration). Every asset's operating",
        "-- CF series + exit event are back-solved to hit a target IRR band so",
        "-- the portfolio-level distribution is realistic:",
        "--   ~10% negative, ~25% low-single, ~55% core-band, ~10% outperformer.",
        "--",
        "-- Fund-level gross IRRs produced by this seed:",
    ]
    # Pre-run the calibrator so we can record fund-level IRRs in the header.
    from app.tooling.repe_calibration import fund_reconciliation

    calibrated_igf = [calibrate_asset(p) for p in IGF_VII_PROFILES]
    calibrated_mref = [calibrate_asset(p) for p in MREF_III_PROFILES]
    calibrated_gp = [calibrate_asset(p) for p in GRANITE_PROFILES]
    for name, cfs in [
        ("Institutional Growth Fund VII", calibrated_igf),
        ("Meridian Real Estate Fund III", calibrated_mref),
        ("Granite Peak Value-Add Fund IV", calibrated_gp),
    ]:
        r = fund_reconciliation(cfs)
        irr = r["gross_irr"]
        lines.append(
            f"--   {name}: gross IRR = {irr * 100:.2f}% · TVPI {r['tvpi']:.2f}x · "
            f"${int(r['total_equity']/1e6)}M equity → ${int(r['total_net_proceeds']/1e6)}M net proceeds"
        )

    lines.append("--")
    lines.append("-- Rerun-safe: DELETE + re-INSERT for operating_qtr; "
                 "ON CONFLICT upsert for exit_event.")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")
    lines.append("-- 1. strategy on every calibrated asset.")
    lines.extend(_strategy_updates())
    lines.append("")

    lines.append(
        "-- 2. Clear prior operating_qtr rows (source_type='seed' only; leaves "
        "imported_gl / manual rows alone)."
    )
    asset_ids = [p.asset_id for p in ALL_PROFILES]
    lines.append(
        "DELETE FROM re_asset_operating_qtr WHERE source_type = 'seed' "
        "AND asset_id = ANY(ARRAY["
        + ", ".join(f"'{aid}'::uuid" for aid in asset_ids)
        + "]);"
    )
    lines.append("")

    lines.append(
        "-- 3. Calibrated quarterly operating CFs per asset."
    )
    for cf in (calibrated_igf + calibrated_mref + calibrated_gp):
        lines.append(f"-- ── {cf.profile.name} "
                     f"({cf.profile.property_type}, {cf.profile.city}, "
                     f"strategy={cf.profile.strategy}, "
                     f"realized IRR={float(cf.realized_irr) * 100:.2f}%)")
        lines.extend(_operating_inserts(cf))
        lines.append("")

    lines.append("-- 4. Exit events. Resolve env_id/business_id per asset via DO block.")
    lines.append("DO $$")
    lines.append("DECLARE")
    lines.append("  v_env_id text;")
    lines.append("  v_business_id uuid;")
    lines.append("BEGIN")

    for cf in (calibrated_igf + calibrated_mref + calibrated_gp):
        lines.append("  -- " + cf.profile.name)
        lines.append(
            "  SELECT COALESCE((SELECT env_id FROM re_authoritative_fund_state_qtr "
            "WHERE fund_id = f.fund_id LIMIT 1), 'demo'), f.business_id "
            "INTO v_env_id, v_business_id "
            "FROM repe_fund f "
            "JOIN repe_deal d ON d.fund_id = f.fund_id "
            "JOIN repe_asset a ON a.deal_id = d.deal_id "
            f"WHERE a.asset_id = '{cf.profile.asset_id}'::uuid "
            "LIMIT 1;"
        )
        lines.append("  IF v_business_id IS NOT NULL THEN")
        lines.append("    " + _exit_event_insert(cf, env_id_expr="v_env_id", business_id_expr="v_business_id"))
        lines.append("  END IF;")

    lines.append("END $$;")
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    sql = emit()
    SEED_PATH.write_text(sql)
    print(f"Wrote {len(sql)} bytes to {SEED_PATH}")
    print(f"Lines: {sql.count(chr(10))}")


if __name__ == "__main__":
    main()
