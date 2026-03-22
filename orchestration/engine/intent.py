from __future__ import annotations

from typing import Any


INTENTS = [
    "ui_refactor",
    "file_move",
    "test_fix",
    "schema_change",
    "business_logic_update",
    "mcp_contract_update",
    "infra_change",
    "documentation",
    "analytics_query",
]


def classify_intent(prompt: str, explicit_intent: str | None = None) -> str:
    if explicit_intent:
        return explicit_intent
    p = prompt.lower()
    if any(k in p for k in ["schema", "migration", "drop table", "ddl"]):
        return "schema_change"
    if any(k in p for k in ["infra", "deployment", "docker", "pipeline", "ci"]):
        return "infra_change"
    if any(k in p for k in ["mcp", "contract", "tool schema"]):
        return "mcp_contract_update"
    if any(k in p for k in ["test", "pytest", "failing test", "fix spec"]):
        return "test_fix"
    if any(k in p for k in ["move file", "rename", "relocate"]):
        return "file_move"
    if any(k in p for k in ["ui", "layout", "css", "component"]):
        return "ui_refactor"
    if any(k in p for k in ["docs", "readme", "document"]):
        return "documentation"
    if any(k in p for k in ["query", "metrics", "analytics"]):
        return "analytics_query"
    return "business_logic_update"


def intent_risk(intent_taxonomy: dict[str, Any], intent: str) -> str:
    if intent not in intent_taxonomy:
        raise ValueError(f"Unknown intent: {intent}")
    return str(intent_taxonomy[intent]["risk_level"])
