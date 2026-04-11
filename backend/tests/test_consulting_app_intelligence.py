"""Tests for App Intelligence inside the Consulting workspace."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from app.services import nv_app_intel, nv_app_intel_memo


ENV_ID = "test-consulting-env"
BUSINESS_ID = str(uuid.uuid4())
INBOX_ID = str(uuid.uuid4())
PATTERN_ID = str(uuid.uuid4())
RECORD_ID = str(uuid.uuid4())
OPPORTUNITY_ID = str(uuid.uuid4())
OUTREACH_TEMPLATE_ID = str(uuid.uuid4())
MEMO_ID = str(uuid.uuid4())
NOW = datetime(2026, 4, 10, 12, 0, 0).isoformat()


def make_record(
    record_id: str,
    app_name: str,
    workflow_input: str,
    workflow_process: str,
    workflow_output: str,
    pain_signals: list[str],
    *,
    target_user: str = "Operations lead",
    relevance_score: str = "50",
    weakness_score: str = "50",
):
    return {
        "id": record_id,
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "app_name": app_name,
        "target_user": target_user,
        "core_workflow_input": workflow_input,
        "core_workflow_process": workflow_process,
        "core_workflow_output": workflow_output,
        "pain_signals": pain_signals,
        "relevance_score": Decimal(relevance_score),
        "weakness_score": Decimal(weakness_score),
        "created_at": NOW,
        "updated_at": NOW,
    }


def make_pattern(**overrides):
    row = {
        "id": PATTERN_ID,
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "pattern_name": "OCR Intake Breakdown",
        "workflow_shape": "PDF intake -> OCR -> manual validation bottleneck",
        "industries_seen_in": ["Fund admin"],
        "recurring_pain": "manual validation bottleneck missing fields OCR cleanup",
        "bad_implementation_pattern": "OCR output still needs analyst cleanup",
        "winston_module_opportunity": "Operator inbox",
        "consulting_offer_opportunity": "Workflow rebuild sprint",
        "demo_idea": "Show exception handling on intake",
        "priority": "high",
        "confidence": Decimal("0.90"),
        "status": "active",
        "notes": None,
        "evidence_count": 3,
        "linked_opportunity_count": 0,
        "evidence": [],
    }
    row.update(overrides)
    return row


class TestExtractionValidation:
    def test_extract_record_rejects_empty_pain_signals(self, client, fake_cursor):
        response = client.post(
            f"/api/consulting/app-intelligence/inbox/{INBOX_ID}/extract?env_id={ENV_ID}&business_id={BUSINESS_ID}",
            json={
                "core_workflow_input": "PDF package",
                "core_workflow_process": "OCR",
                "core_workflow_output": "structured data",
                "pain_signals": [],
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"]["error_code"] == "VALIDATION_ERROR"
        assert "pain_signals" in response.json()["detail"]["message"]

    def test_extract_record_requires_workflow_fields(self, client, fake_cursor):
        response = client.post(
            f"/api/consulting/app-intelligence/inbox/{INBOX_ID}/extract?env_id={ENV_ID}&business_id={BUSINESS_ID}",
            json={
                "core_workflow_input": "PDF package",
                "core_workflow_process": "",
                "core_workflow_output": "structured data",
                "pain_signals": ["Manual cleanup still happens after OCR"],
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"]["error_code"] == "VALIDATION_ERROR"
        assert "core_workflow_process" in response.json()["detail"]["message"]


class TestPatternSuggestions:
    def test_suggest_evidence_prefers_matching_records_with_pg_trgm(self):
        pattern = make_pattern()
        matching = [
            make_record(
                str(uuid.uuid4()),
                "DocFlow",
                "PDF intake",
                "OCR with rules",
                "manual validation bottleneck",
                ["OCR cleanup", "missing fields"],
            ),
            make_record(
                str(uuid.uuid4()),
                "FormPilot",
                "PDF intake",
                "OCR parsing",
                "manual validation bottleneck",
                ["manual validation bottleneck", "OCR cleanup"],
            ),
            make_record(
                str(uuid.uuid4()),
                "IntakeStack",
                "PDF intake",
                "OCR classification",
                "manual validation bottleneck",
                ["missing fields", "analyst cleanup"],
            ),
        ]
        non_matching = [
            make_record(
                str(uuid.uuid4()),
                "ChatDesk",
                "Chat messages",
                "auto-reply drafting",
                "inbox summary",
                ["handoff confusion"],
            ),
            make_record(
                str(uuid.uuid4()),
                "LedgerMate",
                "Bank feed",
                "transaction categorization",
                "monthly close pack",
                ["reconciliation drift"],
            ),
        ]

        suggestions = nv_app_intel.suggest_evidence(
            env_id=ENV_ID,
            business_id=uuid.UUID(BUSINESS_ID),
            pattern=pattern,
            candidate_records=matching + non_matching,
            pg_trgm_available=True,
        )

        returned_ids = [str(item["app_record_id"]) for item in suggestions]
        assert len(suggestions) == 3
        assert set(returned_ids) == {row["id"] for row in matching}
        assert all(suggestions[i]["score"] >= suggestions[i + 1]["score"] for i in range(len(suggestions) - 1))

    def test_suggest_evidence_fallback_keyword_overlap_is_sensible(self):
        pattern = make_pattern()
        matching = make_record(
            str(uuid.uuid4()),
            "FallbackFlow",
            "PDF intake",
            "OCR parsing",
            "manual validation bottleneck",
            ["OCR cleanup", "manual validation bottleneck"],
        )
        weak = make_record(
            str(uuid.uuid4()),
            "WeakMatch",
            "Email intake",
            "routing",
            "task queue",
            ["handoff lag"],
        )

        suggestions = nv_app_intel.suggest_evidence(
            env_id=ENV_ID,
            business_id=uuid.UUID(BUSINESS_ID),
            pattern=pattern,
            candidate_records=[matching, weak],
            pg_trgm_available=False,
        )

        assert len(suggestions) == 1
        assert str(suggestions[0]["app_record_id"]) == matching["id"]
        assert suggestions[0]["score"] > 0.3


class TestDraftPayloads:
    def test_draft_payloads_cover_required_fields(self):
        pattern = make_pattern()
        record = make_record(
            RECORD_ID,
            "DocFlow",
            "PDF intake",
            "OCR parsing",
            "validated package",
            ["Manual cleanup still happens after OCR"],
            target_user="Operations manager",
        )

        for kind, required_fields in nv_app_intel.REQUIRED_FIELDS_BY_KIND.items():
            title, payload, must_edit_fields = nv_app_intel._draft_payload(kind, pattern, record)
            assert title
            assert must_edit_fields == nv_app_intel.MUST_EDIT_FIELDS_BY_KIND[kind]
            for field in required_fields:
                assert payload.get(field) not in (None, "", [])
            if kind == "outreach_angle":
                assert "Manual cleanup still happens after OCR" in payload["pain_statement"]
                assert "PDF intake -> OCR parsing -> validated package" in payload["pain_statement"]
            if kind == "consulting_offer":
                assert payload["pricing_angle"] == "fixed"


class TestOpportunityExport:
    def test_create_record_outreach_angle_exports_template(self, fake_cursor):
        payload = {
            "target_persona": "Fund admin",
            "trigger_signal": "Manual cleanup still happens after OCR",
            "pain_statement": "Manual cleanup still happens after OCR across PDF intake -> OCR parsing -> validated package",
            "positioning_angle": "Operator inbox",
            "hook": "We rebuilt this for fund admin firms",
            "proof_reference": "[link a case study]",
            "next_action": "Send LinkedIn DM",
        }
        fake_cursor.push_result([
            {
                "id": OPPORTUNITY_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "pattern_id": None,
                "app_record_id": RECORD_ID,
                "kind": "outreach_angle",
                "title": "OCR Intake Outreach Angle",
                "payload": payload,
                "brief_markdown": "draft",
                "status": "draft",
                "exported_to": None,
                "exported_ref": None,
                "created_at": NOW,
                "updated_at": NOW,
            }
        ])
        fake_cursor.push_result([{"id": OUTREACH_TEMPLATE_ID}])
        fake_cursor.push_result([
            {
                "id": OPPORTUNITY_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "pattern_id": None,
                "app_record_id": RECORD_ID,
                "kind": "outreach_angle",
                "title": "OCR Intake Outreach Angle",
                "payload": payload,
                "brief_markdown": "draft",
                "status": "draft",
                "exported_to": "cro_outreach_template",
                "exported_ref": OUTREACH_TEMPLATE_ID,
                "created_at": NOW,
                "updated_at": NOW,
            }
        ])
        fake_cursor.push_result([{"hours": 4.5}])

        result = nv_app_intel.create_record_opportunity(
            env_id=ENV_ID,
            business_id=uuid.UUID(BUSINESS_ID),
            record_id=uuid.UUID(RECORD_ID),
            kind="outreach_angle",
            title="OCR Intake Outreach Angle",
            payload=payload,
            status="draft",
        )

        assert result["exported_to"] == "cro_outreach_template"
        assert result["exported_ref"] == OUTREACH_TEMPLATE_ID


class TestScoreboard:
    def test_scoreboard_counts_sent_this_week(self, client, fake_cursor):
        fake_cursor.push_result([{"table_name": "cro_app_opportunity"}])
        fake_cursor.push_result([{"cnt": 2}])
        fake_cursor.push_result([{"cnt": 1}])
        fake_cursor.push_result([{"cnt": 3}])
        fake_cursor.push_result([{"avg_hours": 11.25}])
        fake_cursor.push_result([{"avg_hours": 5.5}])

        response = client.get(
            f"/api/consulting/app-intelligence/scoreboard?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["unconverted_patterns"] == 2
        assert data["prime_unsent"] == 1
        assert data["sent_this_week"] == 3
        assert data["avg_hours_inbox_to_opportunity"] == 11.25
        assert data["avg_hours_opportunity_to_sent"] == 5.5


class TestMemoService:
    def test_generate_weekly_memo_requires_patterns(self, fake_cursor):
        with patch.object(nv_app_intel, "list_patterns", return_value=[]), patch.object(
            nv_app_intel, "list_opportunities", return_value={"rows": []}
        ), patch.object(nv_app_intel, "get_scoreboard", return_value={"unconverted_patterns": 0, "prime_unsent": 0}):
            try:
                nv_app_intel_memo.generate_weekly_memo(
                    env_id=ENV_ID,
                    business_id=uuid.UUID(BUSINESS_ID),
                )
            except nv_app_intel.AppIntelMemoMaterialError as exc:
                assert exc.missing == "patterns"
            else:
                raise AssertionError("Expected AppIntelMemoMaterialError")

    def test_generate_weekly_memo_requires_demo_candidate(self, fake_cursor):
        patterns = [make_pattern(pattern_name=f"Pattern {i}") for i in range(1, 4)]
        outreach_rows = [
            {
                "id": str(uuid.uuid4()),
                "title": f"Angle {i}",
                "kind": "outreach_angle",
                "status": "ready",
                "payload": {
                    "target_persona": "Fund admin",
                    "pain_statement": "Pain",
                    "hook": f"Hook {i}",
                },
            }
            for i in range(1, 4)
        ]
        with patch.object(nv_app_intel, "list_patterns", return_value=patterns), patch.object(
            nv_app_intel, "list_opportunities", return_value={"rows": outreach_rows}
        ), patch.object(nv_app_intel, "get_scoreboard", return_value={"unconverted_patterns": 2, "prime_unsent": 1}):
            try:
                nv_app_intel_memo.generate_weekly_memo(
                    env_id=ENV_ID,
                    business_id=uuid.UUID(BUSINESS_ID),
                )
            except nv_app_intel.AppIntelMemoMaterialError as exc:
                assert exc.missing == "demo_candidate"
            else:
                raise AssertionError("Expected AppIntelMemoMaterialError")

    def test_generate_weekly_memo_happy_path(self, fake_cursor):
        patterns = [make_pattern(pattern_name=f"Pattern {i}") for i in range(1, 4)]
        outreach_rows = [
            {
                "id": str(uuid.uuid4()),
                "title": f"Angle {i}",
                "kind": "outreach_angle",
                "status": "ready",
                "payload": {
                    "target_persona": "Fund admin",
                    "pain_statement": f"Pain {i}",
                    "hook": f"Hook {i}",
                },
            }
            for i in range(1, 4)
        ]
        demo_row = {
            "id": str(uuid.uuid4()),
            "title": "Demo 1",
            "kind": "demo_brief",
            "status": "ready",
            "payload": {
                "narrative": "Tell the exception-resolution story",
                "ui_flow": ["Open intake", "Show bottleneck", "Resolve queue"],
            },
        }
        fake_cursor.push_result([
            {
                "id": MEMO_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "period_start": date(2026, 4, 6),
                "period_end": date(2026, 4, 12),
                "summary_markdown": "memo",
                "memo_payload": {
                    "top_3_patterns_to_act_on": [],
                    "outreach_angles_to_send": [],
                    "demo_to_build_this_week": {},
                    "unconverted_patterns_count": 2,
                    "prime_opportunities_unsent_count": 1,
                },
                "generated_at": NOW,
                "generated_by": "pm",
            }
        ])

        with patch.object(nv_app_intel, "list_patterns", return_value=patterns), patch.object(
            nv_app_intel, "list_opportunities", return_value={"rows": outreach_rows + [demo_row]}
        ), patch.object(nv_app_intel, "get_scoreboard", return_value={"unconverted_patterns": 2, "prime_unsent": 1}):
            result = nv_app_intel_memo.generate_weekly_memo(
                env_id=ENV_ID,
                business_id=uuid.UUID(BUSINESS_ID),
                generated_by="pm",
                period_start=date(2026, 4, 6),
                period_end=date(2026, 4, 12),
            )

        assert result["id"] == MEMO_ID
        assert result["generated_by"] == "pm"
        assert result["memo_payload"]["unconverted_patterns_count"] == 2
        assert result["memo_payload"]["prime_opportunities_unsent_count"] == 1


class TestMemoRoute:
    def test_weekly_memo_route_returns_422_with_missing_piece(self, client, monkeypatch):
        def _raise(*args, **kwargs):
            raise nv_app_intel.AppIntelMemoMaterialError(
                "patterns",
                "need 3 viable patterns, only 1 found — process more apps",
            )

        monkeypatch.setattr("app.routes.consulting.nv_app_intel_memo.generate_weekly_memo", _raise)

        response = client.post(
            f"/api/consulting/app-intelligence/weekly-memo/generate?env_id={ENV_ID}&business_id={BUSINESS_ID}",
            json={},
        )

        assert response.status_code == 422
        assert response.json()["detail"]["missing"] == "patterns"
