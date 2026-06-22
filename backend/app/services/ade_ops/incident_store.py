"""Durable store for ADE Ops incidents (PR 6B) — `ade_ops_incidents`.

Tenant-scoped by env_id + business_id. The schema CHECK enforces no-silent-close
(a closed incident must carry a resolution note + evidence); this store mirrors
the validated state from `incidents.py`.
"""
from __future__ import annotations

import json

from app.db import get_cursor
from app.services.ade_ops.incidents import Incident, IncidentState

_COLS = (
    "id, env_id, business_id, approval_id, source_verdict, provider, target_ref, "
    "recommendation_id, title, severity, state, owner, mitigation_plan, "
    "resolution_note, evidence, created_at"
)


def insert(inc: Incident, *, env_id: str, business_id: str) -> str:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO ade_ops_incidents
               (id, env_id, business_id, approval_id, source_verdict, provider, target_ref,
                recommendation_id, title, severity, state, evidence)
               VALUES (gen_random_uuid(), %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id""",
            (env_id, business_id, inc.approval_id, inc.source_verdict, inc.provider,
             inc.target_ref, inc.recommendation_id, inc.title, inc.severity,
             inc.state.value, json.dumps(inc.evidence)))
        return str(cur.fetchone()["id"])


def get(incident_id: str, *, env_id: str, business_id: str) -> Incident | None:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS} FROM ade_ops_incidents "
            "WHERE id=%s AND env_id=%s AND business_id=%s",
            (incident_id, env_id, business_id))
        row = cur.fetchone()
    return _row(row) if row else None


def list_recent(*, env_id: str, business_id: str, limit: int = 50) -> list[Incident]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS} FROM ade_ops_incidents "
            "WHERE env_id=%s AND business_id=%s ORDER BY created_at DESC LIMIT %s",
            (env_id, business_id, limit))
        rows = cur.fetchall()
    return [_row(r) for r in rows]


def save_transition(inc: Incident, *, env_id: str, business_id: str) -> None:
    """Persist a validated transition. resolved_at/closed_at stamped by state."""
    resolved = "now()" if inc.state in (IncidentState.RESOLVED, IncidentState.CLOSED) else "resolved_at"
    closed = "now()" if inc.state is IncidentState.CLOSED else "closed_at"
    with get_cursor() as cur:
        cur.execute(
            f"""UPDATE ade_ops_incidents
                SET state=%s, owner=%s, mitigation_plan=%s, resolution_note=%s,
                    evidence=%s, updated_at=now(), resolved_at={resolved}, closed_at={closed}
                WHERE id=%s AND env_id=%s AND business_id=%s""",
            (inc.state.value, inc.owner, inc.mitigation_plan, inc.resolution_note,
             json.dumps(inc.evidence), inc.id, env_id, business_id))


def _row(row: dict) -> Incident:
    ev = row.get("evidence") or []
    if isinstance(ev, str):
        ev = json.loads(ev)
    return Incident(
        id=str(row["id"]), approval_id=str(row["approval_id"]) if row.get("approval_id") else None,
        source_verdict=row.get("source_verdict"), provider=row.get("provider"),
        target_ref=row.get("target_ref"), recommendation_id=row.get("recommendation_id"),
        title=row["title"], severity=row.get("severity") or "medium",
        state=IncidentState(row["state"]), owner=row.get("owner"),
        mitigation_plan=row.get("mitigation_plan"), resolution_note=row.get("resolution_note"),
        evidence=ev)
