from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.engine.contracts import load_contracts, validate_with_schema
from orchestration.engine.session import create_session_payload


def test_contract_files_load_and_have_required_keys():
    c = load_contracts()
    for key in [
        "ui_refactor",
        "file_move",
        "test_fix",
        "schema_change",
        "business_logic_update",
        "mcp_contract_update",
        "infra_change",
        "documentation",
        "analytics_query",
    ]:
        assert key in c.intent_taxonomy

    assert "model_alias_env" in c.model_routing_rules
    assert c.model_routing_rules["model_alias_env"]["fast"] == "CODEX_MODEL_FAST"
    assert c.model_routing_rules["model_alias_env"]["deep"] == "CODEX_MODEL_DEEP"


def test_session_schema_validation_accepts_strict_payload():
    c = load_contracts()
    sid = str(uuid4())
    payload = create_session_payload(
        session_id=sid,
        intent="ui_refactor",
        model="fast",
        reasoning_effort="low",
        allowed_directories=["repo-b/src/app"],
        allowed_tools=["read", "edit", "shell"],
        max_files_per_execution=5,
        auto_approval=False,
        risk_level="low",
    )
    validate_with_schema(c.session_schema, payload)


def test_log_schema_has_required_audit_fields():
    c = load_contracts()
    required = set(c.log_schema["required"])
    for f in [
        "execution_id",
        "session_id",
        "intent",
        "model_used",
        "files_modified",
        "lines_added",
        "lines_removed",
        "duration_ms",
        "status",
        "errors",
        "rollback_required",
        "hash_prev",
        "hash_self",
    ]:
        assert f in required
