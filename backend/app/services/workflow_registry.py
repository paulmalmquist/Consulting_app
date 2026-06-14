"""Workflow Registry service — definitions/catalog for the ADE governed fabric (plan PR 2).

A workflow is a named, reusable execution sequence. PR 2 is catalog only: CRUD over
definitions plus two hot run-state columns (run_count, last_run_at). There is no
execution engine and no run-history table — durable run/history analytics are a future
BigQuery concern (Resource Selection Doctrine), not more Postgres rows.

RLS: every statement issues `SET LOCAL app.env_id` (via set_config) so the
nv_workflow_definitions tenant policy passes. Reads and writes are env-scoped.
"""
from __future__ import annotations

import json
import re
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log

# Canonical seed workflows applied lazily on first list per env. Idempotent by
# (env_id, slug): re-running ensure_seed_workflows never duplicates rows.
SEED_WORKFLOWS: list[dict] = [
    {
        "slug": "ticket-to-pr",
        "name": "Ticket → PR",
        "domain": "devops",
        "description": "ADO story to merged PR: plan, research, code, test, PR, review, deploy.",
        "steps": [
            {"step_name": "ADO Story", "tool_name": None, "inputs": [], "outputs": ["story_id"]},
            {"step_name": "Plan", "tool_name": None, "inputs": ["story_id"], "outputs": ["plan"]},
            {"step_name": "Research", "tool_name": None, "inputs": ["plan"], "outputs": ["evidence"]},
            {"step_name": "Code", "tool_name": None, "inputs": ["plan"], "outputs": ["diff"]},
            {"step_name": "Test", "tool_name": None, "inputs": ["diff"], "outputs": ["results"]},
            {"step_name": "PR", "tool_name": "git.create_pr", "inputs": ["diff"], "outputs": ["pr_url"]},
            {"step_name": "Human Review", "tool_name": None, "inputs": ["pr_url"], "outputs": ["approval"]},
            {"step_name": "Deploy", "tool_name": None, "inputs": ["approval"], "outputs": ["deploy_id"]},
        ],
    },
    {
        "slug": "data-engineering",
        "name": "Data Engineering",
        "domain": "data_engineering",
        "description": "Medallion pipeline: source to bronze, silver, gold, validated and reported.",
        "steps": [
            {"step_name": "Source", "tool_name": None, "inputs": [], "outputs": ["raw"]},
            {"step_name": "Bronze", "tool_name": None, "inputs": ["raw"], "outputs": ["bronze"]},
            {"step_name": "Silver", "tool_name": None, "inputs": ["bronze"], "outputs": ["silver"]},
            {"step_name": "Gold", "tool_name": None, "inputs": ["silver"], "outputs": ["gold"]},
            {"step_name": "Validate", "tool_name": None, "inputs": ["gold"], "outputs": ["assertions"]},
            {"step_name": "Report", "tool_name": None, "inputs": ["gold"], "outputs": ["report"]},
        ],
    },
    {
        "slug": "telemetry-investigation",
        "name": "Telemetry Investigation",
        "domain": "telemetry",
        "description": "Anomaly to recommendation: root cause, historical compare, NCR search.",
        "steps": [
            {"step_name": "Alert", "tool_name": None, "inputs": [], "outputs": ["anomaly"]},
            {"step_name": "Root Cause", "tool_name": None, "inputs": ["anomaly"], "outputs": ["cause"]},
            {"step_name": "Historical Compare", "tool_name": None, "inputs": ["anomaly"], "outputs": ["similar_runs"]},
            {"step_name": "NCR Search", "tool_name": None, "inputs": ["cause"], "outputs": ["ncrs"]},
            {"step_name": "Recommendation", "tool_name": None, "inputs": ["cause", "ncrs"], "outputs": ["recommendation"]},
        ],
    },
]

_VALID_DOMAINS = {"data_engineering", "telemetry", "investigation", "devops"}
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return s or "workflow"


def _row_to_dict(r: dict) -> dict:
    return {
        "id": str(r["id"]),
        "slug": r["slug"],
        "name": r["name"],
        "description": r["description"],
        "domain": r["domain"],
        "steps": r["steps"],
        "input_schema": r["input_schema"],
        "output_schema": r["output_schema"],
        "owner": r["owner"],
        "last_run_at": r["last_run_at"].isoformat() if r.get("last_run_at") else None,
        "run_count": r["run_count"],
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
    }


def _set_tenant(cur, env_id: str) -> None:
    cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))


def ensure_seed_workflows(env_id: str, business_id: str | UUID) -> None:
    """Insert the canonical seed workflows for an env if absent. Idempotent.

    Called lazily on first list so any env that opens the catalog gets the seeds
    without baking a hardcoded env_id into the migration.
    """
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        for wf in SEED_WORKFLOWS:
            cur.execute(
                """INSERT INTO nv_workflow_definitions
                       (env_id, business_id, slug, name, description, domain, steps, owner)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (env_id, slug) DO NOTHING""",
                (
                    env_id, str(business_id), wf["slug"], wf["name"], wf["description"],
                    wf["domain"], json.dumps(wf["steps"]), "system",
                ),
            )


def list_workflows(env_id: str, business_id: str | UUID, *, domain: str | None = None) -> list[dict]:
    """List workflow definitions for an env, newest first. Optional domain filter."""
    ensure_seed_workflows(env_id, business_id)
    conditions = ["env_id = %s"]
    params: list = [env_id]
    if domain:
        if domain not in _VALID_DOMAINS:
            raise ValueError(f"Unknown domain: {domain}")
        conditions.append("domain = %s")
        params.append(domain)
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            f"""SELECT id, slug, name, description, domain, steps, input_schema, output_schema,
                       owner, last_run_at, run_count, created_at
                FROM nv_workflow_definitions
                WHERE {where}
                ORDER BY created_at DESC""",
            params,
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def get_workflow(env_id: str, business_id: str | UUID, workflow_id: str | UUID) -> dict | None:
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """SELECT id, slug, name, description, domain, steps, input_schema, output_schema,
                      owner, last_run_at, run_count, created_at
               FROM nv_workflow_definitions
               WHERE env_id = %s AND id = %s""",
            (env_id, str(workflow_id)),
        )
        row = cur.fetchone()
        return _row_to_dict(row) if row else None


def create_workflow(
    env_id: str,
    business_id: str | UUID,
    *,
    name: str,
    domain: str = "data_engineering",
    description: str | None = None,
    steps: list[dict] | None = None,
    input_schema: dict | None = None,
    output_schema: dict | None = None,
    owner: str | None = None,
    slug: str | None = None,
) -> dict:
    """Create one workflow definition. Slug derives from name when not given.

    Raises ValueError on bad domain/slug or a duplicate (env_id, slug).
    """
    if not name or not name.strip():
        raise ValueError("name is required")
    if domain not in _VALID_DOMAINS:
        raise ValueError(f"Unknown domain: {domain}")
    final_slug = (slug or _slugify(name)).strip().lower()
    if not _SLUG_RE.match(final_slug):
        raise ValueError(f"Invalid slug: {final_slug}")
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            "SELECT 1 FROM nv_workflow_definitions WHERE env_id = %s AND slug = %s",
            (env_id, final_slug),
        )
        if cur.fetchone():
            raise ValueError(f"Workflow slug already exists: {final_slug}")
        cur.execute(
            """INSERT INTO nv_workflow_definitions
                   (env_id, business_id, slug, name, description, domain,
                    steps, input_schema, output_schema, owner)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id, slug, name, description, domain, steps, input_schema,
                         output_schema, owner, last_run_at, run_count, created_at""",
            (
                env_id, str(business_id), final_slug, name.strip(), description, domain,
                json.dumps(steps or []), json.dumps(input_schema or {}),
                json.dumps(output_schema or {}), owner,
            ),
        )
        return _row_to_dict(cur.fetchone())


def record_run(env_id: str, business_id: str | UUID, workflow_id: str | UUID) -> dict | None:
    """Bump hot run state: increment run_count, set last_run_at = now().

    NOT a run-history write — there is no run-history table in PR 2. Returns the
    updated row, or None if the workflow does not exist for this env.
    """
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """UPDATE nv_workflow_definitions
               SET run_count = run_count + 1, last_run_at = now()
               WHERE env_id = %s AND id = %s
               RETURNING id, slug, name, description, domain, steps, input_schema,
                         output_schema, owner, last_run_at, run_count, created_at""",
            (env_id, str(workflow_id)),
        )
        row = cur.fetchone()
        if not row:
            emit_log(level="warning", service="workflow_registry", action="record_run_missing",
                     message=f"workflow {workflow_id} not found for env {env_id}")
        return _row_to_dict(row) if row else None
