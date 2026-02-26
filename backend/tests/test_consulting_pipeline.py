"""Tests for the Consulting Revenue OS – Pipeline and Lead endpoints.

Tests:
- Pipeline stages auto-seed for consulting environment
- Create lead creates crm_account + cro_lead_profile
- List leads returns joined data
- Lead scoring is deterministic
- Advance opportunity records stage history
- Kanban returns grouped opportunities
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
LEAD_PROFILE_ID = str(uuid.uuid4())
OPPORTUNITY_ID = str(uuid.uuid4())
STAGE_ID_LEAD = str(uuid.uuid4())
STAGE_ID_DISCOVERY = str(uuid.uuid4())
NOW = datetime(2026, 2, 26, 12, 0, 0).isoformat()


class TestPipelineStages:
    def test_list_stages_auto_seeds(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/pipeline/stages should auto-seed 7 consulting stages."""
        # resolve_tenant_id → fetchone
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        # SELECT existing stages → fetchall (empty → triggers seeding)
        fake_cursor.push_result([])
        # INSERTs don't call fetchone/fetchall so no push needed
        # SELECT stages after seeding → fetchall
        fake_cursor.push_result([
            {"crm_pipeline_stage_id": STAGE_ID_LEAD, "key": "lead", "label": "Lead", "stage_order": 5, "win_probability": Decimal("0.05"), "is_closed": False, "is_won": False, "created_at": NOW},
            {"crm_pipeline_stage_id": STAGE_ID_DISCOVERY, "key": "discovery", "label": "Discovery", "stage_order": 20, "win_probability": Decimal("0.25"), "is_closed": False, "is_won": False, "created_at": NOW},
        ])

        response = client.get(f"/api/consulting/pipeline/stages?business_id={BUSINESS_ID}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["key"] == "lead"
        assert data[1]["key"] == "discovery"


class TestPipelineKanban:
    def test_kanban_groups_by_stage(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/pipeline/kanban should return columns grouped by stage."""
        # resolve_tenant_id
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        # SELECT stages
        fake_cursor.push_result([
            {"crm_pipeline_stage_id": STAGE_ID_LEAD, "key": "lead", "label": "Lead", "stage_order": 5, "win_probability": Decimal("0.05")},
            {"crm_pipeline_stage_id": STAGE_ID_DISCOVERY, "key": "discovery", "label": "Discovery", "stage_order": 20, "win_probability": Decimal("0.25")},
        ])
        # SELECT opportunities
        fake_cursor.push_result([
            {
                "crm_opportunity_id": OPPORTUNITY_ID,
                "name": "AI Audit for Acme",
                "amount": Decimal("50000"),
                "account_name": "Acme Corp",
                "stage_key": "lead",
                "stage_label": "Lead",
                "expected_close_date": "2026-04-15",
                "created_at": NOW,
            },
        ])

        response = client.get(f"/api/consulting/pipeline/kanban?env_id={ENV_ID}&business_id={BUSINESS_ID}")
        assert response.status_code == 200
        data = response.json()
        assert len(data["columns"]) == 2
        lead_col = data["columns"][0]
        assert lead_col["stage_key"] == "lead"
        assert len(lead_col["cards"]) == 1
        assert lead_col["cards"][0]["name"] == "AI Audit for Acme"
        # Weighted = 50000 * 0.05 = 2500
        assert float(data["total_pipeline"]) == 50000
        assert float(data["weighted_pipeline"]) == 2500


class TestCreateLead:
    def test_creates_account_and_profile(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/leads should create crm_account + cro_lead_profile."""
        # resolve_tenant_id
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        # INSERT crm_account
        fake_cursor.push_result([{
            "crm_account_id": ACCOUNT_ID,
            "name": "TechCo Inc",
            "account_type": "prospect",
            "industry": "saas",
            "website": "https://techco.com",
            "created_at": NOW,
        }])
        # INSERT cro_lead_profile
        fake_cursor.push_result([{
            "id": LEAD_PROFILE_ID,
            "lead_score": 52,
            "ai_maturity": "exploring",
            "pain_category": "ai_roi",
            "lead_source": "referral",
            "company_size": "50_200",
            "revenue_band": "10M-50M",
            "erp_system": "NetSuite",
            "estimated_budget": Decimal("75000"),
            "created_at": NOW,
        }])

        response = client.post("/api/consulting/leads", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "company_name": "TechCo Inc",
            "industry": "saas",
            "website": "https://techco.com",
            "ai_maturity": "exploring",
            "pain_category": "ai_roi",
            "lead_source": "referral",
            "company_size": "50_200",
            "revenue_band": "10M-50M",
            "erp_system": "NetSuite",
            "estimated_budget": "75000",
        })

        assert response.status_code == 201
        data = response.json()
        assert data["crm_account_id"] == ACCOUNT_ID
        assert data["lead_profile_id"] == LEAD_PROFILE_ID
        assert data["company_name"] == "TechCo Inc"
        assert data["account_type"] == "prospect"


class TestListLeads:
    def test_returns_joined_data(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/leads should return leads with profile data."""
        fake_cursor.push_result([
            {
                "crm_account_id": ACCOUNT_ID,
                "lead_profile_id": LEAD_PROFILE_ID,
                "company_name": "TechCo Inc",
                "industry": "saas",
                "website": "https://techco.com",
                "account_type": "prospect",
                "ai_maturity": "exploring",
                "pain_category": "ai_roi",
                "lead_score": 52,
                "lead_source": "referral",
                "company_size": "50_200",
                "revenue_band": "10M-50M",
                "erp_system": "NetSuite",
                "estimated_budget": Decimal("75000"),
                "qualified_at": None,
                "disqualified_at": None,
                "stage_key": "lead",
                "stage_label": "Lead",
                "created_at": NOW,
            },
        ])

        response = client.get(f"/api/consulting/leads?env_id={ENV_ID}&business_id={BUSINESS_ID}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "TechCo Inc"
        assert data[0]["lead_score"] == 52
        assert data[0]["stage_key"] == "lead"


class TestLeadScoring:
    def test_deterministic_scoring(self):
        """Lead score should be deterministic based on input factors."""
        from app.services.cro_leads import _compute_lead_score

        # High-value referral from mid-market company exploring AI with large budget
        score = _compute_lead_score(
            ai_maturity="exploring",
            pain_category="ai_roi",
            company_size="200_1000",
            estimated_budget=Decimal("250000"),
            lead_source="referral",
        )
        # exploring=8 + ai_roi=16 + 200_1000=20 + budget<500k=16 + referral=20 = 80
        assert score == 80

        # Low-value cold lead
        score_low = _compute_lead_score(
            ai_maturity="none",
            pain_category="other",
            company_size="1_10",
            estimated_budget=None,
            lead_source="scrape",
        )
        # none=4 + other=4 + 1_10=4 + no_budget=0 + scrape=4 = 16
        assert score_low == 16

        # Max score scenario
        score_max = _compute_lead_score(
            ai_maturity="embedded",
            pain_category="governance_gap",
            company_size="200_1000",
            estimated_budget=Decimal("1000000"),
            lead_source="referral",
        )
        # embedded=20 + governance=20 + 200_1000=20 + budget>=500k=20 + referral=20 = 100
        assert score_max == 100


class TestAdvanceStage:
    def test_advance_records_history(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/pipeline/advance should update stage and record history."""
        # resolve_tenant_id
        fake_cursor.push_result([{"tenant_id": TENANT_ID}])
        # SELECT current stage
        fake_cursor.push_result([{"crm_pipeline_stage_id": STAGE_ID_LEAD}])
        # SELECT target stage
        fake_cursor.push_result([{"crm_pipeline_stage_id": STAGE_ID_DISCOVERY, "is_closed": False, "is_won": False}])
        # UPDATE opportunity
        fake_cursor.push_result([{"crm_opportunity_id": OPPORTUNITY_ID, "name": "AI Audit", "status": "open"}])
        # INSERT stage history
        fake_cursor.push_result([])

        response = client.post("/api/consulting/pipeline/advance", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "opportunity_id": OPPORTUNITY_ID,
            "to_stage_key": "discovery",
            "note": "Discovery call scheduled",
        })

        assert response.status_code == 200
        data = response.json()
        assert data["crm_opportunity_id"] == OPPORTUNITY_ID
        assert data["status"] == "open"


class TestLeadQualification:
    def test_qualify_lead(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/leads/{id}/qualify should set qualified_at."""
        fake_cursor.push_result([{
            "id": LEAD_PROFILE_ID,
            "crm_account_id": ACCOUNT_ID,
            "qualified_at": NOW,
        }])

        response = client.post(f"/api/consulting/leads/{LEAD_PROFILE_ID}/qualify")
        assert response.status_code == 200
        data = response.json()
        assert data["qualified_at"] is not None

    def test_disqualify_lead(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/leads/{id}/disqualify should set reason."""
        fake_cursor.push_result([{
            "id": LEAD_PROFILE_ID,
            "crm_account_id": ACCOUNT_ID,
            "disqualified_at": NOW,
            "disqualified_reason": "Budget too small",
        }])

        response = client.post(
            f"/api/consulting/leads/{LEAD_PROFILE_ID}/disqualify?reason=Budget%20too%20small"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["disqualified_reason"] == "Budget too small"
