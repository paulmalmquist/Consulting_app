"""Tests for Loop Intelligence in the Consulting Revenue OS."""

import uuid
from datetime import datetime
from decimal import Decimal

from tests.conftest import FakeCursor


ENV_ID = "test-consulting-env"
BUSINESS_ID = str(uuid.uuid4())
CLIENT_ID = str(uuid.uuid4())
LOOP_ID = str(uuid.uuid4())
INTERVENTION_ID = str(uuid.uuid4())
NOW = datetime(2026, 3, 2, 12, 0, 0).isoformat()


def make_loop_row(**overrides):
    row = {
        "id": LOOP_ID,
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "client_id": None,
        "name": "Monthly Financial Reporting Loop",
        "process_domain": "reporting",
        "description": "Monthly close package",
        "trigger_type": "scheduled",
        "frequency_type": "monthly",
        "frequency_per_year": Decimal("12"),
        "status": "observed",
        "control_maturity_stage": 2,
        "automation_readiness_score": 58,
        "avg_wait_time_minutes": Decimal("180"),
        "rework_rate_percent": Decimal("10"),
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def make_role_rows():
    return [
        {
            "id": str(uuid.uuid4()),
            "loop_id": LOOP_ID,
            "role_name": "Analyst",
            "loaded_hourly_rate": Decimal("100"),
            "active_minutes": Decimal("60"),
            "notes": "Primary operator",
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "id": str(uuid.uuid4()),
            "loop_id": LOOP_ID,
            "role_name": "Manager",
            "loaded_hourly_rate": Decimal("200"),
            "active_minutes": Decimal("30"),
            "notes": "Approver",
            "created_at": NOW,
            "updated_at": NOW,
        },
    ]


class TestCreateLoop:
    def test_create_loop_computes_costs(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([make_loop_row()])
        fake_cursor.push_result(make_role_rows())

        response = client.post(
            "/api/consulting/loops",
            json={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "name": "Monthly Financial Reporting Loop",
                "process_domain": "reporting",
                "description": "Monthly close package",
                "trigger_type": "scheduled",
                "frequency_type": "monthly",
                "frequency_per_year": "12",
                "status": "observed",
                "control_maturity_stage": 2,
                "automation_readiness_score": 58,
                "avg_wait_time_minutes": "180",
                "rework_rate_percent": "10",
                "roles": [
                    {
                        "role_name": "Analyst",
                        "loaded_hourly_rate": "100",
                        "active_minutes": "60",
                    },
                    {
                        "role_name": "Manager",
                        "loaded_hourly_rate": "200",
                        "active_minutes": "30",
                    },
                ],
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["role_count"] == 2
        assert float(data["loop_cost_per_run"]) == 220
        assert float(data["annual_estimated_cost"]) == 2640
        assert len(data["roles"]) == 2
        assert data["interventions"] == []

    def test_rejects_out_of_scope_client(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([])

        response = client.post(
            "/api/consulting/loops",
            json={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "client_id": CLIENT_ID,
                "name": "Monthly Financial Reporting Loop",
                "process_domain": "reporting",
                "description": "Monthly close package",
                "trigger_type": "scheduled",
                "frequency_type": "monthly",
                "frequency_per_year": "12",
                "status": "observed",
                "control_maturity_stage": 2,
                "automation_readiness_score": 58,
                "avg_wait_time_minutes": "180",
                "rework_rate_percent": "10",
                "roles": [
                    {
                        "role_name": "Analyst",
                        "loaded_hourly_rate": "100",
                        "active_minutes": "60",
                    },
                ],
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"]["error_code"] == "VALIDATION_ERROR"


class TestListLoops:
    def test_list_loops_returns_env_scoped_rows(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([make_loop_row()])
        fake_cursor.push_result(make_role_rows())

        response = client.get(
            f"/api/consulting/loops?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Monthly Financial Reporting Loop"
        assert fake_cursor.queries[0][1] == (ENV_ID, BUSINESS_ID)


class TestLoopDetail:
    def test_detail_returns_roles_and_interventions(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([make_loop_row()])
        fake_cursor.push_result(make_role_rows())
        fake_cursor.push_result([
            {
                "id": INTERVENTION_ID,
                "loop_id": LOOP_ID,
                "intervention_type": "data_standardize",
                "notes": "Standardized intake fields",
                "before_snapshot": {"schema_version": 1},
                "after_snapshot": None,
                "observed_delta_percent": Decimal("12"),
                "created_at": NOW,
                "updated_at": NOW,
            }
        ])

        response = client.get(
            f"/api/consulting/loops/{LOOP_ID}?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["roles"]) == 2
        assert len(data["interventions"]) == 1
        assert data["interventions"][0]["before_snapshot"]["schema_version"] == 1

    def test_detail_returns_404_when_missing(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([])

        response = client.get(
            f"/api/consulting/loops/{LOOP_ID}?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )

        assert response.status_code == 404
        assert response.json()["detail"]["error_code"] == "NOT_FOUND"


class TestUpdateLoop:
    def test_update_replaces_roles_and_recomputes(self, client, fake_cursor: FakeCursor):
        updated_row = make_loop_row(
            frequency_per_year=Decimal("24"),
            rework_rate_percent=Decimal("0"),
            updated_at=datetime(2026, 3, 2, 13, 0, 0).isoformat(),
        )
        fake_cursor.push_result([updated_row])
        fake_cursor.push_result([
            {
                "id": str(uuid.uuid4()),
                "loop_id": LOOP_ID,
                "role_name": "Analyst",
                "loaded_hourly_rate": Decimal("120"),
                "active_minutes": Decimal("60"),
                "notes": None,
                "created_at": NOW,
                "updated_at": NOW,
            }
        ])
        fake_cursor.push_result([])

        response = client.put(
            f"/api/consulting/loops/{LOOP_ID}?env_id={ENV_ID}&business_id={BUSINESS_ID}",
            json={
                "name": "Monthly Financial Reporting Loop",
                "process_domain": "reporting",
                "description": "Updated",
                "trigger_type": "scheduled",
                "frequency_type": "monthly",
                "frequency_per_year": "24",
                "status": "automating",
                "control_maturity_stage": 4,
                "automation_readiness_score": 72,
                "avg_wait_time_minutes": "120",
                "rework_rate_percent": "0",
                "roles": [
                    {
                        "role_name": "Analyst",
                        "loaded_hourly_rate": "120",
                        "active_minutes": "60",
                    }
                ],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["role_count"] == 1
        assert float(data["loop_cost_per_run"]) == 120
        assert float(data["annual_estimated_cost"]) == 2880


class TestInterventions:
    def test_intervention_auto_populates_before_snapshot(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([make_loop_row()])
        fake_cursor.push_result(make_role_rows())
        fake_cursor.push_result([
            {
                "id": INTERVENTION_ID,
                "loop_id": LOOP_ID,
                "intervention_type": "data_standardize",
                "notes": "Standardized intake fields",
                "before_snapshot": {
                    "schema_version": 1,
                    "captured_at": NOW,
                },
                "after_snapshot": None,
                "observed_delta_percent": Decimal("12"),
                "created_at": NOW,
                "updated_at": NOW,
            }
        ])

        response = client.post(
            f"/api/consulting/loops/{LOOP_ID}/interventions?env_id={ENV_ID}&business_id={BUSINESS_ID}",
            json={
                "intervention_type": "data_standardize",
                "notes": "Standardized intake fields",
                "observed_delta_percent": "12",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["before_snapshot"]["schema_version"] == 1
        assert float(data["loop_metrics"]["annual_estimated_cost"]) == 2640


class TestLoopSummary:
    def test_summary_returns_aggregates_and_zero_filled_statuses(self, client, fake_cursor: FakeCursor):
        loop_a = make_loop_row(
            id=str(uuid.uuid4()),
            name="Monthly Financial Reporting Loop",
            status="observed",
            control_maturity_stage=2,
            frequency_per_year=Decimal("12"),
            rework_rate_percent=Decimal("10"),
        )
        loop_b = make_loop_row(
            id=str(uuid.uuid4()),
            name="Invoice Approval Loop",
            status="simplifying",
            control_maturity_stage=4,
            frequency_per_year=Decimal("52"),
            rework_rate_percent=Decimal("0"),
        )
        fake_cursor.push_result([loop_a, loop_b])
        fake_cursor.push_result(make_role_rows())
        fake_cursor.push_result([
            {
                "id": str(uuid.uuid4()),
                "loop_id": loop_b["id"],
                "role_name": "AP Specialist",
                "loaded_hourly_rate": Decimal("80"),
                "active_minutes": Decimal("30"),
                "notes": None,
                "created_at": NOW,
                "updated_at": NOW,
            }
        ])

        response = client.get(
            f"/api/consulting/loops/summary?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )

        assert response.status_code == 200
        data = response.json()
        assert float(data["total_annual_cost"]) == 4720
        assert float(data["avg_maturity_stage"]) == 3
        assert data["top_5_by_cost"][0]["name"] == "Monthly Financial Reporting Loop"
        assert data["status_counts"]["automating"] == 0
        assert data["status_counts"]["stabilized"] == 0
