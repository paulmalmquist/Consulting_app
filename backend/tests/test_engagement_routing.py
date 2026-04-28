"""Engagement Routing tests.

Routing health is pure — no cursor needed. We exercise the spec rules:
- non-Novendor contracting entity ⇒ RED
- Novendor + missing split ⇒ YELLOW
- Novendor + signed contract + revenue + attribution + owners + next action ⇒ GREEN
- invoice activity with no revenue stream ⇒ RED
- economics percentages summing wrong ⇒ YELLOW with reason

Plus invoice rollups, recommended actions, and split warnings.
"""
from __future__ import annotations

from decimal import Decimal

from app.services.engagement_routing import (
    NOVENDOR_ENTITY,
    _compute_rollups,
    calculate_routing_health,
    recommend_next_actions,
)


def _engagement(**overrides) -> dict:
    base = {
        "contracting_entity": NOVENDOR_ENTITY,
        "routing_status": "active",
        "relationship_owner_user_id": "paul",
        "delivery_owner_user_id": "paul",
        "next_action_text": "Prepare delivery kickoff",
        "next_action_task_id": None,
        "marketing_permission_status": "approved_logo",
        "expected_roi_angle": "30% reduction in cycle time",
    }
    base.update(overrides)
    return base


def _fully_signed_contract() -> dict:
    return {"status": "fully_signed", "contract_type": "SOW"}


def _basic_revenue_stream() -> dict:
    return {"revenue_type": "fixed", "total_contract_value": Decimal("35000")}


def _balanced_attribution() -> list[dict]:
    return [
        {"role": "originator", "economics_percentage": 0.5, "credit_percentage": 1.0},
        {"role": "delivery_owner", "economics_percentage": 0.5, "credit_percentage": 0.0},
    ]


# ── RED ─────────────────────────────────────────────────────────────────────


class TestRoutingHealthRed:
    def test_non_novendor_contracting_entity_is_red(self):
        result = calculate_routing_health(
            engagement=_engagement(contracting_entity="Paul Malmquist (personal)"),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "red"
        assert result["personal_risk"] is True
        assert result["novendor_compounding_status"] == "non_compounding"
        assert "Contracting entity is not Novendor LLC" in result["routing_health_reasons"]

    def test_empty_contracting_entity_is_red(self):
        result = calculate_routing_health(
            engagement=_engagement(contracting_entity=""),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "red"
        assert "Contracting entity is not set" in result["routing_health_reasons"]

    def test_active_engagement_with_no_contract_is_red(self):
        result = calculate_routing_health(
            engagement=_engagement(),
            contracts=[],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "red"
        assert "No signed contract attached" in result["routing_health_reasons"]

    def test_invoice_activity_without_revenue_stream_is_red(self):
        result = calculate_routing_health(
            engagement=_engagement(),
            contracts=[_fully_signed_contract()],
            revenue_streams=[],
            invoices=[{"status": "invoiced", "amount": Decimal("5000")}],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "red"
        assert "Invoice activity with no revenue stream" in result["routing_health_reasons"]


# ── YELLOW ──────────────────────────────────────────────────────────────────


class TestRoutingHealthYellow:
    def test_novendor_with_missing_split_is_yellow(self):
        result = calculate_routing_health(
            engagement=_engagement(),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=[],
        )
        assert result["routing_health_status"] == "yellow"
        assert result["novendor_compounding_status"] == "partial"
        assert "Economics split missing" in result["routing_health_reasons"]

    def test_novendor_with_unsigned_contract_is_yellow(self):
        result = calculate_routing_health(
            engagement=_engagement(),
            contracts=[{"status": "draft", "contract_type": "SOW"}],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "yellow"
        assert "Missing signed contract" in result["routing_health_reasons"]

    def test_novendor_missing_owners_is_yellow(self):
        result = calculate_routing_health(
            engagement=_engagement(
                relationship_owner_user_id=None,
                delivery_owner_user_id=None,
            ),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "yellow"
        reasons = result["routing_health_reasons"]
        assert "No relationship owner" in reasons
        assert "No delivery owner" in reasons

    def test_active_engagement_without_next_action_is_yellow(self):
        result = calculate_routing_health(
            engagement=_engagement(next_action_text=None, next_action_task_id=None),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "yellow"
        assert "No next action" in result["routing_health_reasons"]

    def test_economics_split_imbalanced_is_yellow(self):
        result = calculate_routing_health(
            engagement=_engagement(),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=[
                {"role": "originator", "economics_percentage": 0.4},
                {"role": "delivery_owner", "economics_percentage": 0.5},
            ],
        )
        assert result["routing_health_status"] == "yellow"
        assert any("Economics split totals" in r for r in result["routing_health_reasons"])


# ── GREEN ───────────────────────────────────────────────────────────────────


class TestRoutingHealthGreen:
    def test_fully_routed_engagement_is_green(self):
        result = calculate_routing_health(
            engagement=_engagement(),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "green"
        assert result["properly_routed"] is True
        assert result["personal_risk"] is False
        assert result["novendor_compounding_status"] == "compounds"
        assert result["routing_health_reasons"] == []

    def test_green_with_paid_invoices_stays_green(self):
        result = calculate_routing_health(
            engagement=_engagement(),
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[{"status": "paid", "amount": Decimal("17500")}],
            attribution=_balanced_attribution(),
        )
        assert result["routing_health_status"] == "green"


# ── Recommended next actions ─────────────────────────────────────────────────


class TestRecommendedActions:
    def test_red_engagement_recommends_novendor_conversion(self):
        engagement = _engagement(contracting_entity="Personal")
        health = calculate_routing_health(
            engagement=engagement,
            contracts=[],
            revenue_streams=[],
            invoices=[],
            attribution=[],
        )
        recs = recommend_next_actions(health=health, engagement=engagement)
        assert "Convert to Novendor contracting path" in recs

    def test_yellow_recommends_filling_specific_gaps(self):
        engagement = _engagement(
            relationship_owner_user_id=None,
            delivery_owner_user_id=None,
        )
        health = calculate_routing_health(
            engagement=engagement,
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=[],
        )
        recs = recommend_next_actions(health=health, engagement=engagement)
        assert "Define economics split" in recs
        assert "Assign relationship owner" in recs
        assert "Assign delivery owner" in recs

    def test_green_with_unknown_marketing_still_recommends_capture(self):
        engagement = _engagement(marketing_permission_status="unknown")
        health = calculate_routing_health(
            engagement=engagement,
            contracts=[_fully_signed_contract()],
            revenue_streams=[_basic_revenue_stream()],
            invoices=[],
            attribution=_balanced_attribution(),
        )
        recs = recommend_next_actions(health=health, engagement=engagement)
        assert "Capture marketing permission status" in recs


# ── Invoice rollups ─────────────────────────────────────────────────────────


class TestInvoiceRollups:
    def test_billed_collected_outstanding_split(self):
        invoices = [
            {"status": "paid", "amount": Decimal("10000")},
            {"status": "invoiced", "amount": Decimal("5000")},
            {"status": "draft", "amount": Decimal("3000")},  # not billed
        ]
        revenue_streams = [
            {"total_contract_value": Decimal("35000")},
        ]
        rollup = _compute_rollups(invoices, revenue_streams)
        assert rollup["billed"] == Decimal("15000")
        assert rollup["collected"] == Decimal("10000")
        assert rollup["outstanding"] == Decimal("5000")
        assert rollup["contract_value"] == Decimal("35000")

    def test_overdue_invoices_count_as_billed(self):
        invoices = [
            {"status": "overdue", "amount": Decimal("8000")},
        ]
        rollup = _compute_rollups(invoices, [])
        assert rollup["billed"] == Decimal("8000")
        assert rollup["collected"] == Decimal("0")
        assert rollup["outstanding"] == Decimal("8000")

    def test_empty_invoices_yields_zero_rollups(self):
        rollup = _compute_rollups([], [])
        assert rollup["billed"] == Decimal("0")
        assert rollup["collected"] == Decimal("0")
        assert rollup["outstanding"] == Decimal("0")
        assert rollup["contract_value"] == Decimal("0")
