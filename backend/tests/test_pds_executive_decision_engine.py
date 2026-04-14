from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.pds_executive import decision_engine, queue as queue_svc


def _catalog_map() -> dict[str, dict[str, str]]:
    return {f"D{i:02d}": {"decision_title": f"Decision D{i:02d}"} for i in range(1, 21)}


def _calm_metrics() -> dict:
    project_id = uuid4()
    return {
        "projects": [
            {
                "project_id": project_id,
                "project_manager": "PM-A",
                "approved_budget": Decimal("1000000"),
                "forecast_at_completion": Decimal("1000000"),
                "risk_score": Decimal("10000"),
                "next_milestone_date": date(2026, 3, 15),
            }
        ],
        "change_orders_pending": [],
        "risks_open": [],
        "claims_open": [],
        "survey_low": [],
        "crm_open": [],
        "crm_pipeline_value_open": Decimal("0"),
        "comm_recent": [],
        "market_snapshot": {
            "interest_rate": "4.25",
            "steel_index": "105",
            "lumber_index": "101",
            "labor_tightness": "0.45",
        },
        "portfolio_snapshot": None,
    }


def _set_today(monkeypatch: pytest.MonkeyPatch, day: date) -> None:
    class FakeDate(date):
        @classmethod
        def today(cls):
            return cls(day.year, day.month, day.day)

    monkeypatch.setattr(decision_engine, "date", FakeDate)


def _evaluate_target(monkeypatch: pytest.MonkeyPatch, decision_code: str, metrics: dict, today: date) -> bool:
    monkeypatch.setattr(decision_engine.catalog, "get_decision_catalog_map", lambda active_only=True: _catalog_map())
    monkeypatch.setattr(decision_engine.catalog, "get_threshold_policy_map", lambda **_: {})
    monkeypatch.setattr(decision_engine, "_load_metrics", lambda **_: metrics)
    _set_today(monkeypatch, today)

    rows = decision_engine.evaluate_decisions(env_id=uuid4(), business_id=uuid4())
    by_code = {row.decision_code: row for row in rows}
    return bool(by_code[decision_code].triggered)


def _with_projects(count: int, *, manager: str, risky: bool = False) -> list[dict]:
    projects = []
    for _ in range(count):
        projects.append(
            {
                "project_id": uuid4(),
                "project_manager": manager,
                "approved_budget": Decimal("1000000"),
                "forecast_at_completion": Decimal("1250000") if risky else Decimal("1000000"),
                "risk_score": Decimal("90000") if risky else Decimal("12000"),
                "next_milestone_date": date(2026, 3, 15),
            }
        )
    return projects


def _merge(metrics: dict, updates: dict) -> dict:
    out = dict(metrics)
    out.update(updates)
    return out


SCENARIOS = {
    "D01": {
        "trigger_day": date(2026, 1, 5),
        "trigger_mutation": lambda m: m,
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D02": {
        "trigger_day": date(2026, 2, 3),
        "trigger_mutation": lambda m: m,
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D03": {
        "trigger_day": date(2026, 2, 15),
        "trigger_mutation": lambda m: m,
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D04": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"crm_open": [{"win_probability": Decimal("0.70"), "amount": Decimal("500000")}] }),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D05": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"crm_open": [{"win_probability": Decimal("0.20"), "amount": Decimal("450000")}] }),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: _merge(m, {"crm_open": [{"win_probability": Decimal("0.60"), "amount": Decimal("450000")}] }),
    },
    "D06": {
        "trigger_day": date(2026, 2, 16),
        "trigger_mutation": lambda m: m,
        "non_trigger_day": date(2026, 2, 19),
        "non_trigger_mutation": lambda m: m,
    },
    "D07": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {
            "projects": [
                {
                    "project_id": uuid4(),
                    "project_manager": "PM-X",
                    "approved_budget": Decimal("1000000"),
                    "forecast_at_completion": Decimal("1250000"),
                    "risk_score": Decimal("95000"),
                    "next_milestone_date": date(2026, 1, 1),
                }
            ]
        }),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D08": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"change_orders_pending": [{}, {}, {}]}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: _merge(m, {"change_orders_pending": [{}]}),
    },
    "D09": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"claims_open": [{"claimed_amount": Decimal("12000")}, {"claimed_amount": Decimal("18000")}]}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: _merge(m, {"claims_open": [{"claimed_amount": Decimal("12000")}]}),
    },
    "D10": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"projects": _with_projects(5, manager="PM-A")}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D11": {
        "trigger_day": date(2026, 2, 3),
        "trigger_mutation": lambda m: m,
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D12": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"projects": _with_projects(2, manager="PM-R", risky=True)}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: _merge(m, {"projects": _with_projects(1, manager="PM-R", risky=True)}),
    },
    "D13": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"projects": _with_projects(4, manager="PM-H")}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D14": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"projects": _with_projects(3, manager="PM-A") + _with_projects(1, manager="PM-B")}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: _merge(m, {"projects": _with_projects(2, manager="PM-A") + _with_projects(2, manager="PM-B")}),
    },
    "D15": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"comm_recent": [{"classification": "risk_alert"}]}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D16": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"survey_low": [{"score": Decimal("2.2")}]}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D17": {
        "trigger_day": date(2026, 2, 7),
        "trigger_mutation": lambda m: m,
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D18": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"claims_open": [{"exposure_amount": Decimal("325000")}]}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: _merge(m, {"claims_open": [{"exposure_amount": Decimal("120000")}]}),
    },
    "D19": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"market_snapshot": {"interest_rate": "6.10"}}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
    "D20": {
        "trigger_day": date(2026, 2, 20),
        "trigger_mutation": lambda m: _merge(m, {"comm_recent": [{"classification": "status_update", "subject": "Regulatory controversy alert", "summary_text": ""}]}),
        "non_trigger_day": date(2026, 2, 20),
        "non_trigger_mutation": lambda m: m,
    },
}


@pytest.mark.parametrize("decision_code", sorted(SCENARIOS.keys()))
def test_each_decision_has_trigger_and_non_trigger(monkeypatch: pytest.MonkeyPatch, decision_code: str):
    scenario = SCENARIOS[decision_code]

    trigger_metrics = scenario["trigger_mutation"](deepcopy(_calm_metrics()))
    assert _evaluate_target(monkeypatch, decision_code, trigger_metrics, scenario["trigger_day"]) is True

    non_trigger_metrics = scenario["non_trigger_mutation"](deepcopy(_calm_metrics()))
    assert _evaluate_target(monkeypatch, decision_code, non_trigger_metrics, scenario["non_trigger_day"]) is False


class _QueueCursor:
    def __init__(self):
        self.calls: list[tuple[str, tuple | None]] = []
        self._mode = ""

    def execute(self, sql: str, params=None):
        self.calls.append((sql, params))
        if "FROM pds_exec_queue_item" in sql and sql.strip().lower().startswith("select"):
            self._mode = "select_existing"
        elif "UPDATE pds_exec_queue_item" in sql:
            self._mode = "update_existing"
        return self

    def fetchone(self):
        if self._mode == "select_existing":
            return {
                "queue_item_id": uuid4(),
                "priority": "high",
                "status": "open",
            }
        if self._mode == "update_existing":
            return {
                "queue_item_id": uuid4(),
                "priority": "high",
                "status": "open",
                "updated_at": datetime.utcnow(),
            }
        return None


@pytest.fixture
def queue_cursor(monkeypatch: pytest.MonkeyPatch):
    cursor = _QueueCursor()

    class _Ctx:
        def __enter__(self):
            return cursor

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(queue_svc, "get_cursor", lambda: _Ctx())
    return cursor


def test_queue_priority_rank_ordering():
    assert queue_svc._priority_rank("critical") > queue_svc._priority_rank("high")
    assert queue_svc._priority_rank("high") > queue_svc._priority_rank("medium")


def test_queue_upsert_dedupes_existing(queue_cursor):
    result = queue_svc.upsert_queue_item(
        env_id=uuid4(),
        business_id=uuid4(),
        decision_code="D07",
        title="Escalate project",
        summary="Budget and schedule drift",
        priority="medium",
        recommended_action="Escalate",
        recommended_owner="Exec",
        due_at=None,
        risk_score=Decimal("3"),
        project_id=None,
        signal_event_id=None,
        context_json={},
        ai_analysis_json={},
        input_snapshot_json={},
        actor="tester",
    )
    assert result["priority"] == "high"


def test_queue_upsert_casts_nullable_correlation_key(queue_cursor):
    queue_svc.upsert_queue_item(
        env_id=uuid4(),
        business_id=uuid4(),
        decision_code="D07",
        title="Escalate project",
        summary="Budget and schedule drift",
        priority="medium",
        recommended_action="Escalate",
        recommended_owner="Exec",
        due_at=None,
        risk_score=Decimal("3"),
        project_id=None,
        signal_event_id=None,
        context_json={},
        ai_analysis_json={},
        input_snapshot_json={},
        correlation_key=None,
        actor="tester",
    )

    select_sql, _params = queue_cursor.calls[0]
    assert "%s::text IS NULL" in select_sql
    assert "COALESCE(context_json->>'correlation_key', '') = %s::text" in select_sql
