"""Tests for the consulting pipeline operator layer."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from tests.conftest import FakeCursor


ENV_ID = "test-consulting-env"
BUSINESS_ID = str(uuid.uuid4())
TENANT_ID = str(uuid.uuid4())
ACCOUNT_ID = str(uuid.uuid4())
OPPORTUNITY_ID = str(uuid.uuid4())
NOW = datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc)


def _base_row(**overrides):
    row = {
        "crm_opportunity_id": OPPORTUNITY_ID,
        "crm_account_id": ACCOUNT_ID,
        "name": "AI Operator Rollout",
        "amount": Decimal("150000"),
        "status": "open",
        "expected_close_date": NOW.date().isoformat(),
        "created_at": NOW.isoformat(),
        "account_name": "Baptist Health",
        "industry": "healthcare",
        "stage_key": "identified",
        "stage_label": "Identified",
        "stage_order": 10,
        "win_probability": Decimal("0.10"),
        "contact_name": "Dana Ops",
        "personas": ["COO"],
        "pain_hypothesis": "follow-through depends on manual handoffs",
        "value_prop": "force execution and rotate follow-up tactics",
        "demo_angle": "show the pressure queue and operator board",
        "priority_score": 85,
        "engagement_summary": "Strong fit but no recent motion.",
        "execution_pressure": "medium",
        "momentum_status": "flat",
        "risk_flags": [],
        "deal_drift_status": "stable",
        "deal_playbook": {},
        "auto_draft_stack": {},
        "execution_state": {},
        "narrative_memory": {"last_outbound_angle": "economic", "latest_objection_surfaced": "timing"},
        "snoozed_until": None,
        "snooze_reason": None,
        "last_ai_generated_at": None,
        "last_activity_at": (NOW - timedelta(days=9)).isoformat(),
        "next_action_description": None,
        "next_action_due": None,
        "next_action_type": None,
        "no_reply_count": 2,
        "recent_reply_at": None,
        "meeting_booked": False,
    }
    row.update(overrides)
    return row


class TestExecutionBoard:
    def test_execution_board_surfaces_critical_pressure(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        fake_cursor.push_result([_base_row()])

        response = client.get(
            f"/api/consulting/pipeline/execution-board?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["today_queue"][0]["execution_pressure"] == "critical"
        assert "stalled_7d" in data["today_queue"][0]["risk_flags"]
        assert data["critical_deals"][0]["crm_opportunity_id"] == OPPORTUNITY_ID


class TestExecutionCommands:
    def test_move_command_requires_confirmation(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        fake_cursor.push_result([_base_row(account_name="Baptist", name="Baptist Pilot")])
        fake_cursor.push_result([{"id": str(uuid.uuid4())}])

        response = client.post(
            "/api/consulting/pipeline/command",
            json={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "command": "move Baptist to engaged",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["intent"] == "move"
        assert data["requires_confirmation"] is True
        assert data["result"]["target_stage"] == "engaged"


class TestFollowupGeneration:
    def test_followups_rotate_away_from_last_angle(self, client, fake_cursor: FakeCursor):
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        fake_cursor.push_result([_base_row()])
        fake_cursor.push_result([{"id": str(uuid.uuid4())}])

        response = client.post(
            f"/api/consulting/pipeline/{OPPORTUNITY_ID}/generate-followups",
            json={"env_id": ENV_ID, "business_id": BUSINESS_ID},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["followups"]) == 3
        assert data["followups"][0]["angle_key"] != "economic"
