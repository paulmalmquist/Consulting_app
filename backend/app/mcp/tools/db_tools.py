"""Database management MCP tools — db.upsert."""

from __future__ import annotations

import httpx

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, AuditPolicy, registry
from app.mcp.schemas.db_tools import DbUpsertInput


def _db_upsert(ctx: McpContext, inp: DbUpsertInput) -> dict:
    """Upsert records via backend admin API."""

    # Validate dry_run + confirm logic
    if not inp.dry_run and not inp.confirm:
        raise PermissionError("db.upsert with dry_run=false requires confirm=true")

    # Call backend /api/admin/upsert endpoint
    url = "http://localhost:8000/api/admin/upsert"

    request_body = {
        "table": inp.table,
        "records": inp.records,
        "conflict_keys": inp.conflict_keys,
        "dry_run": inp.dry_run,
    }

    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(url, json=request_body)

            if response.status_code == 200:
                result = response.json()
                return {
                    "success": True,
                    "dry_run": result.get("dry_run", inp.dry_run),
                    "table": result.get("table"),
                    "affected_rows": result.get("affected_rows"),
                    "message": "Dry run successful" if inp.dry_run else "Upsert successful",
                }
            else:
                error_detail = response.json().get("detail", response.text) if response.text else "Unknown error"
                return {
                    "success": False,
                    "error": f"Backend returned {response.status_code}: {error_detail}",
                    "status_code": response.status_code,
                }

    except httpx.ConnectError:
        return {
            "success": False,
            "error": "Could not connect to backend. Is it running on localhost:8000?",
            "connection_error": True,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


def register_db_tools():
    """Register database management tools."""

    # Audit policy that redacts full record payloads
    db_audit = AuditPolicy(
        max_input_bytes_to_log=1000,  # Log summary only
        max_output_bytes_to_log=1000,
    )

    registry.register(ToolDef(
        name="db.upsert",
        description="Upsert records into database tables via backend API. Allowlisted tables only. Requires confirm=true when dry_run=false. Never logs full payloads.",
        module="db",
        permission="write",
        input_model=DbUpsertInput,
        handler=_db_upsert,
        audit_policy=db_audit,
    ))
