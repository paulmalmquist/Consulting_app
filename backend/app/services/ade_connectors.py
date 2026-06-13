"""Declared connector inventory for the Automated Data Engineering surface.

This is the code mirror of docs/plans/automated-data-engineering/connector-inventory.md.
When the inventory changes, update BOTH files — the backend never parses markdown.
PR 2 may replace this pair with a generated JSON source if drift becomes painful.

Statuses are declarations, not probes. PR 1 rules: no external cloud calls, no
credential validation, no env-var liveness inference. Vocabulary is exactly
live | stub | script | missing.
"""
from __future__ import annotations

from app.mcp.registry import registry

CONNECTORS: list[dict] = [
    {
        "provider": "OpenAI (model provider)",
        "status": "live",
        "mode": "managed_model",
        "evidence_path": "backend/app/services/ai_gateway.py",
        "reason": "Winston-managed key. BYO-key and enterprise endpoints are roadmap (ADR 0001).",
    },
    {
        "provider": "Git (local repo)",
        "status": "live",
        "mode": "mcp_tools",
        "evidence_path": "backend/app/mcp/tools/git_tools.py",
        "reason": "git.diff and git.commit, local only, no push.",
    },
    {
        "provider": "Supabase/Postgres",
        "status": "live",
        "mode": "service_layer",
        "evidence_path": "backend/app/db.py",
        "reason": "App database through the service layer. Not a direct skill.",
    },
    {
        "provider": "Confluent Cloud / Kafka",
        "status": "live",
        "mode": "streaming",
        "evidence_path": "backend/app/events/transport.py",
        "reason": "Stargate streaming lane. Not yet exposed as a governed MCP skill.",
    },
    {
        "provider": "Microsoft Graph (Outlook)",
        "status": "live",
        "mode": "background_service",
        "evidence_path": "backend/app/services/msgraph_email_sync.py",
        "reason": "Email sync service. Not yet an MCP tool.",
    },
    {
        "provider": "Azure DevOps",
        "status": "script",
        "mode": "import_file",
        "evidence_path": "TELEMETRY_TEMPLATE/ado/gen_ado_backlog.py",
        "reason": "Backlog generator exists. PR 1 does not mutate live ADO.",
    },
    {
        "provider": "Databricks",
        "status": "stub",
        "mode": "sql_connector",
        "evidence_path": "backend/app/data/databricks_source.py",
        "reason": "Stub raises NotImplementedError, awaits client deployment config.",
    },
    {
        "provider": "GitHub (PRs/issues)",
        "status": "missing",
        "mode": "planned",
        "evidence_path": None,
        "reason": "No gh integration in app code. Roadmap.",
    },
    {
        "provider": "Vercel",
        "status": "missing",
        "mode": "planned",
        "evidence_path": None,
        "reason": "Operator CLI only. No in-app connector.",
    },
    {
        "provider": "Railway",
        "status": "missing",
        "mode": "planned",
        "evidence_path": None,
        "reason": "Operator CLI only. No in-app connector.",
    },
    {
        "provider": "BigQuery / Google Cloud",
        "status": "missing",
        "mode": "planned",
        "evidence_path": None,
        "reason": "Planned in RS_ANALYTICS_PLATFORM_PLAN.md. Not implemented.",
    },
]

# Maps a connector's evidence_path to the registry module its tools register
# under. git_tools.py registers ToolDefs with module="git".
_MCP_MODULE_BY_EVIDENCE = {
    "backend/app/mcp/tools/git_tools.py": "git",
}


def list_connectors() -> list[dict]:
    """Return the declared inventory with derived MCP tool counts merged in.

    Only connectors with mode "mcp_tools" get a real count, taken from the
    in-process registry (already populated at app startup). Everything else
    is 0. No probing, no env-var checks.
    """
    out = []
    for c in CONNECTORS:
        row = dict(c)
        if c["mode"] == "mcp_tools":
            module = _MCP_MODULE_BY_EVIDENCE.get(c["evidence_path"] or "")
            row["tool_count"] = len(registry.list_by_module(module)) if module else 0
        else:
            row["tool_count"] = 0
        out.append(row)
    return out
