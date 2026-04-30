"""Tests for bottom_up_fund_scope.discover_fund_scope.

The scope service is exercised through ``_bucket_scope_rows`` (the pure
function inside discover) so tests don't need a real database. Real-DB
behavior is validated end-to-end in the runner integration test.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.services.bottom_up_fund_scope import (
    SCOPE_CONTRACT_VERSION,
    FundScope,
    _bucket_scope_rows,
)


def _row(
    *,
    deal_id: UUID,
    deal_name: str,
    stage: str,
    asset_id: UUID | None = None,
    asset_name: str | None = None,
    archived_at: datetime | None = None,
    quarantined_at: datetime | None = None,
    quarantine_reason: str | None = None,
) -> dict:
    return {
        "deal_id": deal_id,
        "deal_name": deal_name,
        "stage": stage,
        "asset_id": asset_id,
        "asset_name": asset_name,
        "archived_at": archived_at,
        "quarantined_at": quarantined_at,
        "quarantine_reason": quarantine_reason,
    }


def test_active_assets_under_operating_deal_are_included():
    fund_id = uuid4()
    deal_id = uuid4()
    a1, a2 = uuid4(), uuid4()
    rows = [
        _row(deal_id=deal_id, deal_name="Deal Alpha", stage="operating", asset_id=a1, asset_name="Asset 1"),
        _row(deal_id=deal_id, deal_name="Deal Alpha", stage="operating", asset_id=a2, asset_name="Asset 2"),
    ]

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )

    assert isinstance(scope, FundScope)
    assert scope.scope_contract_version == SCOPE_CONTRACT_VERSION
    assert scope.expected_investment_count == 1
    assert scope.expected_asset_count == 2
    assert {a1, a2} == scope.expected_asset_ids
    assert {a1, a2} == scope.nav_eligible_asset_ids
    assert scope.exclusions == []


def test_archived_assets_are_excluded_with_reason():
    fund_id = uuid4()
    deal_id = uuid4()
    active = uuid4()
    archived = uuid4()
    rows = [
        _row(deal_id=deal_id, deal_name="Deal Beta", stage="operating", asset_id=active, asset_name="Active"),
        _row(
            deal_id=deal_id,
            deal_name="Deal Beta",
            stage="operating",
            asset_id=archived,
            asset_name="Archived",
            archived_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        ),
    ]

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )

    assert active in scope.expected_asset_ids
    assert archived not in scope.expected_asset_ids
    assert any(
        ex.entity_id == archived and ex.reason == "archived"
        for ex in scope.exclusions
    )


def test_quarantined_assets_carry_reason_into_receipt():
    fund_id = uuid4()
    deal_id = uuid4()
    qa = uuid4()
    other = uuid4()
    rows = [
        _row(deal_id=deal_id, deal_name="Deal Gamma", stage="operating", asset_id=other, asset_name="Other"),
        _row(
            deal_id=deal_id,
            deal_name="Deal Gamma",
            stage="operating",
            asset_id=qa,
            asset_name="Suspect Asset",
            quarantined_at=datetime(2025, 6, 15, tzinfo=timezone.utc),
            quarantine_reason="ownership_pct_mismatch",
        ),
    ]

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )

    quarantine_ex = next(
        (ex for ex in scope.exclusions if ex.entity_id == qa), None
    )
    assert quarantine_ex is not None
    assert quarantine_ex.reason == "quarantined"
    assert quarantine_ex.extra["quarantine_reason"] == "ownership_pct_mismatch"
    assert qa not in scope.expected_asset_ids


def test_stage_inactive_investments_are_excluded():
    fund_id = uuid4()
    sourcing_deal = uuid4()
    operating_deal = uuid4()
    a1, a2 = uuid4(), uuid4()
    rows = [
        _row(deal_id=sourcing_deal, deal_name="In Sourcing", stage="sourcing", asset_id=a1, asset_name="Speculative"),
        _row(deal_id=operating_deal, deal_name="Operating", stage="operating", asset_id=a2, asset_name="Real"),
    ]

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )

    assert sourcing_deal not in scope.expected_investment_ids
    assert operating_deal in scope.expected_investment_ids
    # Asset under sourcing deal is also out of scope
    assert a1 not in scope.expected_asset_ids
    assert a2 in scope.expected_asset_ids
    assert any(
        ex.entity_id == sourcing_deal and ex.reason == "stage_inactive"
        for ex in scope.exclusions
    )


def test_exited_assets_stay_in_expected_but_not_nav_eligible():
    """Exited assets contribute to lifetime CF / DPI but are excluded from
    the current ending-NAV identity (gate 5)."""
    fund_id = uuid4()
    operating_deal = uuid4()
    exited_deal = uuid4()
    a_op = uuid4()
    a_exited = uuid4()
    rows = [
        _row(deal_id=operating_deal, deal_name="Operating", stage="operating", asset_id=a_op, asset_name="Live"),
        _row(deal_id=exited_deal, deal_name="Sold", stage="exited", asset_id=a_exited, asset_name="Exited"),
    ]

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )

    assert a_op in scope.expected_asset_ids
    assert a_exited in scope.expected_asset_ids
    assert a_op in scope.nav_eligible_asset_ids
    assert a_exited not in scope.nav_eligible_asset_ids
    assert exited_deal in scope.expected_investment_ids


def test_audit_mode_keeps_excluded_entities_in_expected_set():
    fund_id = uuid4()
    deal_id = uuid4()
    a_archived = uuid4()
    a_active = uuid4()
    rows = [
        _row(deal_id=deal_id, deal_name="Deal", stage="operating", asset_id=a_active, asset_name="Alive"),
        _row(
            deal_id=deal_id,
            deal_name="Deal",
            stage="operating",
            asset_id=a_archived,
            asset_name="Gone",
            archived_at=datetime(2024, 7, 1, tzinfo=timezone.utc),
        ),
    ]

    scope_default = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )
    scope_audit = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=True
    )

    assert a_archived not in scope_default.expected_asset_ids
    assert a_archived in scope_audit.expected_asset_ids
    # Both surface the exclusion in the receipt — audit_mode just keeps the
    # entity in expected_* anyway so the snapshot can show it for review.
    assert any(ex.entity_id == a_archived for ex in scope_default.exclusions)
    assert any(ex.entity_id == a_archived for ex in scope_audit.exclusions)


def test_empty_fund_returns_vacuous_complete_scope():
    fund_id = uuid4()
    rows: list[dict] = []

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )

    assert scope.expected_investment_count == 0
    assert scope.expected_asset_count == 0
    assert scope.nav_eligible_asset_ids == set()
    assert scope.exclusions == []


def test_investment_with_zero_active_assets_is_excluded():
    fund_id = uuid4()
    deal_id = uuid4()
    archived = uuid4()
    rows = [
        _row(
            deal_id=deal_id,
            deal_name="All Archived",
            stage="operating",
            asset_id=archived,
            asset_name="Old",
            archived_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        ),
    ]

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )

    assert deal_id not in scope.expected_investment_ids
    assert any(
        ex.entity_id == deal_id and ex.reason == "no_active_assets"
        for ex in scope.exclusions
    )


def test_receipt_dict_contains_all_required_keys():
    fund_id = uuid4()
    deal_id = uuid4()
    a1 = uuid4()
    rows = [
        _row(deal_id=deal_id, deal_name="Deal", stage="operating", asset_id=a1, asset_name="A"),
    ]

    scope = _bucket_scope_rows(
        fund_id=fund_id, as_of_quarter="2026Q2", rows=rows, audit_mode=False
    )
    receipt = scope.to_receipt_dict()

    for key in (
        "fund_id",
        "as_of_quarter",
        "scope_contract_version",
        "expected_investment_count",
        "expected_asset_count",
        "expected_investment_ids",
        "expected_asset_ids",
        "nav_eligible_asset_ids",
        "exclusion_count",
        "exclusions",
        "audit_mode",
    ):
        assert key in receipt
    assert receipt["scope_contract_version"] == SCOPE_CONTRACT_VERSION
