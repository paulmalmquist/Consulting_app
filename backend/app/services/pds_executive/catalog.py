from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg

from app.db import get_cursor

# Canonical decision map for PDS v1 executive automation.
DEFAULT_DECISIONS: list[dict[str, str]] = [
    {"decision_code": "D01", "decision_title": "Market Expansion", "category": "strategy"},
    {"decision_code": "D02", "decision_title": "Sector Focus", "category": "strategy"},
    {"decision_code": "D03", "decision_title": "Strategic Partnerships", "category": "strategy"},
    {"decision_code": "D04", "decision_title": "Pursuit Approval", "category": "pipeline"},
    {"decision_code": "D05", "decision_title": "Proposal Strategy", "category": "pipeline"},
    {"decision_code": "D06", "decision_title": "Pipeline Prioritization", "category": "pipeline"},
    {"decision_code": "D07", "decision_title": "Project Escalation", "category": "portfolio"},
    {"decision_code": "D08", "decision_title": "Change Order Strategy", "category": "portfolio"},
    {"decision_code": "D09", "decision_title": "Contractor Replacement", "category": "portfolio"},
    {"decision_code": "D10", "decision_title": "Project Staffing", "category": "portfolio"},
    {"decision_code": "D11", "decision_title": "PM Promotion", "category": "org"},
    {"decision_code": "D12", "decision_title": "PM Intervention", "category": "org"},
    {"decision_code": "D13", "decision_title": "Hiring Decisions", "category": "org"},
    {"decision_code": "D14", "decision_title": "Workload Allocation", "category": "org"},
    {"decision_code": "D15", "decision_title": "Executive Client Engagement", "category": "client"},
    {"decision_code": "D16", "decision_title": "Client Recovery", "category": "client"},
    {"decision_code": "D17", "decision_title": "Strategic Client Investment", "category": "client"},
    {"decision_code": "D18", "decision_title": "Litigation Risk Response", "category": "risk"},
    {"decision_code": "D19", "decision_title": "Market Risk Adjustment", "category": "risk"},
    {"decision_code": "D20", "decision_title": "Reputation Protection", "category": "risk"},
]


def list_decision_catalog(*, active_only: bool = True) -> list[dict[str, Any]]:
    where_sql = "WHERE is_active = true" if active_only else ""
    try:
        with get_cursor() as cur:
            cur.execute(
                f"""
                SELECT decision_code, decision_title, category, description, trigger_metadata_json, template_key, is_active
                FROM pds_exec_decision_catalog
                {where_sql}
                ORDER BY decision_code
                """
            )
            rows = cur.fetchall()
            if rows:
                return rows
    except psycopg.errors.UndefinedTable:
        pass
    return DEFAULT_DECISIONS


def get_decision_catalog_map(*, active_only: bool = True) -> dict[str, dict[str, Any]]:
    rows = list_decision_catalog(active_only=active_only)
    return {str(row["decision_code"]): row for row in rows}


def get_threshold_policy_map(*, env_id: UUID, business_id: UUID) -> dict[str, dict[str, Any]]:
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT decision_code, policy_key, threshold_value, threshold_unit, metadata_json
                FROM pds_exec_threshold_policy
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND is_enabled = true
                """,
                (str(env_id), str(business_id)),
            )
            rows = cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return {}

    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        decision = str(row.get("decision_code") or "")
        key = str(row.get("policy_key") or "")
        if not decision or not key:
            continue
        out.setdefault(decision, {})[key] = row.get("threshold_value")
    return out
