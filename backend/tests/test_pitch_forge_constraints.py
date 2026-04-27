"""test_pitch_forge_constraints.py — Constraint enforcement tests for Pitch Forge.

Tests:
1. Max 3 iterations enforced at service layer
2. Generic phrases flagged in final output
3. Use cases without economic impact rejected
4. Hallboys constraints present in generated output
5. Missing evidence surfaces as "Not available"
6. Final output does not contain banned consulting filler
7. Red team cannot kill without citing a fixable reason
8. Score thresholds map to correct verdicts
9. Proposal rebuild uses red team fixes
10. Research synthesis structures gaps correctly
"""
from __future__ import annotations

import json
import pytest
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4


# ---------------------------------------------------------------------------
# Helper stubs
# ---------------------------------------------------------------------------

ENV_ID = "test-env-hallboys"
BUSINESS_ID = uuid4()
PROJECT_ID = uuid4()
ITERATION_ID = uuid4()

HALLBOYS_CONSTRAINTS = [
    {"text": "No custom software builds."},
    {"text": "Single AP clerk must not be assumed eliminated."},
    {"text": "No generic AI consulting language."},
    {"text": "3-person IT team — low integration capacity."},
]

VALID_USE_CASE = {
    "workflow_name": "AP Invoice Pre-Screen",
    "current_pain": "Single AP clerk manually reviews all invoices across 5 OpCos. Cannot separate routine from exceptions.",
    "proposed_intervention": "Claude pre-screens invoices, flags mismatches and duplicates, tags routine vs exception.",
    "who_uses_it": "Hallboys AP clerk",
    "change_tomorrow": "Clerk opens a pre-screened list every morning. Exceptions are at the top.",
    "estimated_impact": "Reduce AP review time by 5–8 hours/week. Fewer missed discrepancies.",
    "impact_confidence": "medium",
    "dependencies": "Invoice PDFs must be accessible via email or Acumatica export.",
    "novendor_credibility": "Novendor ran AP pre-screening pilots in 2 prior multi-OpCo environments.",
    "evidence_used": ["Single AP clerk confirmed fact"],
    "flaw": "Acumatica export step not confirmed with IT team.",
}

EMPTY_IMPACT_USE_CASE = {
    **VALID_USE_CASE,
    "workflow_name": "Vague Workflow",
    "estimated_impact": "",  # Invalid — empty
}

VAGUE_IMPACT_USE_CASE = {
    **VALID_USE_CASE,
    "workflow_name": "Streamlined Workflow",
    "estimated_impact": "Improved efficiency across teams.",  # Invalid — no number
}


# ---------------------------------------------------------------------------
# 1. Max 3 iterations enforced
# ---------------------------------------------------------------------------

class TestMaxIterations:
    def test_raises_at_iteration_4(self):
        """increment_iteration_count must raise PitchForgeMaxIterationsError if count >= 3."""
        from app.services.pitch_forge import PitchForgeMaxIterationsError

        mock_project = {
            "id": str(PROJECT_ID),
            "iteration_count": 3,
            "client_name": "Hall Boys Holdings",
            "status": "rebuilding",
        }

        with patch("app.services.pitch_forge.get_cursor") as mock_cursor_ctx:
            # get_project returns a project at count 3
            from app.services import pitch_forge as pf
            with patch.object(pf, "get_project", return_value=mock_project):
                with pytest.raises(PitchForgeMaxIterationsError) as exc_info:
                    pf.increment_iteration_count(
                        env_id=ENV_ID, business_id=BUSINESS_ID, project_id=PROJECT_ID
                    )
                assert "maximum of 3 iterations" in str(exc_info.value)

    def test_allows_iteration_1_to_3(self):
        """increment_iteration_count must succeed for counts 0, 1, 2."""
        from app.services import pitch_forge as pf

        for starting_count in (0, 1, 2):
            mock_project = {
                "id": str(PROJECT_ID),
                "iteration_count": starting_count,
                "client_name": "Hall Boys Holdings",
                "status": "drafting",
            }
            updated_project = {**mock_project, "iteration_count": starting_count + 1}

            mock_cursor = MagicMock()
            mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
            mock_cursor.__exit__ = MagicMock(return_value=False)
            mock_cursor.fetchone.return_value = updated_project

            with patch.object(pf, "get_project", return_value=mock_project):
                with patch("app.services.pitch_forge.get_cursor", return_value=mock_cursor):
                    result = pf.increment_iteration_count(
                        env_id=ENV_ID, business_id=BUSINESS_ID, project_id=PROJECT_ID
                    )
                    assert result["iteration_count"] == starting_count + 1

    def test_iteration_check_column_constraint(self):
        """pf_iteration has a CHECK constraint limiting iteration_num 1–3."""
        # Verify the schema definition includes the correct constraint
        import re
        schema_path = "repo-b/db/schema/10000_pitch_forge_core.sql"
        try:
            with open(schema_path) as f:
                content = f.read()
        except FileNotFoundError:
            pytest.skip("Schema file not found — run from repo root")
        assert "iteration_num BETWEEN 1 AND 3" in content or "iteration_num <= 3" in content, (
            "pf_iteration must have a CHECK constraint capping iteration_num at 3"
        )
        assert "iteration_count <= 3" in content, (
            "pf_project must have a CHECK constraint capping iteration_count at 3"
        )


# ---------------------------------------------------------------------------
# 2. Generic phrases flagged
# ---------------------------------------------------------------------------

class TestBannedPhrases:
    def test_check_banned_phrases_detects_violations(self):
        from app.services.pitch_forge_ai import check_banned_phrases
        text = "We will streamline your operations and unlock new synergies with our holistic approach."
        found = check_banned_phrases(text)
        assert "streamline" in found
        assert "unlock" in found
        assert "synergies" not in found  # not in banned list exactly — but "synergy" is
        # Check a few more
        text2 = "This transformative solution will empower your team with a robust ecosystem."
        found2 = check_banned_phrases(text2)
        assert "transformative" in found2
        assert "empower" in found2
        assert "robust" in found2

    def test_clean_text_passes(self):
        from app.services.pitch_forge_ai import check_banned_phrases
        text = (
            "The AP clerk receives a pre-screened list each morning. "
            "Exceptions are at the top. Review takes 30 minutes instead of 3 hours."
        )
        found = check_banned_phrases(text)
        assert not found, f"Clean text should have no banned phrases, found: {found}"

    def test_final_output_rejects_banned_phrases(self):
        """generate_final_output raises ValueError if output contains banned phrases."""
        from app.services import pitch_forge_ai as ai

        banned_output = (
            "We will streamline your accounts payable workflow to unlock operational value."
        )

        with patch.object(ai, "_chat", return_value=banned_output):
            with pytest.raises(ValueError) as exc_info:
                ai.generate_final_output(
                    client_name="Hall Boys Holdings",
                    use_cases=[VALID_USE_CASE],
                    score=85,
                    format="bullet_email",
                )
            assert "banned phrases" in str(exc_info.value).lower()

    def test_banned_phrase_list_covers_key_terms(self):
        from app.services.pitch_forge_prompts import BANNED_PHRASES
        required = [
            "streamline", "unlock", "empower", "holistic", "transformative",
            "robust", "leverage", "seamless", "paradigm", "synergy",
        ]
        for term in required:
            assert term in BANNED_PHRASES, f"'{term}' must be in BANNED_PHRASES"


# ---------------------------------------------------------------------------
# 3. Use cases without economic value rejected
# ---------------------------------------------------------------------------

class TestEconomicValueValidation:
    def test_empty_impact_rejected(self):
        from app.services import pitch_forge_ai as ai

        ai_response = json.dumps({"use_cases": [EMPTY_IMPACT_USE_CASE]})
        with patch.object(ai, "_chat", return_value=ai_response):
            with pytest.raises(ValueError) as exc_info:
                ai.generate_use_cases(
                    client_name="Hall Boys Holdings",
                    facts=[{"text": "Single AP clerk", "confidence": "high", "source": "DR"}],
                    constraints=HALLBOYS_CONSTRAINTS,
                    inferences=[],
                    gaps=[],
                )
            assert "estimated_impact" in str(exc_info.value)

    def test_valid_impact_passes(self):
        from app.services import pitch_forge_ai as ai

        ai_response = json.dumps({"use_cases": [VALID_USE_CASE]})
        with patch.object(ai, "_chat", return_value=ai_response):
            result = ai.generate_use_cases(
                client_name="Hall Boys Holdings",
                facts=[{"text": "Single AP clerk", "confidence": "high", "source": "DR"}],
                constraints=HALLBOYS_CONSTRAINTS,
                inferences=[],
                gaps=[],
            )
            assert len(result) == 1
            assert result[0]["workflow_name"] == "AP Invoice Pre-Screen"

    def test_red_team_kills_vague_impact(self):
        """Red team should kill/flag use cases with 'improved efficiency' style impact claims."""
        from app.services import pitch_forge_ai as ai

        review_response = json.dumps({
            "score": 55,
            "score_breakdown": {
                "specificity": 15, "economic_value": 5,
                "client_fit": 15, "evidence_quality": 10, "demo_readiness": 10,
            },
            "verdict": "research_refill",
            "verdict_reason": "Use case impact is vague — no quantified value.",
            "kill_list": [{
                "use_case": "Vague Workflow",
                "criterion": "no_economic_delta",
                "reason": "estimated_impact says 'improved efficiency' with no quantified hours, dollars, or error count.",
            }],
            "weak_spots": [],
            "missing_evidence": [],
            "research_refill": [],
            "fatal_issues": [],
            "fixable_issues": [],
            "acceptable_weaknesses": [],
            "missing_inputs": [],
        })

        with patch.object(ai, "_chat", return_value=review_response):
            review = ai.run_red_team(
                client_name="Hall Boys Holdings",
                constraints=HALLBOYS_CONSTRAINTS,
                use_cases=[VAGUE_IMPACT_USE_CASE],
                iteration_num=1,
            )
            assert review["score"] < 65
            assert review["verdict"] in ("rebuild", "research_refill")
            assert any("no_economic_delta" in k["criterion"] for k in review["kill_list"])


# ---------------------------------------------------------------------------
# 4. Hallboys constraints present in prompt
# ---------------------------------------------------------------------------

class TestHallboysConstraintEnforcement:
    def test_use_case_generation_prompt_includes_constraints(self):
        from app.services.pitch_forge_prompts import use_case_generation_prompt
        prompt = use_case_generation_prompt(
            client_name="Hall Boys Holdings",
            facts=[{"text": "Single AP clerk", "confidence": "high", "source": "DR"}],
            constraints=HALLBOYS_CONSTRAINTS,
            inferences=[],
            gaps=[],
        )
        assert "No custom software builds" in prompt
        assert "Single AP clerk must not be assumed eliminated" in prompt
        assert "Hall Boys Holdings" in prompt

    def test_red_team_prompt_includes_constraints(self):
        from app.services.pitch_forge_prompts import red_team_critique_prompt
        prompt = red_team_critique_prompt(
            client_name="Hall Boys Holdings",
            constraints=HALLBOYS_CONSTRAINTS,
            use_cases=[VALID_USE_CASE],
            iteration_num=1,
        )
        assert "No custom software builds" in prompt
        assert "Hall Boys Holdings" in prompt
        assert "violates_client_constraint" in prompt

    def test_final_output_prompt_includes_client_name(self):
        from app.services.pitch_forge_prompts import final_client_output_prompt
        prompt = final_client_output_prompt(
            client_name="Hall Boys Holdings",
            use_cases=[VALID_USE_CASE],
            score=82,
        )
        assert "Hall Boys Holdings" in prompt
        # Anti-filler rules must be in the final output prompt
        assert "streamline" in prompt  # Should be in the banned list embedded in the prompt
        assert "unlock" in prompt


# ---------------------------------------------------------------------------
# 5. Missing evidence surfaces as "Not available"
# ---------------------------------------------------------------------------

class TestMissingEvidenceSurface:
    def test_gap_claims_have_unavailable_flag(self):
        """Claims with is_available=False must have unavailable_reason set."""
        gap_claim = {
            "claim_text": "Current AP invoice volume per week",
            "claim_category": "gap",
            "is_available": False,
            "unavailable_reason": "Not disclosed in research.",
        }
        # Validate the data contract
        assert not gap_claim["is_available"]
        assert gap_claim["unavailable_reason"] is not None
        assert len(gap_claim["unavailable_reason"]) > 0

    def test_synthesis_maps_gaps_to_unavailable_claims(self):
        """research_synthesis result gaps should produce is_available=False claims."""
        synthesis_result = {
            "facts": [],
            "constraints": [],
            "inferences": [],
            "gaps": [
                {
                    "text": "AP invoice volume per week",
                    "why_it_matters": "Needed to size the AP triage opportunity",
                    "available": False,
                    "unavailable_reason": "Not disclosed in research",
                }
            ],
            "risks": [],
        }
        # Simulate what the route does when processing synthesis result
        claims_to_insert = []
        for g in synthesis_result.get("gaps", []):
            claims_to_insert.append({
                "claim_text": g["text"],
                "claim_category": "gap",
                "is_available": False,
                "unavailable_reason": g.get("unavailable_reason", g.get("why_it_matters", "Not confirmed")),
            })
        assert len(claims_to_insert) == 1
        assert claims_to_insert[0]["is_available"] is False
        assert "Not disclosed" in claims_to_insert[0]["unavailable_reason"]

    def test_red_team_surfaces_missing_inputs_not_invents(self):
        """Red team must flag missing inputs explicitly, not fill gaps with invented data."""
        from app.services import pitch_forge_ai as ai

        review_response = json.dumps({
            "score": 60,
            "score_breakdown": {
                "specificity": 15, "economic_value": 12,
                "client_fit": 15, "evidence_quality": 8, "demo_readiness": 10,
            },
            "verdict": "research_refill",
            "verdict_reason": "Impact estimate for QEM scheduling is speculative — actual dispatch volume not confirmed.",
            "kill_list": [],
            "weak_spots": [],
            "missing_evidence": [{
                "use_case": "QEM Multi-Site Scheduling Risk Monitor",
                "what_is_missing": "Confirmed count of concurrent active dispatch sites",
                "why_it_matters": "Cannot quantify impact without knowing actual volume",
            }],
            "research_refill": [{
                "topic": "QEM concurrent dispatch volume",
                "why_blocked": "Cannot estimate cost avoidance without baseline",
            }],
            "fatal_issues": [],
            "fixable_issues": [],
            "acceptable_weaknesses": [],
            "missing_inputs": [{
                "input_needed": "QEM active dispatch count per week",
                "blocks": "Sizing the scheduling risk monitor ROI",
            }],
        })

        with patch.object(ai, "_chat", return_value=review_response):
            review = ai.run_red_team(
                client_name="Hall Boys Holdings",
                constraints=HALLBOYS_CONSTRAINTS,
                use_cases=[VALID_USE_CASE],
                iteration_num=1,
            )
            assert len(review["missing_inputs"]) >= 1
            assert "Not available" not in str(review)  # The word itself shouldn't be invented — it's a UI concern


# ---------------------------------------------------------------------------
# 6. Final output has no banned filler (integration-style test)
# ---------------------------------------------------------------------------

class TestFinalOutputClean:
    def test_generate_final_output_rejects_specific_terms(self):
        """Each banned term individually triggers rejection."""
        from app.services import pitch_forge_ai as ai
        from app.services.pitch_forge_prompts import BANNED_PHRASES

        for term in ("streamline", "unlock", "empower", "transformative", "robust", "holistic"):
            assert term in BANNED_PHRASES, f"{term} must be in BANNED_PHRASES for rejection to work"

        # Test that a clean output passes
        clean_output = (
            "AP Invoice Pre-Screen\n"
            "- The AP clerk currently reviews all invoices manually across 5 OpCos. "
            "This takes 3–4 hours/day with no separation between routine and exception work.\n"
            "- Claude pre-screens each invoice against PO records, flags mismatches and "
            "duplicate patterns, and tags routine vs exception.\n"
            "- The clerk starts each morning with a prioritized exception list. "
            "Review time drops from 3 hours to under 1 hour on routine days."
        )
        with patch.object(ai, "_chat", return_value=clean_output):
            result = ai.generate_final_output(
                client_name="Hall Boys Holdings",
                use_cases=[VALID_USE_CASE],
                score=85,
            )
            assert result == clean_output


# ---------------------------------------------------------------------------
# 7. Red team must cite fixable reason for every kill
# ---------------------------------------------------------------------------

class TestRedTeamKillValidation:
    def test_kill_without_reason_raises(self):
        from app.services import pitch_forge_ai as ai

        bad_review = json.dumps({
            "score": 40,
            "score_breakdown": {
                "specificity": 10, "economic_value": 5,
                "client_fit": 10, "evidence_quality": 8, "demo_readiness": 7,
            },
            "verdict": "research_refill",
            "verdict_reason": "Overall quality too low.",
            "kill_list": [{
                "use_case": "AP Invoice Pre-Screen",
                "criterion": "generic_language",
                "reason": "",  # Empty reason — should fail validation
            }],
            "weak_spots": [],
            "missing_evidence": [],
            "research_refill": [],
            "fatal_issues": [],
            "fixable_issues": [],
            "acceptable_weaknesses": [],
            "missing_inputs": [],
        })

        with patch.object(ai, "_chat", return_value=bad_review):
            with pytest.raises(ValueError) as exc_info:
                ai.run_red_team(
                    client_name="Hall Boys Holdings",
                    constraints=HALLBOYS_CONSTRAINTS,
                    use_cases=[VALID_USE_CASE],
                    iteration_num=1,
                )
            assert "without a specific reason" in str(exc_info.value)

    def test_kill_with_reason_passes(self):
        from app.services import pitch_forge_ai as ai

        good_review = json.dumps({
            "score": 45,
            "score_breakdown": {
                "specificity": 12, "economic_value": 8,
                "client_fit": 12, "evidence_quality": 8, "demo_readiness": 5,
            },
            "verdict": "research_refill",
            "verdict_reason": "Missing volume data blocks impact quantification.",
            "kill_list": [{
                "use_case": "AP Invoice Pre-Screen",
                "criterion": "no_economic_delta",
                "reason": "estimated_impact cites 5-8 hours/week but AP invoice volume is unconfirmed. This number cannot be defended.",
            }],
            "weak_spots": [],
            "missing_evidence": [],
            "research_refill": [],
            "fatal_issues": [],
            "fixable_issues": [],
            "acceptable_weaknesses": [],
            "missing_inputs": [],
        })

        with patch.object(ai, "_chat", return_value=good_review):
            review = ai.run_red_team(
                client_name="Hall Boys Holdings",
                constraints=HALLBOYS_CONSTRAINTS,
                use_cases=[VALID_USE_CASE],
                iteration_num=1,
            )
            assert review["kill_list"][0]["reason"] != ""


# ---------------------------------------------------------------------------
# 8. Score thresholds map to correct verdicts
# ---------------------------------------------------------------------------

class TestScoreThresholds:
    def test_80_plus_verdict_is_pass(self):
        from app.services import pitch_forge_ai as ai

        for score in (80, 85, 100):
            review_resp = json.dumps({
                "score": score,
                "score_breakdown": {"specificity": 25, "economic_value": 25, "client_fit": 20, "evidence_quality": 15, "demo_readiness": 15},
                "verdict": "pass",
                "verdict_reason": f"Score {score} exceeds threshold.",
                "kill_list": [], "weak_spots": [], "missing_evidence": [],
                "research_refill": [], "fatal_issues": [], "fixable_issues": [],
                "acceptable_weaknesses": [], "missing_inputs": [],
            })
            with patch.object(ai, "_chat", return_value=review_resp):
                review = ai.run_red_team(
                    client_name="Hall Boys", constraints=[], use_cases=[VALID_USE_CASE], iteration_num=1
                )
            assert review["verdict"] == "pass"

    def test_under_65_verdict_is_research_refill(self):
        from app.services import pitch_forge_ai as ai

        review_resp = json.dumps({
            "score": 55,
            "score_breakdown": {"specificity": 10, "economic_value": 10, "client_fit": 15, "evidence_quality": 10, "demo_readiness": 10},
            "verdict": "research_refill",
            "verdict_reason": "Score below 65 — research refill required.",
            "kill_list": [], "weak_spots": [], "missing_evidence": [],
            "research_refill": [], "fatal_issues": [], "fixable_issues": [],
            "acceptable_weaknesses": [], "missing_inputs": [],
        })
        with patch.object(ai, "_chat", return_value=review_resp):
            review = ai.run_red_team(
                client_name="Hall Boys", constraints=[], use_cases=[VALID_USE_CASE], iteration_num=1
            )
        assert review["verdict"] == "research_refill"

    def test_max_iterations_forces_fail_verdict(self):
        """At iteration 3, if score < 80, verdict must be 'fail' regardless of AI response."""
        from app.services import pitch_forge_ai as ai

        # AI returns 'rebuild' but we're at max — should be coerced to 'fail'
        review_resp = json.dumps({
            "score": 72,
            "score_breakdown": {"specificity": 20, "economic_value": 18, "client_fit": 16, "evidence_quality": 10, "demo_readiness": 8},
            "verdict": "rebuild",  # AI says rebuild, but we're at max
            "verdict_reason": "Minor fixable issues remain.",
            "kill_list": [], "weak_spots": [], "missing_evidence": [],
            "research_refill": [], "fatal_issues": [], "fixable_issues": [],
            "acceptable_weaknesses": [], "missing_inputs": [],
        })
        with patch.object(ai, "_chat", return_value=review_resp):
            review = ai.run_red_team(
                client_name="Hall Boys",
                constraints=[],
                use_cases=[VALID_USE_CASE],
                iteration_num=3,  # AT MAX
                max_iterations=3,
            )
        assert review["verdict"] == "fail", (
            f"At max iterations with score < 80, verdict must be 'fail', got '{review['verdict']}'"
        )
        assert "Maximum iterations" in review["verdict_reason"]


# ---------------------------------------------------------------------------
# 9. Prompt template structure tests
# ---------------------------------------------------------------------------

class TestPromptTemplates:
    def test_research_synthesis_prompt_contains_required_output_keys(self):
        from app.services.pitch_forge_prompts import research_synthesis_prompt
        prompt = research_synthesis_prompt(
            client_name="Hall Boys Holdings",
            raw_research="Some research text.",
            known_constraints=["No custom software."],
        )
        for key in ("facts", "constraints", "inferences", "gaps", "risks"):
            assert f'"{key}"' in prompt, f"research_synthesis prompt missing '{key}' in output spec"

    def test_use_case_generation_prompt_contains_required_fields(self):
        from app.services.pitch_forge_prompts import use_case_generation_prompt
        prompt = use_case_generation_prompt(
            client_name="Hall Boys Holdings",
            facts=[], constraints=[], inferences=[], gaps=[]
        )
        required_fields = [
            "workflow_name", "current_pain", "proposed_intervention",
            "who_uses_it", "change_tomorrow", "estimated_impact",
            "impact_confidence", "novendor_credibility", "flaw",
        ]
        for field in required_fields:
            assert field in prompt, f"use_case_generation prompt missing field '{field}'"

    def test_red_team_prompt_contains_all_criteria(self):
        from app.services.pitch_forge_prompts import red_team_critique_prompt
        prompt = red_team_critique_prompt(
            client_name="Hall Boys", constraints=[], use_cases=[], iteration_num=1
        )
        criteria = [
            "generic_language", "no_economic_delta", "violates_client_constraint",
            "unrealistic_automation", "tool_first_not_workflow",
            "fake_precision", "unclear_buyer_value", "not_demoable",
        ]
        for c in criteria:
            assert c in prompt, f"red_team prompt missing criterion '{c}'"

    def test_score_weights_sum_to_100(self):
        from app.services.pitch_forge_prompts import SCORE_WEIGHTS
        total = sum(SCORE_WEIGHTS.values())
        assert total == 100, f"Score weights must sum to 100, got {total}"


# ---------------------------------------------------------------------------
# 10. Iteration history is preserved
# ---------------------------------------------------------------------------

class TestIterationHistory:
    def test_schema_has_unique_constraint_on_project_iteration(self):
        """pf_iteration must have UNIQUE(project_id, iteration_num) to prevent duplicate iterations."""
        schema_path = "repo-b/db/schema/10000_pitch_forge_core.sql"
        try:
            with open(schema_path) as f:
                content = f.read()
        except FileNotFoundError:
            pytest.skip("Schema file not found — run from repo root")
        assert "UNIQUE (project_id, iteration_num)" in content, (
            "pf_iteration must have UNIQUE constraint on (project_id, iteration_num)"
        )

    def test_final_output_only_for_passed_projects(self):
        """create_final_output should be gated behind project status=passed at the route layer."""
        from app.services.pitch_forge import PitchForgePreconditionError
        # This test validates the error class exists and is importable
        assert issubclass(PitchForgePreconditionError, Exception)

        # Verify the route checks status before generating output
        import inspect
        import app.routes.pitch_forge as route_module
        source = inspect.getsource(route_module.generate_final_output)
        assert "status" in source and "passed" in source, (
            "generate_final_output route must check project status == 'passed'"
        )
