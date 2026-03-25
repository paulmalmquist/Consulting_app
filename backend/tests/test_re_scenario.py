"""Tests for the RE v2 scenario and assumption system.

Verifies assumption resolution, override precedence, and hash determinism.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import app.routes.re_v2 as re_v2_routes
from tests.conftest import FakeCursor
from app.services import re_scenario


class TestScenarioCRUD:
    """Scenario creation and listing via API routes."""

    def test_create_scenario(self, client, monkeypatch):
        fund_id = str(uuid4())
        scenario_id = str(uuid4())

        monkeypatch.setattr(
            re_v2_routes.re_scenario,
            "create_scenario",
            lambda **_: {
                "scenario_id": scenario_id,
                "fund_id": fund_id,
                "name": "Downside",
                "description": "10% NOI stress",
                "scenario_type": "custom",
                "is_base": False,
                "parent_scenario_id": None,
                "base_assumption_set_id": None,
                "status": "active",
                "created_at": "2026-01-15T00:00:00",
            },
        )
        resp = client.post(
            f"/api/re/v2/funds/{fund_id}/scenarios",
            json={"name": "Downside", "description": "10% NOI stress"},
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "Downside"
        assert resp.json()["is_base"] is False

    def test_list_scenarios_base_first(self, client, monkeypatch):
        fund_id = str(uuid4())

        monkeypatch.setattr(
            re_v2_routes.re_scenario,
            "list_scenarios",
            lambda **_: [
                {
                    "scenario_id": str(uuid4()),
                    "fund_id": fund_id,
                    "name": "Base",
                    "description": None,
                    "scenario_type": "base",
                    "is_base": True,
                    "parent_scenario_id": None,
                    "base_assumption_set_id": None,
                    "status": "active",
                    "created_at": "2026-01-01T00:00:00",
                },
                {
                    "scenario_id": str(uuid4()),
                    "fund_id": fund_id,
                    "name": "Upside",
                    "description": None,
                    "scenario_type": "custom",
                    "is_base": False,
                    "parent_scenario_id": None,
                    "base_assumption_set_id": None,
                    "status": "active",
                    "created_at": "2026-01-02T00:00:00",
                },
            ],
        )
        resp = client.get(f"/api/re/v2/funds/{fund_id}/scenarios")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["is_base"] is True


class TestOverrides:
    """Override CRUD via API routes."""

    def test_set_override(self, client, monkeypatch):
        scenario_id = str(uuid4())
        node_id = str(uuid4())

        monkeypatch.setattr(
            re_v2_routes.re_scenario,
            "set_override",
            lambda **_: {
                "override_id": str(uuid4()),
                "scenario_id": scenario_id,
                "scope_node_type": "asset",
                "scope_node_id": node_id,
                "key": "cap_rate",
                "value_type": "decimal",
                "value_decimal": "0.065",
                "value_int": None,
                "value_text": None,
                "value_json": None,
                "reason": "Stressed cap rate",
                "is_active": True,
                "created_at": "2026-01-15T00:00:00",
            },
        )
        resp = client.post(
            f"/api/re/v2/scenarios/{scenario_id}/overrides",
            json={
                "scope_node_type": "asset",
                "scope_node_id": node_id,
                "key": "cap_rate",
                "value_decimal": 0.065,
                "reason": "Stressed cap rate",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["key"] == "cap_rate"

    def test_list_overrides(self, client, monkeypatch):
        scenario_id = str(uuid4())

        monkeypatch.setattr(
            re_v2_routes.re_scenario,
            "list_overrides",
            lambda **_: [
                {
                    "override_id": str(uuid4()),
                    "scenario_id": scenario_id,
                    "scope_node_type": "fund",
                    "scope_node_id": str(uuid4()),
                    "key": "discount_rate",
                    "value_type": "decimal",
                    "value_decimal": "0.10",
                    "value_int": None,
                    "value_text": None,
                    "value_json": None,
                    "reason": None,
                    "is_active": True,
                    "created_at": "2026-01-15T00:00:00",
                },
            ],
        )
        resp = client.get(f"/api/re/v2/scenarios/{scenario_id}/overrides")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestAssumptionResolution:
    """Verify resolve_assumptions with override precedence."""

    def test_base_assumptions_only(self, fake_cursor: FakeCursor):
        scenario_id = uuid4()
        set_id = str(uuid4())

        # get_scenario
        fake_cursor.push_result([{
            "scenario_id": str(scenario_id),
            "fund_id": str(uuid4()),
            "name": "Base",
            "scenario_type": "base",
            "is_base": True,
            "parent_scenario_id": None,
            "base_assumption_set_id": set_id,
            "status": "active",
        }])
        # assumption values
        fake_cursor.push_result([
            {
                "key": "cap_rate",
                "value_type": "decimal",
                "value_decimal": "0.06",
                "value_int": None,
                "value_text": None,
                "value_json": None,
            },
            {
                "key": "growth_rate",
                "value_type": "decimal",
                "value_decimal": "0.03",
                "value_int": None,
                "value_text": None,
                "value_json": None,
            },
        ])
        # list_overrides
        fake_cursor.push_result([])

        assumptions, h = re_scenario.resolve_assumptions(scenario_id=scenario_id)
        assert assumptions["cap_rate"] == Decimal("0.06")
        assert assumptions["growth_rate"] == Decimal("0.03")
        assert isinstance(h, str)
        assert len(h) == 64  # SHA256 hex

    def test_override_takes_precedence(self, fake_cursor: FakeCursor):
        scenario_id = uuid4()
        fund_id = uuid4()
        set_id = str(uuid4())

        # get_scenario
        fake_cursor.push_result([{
            "scenario_id": str(scenario_id),
            "fund_id": str(fund_id),
            "name": "Stress",
            "scenario_type": "custom",
            "is_base": False,
            "parent_scenario_id": None,
            "base_assumption_set_id": set_id,
            "status": "active",
        }])
        # base assumption values
        fake_cursor.push_result([
            {
                "key": "cap_rate",
                "value_type": "decimal",
                "value_decimal": "0.06",
                "value_int": None,
                "value_text": None,
                "value_json": None,
            },
        ])
        # list_overrides: fund-level override on cap_rate
        fake_cursor.push_result([
            {
                "override_id": str(uuid4()),
                "scenario_id": str(scenario_id),
                "scope_node_type": "fund",
                "scope_node_id": str(fund_id),
                "key": "cap_rate",
                "value_type": "decimal",
                "value_decimal": "0.075",
                "value_int": None,
                "value_text": None,
                "value_json": None,
                "is_active": True,
            },
        ])

        assumptions, _ = re_scenario.resolve_assumptions(
            scenario_id=scenario_id,
            node_path={"fund_id": str(fund_id)},
        )
        # Override should win
        assert assumptions["cap_rate"] == Decimal("0.075")

    def test_hash_determinism(self, fake_cursor: FakeCursor):
        """Same inputs produce same hash across calls."""
        scenario_id = uuid4()

        def _push_scenario_data():
            fake_cursor._result_idx = 0
            fake_cursor._results = []
            fake_cursor.push_result([{
                "scenario_id": str(scenario_id),
                "fund_id": str(uuid4()),
                "name": "Base",
                "scenario_type": "base",
                "is_base": True,
                "parent_scenario_id": None,
                "base_assumption_set_id": str(uuid4()),
                "status": "active",
            }])
            fake_cursor.push_result([
                {
                    "key": "cap_rate",
                    "value_type": "decimal",
                    "value_decimal": "0.06",
                    "value_int": None,
                    "value_text": None,
                    "value_json": None,
                },
            ])
            fake_cursor.push_result([])

        _push_scenario_data()
        _, h1 = re_scenario.resolve_assumptions(scenario_id=scenario_id)

        _push_scenario_data()
        _, h2 = re_scenario.resolve_assumptions(scenario_id=scenario_id)

        assert h1 == h2


class TestExtractValue:
    """Unit tests for _extract_value helper."""

    def test_decimal_value(self):
        row = {"value_type": "decimal", "value_decimal": "0.06"}
        assert re_scenario._extract_value(row) == Decimal("0.06")

    def test_int_value(self):
        row = {"value_type": "int", "value_int": 5, "value_decimal": None}
        assert re_scenario._extract_value(row) == 5

    def test_string_value(self):
        row = {"value_type": "string", "value_text": "office", "value_decimal": None, "value_int": None}
        assert re_scenario._extract_value(row) == "office"

    def test_bool_true(self):
        row = {"value_type": "bool", "value_text": "true", "value_decimal": None, "value_int": None}
        assert re_scenario._extract_value(row) is True

    def test_bool_false(self):
        row = {"value_type": "bool", "value_text": "no", "value_decimal": None, "value_int": None}
        assert re_scenario._extract_value(row) is False

    def test_curve_json(self):
        curve = {"2026Q1": 0.06, "2026Q2": 0.065}
        row = {"value_type": "curve_json", "value_json": curve, "value_decimal": None, "value_int": None, "value_text": None}
        assert re_scenario._extract_value(row) == curve
