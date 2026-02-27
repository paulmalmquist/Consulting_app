"""Tests for the Consulting Revenue OS – Proposal and Client endpoints.

Tests:
- Create proposal with auto-margin calculation
- List proposals with account names
- Get single proposal
- Update proposal status (send, accept, reject)
- Create new version of proposal
- Convert account to client (atomic: client + account_type + opportunity status)
- List clients with engagement/revenue summaries
- Get single client
"""

import uuid
from datetime import datetime
from decimal import Decimal

from tests.conftest import FakeCursor


ENV_ID = "test-consulting-env"
BUSINESS_ID = str(uuid.uuid4())
TENANT_ID = str(uuid.uuid4())
ACCOUNT_ID = str(uuid.uuid4())
OPPORTUNITY_ID = str(uuid.uuid4())
PROPOSAL_ID = str(uuid.uuid4())
CLIENT_ID = str(uuid.uuid4())
STAGE_ID_WON = str(uuid.uuid4())
NOW = datetime(2026, 2, 26, 12, 0, 0).isoformat()


class TestCreateProposal:
    def test_creates_with_margin(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/proposals should create with auto-computed margin."""
        fake_cursor.push_result([{
            "id": PROPOSAL_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_opportunity_id": OPPORTUNITY_ID,
            "crm_account_id": ACCOUNT_ID,
            "title": "AI Strategy Engagement",
            "version": 1,
            "status": "draft",
            "pricing_model": "fixed",
            "total_value": Decimal("100000"),
            "cost_estimate": Decimal("60000"),
            "margin_pct": Decimal("0.4000"),
            "valid_until": "2026-04-01",
            "sent_at": None,
            "accepted_at": None,
            "rejected_at": None,
            "scope_summary": "Full AI maturity assessment",
            "risk_notes": None,
            "created_at": NOW,
        }])

        response = client.post("/api/consulting/proposals", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_opportunity_id": OPPORTUNITY_ID,
            "crm_account_id": ACCOUNT_ID,
            "title": "AI Strategy Engagement",
            "pricing_model": "fixed",
            "total_value": "100000",
            "cost_estimate": "60000",
            "valid_until": "2026-04-01",
            "scope_summary": "Full AI maturity assessment",
        })

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "AI Strategy Engagement"
        assert data["version"] == 1
        assert data["status"] == "draft"
        # margin = (100k - 60k) / 100k = 0.40
        assert float(data["margin_pct"]) == 0.4

    def test_margin_calc_deterministic(self):
        """Margin formula should be (total - cost) / total."""
        from app.services.cro_proposals import _compute_margin

        assert _compute_margin(Decimal("100000"), Decimal("60000")) == Decimal("0.4000")
        assert _compute_margin(Decimal("50000"), Decimal("0")) == Decimal("1.0000")
        assert _compute_margin(Decimal("0"), Decimal("10000")) is None


class TestListProposals:
    def test_returns_with_account_name(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/proposals should include account_name."""
        fake_cursor.push_result([{
            "id": PROPOSAL_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_opportunity_id": OPPORTUNITY_ID,
            "crm_account_id": ACCOUNT_ID,
            "title": "AI Strategy",
            "version": 1,
            "status": "sent",
            "pricing_model": "fixed",
            "total_value": Decimal("100000"),
            "cost_estimate": Decimal("60000"),
            "margin_pct": Decimal("0.4000"),
            "valid_until": "2026-04-01",
            "sent_at": NOW,
            "accepted_at": None,
            "rejected_at": None,
            "scope_summary": "Full assessment",
            "risk_notes": None,
            "account_name": "Acme Corp",
            "created_at": NOW,
        }])

        response = client.get(
            f"/api/consulting/proposals?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["account_name"] == "Acme Corp"


class TestProposalStatus:
    def test_update_status_to_accepted(self, client, fake_cursor: FakeCursor):
        """PATCH /api/consulting/proposals/{id}/status should update and set accepted_at."""
        fake_cursor.push_result([{
            "id": PROPOSAL_ID,
            "status": "accepted",
            "sent_at": NOW,
            "accepted_at": NOW,
            "rejected_at": None,
            "rejection_reason": None,
        }])

        response = client.patch(
            f"/api/consulting/proposals/{PROPOSAL_ID}/status",
            json={"status": "accepted"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "accepted"
        assert data["accepted_at"] is not None

    def test_update_status_to_rejected(self, client, fake_cursor: FakeCursor):
        """PATCH /api/consulting/proposals/{id}/status should set rejection_reason."""
        fake_cursor.push_result([{
            "id": PROPOSAL_ID,
            "status": "rejected",
            "sent_at": NOW,
            "accepted_at": None,
            "rejected_at": NOW,
            "rejection_reason": "Budget constraints",
        }])

        response = client.patch(
            f"/api/consulting/proposals/{PROPOSAL_ID}/status",
            json={"status": "rejected", "rejection_reason": "Budget constraints"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rejection_reason"] == "Budget constraints"


class TestProposalVersioning:
    def test_create_new_version(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/proposals/{id}/version should bump version number."""
        # Get original proposal
        fake_cursor.push_result([{
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_opportunity_id": OPPORTUNITY_ID,
            "crm_account_id": ACCOUNT_ID,
            "title": "AI Strategy",
            "pricing_model": "fixed",
            "total_value": Decimal("100000"),
            "cost_estimate": Decimal("60000"),
            "margin_pct": Decimal("0.4000"),
            "valid_until": "2026-04-01",
            "scope_summary": "Full assessment",
            "risk_notes": None,
            "version": 1,
        }])
        # INSERT new version
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_opportunity_id": OPPORTUNITY_ID,
            "crm_account_id": ACCOUNT_ID,
            "title": "AI Strategy",
            "version": 2,
            "status": "draft",
            "pricing_model": "fixed",
            "total_value": Decimal("100000"),
            "cost_estimate": Decimal("60000"),
            "margin_pct": Decimal("0.4000"),
            "valid_until": "2026-04-01",
            "sent_at": None,
            "accepted_at": None,
            "rejected_at": None,
            "scope_summary": "Full assessment",
            "risk_notes": None,
            "created_at": NOW,
        }])

        response = client.post(f"/api/consulting/proposals/{PROPOSAL_ID}/version")
        assert response.status_code == 201
        data = response.json()
        assert data["version"] == 2
        assert data["status"] == "draft"


class TestConvertToClient:
    def test_convert_creates_client_and_updates_account(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/clients/convert should atomically create client + update account."""
        # resolve_tenant_id
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        # INSERT cro_client
        fake_cursor.push_result([{
            "id": CLIENT_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_account_id": ACCOUNT_ID,
            "crm_opportunity_id": OPPORTUNITY_ID,
            "proposal_id": PROPOSAL_ID,
            "client_status": "active",
            "account_owner": "pm@novendor.co",
            "start_date": "2026-03-01",
            "lifetime_value": Decimal("0"),
            "created_at": NOW,
        }])
        # UPDATE crm_account (no fetch)
        # SELECT closed_won stage
        fake_cursor.push_result([{"crm_pipeline_stage_id": STAGE_ID_WON}])
        # UPDATE crm_opportunity (no fetch)
        # SELECT account name
        fake_cursor.push_result([{"name": "Acme Corp"}])

        response = client.post("/api/consulting/clients/convert", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_account_id": ACCOUNT_ID,
            "crm_opportunity_id": OPPORTUNITY_ID,
            "proposal_id": PROPOSAL_ID,
            "account_owner": "pm@novendor.co",
            "start_date": "2026-03-01",
        })

        assert response.status_code == 201
        data = response.json()
        assert data["client_status"] == "active"
        assert data["company_name"] == "Acme Corp"
        assert data["crm_account_id"] == ACCOUNT_ID


class TestListClients:
    def test_returns_with_summaries(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/clients should return clients with engagement/revenue data."""
        fake_cursor.push_result([{
            "id": CLIENT_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_account_id": ACCOUNT_ID,
            "company_name": "Acme Corp",
            "client_status": "active",
            "account_owner": "pm@novendor.co",
            "start_date": "2026-03-01",
            "lifetime_value": Decimal("150000"),
            "active_engagements": 2,
            "total_revenue": Decimal("75000"),
            "created_at": NOW,
        }])

        response = client.get(
            f"/api/consulting/clients?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Acme Corp"
        assert data[0]["active_engagements"] == 2
        assert float(data[0]["total_revenue"]) == 75000


class TestGetClient:
    def test_get_single_client(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/clients/{id} should return client detail."""
        fake_cursor.push_result([{
            "id": CLIENT_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "crm_account_id": ACCOUNT_ID,
            "company_name": "Acme Corp",
            "client_status": "active",
            "account_owner": "pm@novendor.co",
            "start_date": "2026-03-01",
            "lifetime_value": Decimal("150000"),
            "active_engagements": 2,
            "total_revenue": Decimal("75000"),
            "created_at": NOW,
        }])

        response = client.get(f"/api/consulting/clients/{CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == CLIENT_ID
        assert data["company_name"] == "Acme Corp"

    def test_get_nonexistent_client_returns_404(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/clients/{id} for missing client should return 404."""
        fake_cursor.push_result([])

        bad_id = str(uuid.uuid4())
        response = client.get(f"/api/consulting/clients/{bad_id}")
        assert response.status_code == 404
