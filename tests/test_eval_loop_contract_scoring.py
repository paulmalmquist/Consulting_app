import sys
from pathlib import Path

from eval_loop.scorers import score_assistant_scenario, score_operator_readiness_scenario

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def _complete_receipt() -> dict:
    return {
        "request_id": "req_contract_test",
        "lane": "A_FAST",
        "dispatch": {
            "raw": {
                "skill": "lookup_entity",
                "lane": "A_FAST",
                "needs_retrieval": False,
                "write_intent": False,
                "ambiguity_level": "low",
            },
            "normalized": {
                "source": "model",
                "skill_id": "lookup_entity",
                "lane": "A_FAST",
                "needs_retrieval": False,
                "write_intent": False,
                "ambiguity_level": "low",
                "confidence": 1.0,
                "fallback_used": False,
                "fallback_reason": None,
                "notes": [],
            },
        },
        "fallback_reason": None,
        "context": {
            "environment_id": "env_1",
            "entity_type": "environment",
            "entity_id": "env_1",
            "resolution_status": "resolved",
            "notes": [],
        },
        "skill": {
            "skill_id": "lookup_entity",
            "confidence": 1.0,
            "triggers_matched": [],
        },
        "tools": [],
        "retrieval": {
            "used": False,
            "result_count": 0,
            "status": "empty",
        },
        "status": "success",
    }


def test_contract_failure_makes_scenario_fail_even_when_answer_looks_ok() -> None:
    receipt = _complete_receipt()
    trace = {
        "lane": "A",
        "execution_path": "chat",
        "resolved_scope": {"environment_id": "env_1"},
        "runtime": {"canonical_runtime": True},
    }
    result = {
        "response_text": "Meridian Fund One is selected.",
        "response_blocks": [],
        "turn_receipt": receipt,
        "trace": trace,
        "events": [
            {"event": "token", "data": {"text": "Meridian Fund One is selected."}},
            {"event": "done", "data": {"turn_receipt": receipt, "trace": trace}},
        ],
        "duration_ms": 100,
        "first_token_ms": 20,
    }
    scenario = {
        "id": "contract_identity_required",
        "expected": {
            "context_status": "resolved",
            "lane": "A_FAST",
            "allowed_skills": ["lookup_entity"],
            "status": "success",
            "retrieval_used": False,
            "tool_names": [],
            "answer_must_include": ["Meridian"],
            "runtime_identity_required": True,
            "runtime_path": "canonical",
        },
    }

    scored = score_assistant_scenario(scenario=scenario, result=result)

    assert scored["passed"] is False
    assert scored["failure_category"] == "missing_runtime_identity"
    assert any(m["category"] == "missing_runtime_identity" for m in scored["mismatches"])


def test_operator_readiness_distinguishes_explicit_disabled_state() -> None:
    scored = score_operator_readiness_scenario(
        scenario={
            "id": "operator_readiness_novendor",
            "expected": {
                "allowed_statuses": ["disabled", "misconfigured", "unavailable", "available"],
                "runtime_path": "managed_agent",
            },
        },
        result={
            "operator_status": "disabled",
            "operator_health": {"enabled": False, "fallback_used": False},
            "trace": {
                "runtime_identity": {
                    "path": "managed_agent",
                    "lane": "operator_readiness",
                    "execution_path": "operator_health",
                }
            },
            "duration_ms": 10,
        },
    )

    assert scored["passed"] is True
    assert scored["failure_category"] is None
