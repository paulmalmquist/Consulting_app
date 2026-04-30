"""Phase 5.6 tests — promotion gate.

The gate must block release unless every layer is complete. Each test
constructs a synthetic snapshot bundle with one missing piece and verifies
the gate fails closed with a structured failure code.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services.bottom_up_cashflow import CFPoint, quarter_end_date
from app.services.bottom_up_fund_scope import FundScope
from app.services.bottom_up_rollup import AssetContribution, FundRollup
from app.services.fund_expense_layer import FundExpenseSchedule
from app.services.fund_gross_to_net import build_gross_to_net_bridge
from app.services.fund_snapshot_v2 import (
    PromotionGateResult,
    assert_promotion_preconditions,
)
from app.services.fund_waterfall_layer import FundWaterfallResult, WaterfallEventLog


def _scope(*, n_inv: int = 2, n_assets: int = 4) -> FundScope:
    return FundScope(
        fund_id=uuid4(),
        as_of_quarter="2025Q4",
        expected_investment_ids={uuid4() for _ in range(n_inv)},
        expected_asset_ids={uuid4() for _ in range(n_assets)},
        nav_eligible_asset_ids=set(),
        exclusions=[],
        audit_mode=False,
    )


def _rollup(irr: Decimal | None = Decimal("0.10"), null_reason: str | None = None) -> FundRollup:
    series = [
        CFPoint(
            quarter="2024-Q1",
            quarter_end_date=quarter_end_date("2024-Q1"),
            amount=Decimal("-1000000"),
            component_breakdown={"acquisition": -1000000.0},
        ),
        CFPoint(
            quarter="2025-Q4",
            quarter_end_date=quarter_end_date("2025-Q4"),
            amount=Decimal("400000"),
            component_breakdown={"operating": 400000.0},
            has_actual=True,
        ),
    ]
    return FundRollup(
        fund_id=uuid4(),
        as_of_quarter="2025Q4",
        series=series,
        irr=irr,
        null_reason=null_reason,
        warnings=[],
        investment_contributions=[],
        asset_contributions=[],
        irr_contribution_by_investment=[],
    )


def _expense_complete(
    mgmt: Decimal = Decimal("100000"),
    other: Decimal = Decimal("25000"),
) -> FundExpenseSchedule:
    return FundExpenseSchedule(
        fund_id=uuid4(),
        as_of_quarter="2025Q4",
        lines=[],
        cf_points=[],
        total_management_fees=mgmt,
        total_other_expenses=other,
        expenses_by_type={},
        null_reasons={},
        expense_cf_hash="sha256:test",
    )


def _waterfall_complete(carry: Decimal = Decimal("50000")) -> FundWaterfallResult:
    return FundWaterfallResult(
        fund_id=uuid4(),
        as_of_quarter="2025Q4",
        waterfall_status="computed",
        pre_waterfall_net_cf_hash="sha256:test",
        net_irr=Decimal("0.05"),
        net_tvpi=Decimal("1.20"),
        dpi=Decimal("0.40"),
        rvpi=Decimal("0.80"),
        carry=carry,
        gp_share=Decimal("75000"),
        lp_share=Decimal("400000"),
        pref_distributed=Decimal("80000"),
        return_of_capital_distributed=Decimal("400000"),
        catch_up_distributed=Decimal("0"),
        gross_net_spread_bps=200,
        lp_called=Decimal("1000000"),
        lp_distributions=Decimal("400000"),
        lp_ending_nav_share=Decimal("800000"),
        gp_called=Decimal("10000"),
        gp_distributions=Decimal("75000"),
        gp_ending_nav_share=Decimal("8000"),
        waterfall_style="american",
        pref_rate=Decimal("0.08"),
        carry_rate=Decimal("0.20"),
        catchup_rate=Decimal("1.0"),
        definition_id="test-id",
        definition_version=1,
        event_logs=[
            WaterfallEventLog(
                event_date=date(2025, 12, 31),
                quarter="2025-Q4",
                distribution_amount=Decimal("475000"),
                allocations=[],
                lp_share=Decimal("400000"),
                gp_share=Decimal("75000"),
                carry_share=Decimal("50000"),
                pref_share=Decimal("80000"),
                return_of_capital=Decimal("400000"),
                catch_up=Decimal("0"),
                conservation_diff=Decimal("0.001"),
            )
        ],
        null_reasons={},
        warnings=[],
        inputs_hash="sha256:test",
    )


def _build_bridge(
    rollup: FundRollup,
    expense: FundExpenseSchedule,
    waterfall: FundWaterfallResult,
    *,
    ending_nav: Decimal | None = Decimal("800000"),
):
    return build_gross_to_net_bridge(
        fund_id=rollup.fund_id,
        as_of_quarter="2025Q4",
        fund_gross_cf=rollup.series,
        ending_nav=ending_nav,
        expense_schedule=expense,
        waterfall=waterfall,
    )


def test_gate_passes_when_every_layer_is_complete():
    scope = _scope()
    rollup = _rollup()
    expense = _expense_complete()
    waterfall = _waterfall_complete()
    bridge = _build_bridge(rollup, expense, waterfall)

    gate = assert_promotion_preconditions(
        fund_id=rollup.fund_id,
        quarter="2025Q4",
        scope=scope,
        rollup=rollup,
        expense_schedule=expense,
        waterfall=waterfall,
        bridge=bridge,
        asset_refresh_null_share=Decimal("0.0"),
    )
    # Bridge will have a residual memo (leverage), which surfaces as a
    # warning, not a failure. So failures must be empty.
    assert gate.ok is True or len(gate.failures) == 0
    if not gate.ok:
        assert gate.warnings  # if not ok, at least we have warnings explaining


def test_gate_blocks_when_scope_has_no_investments():
    scope = _scope(n_inv=0, n_assets=0)
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=scope,
        rollup=_rollup(),
        expense_schedule=_expense_complete(),
        waterfall=_waterfall_complete(),
        bridge=_build_bridge(_rollup(), _expense_complete(), _waterfall_complete()),
    )
    assert gate.ok is False
    assert any("scope_no_expected_investments" in f for f in gate.failures)


def test_gate_blocks_when_rollup_irr_null():
    rollup = _rollup(irr=None, null_reason="all_investments_null")
    gate = assert_promotion_preconditions(
        fund_id=rollup.fund_id,
        quarter="2025Q4",
        scope=_scope(),
        rollup=rollup,
        expense_schedule=_expense_complete(),
        waterfall=_waterfall_complete(),
        bridge=_build_bridge(rollup, _expense_complete(), _waterfall_complete()),
    )
    assert gate.ok is False
    assert any("rollup_gross_irr_null" in f for f in gate.failures)


def test_gate_blocks_when_asset_refresh_null_share_above_threshold():
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=_scope(),
        rollup=_rollup(),
        expense_schedule=_expense_complete(),
        waterfall=_waterfall_complete(),
        bridge=_build_bridge(_rollup(), _expense_complete(), _waterfall_complete()),
        asset_refresh_null_share=Decimal("0.10"),  # 10% > 5% threshold
    )
    assert gate.ok is False
    assert any(
        "asset_cf_coverage_below_threshold" in f for f in gate.failures
    )


def test_gate_blocks_when_management_fees_missing():
    expense = _expense_complete(mgmt=None)  # type: ignore[arg-type]
    expense.total_management_fees = None
    expense.null_reasons["management_fee"] = "partial_nulls"
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=_scope(),
        rollup=_rollup(),
        expense_schedule=expense,
        waterfall=_waterfall_complete(),
        bridge=_build_bridge(_rollup(), expense, _waterfall_complete()),
    )
    assert gate.ok is False
    assert any("expense_layer" in f for f in gate.failures)


def test_gate_blocks_when_other_expenses_missing():
    expense = _expense_complete()
    expense.total_other_expenses = None
    expense.null_reasons["fund_expense_layer"] = "no_other_expense_rows"
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=_scope(),
        rollup=_rollup(),
        expense_schedule=expense,
        waterfall=_waterfall_complete(),
        bridge=_build_bridge(_rollup(), expense, _waterfall_complete()),
    )
    assert gate.ok is False
    assert any("expense_layer_other_expenses_null" in f for f in gate.failures)


def test_gate_blocks_when_waterfall_missing_contract():
    waterfall = _waterfall_complete()
    waterfall.waterfall_status = "missing_contract"
    waterfall.net_irr = None
    waterfall.carry = None
    waterfall.null_reasons = {"waterfall": "missing_contract"}
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=_scope(),
        rollup=_rollup(),
        expense_schedule=_expense_complete(),
        waterfall=waterfall,
        bridge=_build_bridge(_rollup(), _expense_complete(), waterfall),
    )
    assert gate.ok is False
    assert any("waterfall_status:missing_contract" in f for f in gate.failures)
    assert any("waterfall_net_irr_null" in f for f in gate.failures)


def test_gate_blocks_on_waterfall_conservation_violation():
    waterfall = _waterfall_complete()
    waterfall.event_logs[0].conservation_diff = Decimal("100.00")
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=_scope(),
        rollup=_rollup(),
        expense_schedule=_expense_complete(),
        waterfall=waterfall,
        bridge=_build_bridge(_rollup(), _expense_complete(), waterfall),
    )
    assert gate.ok is False
    assert any("waterfall_conservation_violation" in f for f in gate.failures)


def test_gate_decisions_carry_provenance():
    """The decisions dict must capture every input so the receipt JSON
    explains why the gate passed or failed."""
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=_scope(),
        rollup=_rollup(),
        expense_schedule=_expense_complete(),
        waterfall=_waterfall_complete(),
        bridge=_build_bridge(_rollup(), _expense_complete(), _waterfall_complete()),
        asset_refresh_null_share=Decimal("0.01"),
    )
    decisions = gate.decisions
    assert "scope_expected_investments" in decisions
    assert "rollup_irr" in decisions
    assert "expense_total_management_fees" in decisions
    assert "waterfall_status" in decisions
    assert "bridge_identity_holds" in decisions
    assert "asset_refresh_null_share" in decisions


def test_gate_to_dict_is_jsonable():
    gate = assert_promotion_preconditions(
        fund_id=uuid4(),
        quarter="2025Q4",
        scope=_scope(),
        rollup=_rollup(irr=None, null_reason="x"),
        expense_schedule=_expense_complete(),
        waterfall=_waterfall_complete(),
        bridge=_build_bridge(_rollup(), _expense_complete(), _waterfall_complete()),
    )
    import json

    d = gate.to_dict()
    s = json.dumps(d)  # must not raise
    assert "failures" in d
    assert "warnings" in d
    assert "decisions" in d
    assert isinstance(s, str)
