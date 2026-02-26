"""Tests for the Consulting Revenue OS – Outreach endpoints.

Tests:
- Create outreach template
- List outreach templates
- Log outreach touch (creates activity + bumps template use_count)
- List outreach log with joined account/contact names
- Record reply (bumps template reply_count)
- Outreach analytics (rolling 30d stats)
"""

import uuid
from datetime import datetime
from decimal import Decimal

import pytest

from tests.conftest import FakeCursor


ENV_ID = "test-consulting-env"
BUSINESS_ID = str(uuid.uuid4())
TENANT_ID = str(uuid.uuid4())
ACCOUNT_ID = str(uuid.uuid4())
CONTACT_ID = str(uuid.uuid4())
TEMPLATE_ID = str(uuid.uuid4())
OUTREACH_LOG_ID = str(uuid.uuid4())
ACTIVITY_ID = str(uuid.uuid4())
NOW = datetime(2026, 2, 26, 12, 0, 0).isoformat()


class TestOutreachTemplates:
    def test_create_template(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/outreach/templates should create a template."""
        fake_cursor.push_result([{
            "id": TEMPLATE_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "name": "Cold Email v1",
            "channel": "email",
            "category": "cold_outreach",
            "subject_template": "Quick question about {{company}}",
            "body_template": "Hi {{name}}, ...",
            "is_active": True,
            "use_count": 0,
            "reply_count": 0,
            "created_at": NOW,
        }])

        response = client.post("/api/consulting/outreach/templates", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "name": "Cold Email v1",
            "channel": "email",
            "category": "cold_outreach",
            "subject_template": "Quick question about {{company}}",
            "body_template": "Hi {{name}}, ...",
        })

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Cold Email v1"
        assert data["channel"] == "email"
        assert data["use_count"] == 0

    def test_list_templates(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/outreach/templates should return active templates."""
        fake_cursor.push_result([
            {
                "id": TEMPLATE_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "name": "Cold Email v1",
                "channel": "email",
                "category": "cold_outreach",
                "subject_template": "Quick question",
                "body_template": "Hi...",
                "is_active": True,
                "use_count": 5,
                "reply_count": 2,
                "created_at": NOW,
            },
        ])

        response = client.get(
            f"/api/consulting/outreach/templates?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["use_count"] == 5


class TestOutreachLog:
    def test_log_outreach(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/outreach/log should create activity + log entry."""
        # resolve_tenant_id
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        # INSERT crm_activity
        fake_cursor.push_result([{"crm_activity_id": ACTIVITY_ID}])
        # INSERT cro_outreach_log
        fake_cursor.push_result([{
            "id": OUTREACH_LOG_ID,
            "crm_activity_id": ACTIVITY_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_account_id": ACCOUNT_ID,
            "crm_contact_id": CONTACT_ID,
            "template_id": TEMPLATE_ID,
            "channel": "email",
            "direction": "outbound",
            "subject": "Quick question",
            "body_preview": "Hi...",
            "sent_at": NOW,
            "replied_at": None,
            "reply_sentiment": None,
            "meeting_booked": False,
            "bounce": False,
            "sent_by": "pm@novendor.co",
            "created_at": NOW,
        }])
        # UPDATE template use_count (no fetch)
        # UPDATE contact last_outreach_at (no fetch)

        response = client.post("/api/consulting/outreach/log", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_account_id": ACCOUNT_ID,
            "crm_contact_id": CONTACT_ID,
            "template_id": TEMPLATE_ID,
            "channel": "email",
            "direction": "outbound",
            "subject": "Quick question",
            "body_preview": "Hi...",
            "sent_by": "pm@novendor.co",
        })

        assert response.status_code == 201
        data = response.json()
        assert data["channel"] == "email"
        assert data["direction"] == "outbound"
        assert data["crm_account_id"] == ACCOUNT_ID

    def test_list_outreach_log(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/outreach/log should return entries with names."""
        fake_cursor.push_result([
            {
                "id": OUTREACH_LOG_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "crm_account_id": ACCOUNT_ID,
                "crm_contact_id": CONTACT_ID,
                "template_id": TEMPLATE_ID,
                "channel": "email",
                "direction": "outbound",
                "subject": "Quick question",
                "body_preview": "Hi...",
                "sent_at": NOW,
                "replied_at": None,
                "reply_sentiment": None,
                "meeting_booked": False,
                "bounce": False,
                "sent_by": "pm@novendor.co",
                "account_name": "Acme Corp",
                "contact_name": "Jane Smith",
                "created_at": NOW,
            },
        ])

        response = client.get(
            f"/api/consulting/outreach/log?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["account_name"] == "Acme Corp"
        assert data[0]["contact_name"] == "Jane Smith"


class TestOutreachReply:
    def test_record_reply(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/outreach/log/{id}/reply should set replied_at."""
        fake_cursor.push_result([{
            "id": OUTREACH_LOG_ID,
            "replied_at": NOW,
            "reply_sentiment": "positive",
            "meeting_booked": True,
            "template_id": TEMPLATE_ID,
        }])
        # UPDATE template reply_count (no fetch)

        response = client.post(
            f"/api/consulting/outreach/log/{OUTREACH_LOG_ID}/reply",
            json={"sentiment": "positive", "meeting_booked": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["reply_sentiment"] == "positive"
        assert data["meeting_booked"] is True


class TestOutreachAnalytics:
    def test_analytics_returns_30d_stats(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/outreach/analytics should return rolling stats."""
        # Overall stats
        fake_cursor.push_result([{
            "total_sent_30d": 20,
            "total_replied_30d": 6,
            "meetings_booked_30d": 3,
        }])
        # By channel
        fake_cursor.push_result([
            {"channel": "email", "sent": 15, "replied": 4, "meetings": 2},
            {"channel": "linkedin", "sent": 5, "replied": 2, "meetings": 1},
        ])
        # By template
        fake_cursor.push_result([
            {"template_name": "Cold Email v1", "template_id": TEMPLATE_ID, "sent": 12, "replied": 3},
        ])

        response = client.get(
            f"/api/consulting/outreach/analytics?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_sent_30d"] == 20
        assert data["total_replied_30d"] == 6
        assert float(data["response_rate_30d"]) == 0.3
        assert data["meetings_booked_30d"] == 3
        assert len(data["by_channel"]) == 2
        assert len(data["by_template"]) == 1
