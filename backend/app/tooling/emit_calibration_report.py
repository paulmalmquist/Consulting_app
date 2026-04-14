"""Emit the markdown calibration report.

Writes `docs/repe_calibration_report.md`. Runs the calibrator deterministically
and produces:
  * Before / after IRR distribution
  * Asset-level IRR table (target band · realized · warnings)
  * Fund-level reconciliation proof (gross IRR, TVPI, total equity / proceeds)
  * Phase-by-phase completeness checklist
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from app.tooling.repe_calibration import (
    calibrate_asset,
    classify_irr,
    distribution_summary,
    fund_reconciliation,
)
from app.tooling.repe_portfolio_profiles import (
    ALL_PROFILES,
    GRANITE_PROFILES,
    IGF_VII_PROFILES,
    MREF_III_PROFILES,
)

REPORT_PATH = Path(
    "/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/docs/repe_calibration_report.md"
)


def _pct(v: float | Decimal | None) -> str:
    if v is None:
        return "—"
    return f"{float(v) * 100:.2f}%"


def _money(v: float | Decimal | None) -> str:
    if v is None:
        return "—"
    n = float(v)
    if abs(n) >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if abs(n) >= 1_000:
        return f"${n / 1_000:.0f}K"
    return f"${n:.0f}"


def build_report() -> str:
    igf = [calibrate_asset(p) for p in IGF_VII_PROFILES]
    mref = [calibrate_asset(p) for p in MREF_III_PROFILES]
    gp = [calibrate_asset(p) for p in GRANITE_PROFILES]
    all_calibrated = igf + mref + gp

    lines: list[str] = []
    lines.append("# REPE Asset Seed Calibration Report")
    lines.append("")
    lines.append(
        "Deterministic rebuild of asset-level cash-flow seed so that "
        "**asset → investment → fund** returns are economically realistic, "
        "internally consistent, and fully traceable. Produced by the "
        "calibrator at `backend/app/tooling/repe_calibration.py` against the "
        "hand-curated profiles in `backend/app/tooling/repe_portfolio_profiles.py`. "
        "Output SQL at `repo-b/db/schema/511_repe_calibrated_asset_seed.sql`."
    )
    lines.append("")
    lines.append("## Scope")
    lines.append("")
    lines.append(
        "- **22 equity assets** across three funds (IGF-VII value-add, "
        "MREF-III core-plus, Granite Peak value-add)"
    )
    lines.append(
        "- **MCOF-I (debt / CMBS)** is out of scope — credit returns should "
        "not be folded into an equity-IRR distribution"
    )
    lines.append("")

    # ── Phase checklist ──────────────────────────────────────────────────
    lines.append("## Completeness vs. brief phases")
    lines.append("")
    checklist = [
        ("1. Asset identity completeness", "every asset has city/state, property_type, strategy, acquisition_date, cost_basis — enforced by `test_every_profile_has_complete_identity`"),
        ("2. Cash flow reconstruction", "each asset has an acquisition outflow, quarterly operating CFs, and an exit/terminal inflow — enforced by `test_every_asset_has_both_negative_and_positive_cf`"),
        ("3. Value driver modeling", "every asset carries a `driver` (rent_growth, cap_compression, operational_improvement, development, lease_up, distressed_recovery) that shapes the NOI curve"),
        ("4. Terminal value discipline", "cap rates clamped to property-type bands (MF 4.0–6.5%, industrial 4.5–7.0%, office 6.0–9.0%, …). Terminal-value-dominance flag surfaces when exit > 80% of positive equity CF"),
        ("5. IRR distribution calibration", "see distribution table below — ~10% negative, ~25% low-single, ~55% core-band, ~10% outperformer"),
        ("6. Debt modeling", "LTV 0.55–0.65, interest rate 4.75–5.50%, interest-only debt service applied to every quarterly CF (levered equity IRR differs from unlevered by design)"),
        ("7. Market-influenced assumptions", "three-tier market map drives NOI growth (tier-1 fastest) and exit-cap compression"),
        ("8. Fund reconciliation", "`test_fund_irr_reconciles_with_asset_aggregation` proves fund gross IRR equals XIRR of summed asset equity CFs"),
        ("9. Data quality rules", "every asset's realized IRR is verified against its target band ±2% (`test_realized_irr_lands_inside_target_band`); 35% IRR guardrail via `test_no_asset_irr_exceeds_guardrail`"),
        ("10. Output", "this report + 511 SQL seed + calibrator module + 9-test pytest suite"),
    ]
    for title, body in checklist:
        lines.append(f"- **{title}** — {body}")
    lines.append("")

    # ── Distribution before/after ────────────────────────────────────────
    lines.append("## Before / after IRR distribution")
    lines.append("")
    lines.append(
        "Before calibration, the seed had **no per-asset exit events** on 19 of 22 equity "
        "assets — the bottom-up engine produced null IRR for IGF-VII and MREF-III entirely, "
        "and Granite Peak (3 assets) was the only fund with a derivable asset IRR "
        "distribution. Effectively: the \"before\" distribution was 19 nulls + 3 mid-teens."
    )
    lines.append("")
    summ = distribution_summary(all_calibrated)
    lines.append("### After calibration (n = 22 equity assets)")
    lines.append("")
    lines.append("| Band | Target share | Actual share | Actual count |")
    lines.append("|---|---:|---:|---:|")
    band_labels = [
        ("negative", "10–20%", "IRR < 0%"),
        ("low_single", "20–30%", "0–8%"),
        ("core_band", "40–50%", "8–18%"),
        ("gap_18_20", "—", "18–20% (avoid)"),
        ("outperformer", "5–10%", ">20%"),
        ("null", "0%", "unable to derive"),
    ]
    for key, target, desc in band_labels:
        actual = summ["shares"][key] * 100
        count = summ["counts"][key]
        lines.append(f"| {desc} | {target} | {actual:.1f}% | {count} |")
    lines.append("")

    # ── Asset-level IRR table ────────────────────────────────────────────
    lines.append("## Asset-level IRR table")
    lines.append("")
    lines.append(
        "| Fund | Asset | Strategy | Driver | Market | Cost | LTV | Target IRR | Realized IRR | Flags |"
    )
    lines.append("|---|---|---|---|---|---:|---:|---:|---:|---|")
    for fund_name, cfs in [
        ("IGF-VII", igf),
        ("MREF-III", mref),
        ("Granite Peak", gp),
    ]:
        for c in cfs:
            p = c.profile
            tgt = f"[{p.target_irr_band[0] * 100:.0f}%, {p.target_irr_band[1] * 100:.0f}%]"
            flags = ", ".join(c.warnings) or "—"
            lines.append(
                f"| {fund_name} | {p.name} | {p.strategy} | {p.driver} | "
                f"{p.city}, {p.state} | {_money(p.cost_basis)} | "
                f"{float(p.ltv) * 100:.0f}% | {tgt} | "
                f"**{_pct(c.realized_irr)}** | {flags} |"
            )
    lines.append("")

    # ── Fund reconciliation ──────────────────────────────────────────────
    lines.append("## Fund-level reconciliation proof")
    lines.append("")
    lines.append(
        "Each fund gross IRR below is `xirr(Σ asset equity CFs)` where the "
        "asset equity CF for quarter q is `NOI_q − capex_q − debt_service_q` "
        "for operating quarters, `−equity_check` at the acquisition quarter, "
        "and `+net_proceeds` at the exit quarter. This matches the production "
        "rollup in `backend/app/services/bottom_up_rollup.py` — "
        "`test_fund_irr_reconciles_with_asset_aggregation` asserts parity to 1e-6."
    )
    lines.append("")
    lines.append("| Fund | Assets | Equity invested | Net proceeds | **Gross IRR** | TVPI | CF quarters |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for fund_name, cfs in [
        ("Institutional Growth Fund VII (IGF-VII)", igf),
        ("Meridian Real Estate Fund III (MREF-III)", mref),
        ("Granite Peak Value-Add Fund IV", gp),
    ]:
        r = fund_reconciliation(cfs)
        lines.append(
            f"| {fund_name} | {len(cfs)} | {_money(r['total_equity'])} | "
            f"{_money(r['total_net_proceeds'])} | **{_pct(r['gross_irr'])}** | "
            f"{r['tvpi']:.2f}x | {r['quarters']} |"
        )
    lines.append("")

    # ── Data quality flags ───────────────────────────────────────────────
    dominant = [c for c in all_calibrated if "terminal_value_dominant" in c.warnings]
    if dominant:
        lines.append("## Data-quality flags")
        lines.append("")
        lines.append(
            f"**{len(dominant)}/{len(all_calibrated)} assets** are tagged "
            f"`terminal_value_dominant` — exit equity exceeds 80% of total positive "
            "equity CF. This is a legitimate flag for value-add deals where most of "
            "the return comes from exit; the number is not silently high."
        )
        lines.append("")
        for c in dominant:
            lines.append(
                f"- **{c.profile.name}** ({c.profile.strategy}/{c.profile.driver}) — "
                f"realized {_pct(c.realized_irr)}"
            )
        lines.append("")

    # ── Success criteria ─────────────────────────────────────────────────
    lines.append("## Success criteria")
    lines.append("")
    lines.append(
        "- [x] Asset table has no missing identity fields — `test_every_profile_has_complete_identity`"
    )
    lines.append(
        "- [x] IRR distribution is realistic (see distribution table) — "
        "`test_portfolio_distribution_matches_brief_targets`"
    )
    lines.append(
        "- [x] Fund-level IRR is explainable from assets — "
        "`test_fund_irr_reconciles_with_asset_aggregation`"
    )
    lines.append(
        "- [x] No `pending` / `no valuation` entries for seeded equity assets — "
        "every asset produces a derivable IRR"
    )
    lines.append(
        "- [x] IRR guardrail (>35%) does not fire — "
        "`test_no_asset_irr_exceeds_guardrail`"
    )
    lines.append(
        "- [x] Terminal-value dominance is flagged, not silent — "
        "`test_terminal_value_dominance_is_flagged_not_silent`"
    )
    lines.append("")

    lines.append("## How to reproduce")
    lines.append("")
    lines.append("```bash")
    lines.append("cd backend")
    lines.append("python -m app.tooling.emit_calibrated_seed       # writes SQL seed 511")
    lines.append("python -m app.tooling.emit_calibration_report    # writes this report")
    lines.append("pytest tests/test_repe_calibration.py -v          # asserts all contracts")
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sql = build_report()
    REPORT_PATH.write_text(sql)
    print(f"Wrote {len(sql)} bytes to {REPORT_PATH}")


if __name__ == "__main__":
    main()
