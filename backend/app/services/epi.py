"""Service layer for Execution Pattern Intelligence (EPI).

All database operations use psycopg3 via get_cursor().
Read-only against upstream systems — only materializes observations
from approved artifacts.
"""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_or_raise(row: dict | None, label: str = "record") -> dict:
    if row is None:
        raise LookupError(f"{label} not found")
    return row


def _compute_weighted_success(row: dict) -> Decimal | None:
    """0.40*business + 0.20*adoption + 0.20*ttv + 0.10*stability + 0.10*schedule"""
    fields = [
        ("business_outcome_score", Decimal("0.40")),
        ("adoption_score", Decimal("0.20")),
        ("time_to_value_score", Decimal("0.20")),
        ("stability_score", Decimal("0.10")),
        ("schedule_adherence_score", Decimal("0.10")),
    ]
    total = Decimal("0")
    has_any = False
    for key, weight in fields:
        val = row.get(key)
        if val is not None:
            total += Decimal(str(val)) * weight
            has_any = True
    return total if has_any else None


# ---------------------------------------------------------------------------
# Dashboard / KPIs
# ---------------------------------------------------------------------------

def get_dashboard_kpis(*, env_id: UUID, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT
                 (SELECT count(*) FROM epi_engagement WHERE env_id = %s::uuid) AS total_engagements,
                 (SELECT count(*) FROM epi_pattern WHERE status != 'archived') AS total_patterns,
                 (SELECT count(*) FROM epi_account_prediction) AS total_predictions,
                 (SELECT count(DISTINCT industry) FROM epi_engagement WHERE industry IS NOT NULL AND env_id = %s::uuid) AS industries_covered
            """,
            (str(env_id), str(env_id)),
        )
        row = cur.fetchone() or {}

        # Top recurring failures
        cur.execute(
            """SELECT failure_mode, category, count(*) AS cnt
               FROM epi_failure_observation fo
               JOIN epi_engagement e ON e.engagement_id = fo.engagement_id
               WHERE e.env_id = %s::uuid
               GROUP BY failure_mode, category
               ORDER BY cnt DESC LIMIT 5""",
            (str(env_id),),
        )
        top_failures = [dict(r) for r in cur.fetchall()]

        # Top successful pilots
        cur.execute(
            """SELECT pilot_name, pilot_type, weighted_success_score, industry
               FROM epi_pilot_observation po
               JOIN epi_engagement e ON e.engagement_id = po.engagement_id
               WHERE e.env_id = %s::uuid AND po.status = 'completed' AND po.weighted_success_score IS NOT NULL
               ORDER BY po.weighted_success_score DESC LIMIT 5""",
            (str(env_id),),
        )
        top_pilots = [dict(r) for r in cur.fetchall()]

        # Recent case feed drafts
        cur.execute(
            """SELECT item_id, title, industry, status, created_at
               FROM epi_case_feed_item
               WHERE status IN ('draft', 'pending_review')
               ORDER BY created_at DESC LIMIT 5""",
        )
        recent_drafts = [dict(r) for r in cur.fetchall()]

        return {
            **row,
            "prediction_hit_rate": None,
            "top_recurring_failures": top_failures,
            "top_successful_pilots": top_pilots,
            "recent_case_feed_drafts": recent_drafts,
        }


# ---------------------------------------------------------------------------
# Engagements
# ---------------------------------------------------------------------------

def list_engagements(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM epi_engagement
               WHERE env_id = %s::uuid AND business_id = %s::uuid
               ORDER BY updated_at DESC""",
            (str(env_id), str(business_id)),
        )
        return [dict(r) for r in cur.fetchall()]


def create_engagement(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_engagement (env_id, business_id, client_name, industry, sub_industry, engagement_stage)
               VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(env_id), str(business_id),
                payload.get("client_name"), payload.get("industry"),
                payload.get("sub_industry"), payload.get("engagement_stage", "active"),
            ),
        )
        return _row_or_raise(cur.fetchone(), "engagement")


# ---------------------------------------------------------------------------
# Source artifacts
# ---------------------------------------------------------------------------

def ingest_artifact(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_source_artifact
                 (source_env_id, source_record_id, source_type, engagement_id, approved_at, version, provenance, payload)
               VALUES (%s::uuid, %s::uuid, %s, %s::uuid, coalesce(%s, now()), %s, %s::jsonb, %s::jsonb)
               ON CONFLICT (source_env_id, source_record_id, version) DO UPDATE
                 SET payload = EXCLUDED.payload, provenance = EXCLUDED.provenance
               RETURNING *""",
            (
                str(payload["source_env_id"]),
                str(payload["source_record_id"]),
                payload["source_type"],
                str(payload["engagement_id"]),
                payload.get("approved_at"),
                payload.get("version", 1),
                json.dumps(payload.get("provenance", {})),
                json.dumps(payload.get("payload", {})),
            ),
        )
        return _row_or_raise(cur.fetchone(), "artifact")


# ---------------------------------------------------------------------------
# Observations
# ---------------------------------------------------------------------------

def create_vendor_observation(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_vendor_observation
                 (engagement_id, vendor_name, vendor_family, product_name, category,
                  version_info, contract_value, renewal_date, problems, tags, payload)
               VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
               RETURNING *""",
            (
                str(payload["engagement_id"]),
                payload["vendor_name"],
                payload.get("vendor_family"),
                payload.get("product_name"),
                payload.get("category"),
                payload.get("version_info"),
                payload.get("contract_value"),
                payload.get("renewal_date"),
                payload.get("problems", []),
                payload.get("tags", []),
                json.dumps(payload.get("payload", {})),
            ),
        )
        return _row_or_raise(cur.fetchone(), "vendor_observation")


def create_workflow_observation(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_workflow_observation
                 (engagement_id, workflow_name, canonical_name, steps, step_count,
                  handoff_count, manual_steps, automated_steps, cycle_time_hours,
                  bottleneck_step, industry, tags, payload)
               VALUES (%s::uuid, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
               RETURNING *""",
            (
                str(payload["engagement_id"]),
                payload["workflow_name"],
                payload.get("canonical_name"),
                json.dumps(payload.get("steps", [])),
                payload.get("step_count"),
                payload.get("handoff_count"),
                payload.get("manual_steps"),
                payload.get("automated_steps"),
                payload.get("cycle_time_hours"),
                payload.get("bottleneck_step"),
                payload.get("industry"),
                payload.get("tags", []),
                json.dumps(payload.get("payload", {})),
            ),
        )
        return _row_or_raise(cur.fetchone(), "workflow_observation")


def create_metric_observation(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_metric_observation
                 (engagement_id, metric_name, canonical_key, formula, formula_ast,
                  unit, source_system, report_usage, industry, tags, payload)
               VALUES (%s::uuid, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s::jsonb)
               RETURNING *""",
            (
                str(payload["engagement_id"]),
                payload["metric_name"],
                payload.get("canonical_key"),
                payload.get("formula"),
                json.dumps(payload["formula_ast"]) if payload.get("formula_ast") else None,
                payload.get("unit"),
                payload.get("source_system"),
                payload.get("report_usage", []),
                payload.get("industry"),
                payload.get("tags", []),
                json.dumps(payload.get("payload", {})),
            ),
        )
        return _row_or_raise(cur.fetchone(), "metric_observation")


def create_architecture_observation(*, payload: dict) -> dict:
    ws = _compute_weighted_success(payload)
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_architecture_observation
                 (engagement_id, architecture_name, modules, inputs, outputs,
                  replaced_vendors, phase_count, status,
                  business_outcome_score, adoption_score, time_to_value_score,
                  stability_score, schedule_adherence_score, weighted_success_score,
                  industry, tags, payload)
               VALUES (%s::uuid, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
               RETURNING *""",
            (
                str(payload["engagement_id"]),
                payload["architecture_name"],
                json.dumps(payload.get("modules", [])),
                payload.get("inputs", []),
                payload.get("outputs", []),
                payload.get("replaced_vendors", []),
                payload.get("phase_count"),
                payload.get("status", "proposed"),
                payload.get("business_outcome_score"),
                payload.get("adoption_score"),
                payload.get("time_to_value_score"),
                payload.get("stability_score"),
                payload.get("schedule_adherence_score"),
                ws,
                payload.get("industry"),
                payload.get("tags", []),
                json.dumps(payload.get("payload", {})),
            ),
        )
        return _row_or_raise(cur.fetchone(), "architecture_observation")


def create_pilot_observation(*, payload: dict) -> dict:
    ws = _compute_weighted_success(payload)
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_pilot_observation
                 (engagement_id, pilot_name, pilot_type, target_workflow, target_vendor,
                  modules_used, duration_weeks, status,
                  business_outcome_score, adoption_score, time_to_value_score,
                  stability_score, schedule_adherence_score, weighted_success_score,
                  industry, tags, payload)
               VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
               RETURNING *""",
            (
                str(payload["engagement_id"]),
                payload["pilot_name"],
                payload.get("pilot_type"),
                payload.get("target_workflow"),
                payload.get("target_vendor"),
                payload.get("modules_used", []),
                payload.get("duration_weeks"),
                payload.get("status", "proposed"),
                payload.get("business_outcome_score"),
                payload.get("adoption_score"),
                payload.get("time_to_value_score"),
                payload.get("stability_score"),
                payload.get("schedule_adherence_score"),
                ws,
                payload.get("industry"),
                payload.get("tags", []),
                json.dumps(payload.get("payload", {})),
            ),
        )
        return _row_or_raise(cur.fetchone(), "pilot_observation")


def create_failure_observation(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO epi_failure_observation
                 (engagement_id, failure_mode, category, severity,
                  related_vendors, related_workflows, related_metrics,
                  root_cause, resolution, industry, tags, payload)
               VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
               RETURNING *""",
            (
                str(payload["engagement_id"]),
                payload["failure_mode"],
                payload.get("category"),
                payload.get("severity", "medium"),
                payload.get("related_vendors", []),
                payload.get("related_workflows", []),
                payload.get("related_metrics", []),
                payload.get("root_cause"),
                payload.get("resolution"),
                payload.get("industry"),
                payload.get("tags", []),
                json.dumps(payload.get("payload", {})),
            ),
        )
        return _row_or_raise(cur.fetchone(), "failure_observation")


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

def list_patterns(
    *,
    pattern_type: str | None = None,
    industry: str | None = None,
    status: str | None = None,
    min_confidence: float | None = None,
    min_support: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    clauses: list[str] = []
    params: list[Any] = []
    if pattern_type:
        clauses.append("p.pattern_type = %s")
        params.append(pattern_type)
    if industry:
        clauses.append("%s = ANY(p.industry_tags)")
        params.append(industry)
    if status:
        clauses.append("p.status = %s")
        params.append(status)
    if min_confidence is not None:
        clauses.append("p.confidence_score >= %s")
        params.append(min_confidence)
    if min_support is not None:
        clauses.append("p.support_count >= %s")
        params.append(min_support)
    where = " AND ".join(clauses) if clauses else "TRUE"
    params.extend([limit, offset])
    with get_cursor() as cur:
        cur.execute(
            f"""SELECT p.* FROM epi_pattern p
                WHERE {where}
                ORDER BY p.confidence_score DESC, p.support_count DESC
                LIMIT %s OFFSET %s""",
            params,
        )
        return [dict(r) for r in cur.fetchall()]


def get_pattern(*, pattern_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM epi_pattern WHERE pattern_id = %s::uuid", (str(pattern_id),))
        row = _row_or_raise(cur.fetchone(), "pattern")
        # Attach subtype detail
        ptype = row.get("pattern_type")
        detail = None
        if ptype == "vendor":
            cur.execute("SELECT * FROM epi_vendor_pattern WHERE pattern_id = %s::uuid", (str(pattern_id),))
            detail = cur.fetchone()
        elif ptype == "workflow":
            cur.execute("SELECT * FROM epi_workflow_pattern WHERE pattern_id = %s::uuid", (str(pattern_id),))
            detail = cur.fetchone()
        elif ptype == "metric":
            cur.execute("SELECT * FROM epi_metric_pattern WHERE pattern_id = %s::uuid", (str(pattern_id),))
            detail = cur.fetchone()
        elif ptype == "architecture":
            cur.execute("SELECT * FROM epi_architecture_pattern WHERE pattern_id = %s::uuid", (str(pattern_id),))
            detail = cur.fetchone()
        elif ptype == "pilot":
            cur.execute("SELECT * FROM epi_pilot_pattern WHERE pattern_id = %s::uuid", (str(pattern_id),))
            detail = cur.fetchone()
        row["detail"] = dict(detail) if detail else None
        return row


# ---------------------------------------------------------------------------
# Predictions
# ---------------------------------------------------------------------------

def list_predictions(*, env_id: UUID, engagement_id: UUID | None = None) -> list[dict]:
    with get_cursor() as cur:
        if engagement_id:
            cur.execute(
                """SELECT * FROM epi_account_prediction
                   WHERE engagement_id = %s::uuid ORDER BY created_at DESC""",
                (str(engagement_id),),
            )
        else:
            cur.execute(
                """SELECT ap.* FROM epi_account_prediction ap
                   JOIN epi_engagement e ON e.engagement_id = ap.engagement_id
                   WHERE e.env_id = %s::uuid ORDER BY ap.created_at DESC""",
                (str(env_id),),
            )
        return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------

def list_recommendations(*, env_id: UUID, engagement_id: UUID | None = None) -> list[dict]:
    with get_cursor() as cur:
        if engagement_id:
            cur.execute(
                """SELECT * FROM epi_recommendation_result
                   WHERE engagement_id = %s::uuid ORDER BY rank ASC""",
                (str(engagement_id),),
            )
        else:
            cur.execute(
                """SELECT rr.* FROM epi_recommendation_result rr
                   JOIN epi_engagement e ON e.engagement_id = rr.engagement_id
                   WHERE e.env_id = %s::uuid ORDER BY rr.rank ASC""",
                (str(env_id),),
            )
        return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def get_graph(
    *,
    node_types: list[str] | None = None,
    edge_types: list[str] | None = None,
    limit: int = 200,
) -> dict:
    with get_cursor() as cur:
        if node_types:
            placeholders = ",".join(["%s"] * len(node_types))
            cur.execute(
                f"SELECT * FROM epi_graph_node WHERE node_type IN ({placeholders}) LIMIT %s",
                [*node_types, limit],
            )
        else:
            cur.execute("SELECT * FROM epi_graph_node LIMIT %s", (limit,))
        nodes = [dict(r) for r in cur.fetchall()]
        node_ids = [str(n["node_id"]) for n in nodes]

        if not node_ids:
            return {"nodes": [], "edges": []}

        placeholders = ",".join(["%s"] * len(node_ids))
        edge_filter = ""
        edge_params: list[Any] = [*node_ids, *node_ids]
        if edge_types:
            et_ph = ",".join(["%s"] * len(edge_types))
            edge_filter = f"AND e.edge_type IN ({et_ph})"
            edge_params.extend(edge_types)

        cur.execute(
            f"""SELECT e.* FROM epi_graph_edge e
                WHERE (e.source_node_id::text IN ({placeholders})
                   OR e.target_node_id::text IN ({placeholders}))
                {edge_filter}
                LIMIT %s""",
            [*edge_params, limit * 3],
        )
        edges = [dict(r) for r in cur.fetchall()]
        return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Case feed
# ---------------------------------------------------------------------------

def list_case_feed(*, status: str | None = None, limit: int = 50) -> list[dict]:
    with get_cursor() as cur:
        if status:
            cur.execute(
                """SELECT cf.*, array_agg(cfl.pattern_id) FILTER (WHERE cfl.pattern_id IS NOT NULL) AS linked_patterns
                   FROM epi_case_feed_item cf
                   LEFT JOIN epi_case_feed_pattern_link cfl ON cfl.item_id = cf.item_id
                   WHERE cf.status = %s
                   GROUP BY cf.item_id
                   ORDER BY cf.created_at DESC LIMIT %s""",
                (status, limit),
            )
        else:
            cur.execute(
                """SELECT cf.*, array_agg(cfl.pattern_id) FILTER (WHERE cfl.pattern_id IS NOT NULL) AS linked_patterns
                   FROM epi_case_feed_item cf
                   LEFT JOIN epi_case_feed_pattern_link cfl ON cfl.item_id = cf.item_id
                   GROUP BY cf.item_id
                   ORDER BY cf.created_at DESC LIMIT %s""",
                (limit,),
            )
        return [dict(r) for r in cur.fetchall()]


def approve_case_feed_item(*, item_id: UUID, approved_by: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE epi_case_feed_item
               SET status = 'approved', approved_by = %s, approved_at = now(), updated_at = now()
               WHERE item_id = %s::uuid
               RETURNING *""",
            (approved_by, str(item_id)),
        )
        return _row_or_raise(cur.fetchone(), "case_feed_item")


# ---------------------------------------------------------------------------
# Industry dashboard
# ---------------------------------------------------------------------------

def get_industry_dashboard(*, industry: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM epi_dashboard_rollup
               WHERE industry = %s ORDER BY rollup_date DESC LIMIT 1""",
            (industry,),
        )
        row = cur.fetchone()
        if row:
            return dict(row)
        # Fallback: compute live
        return {
            "industry": industry,
            "rollup_date": None,
            "total_engagements": 0,
            "total_patterns": 0,
            "top_vendor_stacks": [],
            "top_workflow_bottlenecks": [],
            "top_metric_conflicts": [],
            "top_failure_modes": [],
            "top_successful_pilots": [],
            "top_architectures": [],
            "reporting_delay_patterns": [],
        }


# ---------------------------------------------------------------------------
# Materialize (Phase 1 stub — ingests from source artifacts)
# ---------------------------------------------------------------------------

def materialize(*, engagement_id: UUID | None = None, source_type: str | None = None) -> dict:
    """Materialize raw observations from approved source artifacts.

    Phase 1: basic pass-through from artifact payload to observation tables.
    Phase 2 will add pattern detection, confidence scoring, and graph updates.
    """
    obs_count = 0
    with get_cursor() as cur:
        clauses = ["TRUE"]
        params: list[Any] = []
        if engagement_id:
            clauses.append("sa.engagement_id = %s::uuid")
            params.append(str(engagement_id))
        if source_type:
            clauses.append("sa.source_type = %s")
            params.append(source_type)
        where = " AND ".join(clauses)

        cur.execute(
            f"""SELECT sa.* FROM epi_source_artifact sa
                WHERE {where}
                ORDER BY sa.created_at""",
            params,
        )
        artifacts = cur.fetchall()

        for art in artifacts:
            stype = art["source_type"]
            p = art["payload"] or {}
            eid = str(art["engagement_id"])
            aid = str(art["artifact_id"])

            if stype == "workflow_observation" and p.get("workflow_name"):
                cur.execute(
                    """INSERT INTO epi_workflow_observation
                         (engagement_id, artifact_id, workflow_name, canonical_name,
                          steps, step_count, industry, tags, payload)
                       VALUES (%s::uuid, %s::uuid, %s, %s, %s::jsonb, %s, %s, %s, %s::jsonb)
                       ON CONFLICT DO NOTHING""",
                    (
                        eid, aid,
                        p["workflow_name"], p.get("canonical_name"),
                        json.dumps(p.get("steps", [])), p.get("step_count"),
                        p.get("industry"), p.get("tags", []),
                        json.dumps(p),
                    ),
                )
                obs_count += cur.rowcount

            elif stype == "vendor_stack" and p.get("vendor_name"):
                cur.execute(
                    """INSERT INTO epi_vendor_observation
                         (engagement_id, artifact_id, vendor_name, vendor_family,
                          product_name, category, problems, tags, payload)
                       VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s::jsonb)
                       ON CONFLICT DO NOTHING""",
                    (
                        eid, aid,
                        p["vendor_name"], p.get("vendor_family"),
                        p.get("product_name"), p.get("category"),
                        p.get("problems", []), p.get("tags", []),
                        json.dumps(p),
                    ),
                )
                obs_count += cur.rowcount

            elif stype == "metric_definition" and p.get("metric_name"):
                cur.execute(
                    """INSERT INTO epi_metric_observation
                         (engagement_id, artifact_id, metric_name, canonical_key,
                          formula, unit, source_system, report_usage, industry, tags, payload)
                       VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                       ON CONFLICT DO NOTHING""",
                    (
                        eid, aid,
                        p["metric_name"], p.get("canonical_key"),
                        p.get("formula"), p.get("unit"),
                        p.get("source_system"), p.get("report_usage", []),
                        p.get("industry"), p.get("tags", []),
                        json.dumps(p),
                    ),
                )
                obs_count += cur.rowcount

    return {"observations_created": obs_count, "patterns_updated": 0, "graph_edges_updated": 0, "message": "ok"}
